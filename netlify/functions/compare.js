// netlify/functions/compare.js 
// Node 18+ on Netlify has global fetch. 
// Env vars: OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }
    const { prompt = 'Say hello briefly.', withGemini = false } = JSON.parse(event.body || '{}');
    
    // Call them one at a time, not simultaneously
    let openai, claude, gemini;
    
    try {
      openai = await callOpenAI(prompt);
    } catch (e) {
      openai = `OpenAI error: ${msg(e)}`;
    }
    
    try {
      claude = await callClaude(prompt);
    } catch (e) {
      claude = `Claude error: ${msg(e)}`;
    }
    
    if (withGemini) {
      try {
        gemini = await callGemini(prompt);
      } catch (e) {
        gemini = `Gemini error: ${msg(e)}`;
      }
    }
    
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

// --- OpenAI with Web Search ---
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
      model: 'gpt-4o-search-preview',
      web_search_options: {},
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// --- Anthropic (Claude) with Web Search ---
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
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search"
        }
      ]
    })
  });
  
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  
  const textBlocks = data.content
    ?.filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n\n') ?? '';
    
  return textBlocks;
}

// --- Gemini with Google Search Grounding ---
async function callGemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  
  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${key}`;
  
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      tools: [
        {
          google_search: {}
        }
      ]
    })
  });
  
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || '')
    .join('')
    .trim();
  return text || '';
}
