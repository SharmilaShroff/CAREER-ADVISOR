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
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2), "utf8");
  } else {
    // make sure it's valid JSON with comments array
    try {
      const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
      const db = JSON.parse(raw);
      if (!Array.isArray(db.comments)) {
        fs.writeFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2), "utf8");
      }
    } catch (e) {
      // overwrite corrupted file
      fs.writeFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2), "utf8");
    }
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
// GET /api/comments?role=ROLE  -> returns comments (newest first). Fuzzy matching + AI seed if none found.
// POST /api/comments -> { name, text, role } persisted with canonicalization/tokens.

// Path to comments file (already defined earlier as COMMENTS_FILE in your file)
const atomicWriteFileSync = (targetPath, dataStr) => {
  const tmp = `${targetPath}.tmp`;
  fs.writeFileSync(tmp, dataStr, "utf8");
  fs.renameSync(tmp, targetPath);
};

// Helper: deterministic tokenization & simple heuristic canonicalizer (fast fallback)
function deterministicCanonical(roleStr) {
  const r = String(roleStr || "").trim();
  const strip = s => s.replace(/\(.*?\)/g, "").replace(/\s+in\s+.*$/i, "").replace(/\s+for\s+.*$/i, "").replace(/[-–—].*$/g, "").trim();
  let candidate = strip(r);
  const words = candidate.split(/\s+/).filter(Boolean);
  if (!words.length) candidate = r;
  else if (words.length > 4) candidate = words.slice(0, 4).join(" ");
  // Capitalize
  const canonical = candidate.split(/\s+/).map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
  const aliases = [r, canonical].filter(Boolean);
  const tokens = canonical
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return { canonical, aliases, tokens };
}

// AI-backed canonicalization (tries Gemini - falls back to deterministic)
async function canonicalizeRole(roleStr) {
  const role = String(roleStr || "").trim();
  if (!role) return deterministicCanonical(role);

  // prompt for Gemini to return canonical + aliases
  const prompt = `
You are a concise normalizer. Given a user-provided role string, return EXACT JSON:
{
  "canonical": "a short canonical role title (e.g. Product Manager)",
  "aliases": ["cleaned variants including the original"]
}
Input: "${role.replace(/"/g, '\\"')}"
Return only valid JSON.
`;
  try {
    const parsed = await callGeminiJSON(prompt, 0.25);
    const canonical = parsed?.canonical ? String(parsed.canonical).trim() : null;
    const aliases = Array.isArray(parsed?.aliases) ? parsed.aliases.map(a => String(a).trim()).filter(Boolean) : [];
    if (canonical) {
      const tokens = canonical
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
      return { canonical, aliases: aliases.length ? aliases : [role], tokens };
    }
  } catch (e) {
    // fallthrough to deterministic
    console.warn("AI canonicalize failed, using heuristic:", e?.message || e);
  }
  return deterministicCanonical(role);
}

// token overlap score (0..1)
function tokenOverlapScore(tokensA, tokensB) {
  if (!Array.isArray(tokensA) || !Array.isArray(tokensB) || tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  let common = 0;
  for (const t of tokensA) if (setB.has(t)) common++;
  return common / Math.max(tokensA.length, tokensB.length);
}

// Make sure file exists and top-level shape valid
function ensureCommentsFileSafe() {
  ensureCommentsFile(); // your existing helper ensures basic file exists
  try {
    const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
    const db = JSON.parse(raw);
    if (!Array.isArray(db.comments)) {
      atomicWriteFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2));
    }
  } catch (e) {
    atomicWriteFileSync(COMMENTS_FILE, JSON.stringify({ comments: [] }, null, 2));
  }
}

// Generate AI seed comment (not persisted) for a role
async function generateSeedComment(role) {
  try {
    const prompt = `
You are an experienced professional. Write one helpful 2-3 sentence comment about working as a "${role}".
Include one short certification/book suggestion and one practical mini project idea.
Return EXACT JSON: { "name": "string", "text": "string", "role": "${role}" }
Return only valid JSON.
`;
    const parsed = await callGeminiJSON(prompt, 0.25);
    const seed = {
      id: `seed-${Date.now()}`,
      name: parsed?.name ? String(parsed.name) : "Pro Tip",
      text: parsed?.text ? String(parsed.text) : String(parsed).slice(0, 300),
      role: role,
      canonicalRole: role,
      aliases: [role],
      tokens: (role || "").toLowerCase().split(/\s+/).filter(Boolean),
      timestamp: Date.now(),
      auto: true
    };
    return seed;
  } catch (e) {
    console.warn("Seed generation failed:", e?.message || e);
    return null;
  }
}

