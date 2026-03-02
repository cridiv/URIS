import { useState, useEffect, useRef } from "react";

// ── Simulated WebSocket stream ────────────────────────────────────────────────
const PIPELINE_EVENTS = [
  { type: "agent_start",    agent: "evaluation",  ts: 0 },
  { type: "agent_data",     agent: "evaluation",  ts: 900,  payload: { phase: "schema",   message: "Schema review complete — 12 columns, 891 rows detected." } },
  { type: "agent_data",     agent: "evaluation",  ts: 1600, payload: { phase: "quality",  message: "Scoring completeness, uniqueness, balance, distribution, consistency..." } },
  { type: "agent_data",     agent: "evaluation",  ts: 2200, payload: { phase: "gaps",     message: "Critical gap detected: Cabin column at 77.1% missing (HIGH)." } },
  { type: "agent_complete", agent: "evaluation",  ts: 2800, payload: {
    adfi: 0.827, confidence: 0.95,
    quality_scores: { completeness: 0.838, uniqueness: 1.0, balance: 0.615, distribution_quality: 0.889, consistency: 0.963 },
    critical_gaps: [
      { severity: "high",   description: "High missing rate in the Cabin column.",           affected_columns: ["Cabin"] },
      { severity: "medium", description: "Outlier percentage in the Parch column is high.",  affected_columns: ["Parch"] },
    ],
    reasoning_steps: [
      "Schema review — No issues detected.",
      "Completeness — 98.4% overall, significant missing in Cabin (77.1%).",
      "Distribution — Good quality, but Parch has high outlier % (23.9%).",
      "Consistency — No implausible values detected.",
      "Balance — Target column 'Survived' score: 0.615.",
      "Task relevance — Suitable for classification tasks.",
    ],
  }},

  { type: "agent_start",    agent: "planner",    ts: 3200 },
  { type: "agent_data",     agent: "planner",    ts: 4000, payload: { phase: "planning",  message: "Analyzing evaluation output and forming task queue..." } },
  { type: "agent_data",     agent: "planner",    ts: 4700, payload: { phase: "ordering",  message: "Priority 1: Compliance PII check on Name column." } },
  { type: "agent_data",     agent: "planner",    ts: 5300, payload: { phase: "ordering",  message: "Priority 2–3: Synthesis imputation and outlier handling." } },
  { type: "agent_complete", agent: "planner",    ts: 5900, payload: {
    objective: "Prepare dataset for binary classification on passenger survival",
    target_column: "Survived", risk_tolerance: "medium", adfi_baseline: 0.827,
    tasks: [
      { agent: "compliance", task: "Flag and assess PII in Name column",           priority: 1 },
      { agent: "synthesis",  task: "Impute missing values in Cabin column",        priority: 2 },
      { agent: "synthesis",  task: "Handle outliers in Parch column",              priority: 3 },
      { agent: "validation", task: "Verify improvements in dataset quality",       priority: 4 },
    ],
    constraints: ["Address missing values in Cabin", "Handle outliers in Parch", "Ensure compliance with data protection regulations"],
  }},

  { type: "agent_start",    agent: "compliance", ts: 6300 },
  { type: "agent_data",     agent: "compliance", ts: 7000, payload: { phase: "scanning",  message: "Scanning all 12 columns for PII patterns..." } },
  { type: "agent_data",     agent: "compliance", ts: 7700, payload: { phase: "pii",       message: "FOUND: 'Name' column — direct_identifier, confidence 100%." } },
  { type: "agent_data",     agent: "compliance", ts: 8300, payload: { phase: "regulatory",message: "Mapping findings to GDPR, CCPA, HIPAA exposure levels..." } },
  { type: "agent_complete", agent: "compliance", ts: 9000, payload: {
    privacy_risk_score: 0.3, confidence: 0.95, blocked_columns: ["Name"],
    pii_findings: [{ column: "Name", pii_type: "direct_identifier", confidence: 1, severity: "high" }],
    regulatory_exposure: { GDPR: "high", CCPA: "high", HIPAA: "none" },
    re_identification_risk: { score: 0.2, contributing_columns: ["Age", "Sex", "Pclass", "SibSp", "Parch"] },
    recommended_actions: [{ column: "Name", action: "extract_then_drop", extraction_detail: "Extract title → Name_title, then drop Name." }],
  }},

  { type: "agent_start",    agent: "synthesis",  ts: 9400 },
  { type: "agent_data",     agent: "synthesis",  ts: 10100, payload: { phase: "strategy",   message: "Selecting synthesis strategy — SDV GaussianCopula chosen." } },
  { type: "agent_data",     agent: "synthesis",  ts: 10800, payload: { phase: "attempt",    message: "Attempt 1/3 — budget=600 rows. Running synthesis..." } },
  { type: "agent_data",     agent: "synthesis",  ts: 11700, payload: { phase: "check",      message: "Attempt 1 — Privacy: PASS · Correlation: FAIL. Reducing budget." } },
  { type: "agent_data",     agent: "synthesis",  ts: 12400, payload: { phase: "attempt",    message: "Attempt 2/3 — budget=420 rows. Re-running synthesis..." } },
  { type: "agent_data",     agent: "synthesis",  ts: 13300, payload: { phase: "check",      message: "Attempt 2 — Privacy: PASS · Correlation: PASS. All checks passed." } },
  { type: "agent_complete", agent: "synthesis",  ts: 14000, payload: {
    status: "success", attempt: 2, strategy: "SDV_GaussianCopula",
    rows_before: 891, rows_generated: 420, rows_after: 1311,
    imputation: [
      { column: "Age",      action: "median_imputed",        value: "28",  null_rate_before: "19.9%" },
      { column: "Cabin",    action: "dropped",               value: "—",   reason: "77.1% missing" },
      { column: "Embarked", action: "mode_imputed",          value: '"S"', null_rate_before: "0.2%" },
    ],
    correlation_drift: { max_pair_difference: 0.1663, frobenius_norm: 0.3611, mean_column_drift: 0.1126 },
    per_col_drift: { Survived: 0.0426, Pclass: 0.0968, Age: 0.1663, SibSp: 0.1663, Parch: 0.1214, Fare: 0.0823 },
    trace_attempts: [
      { attempt: 1, budget: 600, privacy: "pass", correlation: "fail" },
      { attempt: 2, budget: 420, privacy: "pass", correlation: "pass" },
    ],
  }},
];

