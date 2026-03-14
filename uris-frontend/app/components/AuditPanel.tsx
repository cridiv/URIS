"use client";
import { useState, useEffect, useRef, type ReactNode } from "react";

const AGENT_META = {
  system:     { label: "System",     color: "#6E7681", accent: "#6E7681" },
  evaluation: { label: "Eval",       color: "#58A6FF", accent: "#58A6FF" },
  planner:    { label: "Planner",    color: "#BC8CFF", accent: "#BC8CFF" },
  compliance: { label: "Compliance", color: "#FF7B72", accent: "#FF7B72" },
  synthesis:  { label: "Synthesis",  color: "#3FB950", accent: "#3FB950" },
};

const OUTCOME_META = {
  ok:   { label: "OK",   color: "#3FB950", dot: "#3FB950", glow: "rgba(63,185,80,0.4)",   leftBar: "transparent" },
  warn: { label: "WARN", color: "#D29922", dot: "#F0B429", glow: "rgba(240,180,41,0.4)",  leftBar: "#D29922"     },
  fail: { label: "FAIL", color: "#F85149", dot: "#F85149", glow: "rgba(248,81,73,0.4)",   leftBar: "#F85149"     },
};

const SEVERITY_META = {
  info:   { label: "info",   color: "#484F58" },
  medium: { label: "medium", color: "#BB8009" },
  high:   { label: "high",   color: "#B91C1C" },
};

type AuditEvent = {
  ts: string;
  agent: keyof typeof AGENT_META;
  action: string;
  severity: keyof typeof SEVERITY_META;
  outcome: keyof typeof OUTCOME_META;
};

type PipelinePanelProps = {
  events?: AuditEvent[];
  streamDelay?: number;
  onComplete?: () => void;
  filename?: string;
  onReplay?: () => void;
};

const DEMO_EVENTS: AuditEvent[] = [
  { ts: "09:00:00.000", agent: "system",     action: "RUN_INITIATED",         severity: "info",   outcome: "ok"   },
  { ts: "09:00:01.204", agent: "evaluation", action: "SCHEMA_SCAN_COMPLETE",  severity: "info",   outcome: "ok"   },
  { ts: "09:00:01.881", agent: "evaluation", action: "ADFI_BASELINE",         severity: "info",   outcome: "ok"   },
  { ts: "09:00:02.340", agent: "evaluation", action: "CRITICAL_GAP_DETECTED", severity: "medium", outcome: "warn" },
  { ts: "09:00:02.901", agent: "evaluation", action: "PII_DETECTED",          severity: "medium", outcome: "warn" },
  { ts: "09:00:03.120", agent: "planner",    action: "TASK_QUEUE_BUILT",      severity: "info",   outcome: "ok"   },
  { ts: "09:00:03.455", agent: "planner",    action: "PRIORITY_ORDERING",     severity: "info",   outcome: "ok"   },
  { ts: "09:00:04.012", agent: "compliance", action: "COLUMN_BLOCKED",        severity: "high",   outcome: "fail" },
  { ts: "09:00:04.210", agent: "compliance", action: "COLUMN_BLOCKED",        severity: "high",   outcome: "fail" },
  { ts: "09:00:04.780", agent: "compliance", action: "GDPR_EXPOSURE",         severity: "medium", outcome: "warn" },
  { ts: "09:00:05.001", agent: "compliance", action: "MANIFEST_RESOLVED",     severity: "info",   outcome: "ok"   },
  { ts: "09:00:05.560", agent: "synthesis",  action: "SYNTHESIS_ATTEMPT",     severity: "info",   outcome: "ok"   },
  { ts: "09:00:07.330", agent: "synthesis",  action: "DISTRIBUTION_CHECK",    severity: "info",   outcome: "ok"   },
  { ts: "09:00:08.102", agent: "synthesis",  action: "REID_RISK_CHECK",       severity: "info",   outcome: "ok"   },
  { ts: "09:00:09.441", agent: "synthesis",  action: "SYNTHESIS_COMPLETE",    severity: "info",   outcome: "ok"   },
];

function elapsed(ts: string, baseTs: string) {
  const parse = (s: string) => {
    const [h, m, sec] = s.split(":").map(Number);
    return h * 3600 + m * 60 + sec;
  };
  const diff = (parse(ts) - parse(baseTs)).toFixed(2);
  return `+${diff}s`;
}

function Cursor() {
  return (
    <span style={{
      display: "inline-block", width: 2, height: 13,
      background: "#58A6FF", borderRadius: 1, marginLeft: 4,
      animation: "cursorBlink 1s steps(1) infinite",
      verticalAlign: "middle", opacity: 0.9,
    }} />
  );
}

