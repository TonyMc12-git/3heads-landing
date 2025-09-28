// netlify/functions/compare.js
// Node 18+ on Netlify has global fetch.
// Env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const { prompt = 'Say hello briefly.', withGemini = false } = JSON.parse(event.body || '{}');

    const openaiP = callOpenAI(prompt).catch(e => `OpenAI error: ${msg(e)}`);
    const claudeP = callClaude(prompt).catch(e => `Claude error: ${msg(e)}`);
    const geminiP = withGemini ? callGemini(prompt).catch(e => `Gemini error: ${msg(e)}`) : null;

    const [openai, claude, gemini] = await Promise.all([openaiP, claudeP, geminiP]);

    const payload = { prompt, openai, claude };
    if (withGemini) payload.gemini = gemini;

    return json(200, payload);
  } catch (err) {
    return json(500, { error: msg(err) });
  }
};

// ---------- helpers ----------
const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

const msg = (e) => (e && e.message) ? e.message : String(e);

// ---------- providers ----------

// --- OpenAI ---
async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// --- Anthropic ---
async function callClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.content?.[0]?.text ?? '';
}

// --- Gemini (2-step: primary attempt + short fallback) ---
async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');

  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;

  // We'll do two quick attempts (10s + 10s) to stay under Netlify's 26s limit.
  const ATTEMPT_MS = 10000;

  async function tryOnce({ maxOutputTokens, instruction, signal }) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `${instruction}\n\n${prompt}` }]
        }],
        generationConfig: {
          maxOutputTokens,
          temperature: 0.2,
          topP: 0.9
        }
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const errText = data?.error?.message || `HTTP ${r.status}`;
      return { ok: false, text: `Gemini error: ${errText}` };
    }

    const finish = data?.candidates?.[0]?.finishReason;
    const blocked = data?.promptFeedback?.blockReason;
    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('')
      .trim();

    if (blocked || !text || finish === 'SAFETY') {
      return { ok: false, text: text || `Gemini error: ${blocked || finish || 'empty response'}` };
    }
    return { ok: true, text };
  }

  // Attempt 1: your current ~120–200 words cap
  const controller1 = new AbortController();
  const timer1 = setTimeout(() => controller1.abort(), ATTEMPT_MS);
  try {
    const a1 = await tryOnce({
      maxOutputTokens: 320,
      instruction: 'Answer concisely in about 120–200 words. Do not over-explain unless asked.',
      signal: controller1.signal
    });
    if (a1.ok) return a1.text || '—';
    // Attempt 2: quick fallback ~≤120 words
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort(), ATTEMPT_MS);
    try {
      const a2 = await tryOnce({
        maxOutputTokens: 200,
        instruction: 'Answer in no more than ~120 words. Focus on the essentials.',
        signal: controller2.signal
      });
      return (a2.text || a1.text || '—');
    } finally {
      clearTimeout(timer2);
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || String(e).includes('aborted'))) {
      // If first attempt timed out, do the short fallback once more
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), ATTEMPT_MS);
      try {
        const a2 = await tryOnce({
          maxOutputTokens: 200,
          instruction: 'Answer in no more than ~120 words. Focus on the essentials.',
          signal: controller2.signal
        });
        return a2.text || 'Gemini timed out.';
      } finally {
        clearTimeout(timer2);
      }
    }
    return `Gemini error: ${msg(e)}`;
  } finally {
    clearTimeout(timer1);
  }
}
