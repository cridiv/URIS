"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

type AgentKey = "system" | "evaluation" | "planner" | "compliance" | "synthesis";
type Outcome = "ok" | "warn" | "fail";
type Severity = "info" | "medium" | "high";

interface AuditEvent {
  ts: string;
  agent: AgentKey;
  action: string;
  resource: string;
  severity: Severity;
  outcome: Outcome;
  detail: string;
}

interface RunPayload {
  id: string;
  status: string;
  adfiScore: number | null;
  complianceStatus: string | null;
  task: string | null;
  createdAt: string;
  updatedAt?: string;
  result?: Record<string, unknown> | null;
  syntheticDataS3Key?: string | null;
}

interface DatasetPayload {
  id: string;
  name: string;
  rowCount: number | null;
  columnCount: number | null;
}

const AGENT_META: Record<AgentKey, { label: string; color: string; bg: string; border: string }> = {
  system: { label: "System", color: "#57606A", bg: "#F6F8FA", border: "#D0D7DE" },
  evaluation: { label: "Evaluation", color: "#0969DA", bg: "#EFF6FF", border: "#DBEAFE" },
  planner: { label: "Planner", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  compliance: { label: "Compliance", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  synthesis: { label: "Synthesis", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0" },
};

const OUTCOME_META: Record<Outcome, { label: string; color: string; bg: string; border: string; dot: string; leftBar: string }> = {
  ok: { label: "OK", color: "#047857", bg: "#ECFDF5", border: "#A7F3D0", dot: "#34D399", leftBar: "transparent" },
  warn: { label: "WARN", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A", dot: "#FBBF24", leftBar: "#FBBF24" },
  fail: { label: "FAIL", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", dot: "#F87171", leftBar: "#F87171" },
};

const SEVERITY_META: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  info: { label: "Info", color: "#57606A", bg: "#F6F8FA", border: "#D0D7DE" },
  medium: { label: "Medium", color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  high: { label: "High", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
};

const ALL_AGENTS: AgentKey[] = ["system", "evaluation", "planner", "compliance", "synthesis"];
const ALL_OUTCOMES: Outcome[] = ["ok", "warn", "fail"];
const ALL_SEVERITIES: Severity[] = ["info", "medium", "high"];

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function inferAgent(line: string): AgentKey {
  const l = line.toLowerCase();
  if (l.includes("evaluation")) return "evaluation";
  if (l.includes("planner")) return "planner";
  if (l.includes("compliance")) return "compliance";
  if (l.includes("synthesis")) return "synthesis";
  return "system";
}

function inferOutcome(line: string): Outcome {
  const l = line.toLowerCase();
  if (l.includes("failed") || l.includes("error") || l.includes("reject")) return "fail";
  if (l.includes("warn") || l.includes("retry") || l.includes("skipped") || l.includes("blocked")) return "warn";
  return "ok";
}

function inferSeverity(outcome: Outcome): Severity {
  if (outcome === "fail") return "high";
  if (outcome === "warn") return "medium";
  return "info";
}

function lineToAction(line: string): string {
  return line
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase()
    .slice(0, 36) || "EVENT";
}

function buildEvents(run: RunPayload | null, datasetName: string): AuditEvent[] {
  if (!run) return [];

  const result = (run.result as Record<string, unknown> | undefined) ?? {};
  const pipeline = (result.pipeline_result as Record<string, unknown> | undefined) ?? result;
  const trace = Array.isArray(pipeline.trace) ? (pipeline.trace as string[]) : [];

  const createdMs = new Date(run.createdAt).getTime();
  const updatedMs = new Date(run.updatedAt ?? run.createdAt).getTime();
  const usableEndMs = updatedMs >= createdMs ? updatedMs : createdMs + Math.max(trace.length, 1) * 400;

  if (trace.length > 0) {
    const step = trace.length > 1 ? (usableEndMs - createdMs) / (trace.length - 1) : 0;
    return trace.map((line, idx) => {
      const outcome = inferOutcome(line);
      return {
        ts: new Date(createdMs + step * idx).toISOString(),
        agent: inferAgent(line),
        action: lineToAction(line),
        resource: datasetName,
        severity: inferSeverity(outcome),
        outcome,
        detail: line,
      };
    });
  }

  return [
    {
      ts: run.createdAt,
      agent: "system",
      action: "RUN_STATUS",
      resource: datasetName,
      severity: run.status.toLowerCase() === "completed" ? "info" : run.status.toLowerCase() === "failed" ? "high" : "medium",
      outcome: run.status.toLowerCase() === "completed" ? "ok" : run.status.toLowerCase() === "failed" ? "fail" : "warn",
      detail: `Run ${run.id} is currently ${run.status}.`,
    },
  ];
}

function elapsed(iso: string, baseTs: string) {
  const ms = new Date(iso).getTime() - new Date(baseTs).getTime();
  return `+${(ms / 1000).toFixed(3)}s`;
}

function fmtTs(iso: string) {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 23);
}

function AgentChip({ agent }: { agent: AgentKey }) {
  const m = AGENT_META[agent];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap", letterSpacing: "0.03em" }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: m.color, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const m = OUTCOME_META[outcome];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  return (
    <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: m.color, background: m.bg, border: `1px solid ${m.border}`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase" }}>
      {m.label}
    </span>
  );
}

function SummaryStrip({ events, baseTs, datasetName, taskLabel, run, onBack }: { events: AuditEvent[]; baseTs: string; datasetName: string; taskLabel: string; run: RunPayload | null; onBack: () => void }) {
  const ok = events.filter((e) => e.outcome === "ok").length;
  const warn = events.filter((e) => e.outcome === "warn").length;
  const fail = events.filter((e) => e.outcome === "fail").length;
  const lastEvent = events[events.length - 1];
  const dur = ((new Date(lastEvent?.ts ?? baseTs).getTime() - new Date(baseTs).getTime()) / 1000).toFixed(2);

  const result = (run?.result as Record<string, unknown> | undefined) ?? {};
  const pipeline = (result.pipeline_result as Record<string, unknown> | undefined) ?? result;
  const validation = (pipeline.validation as Record<string, unknown> | undefined) ?? {};
  const validationInner = (validation.validation as Record<string, unknown> | undefined) ?? {};
  const adfiBefore = toNumber(validationInner.adfi_before);
  const adfiAfter = toNumber(validationInner.adfi_after) ?? run?.adfiScore ?? null;
  const adfiDelta = adfiBefore !== null && adfiAfter !== null && adfiBefore !== 0
    ? `${(((adfiAfter - adfiBefore) / adfiBefore) * 100).toFixed(1)}%`
    : "—";

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, padding: "14px 16px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 220 }}>
          <button onClick={onBack} aria-label="Back to audit index" style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid #E1E4E8", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#57606A", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#F5F3FF", border: "1px solid #DDD6FE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0D1117", fontFamily: "IBM Plex Mono, monospace", lineHeight: 1, letterSpacing: -0.2 }}>Audit Log</div>
            <div style={{ fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 3 }}>{datasetName} · {taskLabel}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))", gap: 8 }}>
        {[
          { label: "Duration", value: `${dur}s`, color: "#0D1117" },
          { label: "OK", value: String(ok), color: "#047857" },
          { label: "Warnings", value: String(warn), color: "#B45309" },
          { label: "Failures", value: String(fail), color: "#DC2626" },
          { label: "ADFI Delta", value: adfiDelta === "—" ? "—" : (adfiDelta.startsWith("-") ? adfiDelta : `+${adfiDelta}`), color: "#047857" },
        ].map((s) => (
          <div key={s.label} style={{ border: "1px solid #F0F2F4", borderRadius: 10, background: "#FAFBFC", padding: "10px 11px", minWidth: 0 }}>
            <div style={{ fontSize: 18, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpandedDetail({ event, idx, baseTs }: { event: AuditEvent; idx: number; baseTs: string }) {
  return (
    <tr>
      <td colSpan={7} style={{ padding: 0, borderBottom: "2px solid #E1E4E8" }}>
        <div style={{ background: "linear-gradient(to bottom, #F6F8FA, #fff)", padding: "14px 20px 16px 56px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0 32px", alignItems: "start" }}>
          <div>
            <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", color: "#B1BAC4", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>Event Detail</div>
            <p style={{ fontSize: 13, fontFamily: "IBM Plex Sans, sans-serif", color: "#24292F", lineHeight: 1.6, margin: 0 }}>{event.detail}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", color: "#B1BAC4", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>Timestamp (UTC)</div>
            <div style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#24292F", fontWeight: 600 }}>{fmtTs(event.ts)}</div>
            <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E", marginTop: 2 }}>{elapsed(event.ts, baseTs)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", color: "#B1BAC4", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 5 }}>Event #</div>
            <div style={{ fontSize: 22, fontFamily: "IBM Plex Mono, monospace", color: "#E1E4E8", fontWeight: 700, lineHeight: 1 }}>{String(idx + 1).padStart(2, "0")}</div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function FilterMenu({ title, items, selected, onToggle }: { title: string; items: Array<{ value: string; label: string; color: string; dot?: string }>; selected: string[]; onToggle: (value: string) => void }) {
  const allSelected = selected.length === items.length;
  return (
    <details style={{ position: "relative" }}>
      <summary style={{ listStyle: "none", display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 11px", borderRadius: 8, border: "1px solid #E1E4E8", background: "#fff", cursor: "pointer" }}>
        <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.08em" }}>{title}</span>
        <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#0969DA", background: "#EFF6FF", border: "1px solid #DBEAFE", borderRadius: 5, padding: "1px 6px", lineHeight: 1.2 }}>{allSelected ? "All" : `${selected.length}/${items.length}`}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 2 }}><path d="M6 9l6 6 6-6" stroke="#8B949E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </summary>
      <div style={{ position: "absolute", top: 38, left: 0, minWidth: 240, zIndex: 30, background: "#fff", border: "1px solid #E1E4E8", borderRadius: 10, boxShadow: "0 8px 20px rgba(0,0,0,0.08)", padding: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((item) => (
            <label key={item.value} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "6px 7px", borderRadius: 7, background: selected.includes(item.value) ? "#F6F8FA" : "transparent", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={selected.includes(item.value)} onChange={() => onToggle(item.value)} style={{ cursor: "pointer" }} />
                <span style={{ fontSize: 11.5, color: "#24292F", fontFamily: "IBM Plex Sans, sans-serif" }}>{item.label}</span>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: item.dot ?? item.color, flexShrink: 0 }} />
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function FilterBar({ filters, setFilters, search, setSearch, shown, total }: { filters: { agents: AgentKey[]; outcomes: Outcome[]; severities: Severity[] }; setFilters: React.Dispatch<React.SetStateAction<{ agents: AgentKey[]; outcomes: Outcome[]; severities: Severity[] }>>; search: string; setSearch: React.Dispatch<React.SetStateAction<string>>; shown: number; total: number }) {
  const toggle = (key: "agents" | "outcomes" | "severities", val: string) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(val as never)
        ? f[key].filter((x) => x !== val)
        : [...f[key], val as never],
    }));

  return (
    <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, padding: "12px 14px", marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ position: "relative", width: "100%" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}><path d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" stroke="#8B949E" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions, resources, details…" style={{ paddingLeft: 30, paddingRight: 10, height: 34, border: "1px solid #E1E4E8", borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#24292F", background: "#F6F8FA", outline: "none", width: "100%" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", flexWrap: "wrap" }}>
        <FilterMenu title="Agent" items={ALL_AGENTS.map((a) => ({ value: a, label: AGENT_META[a].label, color: AGENT_META[a].color }))} selected={filters.agents} onToggle={(v) => toggle("agents", v)} />
        <FilterMenu title="Outcome" items={ALL_OUTCOMES.map((o) => ({ value: o, label: OUTCOME_META[o].label, color: OUTCOME_META[o].color, dot: OUTCOME_META[o].dot }))} selected={filters.outcomes} onToggle={(v) => toggle("outcomes", v)} />
        <FilterMenu title="Severity" items={ALL_SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label, color: SEVERITY_META[s].color }))} selected={filters.severities} onToggle={(v) => toggle("severities", v)} />
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}><span style={{ color: "#0D1117", fontWeight: 700 }}>{shown}</span><span style={{ color: "#B1BAC4" }}> / {total}</span><span> events</span></span>
        </div>
      </div>
    </div>
  );
}

export default function Logs({ datasetId: propDatasetId, runId: propRunId }: { datasetId?: string; runId?: string }) {
  const params = useParams<{ datasetId: string; runId: string }>();
  const router = useRouter();

  const datasetId = propDatasetId ?? params?.datasetId;
  const runId = propRunId ?? params?.runId;

  const [run, setRun] = useState<RunPayload | null>(null);
  const [dataset, setDataset] = useState<DatasetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState({ agents: [...ALL_AGENTS], outcomes: [...ALL_OUTCOMES], severities: [...ALL_SEVERITIES] });
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!datasetId || !runId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [runRes, datasetRes] = await Promise.all([
          fetch(`${API_BASE}/agents/${datasetId}/runs/${runId}`),
          fetch(`${API_BASE}/dataset/${datasetId}`),
        ]);

        if (!runRes.ok) throw new Error(`Failed to load run (${runRes.status})`);
        if (!datasetRes.ok) throw new Error(`Failed to load dataset (${datasetRes.status})`);

        setRun((await runRes.json()) as RunPayload);
        setDataset((await datasetRes.json()) as DatasetPayload);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load logs");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [datasetId, runId]);

  const datasetName = dataset?.name ?? "dataset";
  const taskLabel = run?.task?.replace(/_/g, " ") ?? "Run";
  const rawEvents = useMemo(() => buildEvents(run, datasetName), [run, datasetName]);
  const baseTs = rawEvents[0]?.ts ?? run?.createdAt ?? new Date().toISOString();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const rows = rawEvents.filter((e) =>
      filters.agents.includes(e.agent) &&
      filters.outcomes.includes(e.outcome) &&
      filters.severities.includes(e.severity) &&
      (!q || [e.action, e.resource, e.detail, e.agent].some((f) => f.toLowerCase().includes(q))),
    );
    return sortDir === "asc" ? rows : [...rows].reverse();
  }, [rawEvents, filters, search, sortDir]);

  const renderTH = ({ children, right, sortable, noBorder }: { children: ReactNode; right?: boolean; sortable?: boolean; noBorder?: boolean }) => (
    <th key={String(children)} onClick={sortable ? () => setSortDir((d) => (d === "asc" ? "desc" : "asc")) : undefined} style={{ padding: "10px 14px", textAlign: right ? "right" : "left", fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fontWeight: 700, color: "#8B949E", textTransform: "uppercase", letterSpacing: "0.09em", whiteSpace: "nowrap", background: "#F6F8FA", borderBottom: "1px solid #E1E4E8", borderRight: noBorder ? "none" : "1px solid #F0F2F4", cursor: sortable ? "pointer" : "default", userSelect: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: right ? "flex-end" : "flex-start" }}>
        {children}
        {sortable && <span style={{ color: "#D0D7DE" }}>{sortDir === "asc" ? "↑" : "↓"}</span>}
      </div>
    </th>
  );

  if (loading) {
    return <div style={{ fontFamily: "IBM Plex Mono, monospace", color: "#8B949E", padding: 24 }}>Loading audit logs...</div>;
  }

  if (error) {
    return <div style={{ fontFamily: "IBM Plex Mono, monospace", color: "#DC2626", padding: 24 }}>{error}</div>;
  }

  return (
    <div style={{ fontFamily: "IBM Plex Sans, sans-serif", background: "#F4F5F7", minHeight: "100vh", padding: "24px 28px" }}>
      <SummaryStrip events={rawEvents} baseTs={baseTs} datasetName={datasetName} taskLabel={taskLabel} run={run} onBack={() => router.push("/Audit-Log")} />
      <FilterBar filters={filters} setFilters={setFilters} search={search} setSearch={setSearch} shown={filtered.length} total={rawEvents.length} />

      <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 42 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 220 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 90 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={{ background: "#F6F8FA", borderBottom: "1px solid #E1E4E8", width: 42 }} />
                {renderTH({ children: "Timestamp", sortable: true })}
                {renderTH({ children: "Agent" })}
                {renderTH({ children: "Action" })}
                {renderTH({ children: "Resource" })}
                {renderTH({ children: "Severity" })}
                {renderTH({ children: "Outcome" })}
                {renderTH({ children: "Details", noBorder: true })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "56px 0", textAlign: "center", color: "#B1BAC4", fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}>No events match the current filters.</td></tr>
              )}

              {filtered.map((evt, i) => {
                const globalIdx = rawEvents.indexOf(evt);
                const isOpen = expanded === globalIdx;
                const om = OUTCOME_META[evt.outcome];
                const isOdd = i % 2 !== 0;

                return [
                  <tr key={`row-${globalIdx}`} onClick={() => setExpanded(isOpen ? null : globalIdx)} style={{ borderBottom: isOpen ? "1px solid #DBEAFE" : "1px solid #F0F2F4", background: isOpen ? "#F0F6FF" : isOdd ? "#FAFBFC" : "#fff", cursor: "pointer", borderLeft: `3px solid ${om.leftBar}`, transition: "background 0.1s" }}>
                    <td style={{ padding: "0 0 0 12px", textAlign: "center", borderRight: "1px solid #F0F2F4" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "block", margin: "0 auto" }}><path d="M9 18l6-6-6-6" stroke="#C8D0D8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </td>
                    <td style={{ padding: "11px 14px", borderRight: "1px solid #F0F2F4", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#24292F", fontWeight: 600, lineHeight: 1 }}>{fmtTs(evt.ts).slice(11)}</div>
                      <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#B1BAC4", marginTop: 3 }}>{elapsed(evt.ts, baseTs)}</div>
                    </td>
                    <td style={{ padding: "11px 14px", borderRight: "1px solid #F0F2F4" }}><AgentChip agent={evt.agent} /></td>
                    <td style={{ padding: "11px 14px", borderRight: "1px solid #F0F2F4", overflow: "hidden" }}><span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#0D1117", letterSpacing: "0.01em", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{evt.action}</span></td>
                    <td style={{ padding: "11px 14px", borderRight: "1px solid #F0F2F4", overflow: "hidden" }}><span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#57606A", background: "#F6F8FA", border: "1px solid #E1E4E8", borderRadius: 5, padding: "2px 7px", display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{evt.resource}</span></td>
                    <td style={{ padding: "11px 14px", borderRight: "1px solid #F0F2F4" }}><SeverityBadge severity={evt.severity} /></td>
                    <td style={{ padding: "11px 14px", borderRight: "1px solid #F0F2F4" }}><OutcomeBadge outcome={evt.outcome} /></td>
                    <td style={{ padding: "11px 14px", overflow: "hidden" }}><span style={{ fontSize: 12, fontFamily: "IBM Plex Sans, sans-serif", color: "#57606A", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>{evt.detail}</span></td>
                  </tr>,
                  isOpen && <ExpandedDetail key={`detail-${globalIdx}`} event={evt} idx={globalIdx} baseTs={baseTs} />,
                ];
              })}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "10px 18px", borderTop: "1px solid #F0F2F4", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            {["ok", "warn", "fail"].map((k) => {
              const key = k as Outcome;
              const dot = key === "ok" ? "#34D399" : key === "warn" ? "#FBBF24" : "#F87171";
              const tc = key === "ok" ? "#047857" : key === "warn" ? "#B45309" : "#DC2626";
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: 99, background: dot }} />
                  <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: tc, fontWeight: 600 }}>{rawEvents.filter((e) => e.outcome === key).length} {key}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}>Run ID: <span style={{ color: "#57606A", fontWeight: 600 }}>{run?.id?.slice(0, 14) ?? "—"}</span></span>
            <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", color: "#8B949E" }}>Showing <span style={{ color: "#0D1117", fontWeight: 700 }}>{filtered.length}</span> of {rawEvents.length} events</span>
          </div>
        </div>
      </div>
    </div>
  );
}
