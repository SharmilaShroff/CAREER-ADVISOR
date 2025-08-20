// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();

// Allow only the front-end origin(s) set in CORS_ORIGIN (comma-separated)
const allowed = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",");
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)) }));

app.use(express.json({ limit: "1mb" }));

const MODEL = "gemini-1.5-flash";

app.get("/", (req, res) => res.send(`API running on http://localhost:${process.env.PORT || 5000}`));

app.post("/api/generate", async (req, res) => {
  try {
    const { systemPrompt = "", userPrompt = "", json = false } = req.body || {};
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing on server" });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        ...(systemPrompt ? [{ role: "user", parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemPrompt}` }] }] : []),
        { role: "user", parts: [{ text: userPrompt }] },
      ],
      generationConfig: json
        ? { temperature: 0.4, topP: 0.9, responseMimeType: "application/json" }
        : { temperature: 0.6, topP: 0.9 },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json(data);
    res.json(data);
  } catch (err) {
    console.error("server error:", err);
    res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

