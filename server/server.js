// server/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 5000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MODEL || "gemini-1.5-flash";

if (!GEMINI_API_KEY) {
  console.error("Missing GEMINI_API_KEY in .env — add GEMINI_API_KEY=your_key");
  process.exit(1);
}

const COMMENTS_FILE = path.join(__dirname, "comments.json");

// Ensure comments file exists
function ensureCommentsFile() {
  if (!fs.existsSync(COMMENTS_FILE)) {
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2));
  }
}
ensureCommentsFile();

// Safe JSON parse helper (tries to extract JSON from model response)
function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (e) {}
  // strip triple backticks and possible "```json"
  const cleaned = String(text).replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {}
  const m = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) {
    try { return JSON.parse(m[1]); } catch (e) {}
  }
  throw new Error("AI response parse error");
}

// Call Gemini and request application/json responses when possible
async function callGeminiJSON(prompt, temperature = 0.3) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, responseMimeType: "application/json" }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Try parsed JSON first; if responseMimeType worked it should be pure JSON.
  return safeJsonParse(raw);
}

// --- Basic health / root ---
app.get("/", (_req, res) => res.json({ message: "Career Advisor backend running 🚀", model: MODEL }));
app.get("/api/health", (_req, res) => res.json({ ok: true, model: MODEL }));

// --- Analyze answers -> suggest 3 roles (guarantee avg_salary_INR + scope) ---
app.post("/api/analyze", async (req, res) => {
  try {
    const answers = req.body.answers || {};
    const prompt = `
You are a career advisor for Indian students. Given the following answers (JSON), choose the best 3 career roles across any field.
Answers: ${JSON.stringify(answers, null, 2)}

Respond with EXACT JSON:
{
  "roles": [
    {
      "title": "string",
      "description": "short 1-2 line description",
      "avg_salary_INR": "entry-level salary estimate in INR, e.g., '3-6 LPA'",
      "scope": "1-line future scope in India",
      "why_fit": "1-2 line reason based on the answers"
    },
    { ... },
    { ... }
  ]
}
Return only valid JSON.
`;
    const parsed = await callGeminiJSON(prompt, 0.25);
    const roles = Array.isArray(parsed?.roles) ? parsed.roles.slice(0,3).map(r => ({
      title: String(r?.title ?? "").trim(),
      description: String(r?.description ?? "").trim(),
      avg_salary_INR: String(r?.avg_salary_INR ?? "—").trim(),
      scope: String(r?.scope ?? "—").trim(),
      why_fit: String(r?.why_fit ?? "").trim(),
    })) : [];

    if (!roles.length) return res.status(500).json({ error: "No roles returned from AI" });
    return res.json({ roles });
  } catch (e) {
    console.error("Analyze error:", e.message || e);
    return res.status(500).json({ error: e.message || "Analyze failed" });
  }
});

// --- Details for a given role: concepts + youtube search queries ---
app.post("/api/details", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "title required" });

    const prompt = `
You are an expert curriculum-designer. For the role "${title}" return EXACT JSON:
{
  "concepts": ["at least 5 concise core concepts/skills to learn"],
  "youtube_queries": ["for each concept provide a beginner-friendly YouTube SEARCH query text (not a link)"]
}
Return only valid JSON.
`;
    const parsed = await callGeminiJSON(prompt, 0.25);
    // Normalize arrays to strings
    const concepts = Array.isArray(parsed?.concepts) ? parsed.concepts.map(x => String(x).trim()) : [];
    let youtube_queries = Array.isArray(parsed?.youtube_queries) ? parsed.youtube_queries.map(x => String(x).trim()) : [];
    // If youtube_queries fewer than concepts, synthesize simple ones
    if (youtube_queries.length < concepts.length) {
      const extra = concepts.slice(youtube_queries.length).map(c => `Introduction to ${c} for beginners`);
      youtube_queries = [...youtube_queries, ...extra];
    }
    return res.json({ concepts: concepts.slice(0,12), youtube_queries: youtube_queries.slice(0,12) });
  } catch (e) {
    console.error("Details error:", e.message || e);
    return res.status(500).json({ error: e.message || "Details failed" });
  }
});