// ── Design tokens (reused everywhere) ────────────────────────────────────────
const AGENT_META = {
  evaluation: { label: "Evaluation Agent", color: "#0969DA", bg: "#EFF6FF", border: "#DBEAFE",
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" stroke="#0969DA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  planner:    { label: "Planner Agent",    color: "#7C3AED", bg: "#F5F3FF", border: "#EDE9FE",
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M12 12h.01M12 16h.01" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/></svg> },
  compliance: { label: "Compliance Agent", color: "#DC2626", bg: "#FEF2F2", border: "#FEE2E2",
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/></svg> },
  synthesis:  { label: "Synthesis Agent",  color: "#047857", bg: "#ECFDF5", border: "#D1FAE5",
    icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
};
const AGENT_ORDER = ["evaluation", "planner", "compliance", "synthesis"];

// ── Primitives ────────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const map = {
    success: { c: "#047857", bg: "#ECFDF5", b: "#D1FAE5", l: "SUCCESS" },
    pass:    { c: "#047857", bg: "#ECFDF5", b: "#D1FAE5", l: "PASS" },
    fail:    { c: "#DC2626", bg: "#FEF2F2", b: "#FEE2E2", l: "FAIL" },
    running: { c: "#B45309", bg: "#FFFBEB", b: "#FEF3C7", l: "RUNNING" },
    high:    { c: "#DC2626", bg: "#FEF2F2", b: "#FEE2E2", l: "HIGH" },
    medium:  { c: "#B45309", bg: "#FFFBEB", b: "#FEF3C7", l: "MEDIUM" },
    low:     { c: "#047857", bg: "#ECFDF5", b: "#D1FAE5", l: "LOW" },
    none:    { c: "#8B949E", bg: "#F6F8FA", b: "#E1E4E8", l: "NONE" },
    queued:  { c: "#8B949E", bg: "#F6F8FA", b: "#E1E4E8", l: "QUEUED" },
  };
  const s = map[status?.toLowerCase()] || map.none;
  return (
    <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: s.c, background: s.bg, border: `1px solid ${s.b}`, borderRadius: 5, padding: "1px 6px", letterSpacing: "0.05em" }}>
      {s.l}
    </span>
  );
}

function Tag({ children, color = "#57606A", bg = "#F6F8FA", border = "#E1E4E8" }) {
  return <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color, background: bg, border: `1px solid ${border}`, borderRadius: 5, padding: "2px 7px" }}>{children}</span>;
}

