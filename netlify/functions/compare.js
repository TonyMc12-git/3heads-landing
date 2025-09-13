cat > netlify/functions/compare.js <<'EOF'
// netlify/functions/compare.js

exports.handler = async (event) => {
  const origin = event.headers.origin || "";
  const allowed = [
    "https://3heads.ai",
    "http://localhost:8888",
    "http://localhost:3000",
  ];
  const cors = {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "https://3heads.ai",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "POST only" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const prompt = (body.prompt || "Say hello briefly.").toString();

    // --- OpenAI ---
    let openaiAnswer = "(OpenAI error)";
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        openaiAnswer = j.choices?.[0]?.message?.content ?? "";
      }
    } catch {}

    // --- Claude (Anthropic) ---
    let claudeAnswer = "(Claude error)";
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        claudeAnswer = j.content?.[0]?.text ?? "";
      }
    } catch {}

    // --- Gemini (uses GEMINI_API_KEY) ---
    let geminiAnswer = "(Gemini error)";
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        geminiAnswer = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "";
      }
    } catch {}

    return {
      statusCode: 200,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        openai: openaiAnswer,
        claude: claudeAnswer,
        gemini: geminiAnswer,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...cors, "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
EOF
