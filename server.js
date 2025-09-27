import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
// Serve the front-end from the same server
app.use(express.static(__dirname));

// Serve the compare UI at /app
app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "app.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

/**
 * POST /openai
 * body: { prompt: string }
 */
app.post("/openai", async (req, res) => {
  try {
    const prompt = req.body?.prompt ?? "Say hello briefly.";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text });
    }

    const data = await r.json();
    const answer = data.choices?.[0]?.message?.content ?? "";
    res.json({ answer, raw: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /claude
 * body: { prompt: string }
 */
app.post("/claude", async (req, res) => {
  try {
    const prompt = req.body?.prompt ?? "Say hello briefly.";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",   // <-- use Haiku
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }]  // correct schema
          }
        ]
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text });
    }

    const data = await r.json();
    // Claude responses: content is an array of blocks; first is usually {type:"text", text:"..."}
    const answer = data.content?.[0]?.text ?? "";
    res.json({ answer, raw: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /gemini
 * body: { prompt: string }
 */
app.post("/gemini", async (req, res) => {
  try {
    const prompt = req.body?.prompt ?? "Say hello briefly.";
    const endpoint =
    const endpoint =
  'https://generativelanguage.googleapis.com/v1/models/' +
  'gemini-1.5-pro:generateContent?key=' + `${process.env.GEMINI_API_KEY}`;

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
            role: "user"
          }
        ]
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text });
    }

    const data = await r.json();
    const answer =
      data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "";
    res.json({ answer, raw: data });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/compare", async (req, res) => {
  const prompt = req.body?.prompt ?? "Say hello briefly.";
  const base = `http://localhost:${process.env.PORT || 3000}`;

  try {
    const [o, c, g] = await Promise.all([
      fetch(`${base}/openai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      }),
      fetch(`${base}/claude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      }),
      fetch(`${base}/gemini`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      })
    ]);

    const [oj, cj, gj] = await Promise.all([o.json(), c.json(), g.json()]);
    res.json({
      prompt,
      openai: oj.answer ?? oj.error,
      claude: cj.answer ?? cj.error,
      gemini: gj.answer ?? gj.error,
      raw: { openai: oj, claude: cj, gemini: gj }
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
