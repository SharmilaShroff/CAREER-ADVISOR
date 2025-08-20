import React, { useMemo, useState } from "react";

// --- Simplified React app using TailwindCSS ---
// - Backend (server.js) holds the Gemini API key in .env
// - Frontend no longer stores or asks for an API key
// - API calls go only through http://localhost:5000/api/generate

const MODEL = "gemini-1.5-flash"; // fast & cheap; swap to pro for higher quality

// ------- Utility: Gemini fetch wrapper -------
async function callGemini({ systemPrompt = "", userPrompt = "", json = false }) {
  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
  const url = `${API_BASE}/api/generate`;
  const payload = { systemPrompt, userPrompt, json };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Backend error ${res.status}: ${text}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? JSON.stringify(data);
  return text;
}

// ------- Questionnaire -------
const QUESTIONS = [
  { id: "q1", text: "Which subjects did you enjoy most in 11th/12th/PUC?", type: "multi", options: ["Math", "Physics", "Chemistry", "Biology", "CS/IT", "Economics", "Business", "Arts/Design", "English/Comms"] },
  { id: "q2", text: "Preferred work style?", type: "single", options: ["Individual contributor", "Small team", "Large cross-functional teams", "Customer-facing"] },
  { id: "q3", text: "Do you like coding?", type: "single", options: ["Love it", "Like it", "Neutral", "Prefer not"] },
  { id: "q4", text: "Comfort with mathematics?", type: "single", options: ["High", "Medium", "Low"] },
  { id: "q5", text: "Interest areas", type: "multi", options: ["AI/ML", "Web/App Dev", "Data/Analytics", "Cloud/DevOps", "Cybersecurity", "UI/UX", "Product/Strategy", "Marketing/Sales"] },
  { id: "q6", text: "How important is salary in the first 3 years?", type: "single", options: ["Very high", "Moderate", "Less important"] },
  { id: "q7", text: "Risk appetite (startups, experimentation)?", type: "single", options: ["High", "Medium", "Low"] },
  { id: "q8", text: "Do you prefer research/theory or building things?", type: "single", options: ["Research/theory", "Balanced", "Hands-on building"] },
  { id: "q9", text: "People interaction vs deep work?", type: "single", options: ["Mostly people", "Balanced", "Mostly deep work"] },
  { id: "q10", text: "Comfort presenting ideas to an audience?", type: "single", options: ["Very", "Somewhat", "Not really"] },
  { id: "q11", text: "Pick domains you’re curious about", type: "multi", options: ["FinTech", "HealthTech", "EdTech", "E-commerce", "Gaming", "SaaS", "Manufacturing/IoT"] },
  { id: "q12", text: "Preferred learning mode", type: "single", options: ["Videos", "Docs/Books", "Projects", "Mentorship/Clubs"] },
  { id: "q13", text: "Time you can dedicate weekly now?", type: "single", options: ["<5 hrs", "5-10 hrs", "10-20 hrs", ">20 hrs"] },
  { id: "q14", text: "Location preference", type: "single", options: ["Bengaluru", "Hyderabad", "Pune", "Remote/flexible", "Other India"] },
  { id: "q15", text: "Long-term goal mix", type: "multi", options: ["Leadership", "Specialist/Expert", "Entrepreneurship", "Research/Academia"] },
];

