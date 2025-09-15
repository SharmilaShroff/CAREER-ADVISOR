// App.jsx
import React, { useMemo, useState } from "react";

const API_BASE = "http://localhost:5000"; // change if your backend is deployed

const QUESTIONS = [
  { id: "q1", text: "Which subjects did you enjoy most in 11th/12th/PUC?", type: "multi", options: ["Math", "Physics", "Chemistry", "Biology", "CS/IT", "Economics", "Business", "Arts/Design", "English/Comms", "History", "Law", "Medicine"] },
  { id: "q2", text: "Preferred work style?", type: "single", options: ["Individual contributor", "Small team", "Large cross-functional teams", "Customer-facing"] },
  { id: "q3", text: "Do you like coding?", type: "single", options: ["Love it", "Like it", "Neutral", "Prefer not"] },
  { id: "q4", text: "Comfort with mathematics?", type: "single", options: ["High", "Medium", "Low"] },
  { id: "q5", text: "Interest areas", type: "multi", options: ["AI/ML", "Web/App Dev", "Data/Analytics", "Cloud/DevOps", "Cybersecurity", "UI/UX", "Product/Strategy", "Marketing/Sales", "Medicine", "Law", "Architecture", "Finance", "Arts & Media"] },
  { id: "q6", text: "How important is salary in the first 3 years?", type: "single", options: ["Very high", "Moderate", "Less important"] },
  { id: "q7", text: "Risk appetite (startups, experimentation)?", type: "single", options: ["High", "Medium", "Low"] },
  { id: "q8", text: "Do you prefer research/theory or building things?", type: "single", options: ["Research/theory", "Balanced", "Hands-on building"] },
  { id: "q9", text: "People interaction vs deep work?", type: "single", options: ["Mostly people", "Balanced", "Mostly deep work"] },
  { id: "q10", text: "Comfort presenting ideas to an audience?", type: "single", options: ["Very", "Somewhat", "Not really"] },
  { id: "q11", text: "Pick domains you’re curious about", type: "multi", options: ["FinTech", "HealthTech", "EdTech", "E-commerce", "Gaming", "SaaS", "Manufacturing/IoT", "Law & Justice", "Architecture"] },
  { id: "q12", text: "Preferred learning mode", type: "single", options: ["Videos", "Docs/Books", "Projects", "Mentorship/Clubs"] },
  { id: "q13", text: "Time you can dedicate weekly now?", type: "single", options: ["<5 hrs", "5-10 hrs", "10-20 hrs", ">20 hrs"] },
  { id: "q14", text: "Location preference", type: "single", options: ["Bengaluru", "Hyderabad", "Pune", "Remote/flexible", "Other India"] },
  { id: "q15", text: "Long-term goal mix", type: "multi", options: ["Leadership", "Specialist/Expert", "Entrepreneurship", "Research/Academia"] },
];

function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: active ? "2px solid #111" : "1px solid #ddd",
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
        minWidth: 120,
        textAlign: "center",
      }}
    >
      {children}
    </button>
  );
}

function DarkBtn({ children, onClick, style = {}, type = "button", disabled = false }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 18px",
        borderRadius: 12,
        background: disabled ? "#444" : "#111",
        color: "#fff",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 600,
        minWidth: 140,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function LoadingOverlay({ text = "Thinking..." }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(255,255,255,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, border: "6px solid #ddd", borderTop: "6px solid #111",
          borderRadius: 999, margin: "0 auto", animation: "spin 1s linear infinite"
        }} />
        <div style={{ marginTop: 12, fontWeight: 700 }}>{text}</div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </div>
  );
}

