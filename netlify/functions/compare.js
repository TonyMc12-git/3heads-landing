// netlify/functions/compare.js
// Node 18+ on Netlify has global fetch.
// Env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const { prompt = 'Say hello briefly.', withGemini = false } =
      JSON.parse(event.body || '{}');

    const openaiP = callOpenAI(prompt).catch(e => `OpenAI error: ${msg(e)}`);
    const claudeP = callClaude(prompt).catch(e => `Claude error: ${msg(e)}`);
    const geminiP = withGemini
      ? callGemini(prompt).catch(e => `Gemini error: ${msg(e)}`)
      : null;

    const [openai, claude, gemini] = await Promise.all([
      openaiP,
      claudeP,
      geminiP,
    ]);

    const payload = { prompt, openai, claude };
    if (withGemini) payload.gemini = gemini;

    return json(200, payload);
  } catch (err) {
    return json(500, { error: msg(err) });
  }
};

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});

const msg = (e) => (e?.message ? e.message : String(e));

// ------------------ PROVIDERS ------------------

// --- OPENAI: responses API with web search ---
async function callOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Missing OPENAI_API_KEY');

  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5.1',
      input: prompt,
      tools: [{ type: 'web_search' }],
    }),
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.output_text?.trim() || '';
}

// --- CLAUDE: enable search via "search" tool ---
async function callClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Missing ANTHROPIC_API_KEY');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          name: 'search',
          description: 'Search the web for recent info',
          input_schema: { type: 'object', properties: {} },
        },
      ],
    }),
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.content?.[0]?.text ?? '';
}

// --- GEMINI: correct camelCase googleSearch tool ---
async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');

  const model = 'gemini-2.5-pro';
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
    }),
  });

  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return (
    (data?.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('')
      .trim() || ''
  );
}
