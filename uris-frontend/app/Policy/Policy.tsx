"use client";
import { useState, useEffect, useRef } from "react";

// ── DSL Grammar ───────────────────────────────────────────────────────────────

const VERBS = [
  { id: "BLOCK",      label: "BLOCK",      color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", description: "Column cannot be synthesised or passed downstream. Hard stop.", icon: "🚫" },
  { id: "MASK",       label: "MASK",       color: "#B45309", bg: "#FFFBEB", border: "#FDE68A", description: "Transform value before synthesis. Original never seen by pipeline.", icon: "🎭" },
  { id: "FLAG",       label: "FLAG",       color: "#0969DA", bg: "#EFF6FF", border: "#DBEAFE", description: "Tag for human review. Pipeline continues but event is logged.", icon: "🚩" },
  { id: "GENERALISE", label: "GENERALISE", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", description: "Reduce precision — bucket ages, truncate postcodes, round dates.", icon: "📐" },
  { id: "DROP",       label: "DROP",       color: "#57606A", bg: "#F6F8FA", border: "#D0D7DE", description: "Remove column entirely from output dataset.", icon: "🗑️" },
];

const CONDITIONS = [
  { id: "pii_type IS direct_identifier",  label: "pii_type IS direct_identifier",  description: "Detected as name, email, SSN, passport, etc." },
  { id: "pii_type IS quasi_identifier",   label: "pii_type IS quasi_identifier",   description: "Age, postcode, gender — risky in combination." },
  { id: "pii_type IS financial",          label: "pii_type IS financial",          description: "Credit card, account number, salary fields." },
  { id: "pii_type IS health",             label: "pii_type IS health",             description: "Medical, diagnosis, or biometric data." },
  { id: "reid_risk > 0.3",                label: "reid_risk > 0.3",                description: "Re-identification risk score above 30%." },
  { id: "reid_risk > 0.5",                label: "reid_risk > 0.5",                description: "Re-identification risk score above 50%." },
  { id: "missing_rate > 0.5",             label: "missing_rate > 0.5",             description: "Over 50% of values are null or empty." },
  { id: "missing_rate > 0.7",             label: "missing_rate > 0.7",             description: "Over 70% of values are null or empty." },
  { id: "jurisdiction INCLUDES EU",       label: "jurisdiction INCLUDES EU",       description: "Dataset or subject falls under EU jurisdiction." },
  { id: "jurisdiction INCLUDES US",       label: "jurisdiction INCLUDES US",       description: "Dataset or subject falls under US jurisdiction." },
  { id: "outlier_rate > 0.2",             label: "outlier_rate > 0.2",             description: "More than 20% of values are statistical outliers." },
];

const DATASET_COLUMNS = [
  "col:Name", "col:Age", "col:Email", "col:PassportNo",
  "col:Survived", "col:Pclass", "col:Sex", "col:SibSp",
  "col:Parch", "col:Fare", "col:Cabin", "col:Embarked",
  "col:DOB", "col:Postcode",
];

const BUILT_IN_POLICIES = [
  {
    id: "gdpr", name: "GDPR", fullName: "General Data Protection Regulation",
    jurisdiction: "European Union", icon: "🇪🇺",
    color: "#0969DA", bg: "#EFF6FF", border: "#DBEAFE",
    description: "Governs collection, storage, and processing of personal data for EU residents.",
    rules: [
      "Block all direct identifiers (name, email, national ID)",
      "Flag quasi-identifier combinations above re-identification threshold",
      "Require extract_then_drop for columns with extractable PII",
      "Enforce data minimisation — exclude non-essential columns",
      "Log all data processing actions with timestamps",
    ],
    tags: ["PII", "Re-ID Risk", "Right to Erasure", "Data Minimisation"],
    enforcement: [
      { verb: "BLOCK", target: "any direct_identifiers", condition: "pii_type IS direct_identifier" },
      { verb: "FLAG",  target: "any quasi_identifiers",  condition: "reid_risk > 0.3" },
      { verb: "DROP",  target: "any pii_columns",        condition: "jurisdiction INCLUDES EU" },
    ],
  },
  {
    id: "ccpa", name: "CCPA", fullName: "California Consumer Privacy Act",
    jurisdiction: "California, USA", icon: "🇺🇸",
    color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE",
    description: "Grants California residents the right to know, delete, and opt out of the sale of their personal information.",
    rules: [
      "Identify and flag all personal information fields",
      "Block sale or external transfer of PI without consent flag",
      "Support opt-out: exclude flagged columns from synthesis",
      "Maintain audit trail for all data access and modifications",
      "Flag sensitive categories: financial, health, biometric data",
    ],
    tags: ["Personal Info", "Opt-Out", "Audit Trail", "Data Sale"],
    enforcement: [
      { verb: "FLAG",  target: "any pii_columns",        condition: null },
      { verb: "BLOCK", target: "any pii_columns",        condition: "jurisdiction INCLUDES US" },
      { verb: "FLAG",  target: "any flagged_columns",    condition: "pii_type IS financial" },
    ],
  },
  {
    id: "hipaa", name: "HIPAA", fullName: "Health Insurance Portability and Accountability Act",
    jurisdiction: "United States", icon: "🏥",
    color: "#047857", bg: "#ECFDF5", border: "#A7F3D0",
    description: "Protects individually identifiable health information. Defines 18 PHI identifiers that must be removed or transformed.",
    rules: [
      "Block all 18 PHI identifiers (name, DOB, address, MRN, etc.)",
      "Enforce Safe Harbor de-identification method",
      "Generalise geographic data to 3-digit ZIP or higher",
      "Suppress ages ≥ 90 or aggregate into a single category",
      "Require covered entity agreement for all downstream use",
    ],
    tags: ["PHI", "De-identification", "Safe Harbor", "18 Identifiers"],
    enforcement: [
      { verb: "BLOCK",      target: "any direct_identifiers", condition: "pii_type IS health" },
      { verb: "GENERALISE", target: "col:Age",                condition: null },
      { verb: "GENERALISE", target: "col:Postcode",           condition: null },
      { verb: "DROP",       target: "col:DOB",                condition: null },
    ],
  },
  {
    id: "iso27001", name: "ISO-27001", fullName: "ISO/IEC 27001 Information Security Management",
    jurisdiction: "International", icon: "🔒",
    color: "#B45309", bg: "#FFFBEB", border: "#FDE68A",
    description: "International standard for information security management systems (ISMS). Defines controls for protecting data confidentiality, integrity, and availability across the organisation.",
    rules: [
      "Classify all data assets by sensitivity — public, internal, confidential, restricted",
      "Enforce access controls: only authorised roles may process personal or sensitive data",
      "Maintain a complete audit trail for all data access, modification, and deletion events",
      "Apply risk assessment before processing — block columns that exceed acceptable risk threshold",
      "Ensure data minimisation: exclude fields not required for the stated processing purpose",
    ],
    tags: ["ISMS", "Data Classification", "Access Control", "Risk Assessment", "Audit Trail"],
    enforcement: [
      { verb: "BLOCK",      target: "any direct_identifiers", condition: "pii_type IS direct_identifier" },
      { verb: "FLAG",       target: "any pii_columns",        condition: "reid_risk > 0.3" },
      { verb: "MASK",       target: "any pii_columns",        condition: "pii_type IS financial" },
      { verb: "GENERALISE", target: "any quasi_identifiers",  condition: "pii_type IS quasi_identifier" },
      { verb: "DROP",       target: "any pii_columns",        condition: "missing_rate > 0.7" },
    ],
  },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// Use a single global policy key that applies to all datasets
const getSessionKey = () => `uris_policy_global`;

// ── Session persistence ───────────────────────────────────────────────────────
// Reads/writes the attached policy state to localStorage so it survives
// page refreshes. Custom policies (which aren't in BUILT_IN_POLICIES) are
// stored in full; built-in attachment is stored as a Set of IDs.
//
// Shape stored:
// {
//   attachedIds:    string[]          — IDs of all attached policies
//   customPolicies: CustomPolicy[]    — full objects for user-created policies
//   savedAt:        ISO string        — last save timestamp (shown in UI)
// }

function loadSession() {
  try {
    const raw = localStorage.getItem(getSessionKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      attachedIds:    new Set(parsed.attachedIds   || []),
      customPolicies: parsed.customPolicies || [],
      savedAt:        parsed.savedAt        || null,
    };
  } catch {
    return null;
  }
}

function saveSession({ attachedIds, customPolicies }) {
  try {
    localStorage.setItem(getSessionKey(), JSON.stringify({
      attachedIds:    [...attachedIds],
      customPolicies,
      savedAt:        new Date().toISOString(),
    }));
  } catch {
    // localStorage unavailable (SSR, private mode quota) — fail silently
  }
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPolicyPayload({ attachedIds, allPolicies, datasetId }) {
  const attached = allPolicies.filter(p => attachedIds.has(p.id));

  const inferScopeFromTarget = (target) => {
    if (typeof target !== "string") return "dataset";
    return target.startsWith("col:") ? "column" : "dataset";
  };

  const frameworks = attached
    .filter(p => p._type === "builtin")
    .map(p => ({
      id:          p.id,
      name:        p.name,
      jurisdiction: p.jurisdiction,
      enforcement: p.enforcement,
    }));

  const custom = attached
    .filter(p => p._type === "custom")
    .map(p => ({
      id:          p.id,
      name:        p.name,
      description: p.description || null,
      directives:  (p._dsl || [])
        .filter(r => r.verb && r.target)
        .map(r => ({
          verb:      r.verb,
          target:    r.target,
          scope:     r.targetType === "any" ? "dataset" : "column",
          condition: r.condition || null,
        })),
    }));

  return {
    dataset_id:  datasetId,
    attached_at: new Date().toISOString(),
    frameworks,
    custom_policies: custom,
    resolved_directives: [
      ...custom.flatMap(p => p.directives.map(d => ({ ...d, source: p.name,  priority: "custom" }))),
      ...frameworks.flatMap(f =>
        f.enforcement.map(d => ({
          ...d,
          scope: d.scope || inferScopeFromTarget(d.target),
          source: f.name,
          priority: "framework",
        })),
      ),
    ],
  };
}

// ── Primitives ────────────────────────────────────────────────────────────────

function Pill({ children, color, bg, border }) {
  return (
    <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color, background: bg, border: `1px solid ${border}`, borderRadius: 5, padding: "2px 7px", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Tag({ children, color = "#57606A", bg = "#F6F8FA", border = "#E1E4E8" }) {
  return (
    <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color, background: bg, border: `1px solid ${border}`, borderRadius: 5, padding: "2px 8px" }}>
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 12px" }}>
      <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.1em", color: "#B1BAC4", textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: "#F0F2F4" }} />
    </div>
  );
}

function ruleToString({ verb, target, condition }) {
  if (!verb) return "";
  return `${verb} ${target || "…"}${condition ? ` IF ${condition}` : ""}`;
}

// ── Verb selector ─────────────────────────────────────────────────────────────

function VerbSelector({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {VERBS.map(v => (
        <button key={v.id} onClick={() => onChange(v.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${value === v.id ? v.border : "#E1E4E8"}`, background: value === v.id ? v.bg : "#fff", transition: "all 0.12s" }}>
          <span style={{ fontSize: 13 }}>{v.icon}</span>
          <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: value === v.id ? v.color : "#8B949E", letterSpacing: "0.06em" }}>{v.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Rule row ──────────────────────────────────────────────────────────────────

function RuleRow({ rule, index, onChange, onRemove, colSearch, setColSearch }) {
  const [showColDrop, setShowColDrop]   = useState(false);
  const [showCondDrop, setShowCondDrop] = useState(false);
  const verbMeta    = VERBS.find(v => v.id === rule.verb);
  const filteredCols = DATASET_COLUMNS.filter(c => c.toLowerCase().includes((colSearch[index] || "").toLowerCase()));

  return (
    <div style={{ background: "#fff", border: `1.5px solid ${verbMeta ? verbMeta.border : "#E1E4E8"}`, borderRadius: 12, overflow: "visible", transition: "border-color 0.15s" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "#F6F8FA", border: "1px solid #E1E4E8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#8B949E" }}>{String(index + 1).padStart(2, "0")}</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#B1BAC4", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Action</div>
            <VerbSelector value={rule.verb} onChange={v => onChange({ ...rule, verb: v })} />
            {verbMeta && <div style={{ fontSize: 11.5, color: "#8B949E", fontFamily: "IBM Plex Sans, sans-serif", marginTop: 5 }}>{verbMeta.description}</div>}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Target */}
            <div style={{ flex: "0 0 200px", position: "relative" }}>
              <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#B1BAC4", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Target</div>
              <div style={{ display: "flex", gap: 0, border: "1px solid #E1E4E8", borderRadius: 8, overflow: "hidden", background: "#FAFBFC" }}>
                <select value={rule.targetType || "col"} onChange={e => onChange({ ...rule, targetType: e.target.value, target: "" })}
                  style={{ height: 34, padding: "0 8px", border: "none", borderRight: "1px solid #E1E4E8", background: "#F6F8FA", fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#57606A", outline: "none", cursor: "pointer" }}>
                  <option value="col">col:</option>
                  <option value="any">any</option>
                </select>
                {rule.targetType === "any" ? (
                  <select value={rule.target || ""} onChange={e => onChange({ ...rule, target: e.target.value })}
                    style={{ flex: 1, height: 34, padding: "0 8px", border: "none", background: "transparent", fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", outline: "none", cursor: "pointer" }}>
                    <option value="">— select scope —</option>
                    <option value="direct_identifiers">direct_identifiers</option>
                    <option value="quasi_identifiers">quasi_identifiers</option>
                    <option value="pii_columns">pii_columns</option>
                    <option value="flagged_columns">flagged_columns</option>
                  </select>
                ) : (
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      value={colSearch[index] !== undefined ? colSearch[index] : (rule.target ? rule.target.replace("col:", "") : "")}
                      onChange={e => { setColSearch(s => ({ ...s, [index]: e.target.value })); onChange({ ...rule, target: "" }); setShowColDrop(true); }}
                      onFocus={() => setShowColDrop(true)}
                      onBlur={() => setTimeout(() => setShowColDrop(false), 150)}
                      placeholder="column name…"
                      style={{ width: "100%", height: 34, padding: "0 10px", border: "none", background: "transparent", fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", outline: "none", boxSizing: "border-box" }}
                    />
                    {showColDrop && filteredCols.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E1E4E8", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100, maxHeight: 180, overflowY: "auto", marginTop: 2 }}>
                        {filteredCols.map(c => (
                          <div key={c} onMouseDown={() => { onChange({ ...rule, target: c }); setColSearch(s => ({ ...s, [index]: c.replace("col:", "") })); setShowColDrop(false); }}
                            style={{ padding: "8px 12px", fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", cursor: "pointer", borderBottom: "1px solid #F0F2F4" }}
                            onMouseEnter={e => e.currentTarget.style.background = "#F6F8FA"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            {c}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ paddingTop: 28, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#B1BAC4", letterSpacing: "0.06em" }}>IF</span>
            </div>

            {/* Condition */}
            <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
              <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#B1BAC4", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 6 }}>Condition <span style={{ color: "#D0D7DE", fontWeight: 400 }}>(optional)</span></div>
              <button onClick={() => setShowCondDrop(d => !d)} onBlur={() => setTimeout(() => setShowCondDrop(false), 150)}
                style={{ width: "100%", height: 34, padding: "0 10px 0 12px", border: "1px solid #E1E4E8", borderRadius: 8, background: "#FAFBFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: rule.condition ? "#0D1117" : "#B1BAC4", outline: "none" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.condition || "— none —"}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: 6 }}><path d="M6 9l6 6 6-6" stroke="#B1BAC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              {showCondDrop && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E1E4E8", borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 100, maxHeight: 280, overflowY: "auto", marginTop: 2 }}>
                  <div onMouseDown={() => { onChange({ ...rule, condition: "" }); setShowCondDrop(false); }}
                    style={{ padding: "8px 12px", fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E", cursor: "pointer", borderBottom: "1px solid #F0F2F4", fontStyle: "italic" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#F6F8FA"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    — none —
                  </div>
                  {CONDITIONS.map(c => (
                    <div key={c.id} onMouseDown={() => { onChange({ ...rule, condition: c.id }); setShowCondDrop(false); }}
                      style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #F0F2F4" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F6F8FA"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", fontWeight: 600 }}>{c.label}</div>
                      <div style={{ fontSize: 11, fontFamily: "IBM Plex Sans, sans-serif", color: "#8B949E", marginTop: 2 }}>{c.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {rule.verb && (
            <div style={{ background: "#0D1117", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#57606A", flexShrink: 0 }}>›</span>
              <code style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}>
                {(() => {
                  const parts = ruleToString(rule).split(" ");
                  const vm = VERBS.find(v => v.id === parts[0]);
                  return <>
                    <span style={{ color: vm?.color || "#F97583" }}>{parts[0]}</span>{" "}
                    <span style={{ color: "#79C0FF" }}>{parts[1] || "…"}</span>
                    {parts.length > 2 && <>{" "}<span style={{ color: "#FFAB70" }}>IF</span>{" "}<span style={{ color: "#B3D4FF" }}>{parts.slice(3).join(" ")}</span></>}
                  </>;
                })()}
              </code>
            </div>
          )}
        </div>

        <button onClick={onRemove} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #E1E4E8", background: "#fff", cursor: "pointer", color: "#8B949E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </div>
    </div>
  );
}

// ── DSL Policy builder ────────────────────────────────────────────────────────

function DSLPolicyBuilder({ onCreate }) {
  const [name, setName]           = useState("");
  const [description, setDesc]    = useState("");
  const [rules, setRules]         = useState([{ verb: "", target: "", targetType: "col", condition: "" }]);
  const [error, setError]         = useState("");
  const [colSearch, setColSearch] = useState({});

  const addRule    = () => setRules(r => [...r, { verb: "", target: "", targetType: "col", condition: "" }]);
  const updateRule = (i, v) => setRules(r => r.map((x, j) => j === i ? v : x));
  const removeRule = (i) => setRules(r => r.filter((_, j) => j !== i));

  const handleCreate = () => {
    if (!name.trim()) { setError("Policy name is required."); return; }
    const validRules = rules.filter(r => r.verb && r.target);
    if (validRules.length === 0) { setError("Add at least one complete rule (action + target)."); return; }
    onCreate({ name: name.trim(), description: description.trim(), rules: validRules.map(r => ruleToString(r)), _dsl: validRules });
    setName(""); setDesc(""); setRules([{ verb: "", target: "", targetType: "col", condition: "" }]); setError("");
  };

  const validCount = rules.filter(r => r.verb && r.target).length;

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, overflow: "visible", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #F0F2F4", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#F6F8FA", border: "1px solid #E1E4E8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke="#57606A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#24292F" }}>Policy Rule Builder</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {VERBS.map(v => <span key={v.id} style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: v.color, background: v.bg, border: `1px solid ${v.border}`, borderRadius: 4, padding: "1px 5px" }}>{v.id}</span>)}
        </div>
      </div>

      <div style={{ padding: "18px 20px 22px" }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#57606A", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Policy Name <span style={{ color: "#DC2626" }}>*</span></label>
            <input value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="e.g. Internal PII Standard v2"
              style={{ width: "100%", height: 38, padding: "0 12px", border: `1px solid ${error && !name ? "#F87171" : "#E1E4E8"}`, borderRadius: 9, fontSize: 13, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", background: "#FAFBFC", outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1.5 }}>
            <label style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#57606A", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Description <span style={{ color: "#B1BAC4", fontWeight: 400 }}>(optional)</span></label>
            <input value={description} onChange={e => setDesc(e.target.value)} placeholder="Describe the purpose and scope…"
              style={{ width: "100%", height: 38, padding: "0 12px", border: "1px solid #E1E4E8", borderRadius: 9, fontSize: 12.5, fontFamily: "IBM Plex Sans, sans-serif", color: "#24292F", background: "#FAFBFC", outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#57606A", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
          Rules <span style={{ color: "#DC2626" }}>*</span>
          <span style={{ color: "#B1BAC4", fontWeight: 400, marginLeft: 8 }}>— each rule compiles to a single executable directive</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
          {rules.map((rule, i) => (
            <RuleRow key={i} rule={rule} index={i} onChange={v => updateRule(i, v)} onRemove={() => removeRule(i)} colSearch={colSearch} setColSearch={setColSearch} />
          ))}
        </div>

        <button onClick={addRule} style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#0969DA", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5, marginBottom: 20 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14m-7-7h14" stroke="#0969DA" strokeWidth="2.5" strokeLinecap="round"/></svg>
          Add rule
        </button>

        {validCount > 0 && (
          <div style={{ background: "#0D1117", borderRadius: 10, padding: "14px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#484F58", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>
              Compiled policy · {validCount} rule{validCount !== 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#484F58" }}>POLICY <span style={{ color: "#F97583" }}>{name || "untitled"}</span> {"{"}</div>
            {rules.filter(r => r.verb && r.target).map((r, i) => {
              const vm = VERBS.find(v => v.id === r.verb);
              return (
                <div key={i} style={{ paddingLeft: 20, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}>
                  <span style={{ color: vm?.color || "#F97583" }}>{r.verb}</span>{" "}
                  <span style={{ color: "#79C0FF" }}>{r.target}</span>
                  {r.condition && <>{" "}<span style={{ color: "#FFAB70" }}>IF</span>{" "}<span style={{ color: "#B3D4FF" }}>{r.condition}</span></>}
                  <span style={{ color: "#484F58" }}>;</span>
                </div>
              );
            })}
            <div style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#484F58" }}>{"}"}</div>
          </div>
        )}

        {error && (
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 12, fontFamily: "IBM Plex Sans, sans-serif", color: "#DC2626" }}>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => { setName(""); setDesc(""); setRules([{ verb: "", target: "", targetType: "col", condition: "" }]); setError(""); }}
            style={{ height: 36, padding: "0 16px", borderRadius: 9, border: "1px solid #E1E4E8", background: "#F6F8FA", color: "#57606A", fontSize: 12.5, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer" }}>
            Clear
          </button>
          <button onClick={handleCreate} style={{ height: 36, padding: "0 18px", borderRadius: 9, border: "none", background: validCount > 0 ? "#0969DA" : "#B1BAC4", color: "#fff", fontSize: 12.5, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: validCount > 0 ? "pointer" : "default", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
            Create & Attach
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Built-in card ─────────────────────────────────────────────────────────────

function BuiltInCard({ policy, attached, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#fff", border: `1px solid ${attached ? policy.border : "#E1E4E8"}`, borderRadius: 14, boxShadow: attached ? `0 0 0 3px ${policy.bg}` : "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden", transition: "all 0.2s" }}>
      <div style={{ padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: policy.bg, border: `1px solid ${policy.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{policy.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0D1117", fontFamily: "IBM Plex Mono, monospace", letterSpacing: -0.2 }}>{policy.name}</span>
            <Pill color={policy.color} bg={policy.bg} border={policy.border}>Built-in</Pill>
            {attached && <Pill color="#047857" bg="#ECFDF5" border="#A7F3D0">● Attached</Pill>}
          </div>
          <div style={{ fontSize: 11.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginBottom: 6 }}>{policy.fullName} · {policy.jurisdiction}</div>
          <p style={{ fontSize: 12.5, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.5, margin: 0 }}>{policy.description}</p>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <button onClick={onToggle} style={{ height: 34, padding: "0 16px", borderRadius: 9, border: attached ? "none" : `1px solid ${policy.border}`, background: attached ? "#F87171" : policy.color, color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>
            {attached ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>Detach</> : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 5v14m-7-7h14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/></svg>Attach</>}
          </button>
          <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#8B949E", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
            {expanded ? "Hide rules" : "View rules"}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" stroke="#8B949E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      <div style={{ paddingLeft: 76, paddingRight: 18, paddingBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {policy.tags.map(t => <Tag key={t} color={policy.color} bg={policy.bg} border={policy.border}>{t}</Tag>)}
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #F0F2F4", background: "#FAFBFC", padding: "14px 18px 16px 76px" }}>
          <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.09em", color: "#B1BAC4", textTransform: "uppercase", marginBottom: 10 }}>Enforcement Rules</div>
          {policy.rules.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "5px 0", borderBottom: i < policy.rules.length - 1 ? "1px solid #F0F2F4" : "none" }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: policy.bg, border: `1px solid ${policy.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: policy.color }}>{i + 1}</span>
              </div>
              <span style={{ fontSize: 12.5, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      )}
      {attached && <div style={{ height: 3, background: `linear-gradient(to right, ${policy.color}, ${policy.color}88)` }} />}
    </div>
  );
}

// ── Custom policy card ────────────────────────────────────────────────────────

function CustomPolicyCard({ policy, attached, onToggle, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: "#fff", border: `1px solid ${attached ? "#DBEAFE" : "#E1E4E8"}`, borderRadius: 14, boxShadow: attached ? "0 0 0 3px #EFF6FF" : "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden", transition: "all 0.2s" }}>
      <div style={{ padding: "15px 18px", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#F6F8FA", border: "1px solid #E1E4E8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke="#57606A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0D1117", fontFamily: "IBM Plex Mono, monospace" }}>{policy.name}</span>
            <Pill color="#57606A" bg="#F6F8FA" border="#D0D7DE">Custom DSL</Pill>
            {attached && <Pill color="#047857" bg="#ECFDF5" border="#A7F3D0">● Attached</Pill>}
          </div>
          {policy.description && <p style={{ fontSize: 12.5, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.5, margin: "0 0 6px" }}>{policy.description}</p>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            {(policy._dsl || []).filter(r => r.verb).map((r, i) => {
              const vm = VERBS.find(v => v.id === r.verb);
              return <Tag key={i} color={vm?.color} bg={vm?.bg} border={vm?.border}>{r.verb}</Tag>;
            })}
            <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}>{policy.rules.length} rule{policy.rules.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onToggle} style={{ height: 32, padding: "0 14px", borderRadius: 8, border: attached ? "none" : "1px solid #E1E4E8", background: attached ? "#F87171" : "#0969DA", color: "#fff", fontSize: 11.5, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: "pointer" }}>
              {attached ? "Detach" : "Attach"}
            </button>
            <button onClick={onDelete} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <button onClick={() => setExpanded(e => !e)} style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#8B949E", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
            {expanded ? "Hide" : "View"} compiled
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}><path d="M6 9l6 6 6-6" stroke="#8B949E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: "1px solid #F0F2F4", background: "#0D1117", padding: "12px 18px 14px" }}>
          <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#484F58", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8 }}>Compiled DSL</div>
          <div style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#484F58", marginBottom: 4 }}>POLICY <span style={{ color: "#F97583" }}>{policy.name}</span> {"{"}</div>
          {(policy._dsl || []).filter(r => r.verb && r.target).map((r, i) => {
            const vm = VERBS.find(v => v.id === r.verb);
            return (
              <div key={i} style={{ paddingLeft: 20, fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}>
                <span style={{ color: vm?.color || "#F97583" }}>{r.verb}</span>{" "}
                <span style={{ color: "#79C0FF" }}>{r.target}</span>
                {r.condition && <>{" "}<span style={{ color: "#FFAB70" }}>IF</span>{" "}<span style={{ color: "#B3D4FF" }}>{r.condition}</span></>}
                <span style={{ color: "#484F58" }}>;</span>
              </div>
            );
          })}
          <div style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#484F58" }}>{"}"}</div>
        </div>
      )}
      {attached && <div style={{ height: 3, background: "linear-gradient(to right, #0969DA, #7C3AED)" }} />}
    </div>
  );
}

// ── Attached summary ──────────────────────────────────────────────────────────

function AttachedSummary({ attached, savedAt }) {
  if (attached.length === 0) return null;

  const savedLabel = savedAt
    ? `Last saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : null;

  return (
    <div style={{ background: "#F0FDF4", border: "1px solid #A7F3D0", borderRadius: 12, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#047857" strokeWidth="2" strokeLinecap="round"/></svg>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 12.5, fontFamily: "IBM Plex Sans, sans-serif", color: "#166534", fontWeight: 600 }}>{attached.length} polic{attached.length === 1 ? "y" : "ies"} attached</span>
        <span style={{ fontSize: 12, color: "#166534", fontFamily: "IBM Plex Sans, sans-serif" }}> — enforcement active on next pipeline run.</span>
        {savedLabel && <span style={{ fontSize: 11, color: "#4ADE80", fontFamily: "IBM Plex Mono, monospace", marginLeft: 10 }}>● {savedLabel}</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {attached.map(p => <span key={p.id} style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#047857", background: "#DCFCE7", border: "1px solid #A7F3D0", borderRadius: 5, padding: "2px 8px" }}>{p.name}</span>)}
      </div>
    </div>
  );
}

// ── Run button / submit area ──────────────────────────────────────────────────

function RunPipelineBar({ onSubmit, submitState, onClearSession }) {
  return (
    <div style={{ position: "sticky", bottom: 0, background: "rgba(244,245,247,0.95)", backdropFilter: "blur(8px)", borderTop: "1px solid #E1E4E8", padding: "14px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", marginLeft: -32, marginRight: -32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          {submitState === "idle"    && <span style={{ fontSize: 12.5, color: "#8B949E", fontFamily: "IBM Plex Sans, sans-serif" }}>Policies saved — ready to attach evaluation policy context.</span>}
          {submitState === "sending" && <span style={{ fontSize: 12.5, color: "#B45309", fontFamily: "IBM Plex Sans, sans-serif" }}>⏳ Sending policy config to backend…</span>}
          {submitState === "success" && <span style={{ fontSize: 12.5, color: "#047857", fontFamily: "IBM Plex Sans, sans-serif" }}>✓ Policy config attached to evaluation context.</span>}
          {submitState === "error"   && <span style={{ fontSize: 12.5, color: "#DC2626", fontFamily: "IBM Plex Sans, sans-serif" }}>✗ Failed to send policy config. Check console.</span>}
        </div>
        <button onClick={onClearSession} style={{ fontSize: 11.5, color: "#8B949E", background: "none", border: "none", cursor: "pointer", fontFamily: "IBM Plex Mono, monospace", padding: 0, textDecoration: "underline" }}>
          Clear session
        </button>
      </div>
      <button onClick={onSubmit} disabled={submitState === "sending"} style={{ height: 40, padding: "0 24px", borderRadius: 10, border: "none", background: submitState === "sending" ? "#B1BAC4" : "#0969DA", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "IBM Plex Sans, sans-serif", cursor: submitState === "sending" ? "default" : "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.15s" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="#fff"/></svg>
        Attach Policy Config
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PolicyPage() {
  // ── Hydrate from localStorage on first render ──────────────────────────────
  // `hydrated` flag prevents a flash where SSR renders default state, then
  // client immediately overwrites it — causing a layout shift and React
  // hydration mismatch warning.
  const [hydrated, setHydrated]           = useState(false);
  const [attachedIds, setAttachedIds]     = useState(new Set(["gdpr"]));
  const [customPolicies, setCustomPolicies] = useState([]);
  const [savedAt, setSavedAt]             = useState(null);
  const [tab, setTab]                     = useState("attach");
  const [submitState, setSubmitState]     = useState("idle");

  // Load persisted global policy session once on mount (client-side only)
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setAttachedIds(session.attachedIds);
      setCustomPolicies(session.customPolicies);
      setSavedAt(session.savedAt);
    }
    setHydrated(true);
  }, []);

  // Persist global policy to localStorage whenever attached IDs or custom policies change,
  // but only after initial hydration (avoids overwriting on first render).
  const isFirstSave = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    if (isFirstSave.current) { isFirstSave.current = false; return; }
    saveSession({ attachedIds, customPolicies });
    setSavedAt(new Date().toISOString());
  }, [attachedIds, customPolicies, hydrated]);

  const toggle = (id) => setAttachedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });

  const handleCreate = (p) => {
    const id = `custom_${Date.now()}`;
    setCustomPolicies(prev => [...prev, { ...p, id }]);
    setAttachedIds(prev => new Set([...prev, id]));
    setTab("attach");
  };

  const deleteCustom = (id) => {
    setCustomPolicies(prev => prev.filter(p => p.id !== id));
    setAttachedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const clearSession = () => {
    try { localStorage.removeItem(getSessionKey(activeDatasetId)); } catch {}
    setAttachedIds(new Set(["gdpr"]));
    setCustomPolicies([]);
    setSavedAt(null);
  };

  const allPolicies = [
    ...BUILT_IN_POLICIES.map(p => ({ ...p, _type: "builtin" })),
    ...customPolicies.map(p => ({ ...p, _type: "custom" })),
  ];
  const attached = allPolicies.filter(p => attachedIds.has(p.id));

  const handleRunPipeline = async () => {
    setSubmitState("sending");

    // Use 'global' to indicate this policy applies to all datasets until changed
    const payload = buildPolicyPayload({ attachedIds, allPolicies, datasetId: "global" });
    console.log("[PolicyPage] Sending global policy payload →", JSON.stringify(payload, null, 2));

    try {
      const res = await fetch(`${API_BASE}/policy/attach`, {
        method:  "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}${errText ? ` - ${errText}` : ""}`);
      }
      setSubmitState("success");
    } catch (err) {
      console.error("[PolicyPage] Failed to send policy config:", err);
      setSubmitState("error");
    }
  };

  const TABS = [
    { id: "attach", label: "Attach Policies" },
    { id: "create", label: "Create Custom Policy" },
  ];

  // Avoid rendering with default state before localStorage loads
  if (!hydrated) return null;

  return (
    <div style={{ fontFamily: "IBM Plex Sans, sans-serif", background: "#F4F5F7", minHeight: "100vh", padding: "28px 32px", paddingBottom: 100 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "#F5F3FF", border: "1px solid #DDD6FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0D1117", fontFamily: "IBM Plex Sans, sans-serif", margin: 0, letterSpacing: -0.3 }}>Privacy & Compliance Policies</h1>
        </div>
        <p style={{ fontSize: 13.5, color: "#57606A", margin: "0 0 0 44px", lineHeight: 1.5 }}>
          Attach regulatory frameworks or define custom enforcement rules using the policy DSL.
        </p>
      </div>

      <AttachedSummary attached={attached} savedAt={savedAt} />

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E1E4E8", marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontFamily: "IBM Plex Mono, monospace", fontSize: 12, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#0969DA" : "#8B949E", borderBottom: `2px solid ${tab === t.id ? "#0969DA" : "transparent"}`, marginBottom: -1, transition: "all 0.15s" }}>{t.label}</button>
        ))}
      </div>

      {tab === "attach" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <SectionLabel>Regulatory Frameworks</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 8 }}>
            {BUILT_IN_POLICIES.map(p => <BuiltInCard key={p.id} policy={p} attached={attachedIds.has(p.id)} onToggle={() => toggle(p.id)} />)}
          </div>
          {customPolicies.length > 0 && (
            <>
              <SectionLabel>Your Policies</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {customPolicies.map(p => <CustomPolicyCard key={p.id} policy={p} attached={attachedIds.has(p.id)} onToggle={() => toggle(p.id)} onDelete={() => deleteCustom(p.id)} />)}
              </div>
            </>
          )}
          {customPolicies.length === 0 && (
            <div style={{ background: "#fff", border: "1px dashed #D0D7DE", borderRadius: 14, padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "#F6F8FA", border: "1px solid #E1E4E8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" stroke="#B1BAC4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif" }}>No custom policies yet</span>
              <button onClick={() => setTab("create")} style={{ fontSize: 12.5, color: "#0969DA", background: "none", border: "none", cursor: "pointer", fontFamily: "IBM Plex Sans, sans-serif", fontWeight: 600, textDecoration: "underline", padding: 0 }}>
                Create your first policy with the DSL →
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "create" && <DSLPolicyBuilder onCreate={handleCreate} />}

      <RunPipelineBar onSubmit={handleRunPipeline} submitState={submitState} onClearSession={clearSession} />
    </div>
  );
}