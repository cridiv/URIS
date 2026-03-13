import { useState, useEffect, useRef, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";

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
type AgentKey = keyof typeof AGENT_META;
const AGENT_ORDER: AgentKey[] = ["evaluation", "planner", "compliance", "synthesis"];
type AgentStatus = "queued" | "running" | "complete";
type AgentLogEntry = { message: string; payload?: Record<string, unknown> };
type AgentRuntimeState = { status: AgentStatus; logs: AgentLogEntry[]; result: Record<string, unknown> | null };

function createInitialAgents(): Record<AgentKey, AgentRuntimeState> {
  return Object.fromEntries(
    AGENT_ORDER.map((k) => [k, { status: "queued", logs: [], result: null }]),
  ) as Record<AgentKey, AgentRuntimeState>;
}

// ── Primitives ────────────────────────────────────────────────────────────────
type StatusPillProps = {
  status: "success" | "pass" | "fail" | "warning" | "running" | "high" | "medium" | "low" | "none" | "queued";
};
function StatusPill({ status }: StatusPillProps) {
  const map = {
    success: { c: "#047857", bg: "#ECFDF5", b: "#D1FAE5", l: "SUCCESS" },
    pass:    { c: "#047857", bg: "#ECFDF5", b: "#D1FAE5", l: "PASS" },
    fail:    { c: "#DC2626", bg: "#FEF2F2", b: "#FEE2E2", l: "FAIL" },
    warning: { c: "#92400E", bg: "#FFFBEB", b: "#FDE68A", l: "WARNING" },
    running: { c: "#B45309", bg: "#FFFBEB", b: "#FEF3C7", l: "RUNNING" },
    high:    { c: "#DC2626", bg: "#FEF2F2", b: "#FEE2E2", l: "HIGH" },
    medium:  { c: "#B45309", bg: "#FFFBEB", b: "#FEF3C7", l: "MEDIUM" },
    low:     { c: "#047857", bg: "#ECFDF5", b: "#D1FAE5", l: "LOW" },
    none:    { c: "#8B949E", bg: "#F6F8FA", b: "#E1E4E8", l: "NONE" },
    queued:  { c: "#8B949E", bg: "#F6F8FA", b: "#E1E4E8", l: "QUEUED" },
  };
  const s = map[status] || map.none;
  return (
    <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: s.c, background: s.bg, border: `1px solid ${s.b}`, borderRadius: 5, padding: "1px 6px", letterSpacing: "0.05em" }}>
      {s.l}
    </span>
  );
}

type TagProps = {
  children: ReactNode;
  color?: string;
  bg?: string;
  border?: string;
};
function Tag({ children, color = "#57606A", bg = "#F6F8FA", border = "#E1E4E8" }: TagProps) {
  return <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color, background: bg, border: `1px solid ${border}`, borderRadius: 5, padding: "2px 7px" }}>{children}</span>;
}