export default function App() {
  // UI steps: start | comment_form | questions | results | detail | path | comments_role | stay | thanks
  const [step, setStep] = useState("start");

  // comments form on start
  const [commentTopic, setCommentTopic] = useState(""); // required
  const [commentText, setCommentText] = useState(""); // required
  const [commentName, setCommentName] = useState(""); // optional
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // questions state
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // mapping q.id -> array of options

  // results / roles
  const [roles, setRoles] = useState([]); // top 3 expected
  const [selectedRole, setSelectedRole] = useState(null);
  const [roleDetail, setRoleDetail] = useState(null);
  const [pathway, setPathway] = useState(null);

  // comments for roles
  const [roleComments, setRoleComments] = useState([]);

  // stay ahead tips
  const [stayTips, setStayTips] = useState([]);

  // helpers
  function safeText(v) {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object") return v.name || JSON.stringify(v);
    return String(v);
  }

  function toggleOption(q, opt) {
    setAnswers(prev => {
      const cur = new Set(prev[q.id] || []);
      if (q.type === "single") {
        return { ...prev, [q.id]: [opt] };
      }
      if (cur.has(opt)) cur.delete(opt);
      else cur.add(opt);
      return { ...prev, [q.id]: [...cur] };
    });
  }

  const currentQ = QUESTIONS[qIdx];

  // API calls: analyze, details, pathway, comments, stayahead
  async function submitCommentFromStart() {
    // topic and comment mandatory per your requirement
    if (!commentTopic.trim() || !commentText.trim()) {
      alert("Please enter Topic and Comment to submit.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // post to backend
      await fetch(`${API_BASE}/api/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: commentName || "Anonymous", text: commentText, role: commentTopic.trim() })
      });
      // after post, go back to start
      setCommentTopic(""); setCommentName(""); setCommentText("");
      setStep("start");
      alert("Comment submitted — thank you!");
    } catch (e) {
      setError("Failed to submit comment");
    } finally { setLoading(false); }
  }

  async function analyzeAnswers() {
    // ensure all 15 questions answered (each question should have at least one option)
    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      if (!answers[q.id] || answers[q.id].length === 0) {
        alert(`Please answer question ${i + 1} before submitting.`);
        return;
      }
    }
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Analyze failed");
      // expecting data.roles = [{title, description, avg_salary_INR, why_fit}, ...]
      setRoles(data.roles?.slice(0, 3) || []);
      setStep("results");
    } catch (e) {
      setError(e.message || "Analyze failed");
    } finally { setLoading(false); }
  }

  async function loadDetails(role) {
    setSelectedRole(role);
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/details`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: role.title })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Details failed");
      setRoleDetail(data); // expecting data.concepts (array), data.youtube_queries maybe
      setStep("detail");
    } catch (e) {
      setError(e.message || "Failed to fetch details");
    } finally { setLoading(false); }
  }

  async function generateRoadmap(role) {
    if (role) setSelectedRole(role);
    if (!selectedRole && !role) return;
    setLoading(true); setError("");
    try {
      const title = (role || selectedRole).title;
      const r = await fetch(`${API_BASE}/api/pathway`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Pathway failed");
      setPathway(data); // expecting detailed roadmap structure
      setStep("path");
    } catch (e) {
      setError(e.message || "Failed to generate roadmap");
    } finally { setLoading(false); }
  }

  async function openRoleComments(roleTitle) {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/comments?role=${encodeURIComponent(roleTitle)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Failed to fetch comments");
      const c = data.comments || [];
      if (c.length === 0) {
        // if backend doesn't provide a seed AI comment, use a client-side fallback message:
        setRoleComments([{ id: "ai-1", name: "AI suggestion", text: `No user comments yet for "${roleTitle}". Example comment: "I found this role aligns with strong problem-solving and communication. Great for those who enjoy building products and collaborating with teams."`, role: roleTitle, timestamp: Date.now() }]);
      } else {
        setRoleComments(c);
      }
      setStep("comments_role");
    } catch (e) {
      setError(e.message || "Failed to load comments");
    } finally { setLoading(false); }
  }

  async function getStayAhead(roleTitle) {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API_BASE}/api/stayahead`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: roleTitle, answers })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Stay ahead failed");
      setStayTips(data.tips || []); // expecting array of tips
      setStep("stay");
    } catch (e) {
      setError(e.message || "Failed to get Stay Ahead tips");
    } finally { setLoading(false); }
  }

  function resetAll() {
    setStep("start");
    setCommentTopic(""); setCommentText(""); setCommentName("");
    setQIdx(0); setAnswers({});
    setRoles([]); setSelectedRole(null); setRoleDetail(null); setPathway(null);
    setRoleComments([]); setStayTips([]); setError(""); setLoading(false);
  }

  function downloadReportPDF() {
    const title = selectedRole?.title || "Career Report";
    const concepts = roleDetail?.concepts || [];
    const steps = pathway?.steps || [];
    const he = pathway?.higher_education_options || [];
    const internships = pathway?.internship_ideas || [];
    const budget = pathway?.budget_tips || [];

    const html = `
      <html>
        <head><title>${title} - Career Report</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}
          h1{font-size:22px}
          h2{font-size:18px;margin-top:18px}
          ul{margin-left:18px}
        </style>
        </head>
        <body>
          <h1>${title} - Career Report</h1>
          <h2>Summary of your answers</h2>
          <ul>${Object.entries(answers).map(([k,v])=>`<li><b>${k}</b>: ${Array.isArray(v)?v.join(", "):v}</li>`).join("")}</ul>
          <h2>Core Concepts</h2>
          <ul>${concepts.map(c=>`<li>${safeText(c)}</li>`).join("")}</ul>
          <h2>Roadmap</h2>
          <ol>${steps.map(s=>`<li><b>${safeText(s.title)}</b> - ${safeText(s.description)} <ul>${(s.skills||[]).map(sk=>`<li>${safeText(sk)}</li>`).join("")}</ul></li>`).join("")}</ol>
          <h2>Internship Ideas</h2><ul>${(internships||[]).map(i=>`<li>${safeText(i)}</li>`).join("")}</ul>
          <h2>Higher Education</h2>${he.map(h=>`<div><b>${safeText(h.degree)}</b> - ${safeText(h.universities_example?.join(", ")) || ""} - Avg salary: ${safeText(h.avg_salary_INR)} - Cost: ${safeText(h.cost_note)}<div>${safeText(h.description||"")}</div></div>`).join("")}
          <script>setTimeout(()=>{window.print();},300)</script>
        </body>
      </html>
    `;
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
  }

  // Render helpers
  function renderStart() {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "70vh" }}>
        <div style={{ textAlign: "center", width: "100%" }}>
          <div style={{ marginBottom: 18 }}>
            <DarkBtn onClick={() => setStep("questions")} style={{ minWidth: 200 }}>Start Career Advisor</DarkBtn>
          </div>
          <div>
            <DarkBtn onClick={() => setStep("comment_form")} style={{ minWidth: 200 }}>Comment</DarkBtn>
          </div>
        </div>
      </div>
    );
  }

  function renderCommentForm() {
    const canSubmit = commentTopic.trim().length > 0 && commentText.trim().length > 0;
    return (
      <div style={{ display: "grid", placeItems: "center", paddingTop: 40 }}>
        <div style={{ width: 760, background: "#fff", padding: 20, borderRadius: 14, boxShadow: "0 6px 30px rgba(0,0,0,0.06)" }}>
          <h2 style={{ marginTop: 0 }}>Post a comment</h2>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Topic (role) — required</label>
            <input value={commentTopic} onChange={e => setCommentTopic(e.target.value)} placeholder="e.g. Product Manager" style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Comment — required</label>
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write your comment..." style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", minHeight: 120 }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Your name — optional</label>
            <input value={commentName} onChange={e => setCommentName(e.target.value)} placeholder="Your name (optional)" style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd" }} />
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <DarkBtn onClick={() => { setStep("start"); }} style={{ minWidth: 140 }}>Back</DarkBtn>
            <DarkBtn onClick={submitCommentFromStart} disabled={!canSubmit} style={{ minWidth: 140 }}>Submit</DarkBtn>
          </div>
        </div>
      </div>
    );
  }

  function renderQuestions() {
    const cur = QUESTIONS[qIdx];
    const curAnswers = answers[cur.id] || [];
    const canNext = curAnswers && curAnswers.length > 0;
    const isLast = qIdx === QUESTIONS.length - 1;
    return (
      <div style={{ display: "grid", placeItems: "center", paddingTop: 24 }}>
        <div style={{ width: 860, background: "#fff", padding: 20, borderRadius: 14, boxShadow: "0 6px 30px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700 }}>Q{qIdx + 1}. {cur.text}</div>
            <div style={{ fontSize: 13, color: "#666" }}>{qIdx + 1}/{QUESTIONS.length}</div>
          </div>

          <div style={{
            display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
            justifyContent: "center", marginBottom: 18
          }}>
            {cur.options.map(opt => {
              const active = (answers[cur.id] || []).includes(opt);
              return <Pill key={opt} active={active} onClick={() => toggleOption(cur, opt)}>{opt}</Pill>;
            })}
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <DarkBtn onClick={() => { if (qIdx === 0) setStep("start"); else setQIdx(qIdx - 1); }}>Back</DarkBtn>
            {!isLast ? (
              <DarkBtn onClick={() => setQIdx(qIdx + 1)} disabled={!canNext}>Next</DarkBtn>
            ) : (
              <DarkBtn onClick={analyzeAnswers} disabled={!canNext}>Submit</DarkBtn>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderResults() {
    return (
      <div style={{ display: "grid", justifyItems: "center", paddingTop: 24 }}>
        <div style={{ width: 900 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Top Matches</h2>
            <div>
              <button onClick={() => { setStep("questions"); setQIdx(0); }} style={{ background: "none", border: "none", color: "#111", textDecoration: "underline", cursor: "pointer" }}>Edit answers</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            {roles.map((r, i) => (
              <div key={r.title} style={{ background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: 12, color: "#666" }}>Rank #{i + 1}</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{r.title}</div>
                <div style={{ marginTop: 8, color: "#333" }}>{safeText(r.description || r.short_description || r.summary || "")}</div>
                <div style={{ marginTop: 8 }}><b>Average salary (INR):</b> {safeText(r.avg_salary_INR || r.avg_salary || "—")}</div>
                <div style={{ marginTop: 8, color: "#666" }}><b>Why suggested:</b> {safeText(r.why_fit || r.reason || "")}</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12 }}>
                  <DarkBtn onClick={() => loadDetails(r)}>More details →</DarkBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderDetail() {
    const concepts = roleDetail?.concepts || [];
    // youtube queries: if roleDetail has youtube_queries array use them else create from concepts
    const youtubeQueries = roleDetail?.youtube_queries || concepts.map(c => `${selectedRole.title} ${c} tutorial`);
    return (
      <div style={{ display: "grid", placeItems: "center", paddingTop: 24 }}>
        <div style={{ width: 900, background: "#fff", padding: 20, borderRadius: 14, boxShadow: "0 6px 30px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>{selectedRole.title} — Learning Overview</h2>
            <div>
              <button onClick={() => setStep("results")} style={{ background: "none", border: "none", color: "#111", textDecoration: "underline", cursor: "pointer" }}>Back to results</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
            <div style={{ background: "#fff" }}>
              <div style={{ fontWeight: 700 }}>Core concepts</div>
              <ul>
                {concepts.slice(0, 6).map((c, idx) => <li key={idx}>{safeText(c)}</li>)}
              </ul>
            </div>

            <div>
              <div style={{ fontWeight: 700 }}>YouTube: search queries (click to open)</div>
              <ul>
                {youtubeQueries.slice(0, 6).map((q, i) => (
                  <li key={i}><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer">{q}</a></li>
                ))}
              </ul>
              <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>Links open YouTube search results (not a specific video).</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 18 }}>
            <DarkBtn onClick={() => setStep("results")}>Back</DarkBtn>
            <DarkBtn onClick={() => generateRoadmap(selectedRole)}>Generate Roadmap</DarkBtn>
          </div>
        </div>
      </div>
    );
  }

  function renderPathway() {
    // pathway expected structure: timeline_years, steps: [{title, duration_months, description, skills, suggested_resources}], internship_ideas, budget_tips, higher_education_options
    const p = pathway || {};
    return (
      <div style={{ display: "grid", placeItems: "center", paddingTop: 24 }}>
        <div style={{ width: 980, background: "#fff", padding: 20, borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Roadmap to {selectedRole.title}</h2>
            <div />
          </div>

          <div style={{ marginTop: 12, fontSize: 14, color: "#666" }}>Typical timeline: {safeText(p.timeline_years) || "—"} years</div>

          <div style={{ background: "#fff", padding: 16, borderRadius: 10, marginTop: 12 }}>
            <ol>
              {(p.steps || []).map((s, i) => (
                <li key={i} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 700 }}>{safeText(s.title)} {s.duration_months ? <span style={{ color: "#666", fontWeight: 500 }}>({safeText(s.duration_months)} months)</span> : null}</div>
                  <div style={{ marginTop: 6 }}>{safeText(s.description)}</div>
                  {s.skills?.length > 0 && <div style={{ marginTop: 6 }}><b>Skills:</b><ul>{s.skills.map((sk, j) => <li key={j}>{safeText(sk)}</li>)}</ul></div>}
                  {s.suggested_resources?.length > 0 && <div style={{ marginTop: 6 }}><b>Resources:</b><ul>{s.suggested_resources.map((r, j) => <li key={j}>{safeText(r)}</li>)}</ul></div>}
                </li>
              ))}
            </ol>
          </div>

          <div style={{ marginTop: 18 }}>
            <h3>Internship ideas</h3>
            <ul>{(p.internship_ideas || []).map((it, i) => <li key={i}>{safeText(it)}</li>)}</ul>

            <h3>Certifications & avg costs (examples)</h3>
            <ul>{(p.certification_examples || []).map((c, i) => <li key={i}><b>{safeText(c.name)}</b> — {safeText(c.description)} (Est. cost: {safeText(c.cost)})</li>)}</ul>

            <h3>Budget tips</h3>
            <ul>{(p.budget_tips || []).map((bt, i) => <li key={i}>{safeText(bt)}</li>)}</ul>

            <h3>Higher education options</h3>
            {(p.higher_education_options || []).map((h, i) => (
              <div key={i} style={{ background: "#fafafa", padding: 12, borderRadius: 10, marginTop: 10 }}>
                <div><b>Degree:</b> {safeText(h.degree)}</div>
                {h.specialization && <div><b>Specialization:</b> {safeText(h.specialization)}</div>}
                {h.universities_example && <div><b>Institutes:</b> {safeText((h.universities_example || []).join(", "))}</div>}
                {h.avg_salary_INR && <div><b>Avg salary after:</b> {safeText(h.avg_salary_INR)}</div>}
                {h.cost_note && <div><b>Avg cost:</b> {safeText(h.cost_note)}</div>}
                {h.description && <div style={{ marginTop: 6 }}>{safeText(h.description)}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 18 }}>
            <DarkBtn onClick={() => setStep("thanks")}>Done</DarkBtn>
            <DarkBtn onClick={() => openRoleComments(selectedRole.title)}>Comments</DarkBtn>
            <DarkBtn onClick={() => getStayAhead(selectedRole.title)}>Stay Ahead</DarkBtn>
          </div>
        </div>
      </div>
    );
  }

  function renderCommentsForRole() {
    return (
      <div style={{ display: "grid", placeItems: "center", paddingTop: 24 }}>
        <div style={{ width: 780, background: "#fff", padding: 20, borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Comments for {selectedRole?.title || "role"}</h2>
            <div>
              <button onClick={() => setStep("path")} style={{ background: "none", border: "none", color: "#111", textDecoration: "underline", cursor: "pointer" }}>Back to roadmap</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            {roleComments.length === 0 ? <div>No comments yet.</div> : roleComments.map(c => (
              <div key={c.id || (c.timestamp + Math.random())} style={{ borderBottom: "1px solid #eee", padding: 10 }}>
                <div style={{ fontWeight: 700 }}>{safeText(c.name)} <span style={{ fontWeight: 500, color: "#666", fontSize: 12 }}>· {new Date(c.timestamp || Date.now()).toLocaleString()}</span></div>
                <div style={{ marginTop: 6 }}>{safeText(c.text)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8 }}><b>Post a comment for this role</b></div>
            <input placeholder="Role (auto-filled)" value={selectedRole?.title || ""} disabled style={{ width: "100%", padding: 8, marginBottom: 8 }} />
            <input placeholder="Your name (optional)" value={commentName} onChange={e => setCommentName(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 8 }} />
            <textarea placeholder="Write your comment..." value={commentText} onChange={e => setCommentText(e.target.value)} style={{ width: "100%", padding: 8, minHeight: 100 }} />
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 10 }}>
              <DarkBtn onClick={async () => {
                // post comment for this role
                if (!commentText.trim()) { alert("Comment required."); return; }
                setLoading(true);
                try {
                  await fetch(`${API_BASE}/api/comments`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: commentName || "Anonymous", text: commentText.trim(), role: selectedRole.title })
                  });
                  // reload comments
                  await openRoleComments(selectedRole.title);
                  setCommentText(""); setCommentName("");
                } catch (e) {
                  alert("Failed to post comment");
                } finally { setLoading(false); }
              }}>Post</DarkBtn>
              <DarkBtn onClick={() => { setCommentText(""); setCommentName(""); }}>Clear</DarkBtn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderStayAhead() {
    return (
      <div style={{ display: "grid", placeItems: "center", paddingTop: 24 }}>
        <div style={{ width: 760, background: "#fff", padding: 20, borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>Stay Ahead tips for {selectedRole?.title}</h2>
            <div>
              <button onClick={() => setStep("path")} style={{ background: "none", border: "none", color: "#111", textDecoration: "underline", cursor: "pointer" }}>Back</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <ul>
              {(stayTips.length > 0 ? stayTips : [
                "Top certification suggestion related to the role.",
                "Specific online course project to build and showcase.",
                "Key soft skill to practise and where to practise it.",
                "Suggested internship type and how to approach recruiters.",
                "Portfolio / GitHub ideas to demonstrate skills.",
                "Networking & mentorship actions (what to say & where)."
              ]).slice(0, 6).map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16 }}>
            <DarkBtn onClick={() => setStep("comments_role")}>Comments</DarkBtn>
            <DarkBtn onClick={() => setStep("thanks")}>Done</DarkBtn>
          </div>
        </div>
      </div>
    );
  }

  function renderThanks() {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "70vh" }}>
        <div style={{ textAlign: "center" }}>
          <h2>🎉 Thank you!</h2>
          <div style={{ marginTop: 12, display: "flex", gap: 12, justifyContent: "center" }}>
            <DarkBtn onClick={downloadReportPDF}>Download PDF</DarkBtn>
            <DarkBtn onClick={resetAll}>Restart</DarkBtn>
          </div>
        </div>
      </div>
    );
  }

  // main render
  return (
    <div style={{ minHeight: "100vh", background: "#f7f7fb", fontFamily: "Inter, Roboto, Arial, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontWeight: 800 }}>Career Advisor</h1>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ color: "#666", fontSize: 13 }}>Powered by AI</div>
            <button onClick={resetAll} style={{ background: "none", border: "none", color: "#111", cursor: "pointer", textDecoration: "underline" }}>Reset</button>
          </div>
        </header>

        {error && <div style={{ color: "#b00020", marginBottom: 12 }}>{error}</div>}

        {loading && <LoadingOverlay text="Working..." />}

        {step === "start" && renderStart()}
        {step === "comment_form" && renderCommentForm()}
        {step === "questions" && renderQuestions()}
        {step === "results" && renderResults()}
        {step === "detail" && renderDetail()}S
        {step === "path" && renderPathway()}
        {step === "comments_role" && renderCommentsForRole()}
        {step === "stay" && renderStayAhead()}
        {step === "thanks" && renderThanks()}
      </div>
    </div>
  );
}