// GET comments (with optional role fuzzy matching)
// If ?role= provided -> return all relevant comments for that role (exact canonical + fuzzy matches)
app.get("/api/comments", async (req, res) => {
  try {
    const roleQuery = req.query.role ? String(req.query.role).trim() : null;
    ensureCommentsFileSafe();
    const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
    const db = JSON.parse(raw);
    let comments = Array.isArray(db.comments) ? db.comments.slice() : [];

    // normalize stored comments if they lack metadata (best-effort deterministic)
    let modified = false;
    for (let i = 0; i < comments.length; i++) {
      const c = comments[i];
      if (!c.canonicalRole || !Array.isArray(c.tokens) || !Array.isArray(c.aliases)) {
        const heur = deterministicCanonical(c.role || c.topic || "");
        c.canonicalRole = c.canonicalRole || heur.canonical;
        c.aliases = Array.isArray(c.aliases) && c.aliases.length ? c.aliases : heur.aliases;
        c.tokens = Array.isArray(c.tokens) && c.tokens.length ? c.tokens : heur.tokens;
        modified = true;
      }
    }
    // persist back if we added metadata (keeps future reads faster)
    if (modified) {
      try {
        atomicWriteFileSync(COMMENTS_FILE, JSON.stringify({ comments }, null, 2));
      } catch (e) {
        console.warn("Failed to persist comments metadata:", e?.message || e);
      }
    }

    // show newest-first by default
    comments.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));

    if (!roleQuery) {
      // return all comments newest-first
      return res.json({ comments });
    }

    // canonicalize the query role (AI preferred, fallback deterministic)
    const qCanonObj = await canonicalizeRole(roleQuery);
    const qCanon = qCanonObj.canonical;
    const qTokens = qCanonObj.tokens;

    // Build match list with scoring
    const matches = [];
    for (const c of comments) {
      const storedCanon = String(c.canonicalRole || "").trim();
      const storedTokens = Array.isArray(c.tokens) ? c.tokens : [];
      const storedRoleLower = String(c.role || "").toLowerCase();
      let score = 0;

      // exact canonical match (strong)
      if (storedCanon && qCanon && storedCanon.toLowerCase() === qCanon.toLowerCase()) {
        score += 2.0;
      }

      // token overlap
      const overlap = tokenOverlapScore(qTokens, storedTokens);
      score += overlap * 2.0; // scale

      // substring match on raw role or canonical
      if (storedRoleLower.includes(roleQuery.toLowerCase()) || (storedCanon && storedCanon.toLowerCase().includes(roleQuery.toLowerCase()))) {
        score += 0.5;
      }

      // small recency boost (newer slightly higher)
      const ageMs = Date.now() - (c.timestamp || c.createdAt || Date.now());
      const recencyBoost = Math.max(0, 1 - Math.min(ageMs / (1000 * 60 * 60 * 24 * 365), 1)); // 0..1
      score += recencyBoost * 0.1;

      // If score exceeds a small threshold include it
      if (score > 0.15) {
        matches.push({ comment: c, score });
      }
    }

    // Sort by score desc then timestamp desc
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.comment.timestamp || b.comment.createdAt || 0) - (a.comment.timestamp || a.comment.createdAt || 0);
    });

    const results = matches.map(m => m.comment);

    if (results.length === 0) {
      // No stored comments — return one AI-generated seed (not persisted)
      const seed = await generateSeedComment(qCanon || roleQuery);
      if (seed) return res.json({ comments: [seed], seed: true });
      return res.json({ comments: [] });
    }

    return res.json({ comments: results });
  } catch (e) {
    console.error("Comments GET error:", e);
    return res.status(500).json({ error: "Failed to read comments" });
  }
});

// POST create comment (topic/role and text required)
app.post("/api/comments", async (req, res) => {
  try {
    const { name, text, role } = req.body;
    // your frontend may call the field 'topic' instead of 'role' — support both
    const topic = role || req.body.topic || "";
    if (!text || !topic) return res.status(400).json({ error: "text and role/topic are required" });

    ensureCommentsFileSafe();
    // canonicalize (AI preferred) for better future matching
    const canon = await canonicalizeRole(topic);

    const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
    const db = JSON.parse(raw);
    db.comments = db.comments || [];

    const entry = {
      id: `c_${Date.now()}`,
      name: String(name || "Anonymous").trim(),
      text: String(text).trim(),
      role: String(topic).trim(),
      canonicalRole: canon.canonical,
      aliases: canon.aliases || [],
      tokens: canon.tokens || [],
      timestamp: Date.now(),
      auto: false
    };

    // push newest-first (unshift) to keep file in newest-first order
    db.comments.unshift(entry);

    atomicWriteFileSync(COMMENTS_FILE, JSON.stringify(db, null, 2));
    console.log(`[Comments POST] saved id=${entry.id} role="${entry.role}" total=${db.comments.length} file=${COMMENTS_FILE}`);
    return res.json({ ok: true, comment: entry, total: db.comments.length });
  } catch (e) {
    console.error("Comments POST error:", e);
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

// --- Debug helper (optional) ---
app.get("/api/debug/comments-file", (_req, res) => {
  try {
    ensureCommentsFile();
    const stats = fs.statSync(COMMENTS_FILE);
    return res.json({
      path: COMMENTS_FILE,
      size: stats.size,
      mtime: stats.mtime,
      exists: fs.existsSync(COMMENTS_FILE)
    });
  } catch (e) {
    return res.status(500).json({ error: "debug failed", detail: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`Comments file path: ${COMMENTS_FILE}`);
});
