// netlify/functions/compare.js
// Runtime: Node 18+ (global fetch)

// Env vars:
// - OPENAI_API_KEY
// - ANTHROPIC_API_KEY
// - DEEPSEEK_API_KEY          // <-- New (ensure it's set in Netlify)
// - GEMINI_API_KEY            // kept for later; code is commented

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// Always return a plain string
function msg(e) {
  try {
    if (!e) return "Unknown error";
    if (typeof e === "string") return e;
    if (e.message) return e.message;
    if (e.response && e.response.status) return `HTTP ${e.response.status}`;
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
    if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

    const { prompt = "Say hello briefly." } = JSON.parse(event.body || "{}");

    const [openai, claude, deepseek /* , gemini */] = await Promise.all([
      callOpenAI(prompt).catch((e) => `OpenAI error: ${msg(e)}`),
      callClaude(prompt).catch((e) => `Claude error: ${msg(e)}`),
      callDeepSeek(prompt).catch((e) => `DeepSeek error: ${msg(e)}`),
      // callGemini(prompt).catch((e) => `Gemini error: ${msg(e)}`),
    ]);

    return json(200, { prompt, openai, claude, deepseek /* , gemini */ });
  } catch (err) {
    return json(500, { error: msg(err) });
  }
};

/* =======================
 * Providers
 * ======================= */

async function callOpenAI(prompt) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini", // or "gpt-5"
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return text.trim();
}

async function callClaude(prompt) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-7-sonnet-2025-05-28",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const text = (data.content || [])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  return text;
}

async function callDeepSeek(prompt) {
  const apiKey = (process.env.DEEPSEEK_API_KEY || "").trim(); // <-- fixed
  if (!apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat", // or "deepseek-reasoner"
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      // max_tokens: 1024,
      // stream: false,
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  return text.trim();
}

/* Gemini (kept for later) */
// async function callGemini(prompt) {
//   const apiKey = (process.env.GEMINI_API_KEY || "").trim();
//   if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
//
//   const res = await fetch(
//     `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
//     {
//       method: "POST",
//       headers: { "content-type": "application/json" },
//       body: JSON.stringify({
//         contents: [{ role: "user", parts: [{ text: prompt }] }],
//       }),
//     }
//   );
//
//   if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
//   const data = await res.json();
//   const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
//   return text.trim();
// }