function LogRow({ event, idx, baseTs, isLast, done }: { event: AuditEvent; idx: number; baseTs: string; isLast: boolean; done: boolean }) {
  const om  = OUTCOME_META[event.outcome] ?? OUTCOME_META.ok;
  const am  = AGENT_META[event.agent]     ?? AGENT_META.system;
  const sm  = SEVERITY_META[event.severity] ?? SEVERITY_META.info;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "100px 90px 1fr 56px 52px",
      alignItems: "center",
      gap: 0,
      padding: "0 16px",
      minHeight: 40,
      borderBottom: "1px solid rgba(255,255,255,0.045)",
      borderLeft: `2px solid ${om.leftBar}`,
      background: idx % 2 === 1 ? "rgba(255,255,255,0.018)" : "transparent",
      animation: "rowIn 0.22s cubic-bezier(0.16,1,0.3,1) both",
      transition: "background 0.15s",
    }}>

      {/* TIME */}
      <div style={{ paddingRight: 12 }}>
        <div style={{
          fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace",
          color: "#8B949E", fontWeight: 500, letterSpacing: "0.01em", lineHeight: 1,
        }}>
          {event.ts.slice(6)}
        </div>
        <div style={{
          fontSize: 9, fontFamily: "IBM Plex Mono, monospace",
          color: "#30363D", marginTop: 2, lineHeight: 1,
        }}>
          {elapsed(event.ts, baseTs)}
        </div>
      </div>

      {/* AGENT */}
      <div>
        <span style={{
          fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
          color: am.color, letterSpacing: "0.02em",
        }}>
          {am.label}
        </span>
      </div>

      {/* ACTION */}
      <div style={{ overflow: "hidden", paddingRight: 12 }}>
        <span style={{
          fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500,
          color: event.outcome === "fail" ? "#FF7B72"
               : event.outcome === "warn" ? "#E3B341"
               : "#CDD9E5",
          display: "block", overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", letterSpacing: "0.005em",
        }}>
          {event.action}
          {isLast && !done && <Cursor />}
        </span>
      </div>

      {/* SEVERITY */}
      <div>
        <span style={{
          fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
          color: sm.color, letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {sm.label}
        </span>
      </div>

      {/* OUTCOME dot + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
        <div style={{
          width: 6, height: 6, borderRadius: 99,
          background: om.dot, flexShrink: 0,
          boxShadow: event.outcome !== "ok" ? `0 0 6px ${om.glow}` : "none",
        }} />
        <span style={{
          fontSize: 9.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
          color: om.color, letterSpacing: "0.06em",
        }}>
          {om.label}
        </span>
      </div>
    </div>
  );
}

function WaitingDots() {
  return (
    <div style={{ display: "flex", gap: 5, padding: "10px 18px", alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 3, height: 3, borderRadius: 99, background: "#21262D",
          animation: `dotPulse 1.1s ${i * 0.2}s ease infinite`,
        }} />
      ))}
    </div>
  );
}

function ColHeader({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" | "center" }) {
  return (
    <div style={{
      fontSize: 9, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
      color: "#30363D", textTransform: "uppercase", letterSpacing: "0.1em",
      textAlign: align,
    }}>
      {children}
    </div>
  );
}

function ResultBadge() {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
      borderTop: "1px solid rgba(63,185,80,0.2)",
      background: "linear-gradient(to bottom, rgba(63,185,80,0.06), transparent)",
      animation: "rowIn 0.35s cubic-bezier(0.16,1,0.3,1) both",
      flexShrink: 0,
    }}>
      {[
        { label: "ADFI",        value: "0.912",  color: "#3FB950" },
        { label: "IMPROVEMENT", value: "+10.3%", color: "#58A6FF" },
        { label: "ROWS",        value: "1,311",  color: "#BC8CFF" },
      ].map(({ label, value, color }, i) => (
        <div key={label} style={{
          padding: "12px 0", textAlign: "center",
          borderRight: i < 2 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <div style={{
            fontSize: 18, fontFamily: "IBM Plex Mono, monospace",
            fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em",
          }}>
            {value}
          </div>
          <div style={{
            fontSize: 8.5, fontFamily: "IBM Plex Mono, monospace",
            color: "#484F58", textTransform: "uppercase",
            letterSpacing: "0.1em", marginTop: 5,
          }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PipelinePanel({
  events: propEvents,
  streamDelay = 300,
  onComplete,
}: PipelinePanelProps) {
  const source    = propEvents ?? DEMO_EVENTS;
  const [visible, setVisible] = useState(0);
  const [done, setDone]       = useState(false);
  const scrollRef             = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (visible >= source.length) {
      if (done) return;
      const t = setTimeout(() => {
        setDone(true);
        onComplete?.();
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible(v => v + 1), streamDelay);
    return () => clearTimeout(t);
  }, [done, onComplete, visible, source.length, streamDelay]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [visible]);

  const shownEvents = source.slice(0, visible);
  const baseTs      = source[0]?.ts ?? "09:00:00.000";

  return (
    <div style={{
      background: "#0D1117",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.025), 0 20px 60px rgba(0,0,0,0.55)",
      display: "flex",
      flexDirection: "column",
      maxHeight: 480,
    }}>

      {/* ── Column headers ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "100px 90px 1fr 56px 52px",
        alignItems: "center",
        padding: "10px 16px 9px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.02)",
        flexShrink: 0,
      }}>
        <ColHeader>Time</ColHeader>
        <ColHeader>Agent</ColHeader>
        <ColHeader>Action</ColHeader>
        <ColHeader>Sev</ColHeader>
        <ColHeader align="right">Result</ColHeader>
      </div>

      {/* ── Scrollable rows ── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {shownEvents.length === 0 && (
          <div style={{
            padding: "40px 0", textAlign: "center",
            color: "#21262D", fontSize: 11,
            fontFamily: "IBM Plex Mono, monospace",
          }}>
            initialising…
          </div>
        )}

        {shownEvents.map((evt, i) => (
          <LogRow
            key={i}
            event={evt}
            idx={i}
            baseTs={baseTs}
            isLast={i === shownEvents.length - 1}
            done={done}
          />
        ))}

        {!done && visible < source.length && <WaitingDots />}
      </div>

      {/* ── Result badge ── */}
      {done && <ResultBadge />}

      <style>{`
        @keyframes rowIn       { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes cursorBlink { 0%,49%{ opacity:1; } 50%,100%{ opacity:0; } }
        @keyframes dotPulse    { 0%,100%{ opacity:0.15; } 50%{ opacity:0.7; } }
        *::-webkit-scrollbar   { display:none; }
      `}</style>
    </div>
  );
}