function SectionHead({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.1em", color: "#B1BAC4", textTransform: "uppercase", marginBottom: 7, marginTop: 12 }}>{children}</div>;
}

function MiniBar({ value, color = "#0969DA" }: { value: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 99, background: "#F0F2F4", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value * 100, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#24292F", minWidth: 34, textAlign: "right" }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
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
function LogStream({ lines, running }: { lines: Array<{ message: string }>; running: boolean }) {
  const endRef = useRef<HTMLDivElement | null>(null);
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
function AgentHeader({ agentKey, status }: { agentKey: AgentKey; status: AgentStatus }) {
  const m = AGENT_META[agentKey];
  const statusKey: StatusPillProps["status"] = status === "complete" ? "success" : status === "running" ? "running" : "queued";
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

function Dot({ delay, color }: { delay: number; color: string }) {
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
type EvaluationPayload = {
  quality_scores?: Record<string, number | string>;
  critical_gaps?: Array<{ severity?: string; affected_columns?: string[]; description?: string }>;
};
function EvaluationResult({ payload }: { payload?: EvaluationPayload | null }) {
  const barColor = (v: number) => v >= 0.85 ? "#34D399" : v >= 0.65 ? "#FBBF24" : "#F87171";
  const qualityScores = payload?.quality_scores && typeof payload.quality_scores === "object"
    ? payload.quality_scores
    : {};
  const criticalGaps = Array.isArray(payload?.critical_gaps) ? payload.critical_gaps : [];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      </div>
      <SectionHead>Quality Scores</SectionHead>
      {Object.entries(qualityScores).map(([k, rawValue]) => {
        const v = typeof rawValue === "number" ? rawValue : Number(rawValue) || 0;

        return (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
          <span style={{ fontSize: 11, color: "#8B949E", width: 130, flexShrink: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>{k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
          <MiniBar value={v} color={barColor(v)} />
        </div>
        );
      })}
      <SectionHead>Critical Gaps</SectionHead>
      {criticalGaps.map((g, i: number) => {
        const gapSeverity = g?.severity === "high" ? "high" : "medium";
        const affectedColumns = Array.isArray(g?.affected_columns) ? g.affected_columns : [];

        return (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: gapSeverity === "high" ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${gapSeverity === "high" ? "#FEE2E2" : "#FEF3C7"}`, borderRadius: 7, marginBottom: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginTop: 1, flexShrink: 0 }}><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={gapSeverity === "high" ? "#DC2626" : "#B45309"} strokeWidth="2" strokeLinecap="round"/></svg>
          <div>
            <div style={{ fontSize: 11, color: gapSeverity === "high" ? "#DC2626" : "#B45309", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.4 }}>{g?.description ?? "Gap details unavailable"}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>{affectedColumns.map((c: string) => <Tag key={c}>{c}</Tag>)}</div>
          </div>
        </div>
        );
      })}
    </div>
  );
}

type PlannerTask = {
  skip?: boolean;
  agent?: string;
  priority?: string;
  task?: string;
  reason?: string;
};
type PlannerPayload = {
  target_column?: string;
  risk_tolerance?: StatusPillProps["status"];
  adfi_baseline?: number | string;
  adfi_baseline_estimate?: { overall?: number };
  tasks?: PlannerTask[];
  ordered_tasks?: PlannerTask[];
  constraints?: string[];
};
function PlannerResult({ payload }: { payload?: PlannerPayload | null }) {
  const agentColor = { compliance: "#7C3AED", synthesis: "#0969DA", validation: "#047857" };
  const agentBg    = { compliance: "#F5F3FF", synthesis: "#EFF6FF", validation: "#ECFDF5" };
  const tasks = payload?.tasks ?? payload?.ordered_tasks ?? [];
  const constraints = payload?.constraints ?? [];
  const adfiBaseline =
    payload?.adfi_baseline ?? payload?.adfi_baseline_estimate?.overall ?? "N/A";

  const getAgentColor = (agent: string | undefined) =>
    agent && agent in agentColor ? agentColor[agent as keyof typeof agentColor] : "#57606A";
  const getAgentBg = (agent: string | undefined) =>
    agent && agent in agentBg ? agentBg[agent as keyof typeof agentBg] : "#F6F8FA";

  return (
    <div>
      <Row label="Target"><Tag color="#0969DA" bg="#EFF6FF" border="#DBEAFE">{payload?.target_column ?? "N/A"}</Tag></Row>
      <Row label="Risk Tolerance"><StatusPill status={payload?.risk_tolerance ?? "none"} /></Row>
      <Row label="ADFI Baseline">{typeof adfiBaseline === "number" ? adfiBaseline.toFixed(3) : String(adfiBaseline)}</Row>
      <SectionHead>Task Queue</SectionHead>
      {tasks.map((t: PlannerTask, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 0", borderBottom: i < tasks.length - 1 ? "1px solid #F6F8FA" : "none", opacity: t.skip ? 0.5 : 1 }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, background: t.skip ? "#F6F8FA" : getAgentBg(t.agent), border: `1px solid ${t.skip ? "#E1E4E8" : `${getAgentColor(t.agent)}33`}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {t.skip ? (
              <span style={{ fontSize: 10, color: "#8B949E" }}>—</span>
            ) : (
              <span style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: getAgentColor(t.agent) }}>{t.priority}</span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: t.skip ? "#8B949E" : getAgentColor(t.agent), textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.agent}</span>
              {t.skip && (
                <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#8B949E", background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 4, padding: "1px 5px" }}>SKIPPED</span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: t.skip ? "#8B949E" : "#24292F", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.4 }}>{t.task}</div>
            {t.reason && (
              <div style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Sans, sans-serif", marginTop: 3, fontStyle: "italic" }}>{t.reason}</div>
            )}
          </div>
        </div>
      ))}
      <SectionHead>Constraints</SectionHead>
      {constraints.map((c: string, i: number) => (
        <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "3px 0" }}>
          <div style={{ width: 4, height: 4, borderRadius: 99, background: "#D0D7DE", marginTop: 5, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.5 }}>{c}</span>
        </div>
      ))}
    </div>
  );
}

type ComplianceFinding = {
  column?: string;
  pii_type?: string;
  severity?: StatusPillProps["status"];
  confidence?: number;
};
type ComplianceAction = {
  column?: string;
  action?: string;
  extraction_detail?: string;
};
type CompliancePayload = {
  status?: string;
  reason?: string;
  privacy_risk_score?: number;
  confidence?: number;
  blocked_columns?: string[] | string;
  pii_findings?: ComplianceFinding[];
  recommended_actions?: ComplianceAction[];
  regulatory_exposure?: Record<string, string>;
  re_identification_risk?: {
    score?: number;
    contributing_columns?: string[];
  };
};
function ComplianceResult({ payload }: { payload?: CompliancePayload | null }) {
  const regColor = { high: "#DC2626", medium: "#B45309", low: "#047857", none: "#8B949E" };
  const regBg    = { high: "#FEF2F2", medium: "#FFFBEB", low: "#ECFDF5", none: "#F6F8FA" };
  const regBdr   = { high: "#FEE2E2", medium: "#FEF3C7", low: "#D1FAE5", none: "#E1E4E8" };
  
  // Handle skipped compliance
  if (payload?.status === "skipped") {
    return (
      <div>
        <div style={{ padding: "20px", textAlign: "center", background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#24292F", marginBottom: 4 }}>Compliance Check Skipped</div>
          <div style={{ fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Sans, sans-serif" }}>
            {payload.reason || "No PII risk detected by planner"}
          </div>
        </div>
      </div>
    );
  }

  // Helper to parse blocked columns (may be string array or comma-separated string)
  const getBlockedColumns = () => {
    if (!payload?.blocked_columns) return [];
    if (Array.isArray(payload.blocked_columns)) {
      return payload.blocked_columns.filter((col: string) => typeof col === 'string' && col.trim().length > 0);
    }
    if (typeof payload.blocked_columns === 'string') {
      return payload.blocked_columns.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    }
    return [];
  };

  // Helper to parse PII findings
  const getPIIFindings = () => {
    if (!payload?.pii_findings) return [];
    if (Array.isArray(payload.pii_findings)) {
      return payload.pii_findings.filter((f: ComplianceFinding) => typeof f === 'object' && f !== null && f.column);
    }
    return [];
  };

  // Helper to parse recommended actions
  const getRecommendedActions = () => {
    if (!payload?.recommended_actions) return [];
    if (Array.isArray(payload.recommended_actions)) {
      return payload.recommended_actions.filter((a: ComplianceAction) => typeof a === 'object' && a !== null && a.column);
    }
    return [];
  };

  const blockedCols = getBlockedColumns();
  const piiFindings = getPIIFindings();
  const actions = getRecommendedActions();
  
  return (
    <div>
      <Row label="Privacy Risk Score"><span style={{ color: "#B45309", fontWeight: 700 }}>{payload?.privacy_risk_score?.toFixed(2) ?? "N/A"} / 1.00</span></Row>
      <Row label="Confidence">{payload?.confidence ? (payload.confidence * 100).toFixed(0) : "N/A"}%</Row>
      <Row label="Blocked">
        {blockedCols.length > 0 ? (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {blockedCols.slice(0, 2).map((col: string, i: number) => (
              <Tag key={i} color="#DC2626" bg="#FEF2F2" border="#FEE2E2">{col}</Tag>
            ))}
            {blockedCols.length > 2 && <span style={{ fontSize: 11, color: "#8B949E" }}>+{blockedCols.length - 2} more</span>}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: "#8B949E" }}>None</span>
        )}
      </Row>
      <SectionHead>PII Finding</SectionHead>
      {piiFindings.length > 0 ? (
        piiFindings.map((f: ComplianceFinding, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#FEF2F2", border: "1px solid #FEE2E2", borderRadius: 8, padding: "8px 10px", gap: 8, marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#DC2626", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.column}</div>
                <div style={{ fontSize: 10, color: "#B91C1C", fontFamily: "IBM Plex Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeof f.pii_type === 'string' ? f.pii_type.replace(/_/g, " ") : "direct identifier"}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
              <StatusPill status={f.severity || "high"} />
              <span style={{ fontSize: 10, color: "#B91C1C", fontFamily: "IBM Plex Mono, monospace" }}>conf. {(typeof f.confidence === 'number' ? f.confidence * 100 : 100).toFixed(0)}%</span>
            </div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No PII findings</div>
      )}
      <SectionHead>Regulatory Exposure</SectionHead>
      {payload?.regulatory_exposure && typeof payload.regulatory_exposure === 'object' ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(payload.regulatory_exposure).map(([reg, level]: [string, unknown]) => {
            const levelKey = typeof level === 'string' && level.toLowerCase() in regColor
              ? (level.toLowerCase() as keyof typeof regColor)
              : 'none';

            return (
            <div key={reg} style={{ flex: "1 1 auto", minWidth: 80, textAlign: "center", background: regBg[levelKey], border: `1px solid ${regBdr[levelKey]}`, borderRadius: 8, padding: "7px 4px" }}>
              <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: regColor[levelKey] }}>{typeof level === 'string' ? level.toUpperCase() : "NONE"}</div>
              <div style={{ fontSize: 9.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.05em" }}>{reg}</div>
            </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No regulatory data available</div>
      )}
      <SectionHead>Re-id Risk</SectionHead>
      {payload?.re_identification_risk && typeof payload.re_identification_risk === 'object' ? (
        <div style={{ background: "#FFFBEB", border: "1px solid #FEF3C7", borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#B45309" }}>Score</span>
            <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#B45309" }}>{typeof payload.re_identification_risk.score === 'number' ? payload.re_identification_risk.score.toFixed(1) : "N/A"}</span>
          </div>
          {payload.re_identification_risk.contributing_columns && Array.isArray(payload.re_identification_risk.contributing_columns) && payload.re_identification_risk.contributing_columns.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {payload.re_identification_risk.contributing_columns
                .filter((c: string) => typeof c === 'string' && c.trim().length > 0)
                .map((c: string) => <Tag key={c} color="#B45309" bg="#FEF9C3" border="#FEF3C7">{c}</Tag>)
              }
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No re-identification risk data</div>
      )}
      <SectionHead>Action</SectionHead>
      {actions.length > 0 ? (
        actions.map((a: ComplianceAction, i: number) => (
          <div key={i} style={{ background: "#F0FDF4", border: "1px solid #D1FAE5", borderRadius: 8, padding: "9px 11px", marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
              <Tag color="#047857" bg="#DCFCE7" border="#D1FAE5">{a.column}</Tag>
              <Tag color="#0969DA" bg="#EFF6FF" border="#DBEAFE">{typeof a.action === 'string' ? a.action.replace(/_/g, " ") : "extract"}</Tag>
            </div>
            <div style={{ fontSize: 11, color: "#166534", fontFamily: "IBM Plex Sans, sans-serif", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis" }}>{a.extraction_detail || a.action}</div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No recommended actions</div>
      )}
    </div>
  );
}

type SynthesisResultProps = {
  payload?: Record<string, unknown> | null;
  datasetId?: string;
  runId?: string;
  onAnalysisSaved?: (analysis: { synthesis: Record<string, unknown>; syntheticDataS3Key?: string | null }) => void;
  existingSyntheticDataS3Key?: string | null;
};
type AttemptTrace = { attempt: number; budget: number | null; privacy: StatusPillProps["status"]; correlation: StatusPillProps["status"] };
type SynthesisPayload = Record<string, unknown> & {
  synthesis_report?: Record<string, unknown>;
  strategy_used?: Record<string, unknown>;
  correlation_drift?: Record<string, unknown>;
  correlation_report?: Record<string, unknown>;
  trace_attempts?: AttemptTrace[];
  trace?: string[];
  attempt?: number;
  max_attempts?: number;
  status?: string;
  warning?: string;
  imputation_report?: Record<string, { action?: string; value?: unknown; reason?: string }>;
};
function SynthesisResult({ payload, datasetId, runId, onAnalysisSaved, existingSyntheticDataS3Key }: SynthesisResultProps) {
  const [generating, setGenerating] = useState(false);
  const [generatedFile, setGeneratedFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFallbackDownload, setIsFallbackDownload] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Synthesis may arrive either as direct payload or nested under `result`.
  const synthesisPayload: SynthesisPayload | null =
    payload?.result && typeof payload.result === 'object'
      ? (payload.result as SynthesisPayload)
      : (payload as SynthesisPayload | null);
  const synthesisReport = synthesisPayload?.synthesis_report && typeof synthesisPayload.synthesis_report === 'object'
    ? (synthesisPayload.synthesis_report as Record<string, unknown>)
    : null;
  const strategyUsed = synthesisPayload?.strategy_used && typeof synthesisPayload.strategy_used === 'object'
    ? (synthesisPayload.strategy_used as Record<string, unknown>)
    : null;
  const correlationDrift = synthesisPayload?.correlation_drift
    ?? ((synthesisPayload?.correlation_report?.drift_metrics as Record<string, unknown> | undefined) ?? null)
    ?? null;
  const traceAttempts = Array.isArray(synthesisPayload?.trace_attempts)
    ? synthesisPayload.trace_attempts
    : deriveAttemptTraceFromLines(Array.isArray(synthesisPayload?.trace) ? synthesisPayload.trace : []);

  const rowsBefore = typeof synthesisReport?.rows_before === 'number' ? synthesisReport.rows_before : null;
  const rowsGenerated = typeof synthesisReport?.rows_generated === 'number'
    ? synthesisReport.rows_generated
    : (typeof strategyUsed?.augmentation_budget === 'number' ? strategyUsed.augmentation_budget : null);
  const rowsAfter = typeof synthesisReport?.rows_after === 'number' ? synthesisReport.rows_after : null;

  const currentAttempt = typeof synthesisPayload?.attempt === 'number' ? synthesisPayload.attempt : null;
  const maxAttempts = typeof synthesisPayload?.max_attempts === 'number'
    ? synthesisPayload.max_attempts
    : (traceAttempts.length > 0 ? traceAttempts.length : null);

  const strategyLabel = typeof synthesisReport?.strategy === 'string'
    ? synthesisReport.strategy.replace(/_/g, ' ')
    : (typeof strategyUsed?.fallback_strategy === 'string' ? strategyUsed.fallback_strategy : 'N/A');

  const meanColumnDrift = typeof correlationDrift?.mean_column_drift === 'number'
    ? correlationDrift.mean_column_drift
    : (typeof correlationDrift?.mean_column_max_drift === 'number' ? correlationDrift.mean_column_max_drift : null);

  const formatCount = (value: number | null, prefix = '') => (typeof value === 'number' ? `${prefix}${value.toLocaleString()}` : 'N/A');
  const summaryCards: Array<[string, string]> = [
    ['Before', formatCount(rowsBefore)],
    ['Generated', formatCount(rowsGenerated, '+')],
    ['After', formatCount(rowsAfter)],
    ['Attempt', currentAttempt !== null ? `${currentAttempt}${maxAttempts ? `/${maxAttempts}` : ''}` : 'N/A'],
  ];
  
  const driftColor = (v: number) => v < 0.10 ? "#34D399" : v < 0.15 ? "#FBBF24" : "#F87171";
  
  // Handle synthesis failed/skipped
  if (synthesisPayload?.status === "synthesis_failed" || synthesisPayload?.status === "fallback") {
    return (
      <div>
        <div style={{ padding: "20px", textAlign: "center", background: "#ECFDF5", border: "1px solid #D1FAE5", borderRadius: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#047857", marginBottom: 4 }}>Synthesis Skipped</div>
          <div style={{ fontSize: 11, color: "#16A34A", fontFamily: "IBM Plex Sans, sans-serif", marginBottom: 8 }}>
            {synthesisPayload?.warning || "Dataset already balanced or synthesis not needed"}
          </div>
          {synthesisPayload?.trace && Array.isArray(synthesisPayload.trace) && synthesisPayload.trace.length > 0 && (
            <div style={{ fontSize: 10, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 6, padding: "8px", textAlign: "left", maxHeight: 100, overflowY: "auto" }}>
              {synthesisPayload.trace.map((line: string, i: number) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  const handleGenerateSynthetic = async () => {
    if (!datasetId || !runId) {
      setError('Missing dataset or run information');
      return;
    }
    
    setGenerating(true);
    setError(null);
    setResultMessage(null);
    setIsFallbackDownload(false);
    
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';
      const response = existingSyntheticDataS3Key
        ? await fetch(`${API_BASE}/agents/${datasetId}/runs/${runId}/download-synthetic`, {
            credentials: 'include',
          })
        : await fetch(`${API_BASE}/agents/${datasetId}/runs/${runId}/generate-synthetic`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.detail || `Generation failed (${response.status})`;
        throw new Error(errorMsg);
      }
      
      const result = await response.json();
      const syntheticDownloadUrl = typeof result.downloadUrl === 'string' && result.downloadUrl.trim().length > 0
        ? result.downloadUrl
        : (typeof result.filePath === 'string' && result.filePath.trim().length > 0 ? result.filePath : null);

      if (!syntheticDownloadUrl) {
        throw new Error('Synthetic generation succeeded but no download URL was returned');
      }

      setGeneratedFile(syntheticDownloadUrl);
      setIsFallbackDownload(Boolean(result.isFallback));
      if (typeof result.message === 'string' && result.message.trim().length > 0) {
        setResultMessage(result.message);
      } else if (existingSyntheticDataS3Key) {
        setResultMessage('Stored synthetic dataset loaded successfully.');
      }
      if (result.isFallback && typeof result.failureReason === 'string' && result.failureReason.trim().length > 0) {
        setError(result.failureReason);
      }
      
      // Save analysis to database after successful generation
      if (onAnalysisSaved) {
        try {
          await fetch(`${API_BASE}/agents/${datasetId}/runs/${runId}/save-analysis`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              synthesis: synthesisPayload,
              syntheticDataS3Key: result.syntheticDataS3Key,
              generatedAt: new Date().toISOString(),
            }),
          });
          
          if (onAnalysisSaved) {
            onAnalysisSaved({
              synthesis: synthesisPayload ?? {},
              syntheticDataS3Key: result.syntheticDataS3Key,
            });
          }
        } catch (err) {
          console.warn('Failed to save analysis:', err);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const generatedFileName = (() => {
    if (!generatedFile) return 'synthetic_data.csv';

    try {
      const parsed = new URL(generatedFile);
      const segments = parsed.pathname.split('/').filter(Boolean);
      return decodeURIComponent(segments[segments.length - 1] || 'synthetic_data.csv');
    } catch {
      const noQuery = generatedFile.split('?')[0];
      const fallbackName = noQuery.split('/').pop();
      return fallbackName && fallbackName.length > 0 ? fallbackName : 'synthetic_data.csv';
    }
  })();
  
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {summaryCards.map(([l, v]) => (
          <div key={l} style={{ flex: 1, background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 8, padding: "7px 5px", textAlign: "center" }}>
            <div style={{ fontSize: 13, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#0D1117", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 9, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
          </div>
        ))}
      </div>
      <Row label="Strategy"><Tag color="#7C3AED" bg="#F5F3FF" border="#EDE9FE">{strategyLabel}</Tag></Row>
      <SectionHead>Imputation</SectionHead>
      {synthesisPayload?.imputation_report && Object.keys(synthesisPayload.imputation_report).length > 0 ? (
        Object.entries(synthesisPayload.imputation_report).map(([col, data], i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #F6F8FA", gap: 8 }}>
            <Tag>{col}</Tag>
            <span style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", flex: 1, textAlign: "center" }}>{(data.action ?? 'unknown').replace(/_/g, " ")}</span>
            <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: data.action === "dropped" ? "#DC2626" : "#0D1117" }}>
              {data.value !== undefined ? String(data.value) : (data.reason || '—')}
            </span>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No imputation performed</div>
      )}
      <SectionHead>Correlation Drift</SectionHead>
      {correlationDrift ? (
        ([
          ["Max Pair Diff.", correlationDrift.max_pair_difference, 0.20], 
          ["Frobenius Norm", correlationDrift.frobenius_norm, 0.40], 
          ["Mean Col. Drift", meanColumnDrift, 0.20]
        ] as Array<[string, number | null, number]>).filter((item): item is [string, number, number] => typeof item[1] === 'number').map(([l, v, t]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <span style={{ fontSize: 10.5, color: "#8B949E", width: 100, flexShrink: 0, fontFamily: "IBM Plex Sans, sans-serif" }}>{l}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 99, background: "#F0F2F4", overflow: "hidden" }}>
              <div style={{ width: `${Math.min((v / t) * 100, 100)}%`, height: "100%", background: driftColor(v), borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#24292F", minWidth: 38, textAlign: "right" }}>{v.toFixed(2)}</span>
          </div>
        ))
      ) : synthesisPayload?.correlation_report?.status === "skip" ? (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>
          {synthesisPayload.correlation_report.details || "No numeric columns available for correlation check"}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No correlation data available</div>
      )}
      <SectionHead>Attempt Trace</SectionHead>
      {traceAttempts.length > 0 ? (
        traceAttempts.map((t: AttemptTrace, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.privacy === "pass" && t.correlation === "pass" ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${t.privacy === "pass" && t.correlation === "pass" ? "#D1FAE5" : "#FEE2E2"}`, borderRadius: 7, padding: "6px 10px", marginBottom: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#8B949E" }}>#{t.attempt}</span>
              <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#57606A" }}>budget={t.budget}</span>
            </div>
            <div style={{ display: "flex", gap: 5 }}>
              <StatusPill status={t.privacy} />
              <StatusPill status={t.correlation} />
            </div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 11, color: "#8B949E", padding: "8px 0", fontStyle: "italic" }}>No attempt trace available</div>
      )}
      
      {/* Generate Synthetic Data Button */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E1E4E8" }}>
        {error && (
          <div style={{
            padding: "12px 14px",
            background: "#FEF2F2",
            border: "1px solid #FEE2E2",
            borderRadius: 8,
            marginBottom: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginTop: 1, flexShrink: 0 }}>
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", marginBottom: 2 }}>Error</div>
              <div style={{ fontSize: 11, color: "#B91C1C", fontFamily: "IBM Plex Mono, monospace", lineHeight: 1.4 }}>{error}</div>
            </div>
            <button
              onClick={() => setError(null)}
              style={{
                background: "transparent",
                border: "none",
                color: "#DC2626",
                cursor: "pointer",
                padding: 0,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}
        
        {!generating && !generatedFile && (
          <button
            onClick={handleGenerateSynthetic}
            style={{
              width: "100%",
              padding: "10px 16px",
              background: "#0969DA",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              fontFamily: "IBM Plex Sans, sans-serif",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {existingSyntheticDataS3Key ? 'Download Synthetic Data' : 'Generate Synthetic Data'}
          </button>
        )}
        
        {generating && (
          <div style={{
            padding: "16px",
            background: "#F6F8FA",
            border: "1px solid #E1E4E8",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}>
            <div style={{
              width: 16,
              height: 16,
              border: "2px solid #E1E4E8",
              borderTop: "2px solid #0969DA",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <span style={{ fontSize: 13, color: "#57606A", fontFamily: "IBM Plex Sans, sans-serif" }}>
              Generating synthetic data...
            </span>
          </div>
        )}
        
        {generatedFile && (
          <div style={{
            padding: "12px 14px",
            background: isFallbackDownload ? "#FFFBEB" : "#F0FDF4",
            border: isFallbackDownload ? "1px solid #FDE68A" : "1px solid #D1FAE5",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isFallbackDownload ? "#B45309" : "#047857"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: isFallbackDownload ? "#B45309" : "#047857", fontFamily: "IBM Plex Sans, sans-serif" }}>
                  {isFallbackDownload ? "Original Dataset Returned" : "Synthetic Data Generated"}
                </div>
                <div style={{ fontSize: 10, color: "#166534", fontFamily: "IBM Plex Mono, monospace", marginTop: 2 }}>
                  {generatedFileName}
                </div>
                {resultMessage && (
                  <div style={{ fontSize: 10, color: isFallbackDownload ? "#92400E" : "#166534", fontFamily: "IBM Plex Sans, sans-serif", marginTop: 4 }}>
                    {resultMessage}
                  </div>
                )}
              </div>
            </div>
            <a
              href={generatedFile}
              download={generatedFileName}
              style={{
                padding: "6px 12px",
                background: isFallbackDownload ? "#B45309" : "#047857",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                textDecoration: "none",
                fontFamily: "IBM Plex Sans, sans-serif",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 12.8V2.5"/>
              </svg>
              Download CSV
            </a>
          </div>
        )}
        
        {error && (
          <div style={{
            padding: "12px 14px",
            background: "#FEF2F2",
            border: "1px solid #FEE2E2",
            borderRadius: 8,
            fontSize: 12,
            color: "#DC2626",
            fontFamily: "IBM Plex Sans, sans-serif",
          }}>
            {error}
          </div>
        )}
      </div>
      
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const RESULT_RENDERERS = { evaluation: EvaluationResult, planner: PlannerResult, compliance: ComplianceResult, synthesis: SynthesisResult };

// ── Arrow ─────────────────────────────────────────────────────────────────────
function Arrow({ from }: { from: AgentKey }) {
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
type AgentBlockProps = {
  agentKey: AgentKey;
  agentState: AgentRuntimeState;
  datasetId?: string;
  runId?: string;
  onAnalysisSaved?: (analysis: { synthesis: Record<string, unknown>; syntheticDataS3Key?: string | null }) => void;
  existingSyntheticDataS3Key?: string | null;
};
function AgentBlock({ agentKey, agentState, datasetId, runId, onAnalysisSaved, existingSyntheticDataS3Key }: AgentBlockProps) {
  const { status, logs, result } = agentState;
  const ResultRenderer = RESULT_RENDERERS[agentKey] as (props: {
    payload?: Record<string, unknown> | null;
    datasetId?: string;
    runId?: string;
    onAnalysisSaved?: (analysis: { synthesis: Record<string, unknown>; syntheticDataS3Key?: string | null }) => void;
    existingSyntheticDataS3Key?: string | null;
  }) => JSX.Element;
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
            <ResultRenderer payload={result} datasetId={datasetId} runId={runId} onAnalysisSaved={onAnalysisSaved} existingSyntheticDataS3Key={existingSyntheticDataS3Key} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface AgentAnalysisProps {
  dataset: {
    id: string;
    name: string;
    status: string;
    rowCount: number | null;
    columnCount: number | null;
  } | null;
  currentRun: {
    id: string;
    status: string;
    adfiScore: number | null;
    complianceStatus: string | null;
    task: string | null;
    createdAt: string;
    updatedAt?: string | null;
    result?: Record<string, unknown> | null;
    errorMsg?: string | null;
    syntheticDataS3Key?: string | null;
  } | null;
  onRunCreated?: (run: {
    id: string;
    status: string;
    datasetId?: string;
  }) => void;
}

interface AgentEvent {
  type: "agent_start" | "agent_data" | "agent_complete";
  agent: string;
  payload?: {
    phase?: string;
    message?: string;
    [key: string]: unknown;
  };
}

function pushUniqueLog(target: Array<{ message: string }>, message: string) {
  const trimmed = message.trim();
  if (!trimmed) return;
  if (target.length > 0 && target[target.length - 1].message === trimmed) return;
  target.push({ message: trimmed });
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)).filter((v) => v.trim().length > 0) : [];
}

function pickFirstString(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const candidates = [
    source.message,
    source.emitted_message,
    source.reason,
    source.summary,
    source.text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

function extractNarrativeLines(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];

  const source = payload as Record<string, unknown>;
  const lines: string[] = [];

  const append = (value: unknown) => {
    toStringArray(value).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (!lines.includes(trimmed)) lines.push(trimmed);
    });
  };

  append(source.reasoning_steps);
  append(source.reasoning);
  append(source.messages);
  append(source.logs);

  // Prefer content-bearing traces over lifecycle lines when available.
  const traceLines = toStringArray(source.trace).filter((line) => {
    const lower = line.toLowerCase();
    return !(
      lower.startsWith("starting ") ||
      lower.startsWith("running ") ||
      lower.endsWith(" complete") ||
      lower.includes("finished: success")
    );
  });
  traceLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!lines.includes(trimmed)) lines.push(trimmed);
  });

  const scalarMessage = pickFirstString(source);
  if (scalarMessage && !lines.includes(scalarMessage)) {
    lines.unshift(scalarMessage);
  }

  return lines;
}

function pickObject(source: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = source[key];
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeAgentResult(agentKey: string, payload: Record<string, unknown>): Record<string, unknown> {
  const direct =
    pickObject(payload, [agentKey, "result", "payload"]) ??
    payload;

  if (agentKey === "evaluation") {
    return pickObject(direct, ["evaluation"]) ?? direct;
  }
  if (agentKey === "planner") {
    const plannerNode = pickObject(direct, ["planner", "plan"]) ?? direct;
    return pickObject(plannerNode, ["plan"]) ?? plannerNode;
  }
  if (agentKey === "compliance") {
    const complianceNode = pickObject(direct, ["compliance"]) ?? direct;
    return pickObject(complianceNode, ["compliance"]) ?? complianceNode;
  }
  if (agentKey === "synthesis") {
    const synthesisNode = pickObject(direct, ["synthesis"]) ?? direct;
    return pickObject(synthesisNode, ["result"]) ?? synthesisNode;
  }
  return direct;
}

function deriveAttemptTraceFromLines(lines: string[]): Array<{ attempt: number; budget: number | null; privacy: string; correlation: string }> {
  const attempts: Array<{ attempt: number; budget: number | null; privacy: string; correlation: string }> = [];
  let current: { attempt: number; budget: number | null; privacy: string; correlation: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const attemptMatch = line.match(/^Attempt\s+(\d+)\/\d+\s+[-—]\s+budget=(\d+)/i);

    if (attemptMatch) {
      if (current) {
        attempts.push(current);
      }

      current = {
        attempt: Number(attemptMatch[1]),
        budget: Number(attemptMatch[2]),
        privacy: 'queued',
        correlation: 'queued',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (/privacy check:\s*pass/i.test(line)) {
      current.privacy = 'pass';
    } else if (/privacy check:\s*fail/i.test(line)) {
      current.privacy = 'fail';
    } else if (/correlation check:\s*pass/i.test(line)) {
      current.correlation = 'pass';
    } else if (/correlation check:\s*fail/i.test(line)) {
      current.correlation = 'fail';
    }
  }

  if (current) {
    attempts.push(current);
  }

  return attempts;
}

export default function PipelineLog({ dataset, currentRun, onRunCreated }: AgentAnalysisProps) {
  const [agents, setAgents] = useState<Record<AgentKey, AgentRuntimeState>>(() => createInitialAgents());
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketRunKeyRef = useRef<string | null>(null);
  const hydratedRunSignatureRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!currentRun) {
      hydratedRunSignatureRef.current = null;
      setStarted(false);
      setDone(false);
      setElapsed(0);
      setAgents(createInitialAgents());
      return;
    }

    const runStatus = (currentRun.status ?? '').toLowerCase();
    const runResult = (currentRun.result as Record<string, unknown> | undefined) ?? undefined;
    const resultKeys = runResult ? Object.keys(runResult).sort().join('|') : '';
    const nextHydrationSignature = `${currentRun.id}:${runStatus}:${currentRun.updatedAt ?? ''}:${resultKeys}`;

    if (hydratedRunSignatureRef.current === nextHydrationSignature) {
      return;
    }

    const shouldHydrateFromStoredResult = runStatus === 'completed' || runStatus === 'failed' || Boolean(runResult);
    if (!shouldHydrateFromStoredResult) {
      return;
    }

    hydratedRunSignatureRef.current = nextHydrationSignature;

    const pipelineResult =
      ((runResult?.pipeline_result as Record<string, unknown> | undefined) ?? runResult);
    if (!pipelineResult || typeof pipelineResult !== "object") return;

    const nextAgents = createInitialAgents();

    const summaryTrace = Array.isArray(pipelineResult.trace)
      ? (pipelineResult.trace as string[])
      : [];

    const mapping: Record<string, string[]> = {
      evaluation: ["evaluation"],
      planner: ["plan", "planner"],
      compliance: ["compliance"],
      synthesis: ["synthesis"],
    };

    AGENT_ORDER.forEach((agentKey) => {
      const keys = mapping[agentKey] ?? [agentKey];
      const found = keys
        .map((k) => pipelineResult[k])
        .find((v) => v && typeof v === "object") as Record<string, unknown> | undefined;

      if (!found) return;
      const normalizedResult = normalizeAgentResult(agentKey, found);
      nextAgents[agentKey].result = normalizedResult;
      nextAgents[agentKey].status = "complete";

      extractNarrativeLines(normalizedResult).forEach((line) => pushUniqueLog(nextAgents[agentKey].logs, line));

      if (agentKey === "synthesis") {
        const synthesisInner =
          ((normalizedResult.result as Record<string, unknown> | undefined) ?? normalizedResult);
        extractNarrativeLines(synthesisInner).forEach((line) => pushUniqueLog(nextAgents[agentKey].logs, line));
      }
    });

    if (AGENT_ORDER.every((key) => nextAgents[key].logs.length === 0)) {
      summaryTrace.forEach((line) => {
        const msg = String(line);
        const lower = msg.toLowerCase();
        const inferred = (lower.includes("synthesis") || lower.includes("validation"))
            ? "synthesis"
            : lower.includes("compliance")
              ? "compliance"
              : lower.includes("planner")
                ? "planner"
                : "evaluation";
        if (!nextAgents[inferred]) return;
        pushUniqueLog(nextAgents[inferred].logs, msg);
        if (nextAgents[inferred].status === "queued") nextAgents[inferred].status = "complete";
      });
    }

    setAgents(nextAgents);
    setStarted(true);
    setDone((currentRun.status ?? "").toLowerCase() === "completed" || (currentRun.status ?? "").toLowerCase() === "failed");
  }, [currentRun]);

  // Connect to WebSocket for real-time agent events
  useEffect(() => {
    const runId = currentRun?.id;
    const datasetId = dataset?.id;

    if (!runId || !datasetId) {
      return;
    }

    const runKey = `${datasetId}:${runId}`;
    if (socketRef.current && socketRunKeyRef.current === runKey) {
      return;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      socketRunKeyRef.current = null;
    }

    try {
      const socketUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

      const socket = io(`${socketUrl}/agents`, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling'],
      });

      socket.on("connect", () => {
        setIsConnected(true);
        socket.emit("subscribe_to_run", {
          runId,
          datasetId,
        });
      });

      socket.on("disconnect", () => {
        console.log("❌ WebSocket disconnected");
        setIsConnected(false);
      });

      socket.on("subscribed", (data) => {
        console.log("✅ Subscribed to run:", data);
      });

      socket.on("agent_event", (event: AgentEvent) => {
        console.log("📨 Agent event received:", event);
        // Update agent state based on event
        const { type, payload } = event;
        const agent = event.agent === "validation" ? "synthesis" : event.agent;

        if (!AGENT_ORDER.includes(agent)) {
          return;
        }
        
        setAgents((prev) => {
          const agent_state = { ...prev[agent] };
          if (type === "agent_start") {
            agent_state.status = "running";
          } else if (type === "agent_data") {
            const narrative = extractNarrativeLines(payload);
            if (narrative.length > 0) {
              narrative.forEach((line) => pushUniqueLog(agent_state.logs, line));
            } else if (typeof payload?.phase === "string" && payload.phase.trim().length > 0) {
              pushUniqueLog(agent_state.logs, payload.phase);
            }
          } else if (type === "agent_complete") {
            agent_state.status = "complete";
            const normalized = normalizeAgentResult(agent, (payload ?? {}) as Record<string, unknown>);
            agent_state.result = normalized;
            extractNarrativeLines(payload).forEach((line) => pushUniqueLog(agent_state.logs, line));
            if (agent === "synthesis") {
              const synthesisInner =
                ((normalized.result as Record<string, unknown> | undefined) ?? normalized);
              extractNarrativeLines(synthesisInner).forEach((line) => pushUniqueLog(agent_state.logs, line));
            }
          }
          return { ...prev, [agent]: agent_state };
        });

        if (type === "agent_complete" && agent === "synthesis") {
          setDone(true);
          if (timerRef.current) clearInterval(timerRef.current);
        }
      });

      socket.on("error", (error) => {
        console.error("❌ WebSocket error:", error);
      });

      socketRef.current = socket;
      socketRunKeyRef.current = runKey;

      return () => {
        if (socketRunKeyRef.current === runKey) {
          socket.disconnect();
          socketRef.current = null;
          socketRunKeyRef.current = null;
        }
      };
    } catch (err) {
      console.error("❌ Failed to connect to WebSocket:", err);
    }
  }, [currentRun?.id, dataset?.id]);

  const startPipeline = async () => {
    if (!dataset || started || starting) return;

    setStarting(true);
    setStarted(true);
    setDone(false);
    setElapsed(0);
    setAgents(createInitialAgents());

    timerRef.current = setInterval(() => setElapsed((e) => e + 100), 100);

    // Trigger orchestration on backend with event headers
    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
      const res = await fetch(`${backendUrl}/agents/${dataset.id}/orchestrate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Backend-Url": backendUrl,
        },
      });
      if (!res.ok) {
        console.error("Failed to start orchestration:", res.statusText);
        setStarted(false);
      } else {
        const data = await res.json();
        if (data?.run?.id) {
          onRunCreated?.(data.run);
        }
        console.log("Pipeline started successfully");
      }
    } catch (err) {
      console.error("Error starting pipeline:", err);
      setStarted(false);
    } finally {
      setStarting(false);
    }
  };

  const reset = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStarted(false);
    setDone(false);
    setElapsed(0);
    setAgents(createInitialAgents());
  };

  const activeAgent = AGENT_ORDER.find((k) => agents[k].status === "running");
  const datasetName = dataset?.name?.replace(/\.[^/.]+$/, "") || "dataset";

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
                Pipeline — {datasetName}
              </span>
              {started && !done && activeAgent && (
                <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}>
                  · {AGENT_META[activeAgent]?.label}
                </span>
              )}
              {!isConnected && (
                <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#DC2626" }}>
                  · WebSocket disconnected
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
                <button disabled={starting} onClick={startPipeline} style={{ height: 30, padding: "0 14px", borderRadius: 8, border: "none", background: starting ? "#8FB7E8" : "#0969DA", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: starting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="#fff"/></svg>
                  {starting ? "Starting..." : "Run Pipeline"}
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
                <button disabled={starting} onClick={startPipeline} style={{ height: 36, padding: "0 20px", borderRadius: 9, border: "none", background: starting ? "#8FB7E8" : "#0969DA", color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Sans, sans-serif", cursor: starting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9V3z" fill="#fff"/></svg>
                  {starting ? "Starting..." : "Run Pipeline"}
                </button>
              </div>
            ) : (
              AGENT_ORDER.map((key, i) => (
                <div key={key}>
                  <AgentBlock 
                    agentKey={key} 
                    agentState={agents[key]} 
                    datasetId={dataset?.id} 
                    runId={currentRun?.id}
                    onAnalysisSaved={(analysis) => {
                      console.log('Analysis saved for agent:', key, analysis);
                    }}
                    existingSyntheticDataS3Key={currentRun?.syntheticDataS3Key ?? null}
                  />
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