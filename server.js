import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
        model: "claude-3-haiku-20240307",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: text });
    }

    const data = await r.json();
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
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `gemini-1.5-flash-latest:generateContent?key=${process.env.GOOGLE_API_KEY}`;

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

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
