// netlify/functions/compare.js
// Node 18+ on Netlify has global fetch. Uses env keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const { prompt = 'Say hello briefly.' } = JSON.parse(event.body || '{}');

    // Kick off all three in parallel
    const [openai, claude, gemini] = await Promise.all([
      callOpenAI(prompt).catch(e => `OpenAI error: ${msg(e)}`),
      callClaude(prompt).catch(e => `Claude error: ${msg(e)}`),
      callGemini(prompt).catch(e => `Gemini error: ${msg(e)}`),
    ]);

    return json(200, { prompt, openai, claude, gemini });
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
  // Anthropics returns content as array of blocks; take first text block.
  return data.content?.[0]?.text ?? '';
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY; // you asked to use GEMINI_API_KEY
  if (!key) throw new Error('Missing GEMINI_API_KEY');

  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${key}`;

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '')
    .join('');
  return text;
}
