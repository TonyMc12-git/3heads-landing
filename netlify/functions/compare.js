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

// --- Gemini (hardcoded to 2.5-flash with 20s deadline) ---
async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');

  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;

  // Deadline so we don't hit Netlify's hard 26s cap
  const DEADLINE_MS = 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Answer concisely in about 120–200 words. Do not over-explain unless asked.\n\n${prompt}`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 320,   // ~200 words
          temperature: 0.2,
          topP: 0.9
        }
      }),
      signal: controller.signal
    });

    const data = await r.json();
    if (!r.ok) {
      // Return readable error for the card instead of empty text
      const pretty = data?.error?.message ? `Gemini error: ${data.error.message}` : `Gemini HTTP ${r.status}`;
      return pretty;
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('');
    return text.trim() || '—';
  } catch (e) {
    if (e && (e.name === 'AbortError' || String(e).includes('aborted'))) {
      return 'Gemini timed out (took too long).';
    }
    return `Gemini error: ${msg(e)}`;
  } finally {
    clearTimeout(timer);
  }
}