function SectionHead({ children }) {
  return <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.1em", color: "#B1BAC4", textTransform: "uppercase", marginBottom: 7, marginTop: 12 }}>{children}</div>;
}

function MiniBar({ value, color = "#0969DA" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 99, background: "#F0F2F4", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value * 100, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#24292F", minWidth: 34, textAlign: "right" }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: "1px solid #F6F8FA" }}>
      <span style={{ fontSize: 11.5, color: "#8B949E", fontFamily: "IBM Plex Sans, sans-serif", flexShrink: 0 }}>{label}</span>
      <div style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: "#24292F", textAlign: "right" }}>{children}</div>
    </div>
  );
}

// ── Typing cursor ─────────────────────────────────────────────────────────────
function Cursor() {
  const [vis, setVis] = useState(true);
  useEffect(() => { const t = setInterval(() => setVis(v => !v), 500); return () => clearInterval(t); }, []);
  return <span style={{ display: "inline-block", width: 6, height: 12, background: vis ? "#0969DA" : "transparent", borderRadius: 1, marginLeft: 2, verticalAlign: "middle", transition: "background 0.1s" }} />;
}

// ── Live log lines ────────────────────────────────────────────────────────────
function LogStream({ lines, running }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [lines]);
  return (
    <div style={{ marginTop: 10, background: "#0D1117", borderRadius: 9, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3, maxHeight: 120, overflowY: "auto" }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", color: "#3FB950", flexShrink: 0, marginTop: 1 }}>›</span>
          <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", color: "#C9D1D9", lineHeight: 1.5 }}>{l.message}</span>
        </div>
      ))}
      {running && <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", color: "#3FB950" }}>›</span><Cursor /></div>}
      <div ref={endRef} />
    </div>
  );
}

// ── Agent header ──────────────────────────────────────────────────────────────
function AgentHeader({ agentKey, status }) {
  const m = AGENT_META[agentKey];
  const statusKey = status === "complete" ? "success" : status === "running" ? "running" : "queued";
  return (
    <div style={{ padding: "11px 16px 10px", borderBottom: "1px solid #F0F2F4", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 8, padding: "3px 10px 3px 7px" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: m.color + "22", border: `1px solid ${m.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {m.icon}
        </div>
        <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: m.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{m.label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        {status === "running" && (
          <div style={{ display: "flex", gap: 3 }}>
            {[0, 1, 2].map(i => <Dot key={i} delay={i * 200} color={m.color} />)}
          </div>
        )}
        <StatusPill status={statusKey} />
      </div>
    </div>
  );
}

function Dot({ delay, color }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const loop = setInterval(() => setUp(v => !v), 600);
      return () => clearInterval(loop);
    }, delay);
    return () => clearTimeout(t);
  }, [delay]);
  return <div style={{ width: 4, height: 4, borderRadius: 99, background: up ? color : color + "44", transition: "background 0.3s" }} />;
}

// ── Result renderers per agent ────────────────────────────────────────────────
function EvaluationResult({ payload }) {
  const barColor = v => v >= 0.85 ? "#34D399" : v >= 0.65 ? "#FBBF24" : "#F87171";
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["ADFI", payload.adfi.toFixed(3)], ["Confidence", `${(payload.confidence * 100).toFixed(0)}%`], ["Rows", "891"], ["Cols", "12"]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 8, padding: "7px 5px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#0D1117", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 9, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
          </div>
        ))}
      </div>
      <SectionHead>Quality Scores</SectionHead>
      {Object.entries(payload.quality_scores).map(([k, v]) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
          <span style={{ fontSize: 11, color: "#8B949E", width: 130, flexShrink: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>{k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
          <MiniBar value={v} color={barColor(v)} />
        </div>
      ))}
      <SectionHead>Critical Gaps</SectionHead>
      {payload.critical_gaps.map((g, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: g.severity === "high" ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${g.severity === "high" ? "#FEE2E2" : "#FEF3C7"}`, borderRadius: 7, marginBottom: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginTop: 1, flexShrink: 0 }}><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={g.severity === "high" ? "#DC2626" : "#B45309"} strokeWidth="2" strokeLinecap="round"/></svg>
          <div>
            <div style={{ fontSize: 11, color: g.severity === "high" ? "#DC2626" : "#B45309", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.4 }}>{g.description}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>{g.affected_columns.map(c => <Tag key={c}>{c}</Tag>)}</div>
          </div>
        </div>
      ))}
      <SectionHead>Reasoning</SectionHead>
      {payload.reasoning_steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 8, padding: "3.5px 0", borderBottom: i < payload.reasoning_steps.length - 1 ? "1px solid #F6F8FA" : "none" }}>
          <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#B1BAC4", marginTop: 1, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
          <span style={{ fontSize: 11, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.5 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function PlannerResult({ payload }) {
  const agentColor = { compliance: "#7C3AED", synthesis: "#0969DA", validation: "#047857" };
  const agentBg    = { compliance: "#F5F3FF", synthesis: "#EFF6FF", validation: "#ECFDF5" };
  return (
    <div>
      <Row label="Target"><Tag color="#0969DA" bg="#EFF6FF" border="#DBEAFE">{payload.target_column}</Tag></Row>
      <Row label="Risk Tolerance"><StatusPill status={payload.risk_tolerance} /></Row>
      <Row label="ADFI Baseline">{payload.adfi_baseline}</Row>
      <SectionHead>Task Queue</SectionHead>
      {payload.tasks.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 0", borderBottom: i < payload.tasks.length - 1 ? "1px solid #F6F8FA" : "none" }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: agentBg[t.agent] || "#F6F8FA", border: `1px solid ${agentColor[t.agent]}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: agentColor[t.agent] || "#57606A" }}>{t.priority}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "#24292F", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.4 }}>{t.task}</div>
            <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: agentColor[t.agent] || "#57606A", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.agent}</span>
          </div>
        </div>
      ))}
      <SectionHead>Constraints</SectionHead>
      {payload.constraints.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "3px 0" }}>
          <div style={{ width: 4, height: 4, borderRadius: 99, background: "#D0D7DE", marginTop: 5, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.5 }}>{c}</span>
        </div>
      ))}
    </div>
  );
}

