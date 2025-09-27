// ...everything above is unchanged...

// Compare (local dev convenience)
app.post("/compare", async (req, res) => {
  const prompt = req.body?.prompt ?? "Say hello briefly.";
  const base = `http://localhost:${process.env.PORT || 3000}`;

  try {
    const [o, c, d] = await Promise.all([
      fetch(`${base}/openai`,   { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) }),
      fetch(`${base}/claude`,   { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) }),
      fetch(`${base}/deepseek`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) }),
      // fetch(`${base}/gemini`, { ... }) // left out on purpose
    ]);

    const [oj, cj, dj] = await Promise.all([o.json(), c.json(), d.json()]);
    res.json({
      prompt,
      openai:   oj.answer ?? oj.error,
      claude:   cj.answer ?? cj.error,
      deepseek: dj.answer ?? dj.error,
      raw: { openai: oj, claude: cj, deepseek: dj }
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ...everything below is unchanged...
