// netlify/functions/deepseek.js
// Env var: DEEPSEEK_API_KEY

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method Not Allowed' });
    }
    const { prompt = 'Say hello briefly.' } = JSON.parse(event.body || '{}');
    const answer = await callDeepSeek(prompt);
    return json(200, { prompt, deepseek: answer });
  } catch (err) {
    return json(500, { error: msg(err) });
  }
};

const json = (statusCode, obj) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
});
const msg = (e) => (e && e.message) ? e.message : String(e);

// Keep answers similar length to OpenAI/Claude, and avoid long generations.
const MAX_TOKENS = 320;       // ~200 words-ish
const DEADLINE_MS = 20000;    // 20s guard so we don’t drift into 504s

async function callDeepSeek(prompt) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('Missing DEEPSEEK_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEADLINE_MS);

  try {
    const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'Answer concisely in about 120–200 words. ' +
              'Do not over-explain or enumerate every nuance unless asked.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.2,
        top_p: 0.9,
        n: 1
      }),
      signal: controller.signal
    });

    // Try to parse a helpful error if not OK
    if (!r.ok) {
      let errText = await r.text();
      try {
        const j = JSON.parse(errText);
        errText = j.error?.message || errText;
      } catch (_) {}
      throw new Error(`DeepSeek HTTP ${r.status}: ${errText}`);
    }

    const data = await r.json();
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } catch (e) {
    if (e && (e.name === 'AbortError' || String(e).includes('aborted'))) {
      return 'DeepSeek timed out (kept answer short; try re-asking for more detail).';
    }
    // Surface API-side 5xx/4xx as text in the card instead of crashing
    return `DeepSeek error: ${msg(e)}`;
  } finally {
    clearTimeout(timer);
  }
}