function Question({ q, value, onChange }) {
  return (
    <div className="mb-6 p-4 rounded-2xl bg-white/70 shadow">
      <div className="font-medium mb-3">{q.text}</div>
      {q.type === "single" && (
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => (
            <button
              key={opt}
              onClick={() => onChange([opt])}
              className={`px-3 py-1 rounded-full border text-sm ${value?.[0] === opt ? "bg-black text-white" : "hover:bg-black/5"}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {q.type === "multi" && (
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => {
            const active = value?.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => {
                  const next = new Set(value || []);
                  active ? next.delete(opt) : next.add(opt);
                  onChange([...next]);
                }}
                className={`px-3 py-1 rounded-full border text-sm ${active ? "bg-black text-white" : "hover:bg-black/5"}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------- Main App -------
export default function App() {
  const [step, setStep] = useState("start");
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleDetail, setRoleDetail] = useState(null);
  const [pathway, setPathway] = useState(null);

  const unanswered = useMemo(() => {
    return QUESTIONS.filter((q) => !answers[q.id] || answers[q.id].length === 0).length;
  }, [answers]);

  const handleAnalyze = async () => {
    setLoading(true); setError("");
    try {
      const system = `You are a career advisor for Indian students (Bengaluru context). Always reason step-by-step but output only JSON when asked. Be practical and current.`;
      const user = `Based on the following survey answers, recommend the top 3 job roles (ordered best-first).\n\nAnswers JSON: ${JSON.stringify(answers)}\n\nFor each role, provide:\n- title (short)\n- description (<= 80 words)\n- avg_salary_INR (freshers in India; range like "4-7 LPA")\n- scope\n- why_fit\nReturn JSON { "roles": [ ... ] }`;

      const text = await callGemini({ systemPrompt: system, userPrompt: user, json: true });
      const parsed = JSON.parse(sanitizeToJson(text));
      setRoles(parsed.roles.slice(0, 3));
      setStep("results");
    } catch (e) {
      setError(e.message || "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const handleMoreDetail = async (role) => {
    setSelectedRole(role); setLoading(true); setError("");
    try {
      const system = `You are an expert curriculum designer.`;
      const user = `Role: ${role.title}\n\nReturn JSON with { concepts, starter_topics, suggested_channels }`;
      const text = await callGemini({ systemPrompt: system, userPrompt: user, json: true });
      setRoleDetail(JSON.parse(sanitizeToJson(text)));
      setStep("detail");
    } catch (e) {
      setError(e.message || "Failed to fetch details");
    } finally {
      setLoading(false);
    }
  };

  const handlePathway = async () => {
    if (!selectedRole) return;
    setLoading(true); setError("");
    try {
      const system = `You are a career roadmap planner for students in India.`;
      const user = `Create a step-by-step path from 12th/PUC to becoming a ${selectedRole.title}. Return JSON with timeline_years, steps[], budget_tips[], internship_ideas[]`;
      const text = await callGemini({ systemPrompt: system, userPrompt: user, json: true });
      setPathway(JSON.parse(sanitizeToJson(text)));
      setStep("path");
    } catch (e) {
      setError(e.message || "Failed to generate path");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setAnswers({}); setRoles([]); setSelectedRole(null); setRoleDetail(null); setPathway(null); setError(""); setStep("start");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 text-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Career Advisor</h1>
          <div className="text-xs opacity-70">Model: {MODEL}</div>
        </header>

        {step === "start" && (
          <div className="rounded-2xl bg-white/80 shadow p-6">
            <p className="mb-4">Answer a short questionnaire and get 3 tailored career suggestions, plus roadmap guidance.</p>
            <button
              onClick={() => setStep("questions")}
              className="mt-2 px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90"
            >
              Start
            </button>
          </div>
        )}

        {step === "questions" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm opacity-70">{QUESTIONS.length - unanswered} / {QUESTIONS.length} answered</div>
              <button onClick={resetAll} className="text-sm underline">Reset</button>
            </div>
            {QUESTIONS.map((q) => (
              <Question
                key={q.id}
                q={q}
                value={answers[q.id]}
                onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
              />
            ))}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAnalyze}
                disabled={loading || unanswered > 0}
                className="px-4 py-2 rounded-2xl bg-black text-white shadow disabled:opacity-40"
              >
                {loading ? "Analyzing…" : "Get Recommendations"}
              </button>
              {unanswered > 0 && <span className="text-sm opacity-70">{unanswered} left</span>}
            </div>
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </div>
        )}

        {/* Results, Detail, Pathway components remain unchanged (same as your version) */}
      </div>
    </div>
  );
}

// ------- Helpers -------
function sanitizeToJson(text) {
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) return trimmed;
    const match = trimmed.match(/[\{\[].*[\}\]]/s);
    return match ? match[0] : trimmed;
  } catch {
    return text;
  }
}