// --- Pathway: roadmap with higher_education_options (ensure avg_salary_INR there) ---
app.post("/api/pathway", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "title required" });

    const prompt = `
Create a practical roadmap for a student in India to become a "${title}" starting from 12th/PUC. Include affordability and realistic steps.
Return EXACT JSON:
{
  "timeline_years": number,
  "steps": [
    { "title": "string", "description":"string", "skills": ["..."], "duration_months": number, "suggested_resources": ["..."] }
  ],
  "internship_ideas": ["6-8 ideas"],
  "budget_tips": ["7-8 tips"],
  "higher_education_options": [
    { "degree":"string","specialization":"string","avg_salary_INR":"string","typical_exams":["..."],"universities_example":["..."],"benefits":["..."],"cost_note":"string" }
  ]
}
Return only valid JSON.
`;
    const parsed = await callGeminiJSON(prompt, 0.25);

    // normalize
    const timeline_years = Number(parsed?.timeline_years) || null;
    const steps = Array.isArray(parsed?.steps) ? parsed.steps.map(s => ({
      title: String(s?.title ?? "").trim(),
      description: String(s?.description ?? "").trim(),
      skills: Array.isArray(s?.skills) ? s.skills.map(x => String(x)) : [],
      duration_months: Number(s?.duration_months) || null,
      suggested_resources: Array.isArray(s?.suggested_resources) ? s.suggested_resources.map(x => String(x)) : []
    })) : [];

    const internship_ideas = Array.isArray(parsed?.internship_ideas) ? parsed.internship_ideas.map(x => String(x)) : [];
    const budget_tips = Array.isArray(parsed?.budget_tips) ? parsed.budget_tips.map(x => String(x)) : [];
    const higher_education_options = Array.isArray(parsed?.higher_education_options) ? parsed.higher_education_options.map(h => ({
      degree: String(h?.degree ?? "").trim(),
      specialization: String(h?.specialization ?? "").trim(),
      avg_salary_INR: String(h?.avg_salary_INR ?? "—").trim(),
      typical_exams: Array.isArray(h?.typical_exams) ? h.typical_exams.map(x => String(x)) : [],
      universities_example: Array.isArray(h?.universities_example) ? h.universities_example.map(x => String(x)) : [],
      benefits: Array.isArray(h?.benefits) ? h.benefits.map(x => String(x)) : [],
      cost_note: String(h?.cost_note ?? "").trim()
    })) : [];

    return res.json({ timeline_years, steps, internship_ideas, budget_tips, higher_education_options });
  } catch (e) {
    console.error("Pathway error:", e.message || e);
    return res.status(500).json({ error: e.message || "Pathway failed" });
  }
});

// --- COMMENTS persistence (file-based) ---
// GET /api/comments?role=ROLE  -> returns comments (latest first). If role provided and none found, generate a seed comment via AI (not persisted).
// POST /api/comments -> { name, text, role } persisted.

app.get("/api/comments", async (req, res) => {
  try {
    const role = req.query.role ? String(req.query.role).trim() : null;
    ensureCommentsFile();
    const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
    const db = JSON.parse(raw);
    let comments = Array.isArray(db.comments) ? db.comments.slice().reverse() : []; // newest first

    if (role) {
      comments = comments.filter(c => String(c.role || "").toLowerCase() === role.toLowerCase());
    }

    // if role requested and no comments -> generate a seed example comment from AI (but do not persist)
    if (role && comments.length === 0) {
      try {
        const prompt = `
You are an experienced professional. Write one helpful 2-3 sentence comment about working as a "${role}".
Include one short certification/book suggestion and one practical mini project idea.
Return JSON: { "name": "string", "text": "string", "role": "${role}" }
Return only valid JSON.
`;
        const parsed = await callGeminiJSON(prompt, 0.25);
        const seed = {
          id: `seed-${Date.now()}`,
          name: parsed?.name ? String(parsed.name) : "Pro Tip",
          text: parsed?.text ? String(parsed.text) : String(parsed).slice(0,300),
          role: role,
          timestamp: Date.now(),
          auto: true
        };
        return res.json({ comments: [seed] });
      } catch (err) {
        // fallback to empty
        return res.json({ comments: [] });
      }
    }

    return res.json({ comments });
  } catch (e) {
    console.error("Comments get error:", e);
    return res.status(500).json({ error: "Failed to read comments" });
  }
});

app.post("/api/comments", (req, res) => {
  try {
    const { name, text, role } = req.body;
    if (!text || !role) return res.status(400).json({ error: "text and role are required" });
    ensureCommentsFile();
    const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
    const db = JSON.parse(raw);
    const entry = {
      id: `c_${Date.now()}`,
      name: String(name || "Anonymous").trim(),
      text: String(text).trim(),
      role: String(role).trim(),
      timestamp: Date.now(),
      auto: false
    };
    db.comments = db.comments || [];
    db.comments.push(entry);
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(db, null, 2), "utf8");
    return res.json({ ok: true, comment: entry });
  } catch (e) {
    console.error("Comments post error:", e);
    return res.status(500).json({ error: "Failed to save comment" });
  }
});

// --- STAY AHEAD tips (AI generated) ---
app.post("/api/stayahead", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const answers = req.body?.answers || {};
    if (!title) return res.status(400).json({ error: "title required" });

    const prompt = `
You are an expert career coach. For the role "${title}" produce 6 concise "stay ahead" tips for a student who has completed the basic roadmap.
Include:
- 2-3 short certificate suggestions (affordable/online),
- 2 mini-project ideas to strengthen portfolio,
- 1 networking tip,
- 1 soft-skill to practice.
Return JSON: { "tips": ["tip1","tip2", ...] }
Return only valid JSON.
`;

    const parsed = await callGeminiJSON(prompt, 0.25);
    const tips = Array.isArray(parsed?.tips) ? parsed.tips.map(x => String(x)) : [];
    return res.json({ tips });
  } catch (e) {
    console.error("Stayahead error:", e);
    return res.status(500).json({ error: "Failed to generate tips" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
