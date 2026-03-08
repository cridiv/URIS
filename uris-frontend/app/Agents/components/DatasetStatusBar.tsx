'use client'

function Divider() {
  return (
    <div
      style={{ width: 1, height: 28, background: "#E1E4E8", flexShrink: 0 }}
    />
  );
}

interface Dataset {
  id: string;
  name: string;
  status: string;
  rowCount: number | null;
  columnCount: number | null;
}

interface AgentRun {
  id: string;
  status: string;
  adfiScore: number | null;
  complianceStatus: string | null;
  task: string | null;
  createdAt: string;
}

interface DatasetStatusBarProps {
  dataset: Dataset | null;
  currentRun: AgentRun | null;
}

export default function DatasetStatusBar({ dataset, currentRun }: DatasetStatusBarProps) {
  const rawStatus = (currentRun?.status ?? "analyzing").toLowerCase();
  const runStatus = rawStatus.toUpperCase();
  const compliance = currentRun?.complianceStatus?.toUpperCase() || "—";
  const adfi = currentRun?.adfiScore || null;
  const runStatusTone =
    rawStatus === "completed"
      ? { dot: "#34D399", text: "#047857", glow: "0 0 0 2.5px #D1FAE5" }
      : rawStatus === "analyzing" || rawStatus === "running"
      ? { dot: "#FBBF24", text: "#B45309", glow: "none" }
      : { dot: "#F87171", text: "#DC2626", glow: "none" };

  const priorAdfi = null;
  const adfiDelta =
    typeof adfi === "number" && typeof priorAdfi === "number" && priorAdfi !== 0
      ? (((adfi - priorAdfi) / priorAdfi) * 100)
      : null;
  const inferredDatasetName = currentRun?.task
    ? currentRun.task.replace(/_analysis$/i, "").replace(/_/g, " ")
    : null;
  const datasetName = dataset?.name || inferredDatasetName || "Loading...";
  const task = currentRun?.task ? currentRun.task.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "—";
  const runId = currentRun?.id ? `run-${currentRun.id.slice(0, 8)}` : "—";

  return (
    <div
      style={{
        fontFamily: "IBM Plex Sans, sans-serif",
        background: "#fff",
        borderBottom: "1px solid #E1E4E8",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 4px",
          height: 68,
          maxWidth: "100%",
          margin: "0 auto",
        }}
      >
        {/* Back Button */}
        <button
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            border: "1px solid #E1E4E8",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#0D1117",
            marginLeft: 14,
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {/* Dataset + Task */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 18px",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#F5F3FF",
              border: "1px solid #EDE9FE",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <ellipse cx="12" cy="6" rx="9" ry="3" stroke="#7C3AED" strokeWidth="1.8" />
              <path d="M3 6v6c0 1.657 4.03 3 9 3s9-1.343 9-3V6" stroke="#7C3AED" strokeWidth="1.8" />
              <path d="M3 12v6c0 1.657 4.03 3 9 3s9-1.343 9-3v-6" stroke="#7C3AED" strokeWidth="1.8" />
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#0D1117",
                fontFamily: "IBM Plex Mono, monospace",
                letterSpacing: -0.2,
                lineHeight: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 250,
              }}
              title={datasetName}
            >
              {datasetName}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#8B949E",
                fontFamily: "IBM Plex Mono, monospace",
                lineHeight: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 220,
              }}
              title={task}
            >
              {task}
            </span>
          </div>
        </div>

        <Divider />

        {/* ADFI */}
        <div style={{ padding: "0 22px", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600,
              letterSpacing: "0.07em",
              color: "#8B949E",
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            ADFI Score
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: adfi ? "#0D1117" : "#8B949E",
                fontFamily: "IBM Plex Mono, monospace",
                letterSpacing: -0.5,
                lineHeight: 1,
              }}
            >
              {adfi ? adfi.toFixed(3) : "—"}
            </span>
            {adfiDelta !== null && (
              <span
                style={{
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "IBM Plex Mono, monospace",
                color: adfiDelta >= 0 ? "#047857" : "#B45309",
                background: adfiDelta >= 0 ? "#ECFDF5" : "#FFFBEB",
                border: adfiDelta >= 0 ? "1px solid #D1FAE5" : "1px solid #FEF3C7",
                borderRadius: 6,
                padding: "2px 7px",
                display: "flex",
                alignItems: "center",
                gap: 3,
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 9 }}>{adfiDelta >= 0 ? "▲" : "▼"}</span> {`${adfiDelta >= 0 ? "+" : ""}${adfiDelta.toFixed(1)}%`}
            </span>
            )}
          </div>
        </div>

        <Divider />

        {/* Compliance */}
        <div style={{ padding: "0 22px", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600,
              letterSpacing: "0.07em",
              color: "#8B949E",
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            Compliance
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                stroke="#047857"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                fontFamily: "IBM Plex Mono, monospace",
                color:
                  compliance === "PASSED"
                    ? "#047857"
                    : compliance === "FAILED"
                    ? "#DC2626"
                    : "#8B949E",
                letterSpacing: 0.3,
              }}
            >
              {compliance}
            </span>
          </div>
        </div>

        <Divider />

        {/* Run ID */}
        <div style={{ padding: "0 22px", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600,
              letterSpacing: "0.07em",
              color: "#8B949E",
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            Run ID
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "IBM Plex Mono, monospace",
                color: "#0D1117",
                letterSpacing: -0.2,
              }}
            >
              {runId}
            </span>
          </div>
        </div>

        <Divider />

        {/* Run Status */}
        <div style={{ padding: "0 22px", flexShrink: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 600,
              letterSpacing: "0.07em",
              color: "#8B949E",
              textTransform: "uppercase",
              marginBottom: 3,
            }}
          >
            Run Status
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: runStatusTone.dot,
                display: "inline-block",
                flexShrink: 0,
                boxShadow: runStatusTone.glow,
              }}
            />
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "IBM Plex Mono, monospace",
                color: runStatusTone.text,
              }}
            >
              {runStatus}
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "0 14px",
            flexShrink: 0,
          }}
        >
          <button
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              border: "1px solid #E1E4E8",
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#8B949E",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6h16M4 12h16M4 18h7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            style={{
              height: 34,
              padding: "0 15px",
              borderRadius: 9,
              border: "none",
              background: "#0969DA",
              color: "#fff",
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: "IBM Plex Sans, sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              letterSpacing: 0.1,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Re-run
          </button>
        </div>
      </div>
    </div>
  );
}