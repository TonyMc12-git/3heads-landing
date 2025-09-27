// netlify/functions/compare.js
// Node 18+ on Netlify has global fetch.
// Env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY.

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }

    const { prompt = 'Say hello briefly.' } = JSON.parse(event.body || '{}');

    const [openai, claude, gemini] = await Promise.all([
      callOpenAI(prompt).catch(e => `OpenAI error: ${msg(e)}`),
      callClaude(prompt).catch(e => `Claude error: ${msg(e)}`),
     // callGemini(prompt).catch(e => `Gemini error: ${msg(e)}`),
      callDeepSeek(prompt).catch(e => `DeepSeek error: ${msg(e)}`),
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
  return data.content?.[0]?.text ?? '';
}

// --- Gemini ---

async function pickGeminiModel(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();

  const names = new Set((data.models || []).map(m => m.name.replace(/^models\//, "")));

  if (names.has("gemini-1.5-pro")) return "gemini-1.5-pro";
  if (names.has("gemini-1.5-flash")) return "gemini-1.5-flash";
  if (names.has("gemini-1.5-flash-8b")) return "gemini-1.5-flash-8b";

  console.error("Gemini ListModels available:", [...names]);
  // safe default
  return "gemini-1.5-flash";
}

async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');

  const model = "gemini-2.5-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  });

async function callDeepSeek(prompt) {
  const key = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");

  const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 400
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return data?.choices?.[0]?.message?.content ?? "";
}

  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));

  const text = (data.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '')
    .join('');
  return text;
}