function ComplianceResult({ payload }) {
  const regColor = { high: "#DC2626", medium: "#B45309", low: "#047857", none: "#8B949E" };
  const regBg    = { high: "#FEF2F2", medium: "#FFFBEB", low: "#ECFDF5", none: "#F6F8FA" };
  const regBdr   = { high: "#FEE2E2", medium: "#FEF3C7", low: "#D1FAE5", none: "#E1E4E8" };
  return (
    <div>
      <Row label="Privacy Risk Score"><span style={{ color: "#B45309", fontWeight: 700 }}>{payload.privacy_risk_score.toFixed(2)} / 1.00</span></Row>
      <Row label="Confidence">{(payload.confidence * 100).toFixed(0)}%</Row>
      <Row label="Blocked"><Tag color="#DC2626" bg="#FEF2F2" border="#FEE2E2">{payload.blocked_columns[0]}</Tag></Row>
      <SectionHead>PII Finding</SectionHead>
      {payload.pii_findings.map((f, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8, padding: "8px 10px", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/></svg>
            <div>
              <div style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#DC2626" }}>{f.column}</div>
              <div style={{ fontSize: 10, color: "#B91C1C", fontFamily: "IBM Plex Mono, monospace" }}>{f.pii_type.replace(/_/g, " ")}</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
            <StatusPill status={f.severity} />
            <span style={{ fontSize: 10, color: "#B91C1C", fontFamily: "IBM Plex Mono, monospace" }}>conf. {(f.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      ))}
      <SectionHead>Regulatory Exposure</SectionHead>
      <div style={{ display: "flex", gap: 6 }}>
        {Object.entries(payload.regulatory_exposure).map(([reg, level]) => (
          <div key={reg} style={{ flex: 1, textAlign: "center", background: regBg[level], border: `1px solid ${regBdr[level]}`, borderRadius: 8, padding: "7px 4px" }}>
            <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: regColor[level] }}>{level.toUpperCase()}</div>
            <div style={{ fontSize: 9.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{reg}</div>
          </div>
        ))}
      </div>
      <SectionHead>Re-id Risk</SectionHead>
      <div style={{ background: "#FFFBEB", border: "1px solid #FEF3C7", borderRadius: 8, padding: "9px 11px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#B45309" }}>Score</span>
          <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#B45309" }}>{payload.re_identification_risk.score.toFixed(1)}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {payload.re_identification_risk.contributing_columns.map(c => <Tag key={c} color="#B45309" bg="#FEF9C3" border="#FEF3C7">{c}</Tag>)}
        </div>
      </div>
      <SectionHead>Action</SectionHead>
      {payload.recommended_actions.map((a, i) => (
        <div key={i} style={{ background: "#F0FDF4", border: "1px solid #D1FAE5", borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Tag color="#047857" bg="#DCFCE7" border="#D1FAE5">{a.column}</Tag>
            <Tag color="#0969DA" bg="#EFF6FF" border="#DBEAFE">{a.action.replace(/_/g, " ")}</Tag>
          </div>
          <div style={{ fontSize: 11, color: "#166534", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.4 }}>{a.extraction_detail}</div>
        </div>
      ))}
    </div>
  );
}

function SynthesisResult({ payload }) {
  const driftColor = v => v < 0.10 ? "#34D399" : v < 0.15 ? "#FBBF24" : "#F87171";
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["Before", "891"], ["Generated", "+420"], ["After", "1,311"], ["Attempt", "2/3"]].map(([l, v]) => (
          <div key={l} style={{ flex: 1, background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 8, padding: "7px 5px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#0D1117", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 9, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
          </div>
        ))}
      </div>
      <Row label="Strategy"><Tag color="#7C3AED" bg="#F5F3FF" border="#EDE9FE">SDV GaussianCopula</Tag></Row>
      <SectionHead>Imputation</SectionHead>
      {payload.imputation.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F6F8FA", gap: 8 }}>
          <Tag>{r.column}</Tag>
          <span style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", flex: 1, textAlign: "center" }}>{r.action.replace(/_/g, " ")}</span>
          <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: r.action === "dropped" ? "#DC2626" : "#0D1117" }}>{r.value}</span>
        </div>
      ))}
      <SectionHead>Correlation Drift</SectionHead>
      {[["Max Pair Diff.", payload.correlation_drift.max_pair_difference, 0.20], ["Frobenius Norm", payload.correlation_drift.frobenius_norm, 0.40], ["Mean Col. Drift", payload.correlation_drift.mean_column_drift, 0.20]].map(([l, v, t]) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
          <span style={{ fontSize: 10.5, color: "#8B949E", width: 100, flexShrink: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>{l}</span>
          <div style={{ flex: 1, height: 4, borderRadius: 99, background: "#F0F2F4", overflow: "hidden" }}>
            <div style={{ width: `${(v / t) * 100}%`, height: "100%", background: driftColor(v), borderRadius: 99 }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#24292F", minWidth: 38, textAlign: "right" }}>{v.toFixed(4)}</span>
        </div>
      ))}
      <SectionHead>Attempt Trace</SectionHead>
      {payload.trace_attempts.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: i === 1 ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${i === 1 ? "#D1FAE5" : "#FEE2E2"}`, borderRadius: 7, padding: "6px 10px", marginBottom: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#8B949E" }}>#{t.attempt}</span>
            <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#57606A" }}>budget={t.budget}</span>
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <StatusPill status={t.privacy} />
            <StatusPill status={t.correlation} />
          </div>
        </div>
      ))}
    </div>
  );
}

const RESULT_RENDERERS = { evaluation: EvaluationResult, planner: PlannerResult, compliance: ComplianceResult, synthesis: SynthesisResult };

// ── Arrow ─────────────────────────────────────────────────────────────────────
function Arrow({ from }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, padding: "2px 0" }}>
      <div style={{ width: 1, height: 12, background: "#E1E4E8" }} />
      <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#B1BAC4", letterSpacing: "0.08em", textTransform: "uppercase", background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 5, padding: "2px 8px" }}>
        → {AGENT_META[from]?.label.split(" ")[0].toLowerCase()} complete
      </span>
      <div style={{ width: 1, height: 12, background: "#E1E4E8" }} />
      <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#C8D0D8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );
}

// ── Agent block ───────────────────────────────────────────────────────────────
function AgentBlock({ agentKey, agentState }) {
  const { status, logs, result } = agentState;
  const ResultRenderer = RESULT_RENDERERS[agentKey];
  const isQueued = status === "queued";

  return (
    <div style={{
      background: "#fff", border: `1px solid ${isQueued ? "#F0F2F4" : "#E1E4E8"}`,
      borderRadius: 14,
      boxShadow: isQueued ? "none" : "0 1px 3px rgba(0,0,0,0.05)",
      overflow: "hidden",
      opacity: isQueued ? 0.45 : 1,
      transition: "opacity 0.4s ease, box-shadow 0.3s ease",
    }}>
      <AgentHeader agentKey={agentKey} status={status} />
      <div style={{ padding: "10px 16px 14px" }}>
        {/* Log stream — visible while running or if there are logs */}
        {(status === "running" || (status === "complete" && logs.length > 0)) && (
          <LogStream lines={logs} running={status === "running"} />
        )}

        {/* Queued placeholder */}
        {status === "queued" && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#B1BAC4" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 11.5, color: "#B1BAC4", fontFamily: "IBM Plex Mono, monospace" }}>Waiting for upstream agent…</span>
          </div>
        )}

        {/* Final result — revealed on complete */}
        {status === "complete" && result && (
          <div style={{ marginTop: logs.length > 0 ? 14 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #F0F2F4" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#34D399" strokeWidth="2" strokeLinecap="round"/></svg>
              <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#047857", textTransform: "uppercase", letterSpacing: "0.08em" }}>Agent Output</span>
            </div>
            <ResultRenderer payload={result} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PipelineLog() {
  const [agents, setAgents] = useState(() =>
    Object.fromEntries(AGENT_ORDER.map(k => [k, { status: "queued", logs: [], result: null }]))
  );
  const [started, setStarted] = useState(false);
  const [done, setDone]       = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef(null);

  const runPipeline = () => {
    if (started) return;
    setStarted(true);
    setDone(false);
    setElapsed(0);
    setAgents(Object.fromEntries(AGENT_ORDER.map(k => [k, { status: "queued", logs: [], result: null }])));

    timerRef.current = setInterval(() => setElapsed(e => e + 100), 100);

    PIPELINE_EVENTS.forEach(evt => {
      setTimeout(() => {
        setAgents(prev => {
          const agent = { ...prev[evt.agent] };
          if (evt.type === "agent_start")    { agent.status = "running"; }
          if (evt.type === "agent_data")     { agent.logs = [...agent.logs, evt.payload]; }
          if (evt.type === "agent_complete") { agent.status = "complete"; agent.result = evt.payload; }
          return { ...prev, [evt.agent]: agent };
        });
        if (evt.type === "agent_complete" && evt.agent === "synthesis") {
          clearInterval(timerRef.current);
          setDone(true);
        }
      }, evt.ts);
    });
  };

  const reset = () => {
    clearInterval(timerRef.current);
    setStarted(false); setDone(false); setElapsed(0);
    setAgents(Object.fromEntries(AGENT_ORDER.map(k => [k, { status: "queued", logs: [], result: null }])));
  };

  const activeAgent = AGENT_ORDER.find(k => agents[k].status === "running");

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>
      <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>

          {/* Header */}
          <div style={{ padding: "12px 20px 11px", borderBottom: "1px solid #F0F2F4", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "#F5F3FF", border: "1px solid #EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#57606A", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                Pipeline — titanic_v3.csv
              </span>
              {started && !done && activeAgent && (
                <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}>
                  · {AGENT_META[activeAgent]?.label}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {started && (
                <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}>
                  {(elapsed / 1000).toFixed(1)}s
                </span>
              )}
              {done
                ? <StatusPill status="success" />
                : started
                  ? <StatusPill status="running" />
                  : null
              }
              {!started ? (
                <button onClick={runPipeline} style={{ height: 30, padding: "0 14px", borderRadius: 8, border: "none", background: "#0969DA", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="#fff"/></svg>
                  Run Pipeline
                </button>
              ) : (
                <button onClick={reset} style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid #E1E4E8", background: "#F6F8FA", color: "#57606A", fontSize: 12, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer" }}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Agent chain */}
          <div style={{ padding: "20px 24px 28px", overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 0 }}>
            {!started ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 0" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "#F5F3FF", border: "1px solid #EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0D1117", fontFamily: "IBM Plex Sans, sans-serif" }}>Pipeline ready</div>
                  <div style={{ fontSize: 12, color: "#8B949E", marginTop: 4, fontFamily: "IBM Plex Mono, monospace" }}>4 agents · titanic_v3.csv</div>
                </div>
                <button onClick={runPipeline} style={{ height: 36, padding: "0 20px", borderRadius: 9, border: "none", background: "#0969DA", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="#fff"/></svg>
                  Run Pipeline
                </button>
              </div>
            ) : (
              AGENT_ORDER.map((key, i) => (
                <div key={key}>
                  <AgentBlock agentKey={key} agentState={agents[key]} />
                  {i < AGENT_ORDER.length - 1 && agents[key].status === "complete" && <Arrow from={key} />}
                  {i < AGENT_ORDER.length - 1 && agents[key].status !== "complete" && <div style={{ height: 12 }} />}
                </div>
              ))
            )}
          </div>
      </div>
    </div>
  );
}