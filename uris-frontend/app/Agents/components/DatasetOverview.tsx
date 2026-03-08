"use client";

interface Dataset {
  id: string;
  name: string;
  rowCount: number | null;
  columnCount: number | null;
  sizeBytes?: string;
  columns?: Array<{
    name: string;
    dtype: string;
    nullCount: number;
    uniqueCount: number;
  }> | null;
  profileMeta?: Record<string, unknown> | null;
}

interface AgentRun {
  id: string;
  status: string;
  adfiScore: number | null;
  createdAt: string;
}

interface DatasetOverviewProps {
  dataset: Dataset | null;
  runs: AgentRun[];
  selectedRun: string | null;
  onSelectRun: (id: string) => void;
}

function formatBytes(bytes?: string) {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024) return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatPct(value: unknown) {
  if (typeof value !== "number") return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function statusColor(status: string) {
  const s = status.toLowerCase();
  if (s === "completed") return "#047857";
  if (s === "failed" || s === "error") return "#DC2626";
  return "#B45309";
}

export default function DatasetOverview({ dataset, runs, selectedRun, onSelectRun }: DatasetOverviewProps) {
  const profile = (dataset?.profileMeta ?? {}) as Record<string, unknown>;

  const missingRateValue = (() => {
    const direct = profile.missing_rate;
    if (typeof direct === 'number') return direct;

    const qualityScores = profile.quality_scores as Record<string, unknown> | undefined;
    const completeness = qualityScores?.completeness;
    if (typeof completeness === 'number') return Math.max(0, 1 - completeness);

    const cols = profile.columns as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(cols) && cols.length > 0) {
      const rates = cols
        .map((c) => c.missing_pct)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (rates.length > 0) {
        return rates.reduce((sum, v) => sum + v, 0) / rates.length;
      }
    }

    return null;
  })();

  const missingRate = formatPct(missingRateValue);
  const duplicateRowsPct = formatPct(profile.duplicate_rows_pct ?? null);

  return (
    <div style={{ width: 292, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0, overflowY: "auto" }}>
      <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F0F2F4" }}>
          <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.08em", color: "#57606A", textTransform: "uppercase" }}>
            Dataset Overview
          </div>
          <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "#0D1117", fontFamily: "IBM Plex Mono, monospace" }}>
            {dataset?.name ?? "Loading..."}
          </div>
        </div>

        <div style={{ padding: "10px 16px 14px" }}>
          <Row label="Rows" value={dataset?.rowCount ?? "—"} />
          <Row label="Columns" value={dataset?.columnCount ?? "—"} />
          <Row label="Size" value={formatBytes(dataset?.sizeBytes)} />
          <Row label="Missing Rate" value={missingRate} />
          <Row label="Duplicate Rows" value={duplicateRowsPct} />
        </div>

        <div style={{ borderTop: "1px solid #F0F2F4", padding: "10px 16px 14px" }}>
          <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.08em", color: "#8B949E", textTransform: "uppercase", marginBottom: 10 }}>
            Profiled Columns
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {(dataset?.columns ?? []).map((col) => (
              <div key={col.name} style={{ border: "1px solid #E1E4E8", borderRadius: 8, padding: "7px 9px", background: "#FAFBFC" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#24292F" }}>{col.name}</span>
                  <span style={{ fontSize: 10, color: "#57606A", fontFamily: "IBM Plex Mono, monospace" }}>{col.dtype}</span>
                </div>
                <div style={{ marginTop: 5, display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace" }}>
                  <span>nulls: {col.nullCount}</span>
                  <span>unique: {col.uniqueCount}</span>
                </div>
              </div>
            ))}
            {(!dataset?.columns || dataset.columns.length === 0) && (
              <span style={{ fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace" }}>No profiled columns available.</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)", overflow: "hidden", flex: 1, minHeight: 220, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #F0F2F4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, letterSpacing: "0.08em", color: "#57606A", textTransform: "uppercase" }}>
            Run History
          </span>
          <span style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace" }}>{runs.length} runs</span>
        </div>

        <div style={{ padding: "6px 0", flex: 1, minHeight: 0, overflowY: "auto" }}>
          {runs.map((run) => {
            const active = selectedRun === run.id;
            return (
              <button
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                style={{
                  width: "100%",
                  border: "none",
                  background: active ? "#F6F8FA" : "transparent",
                  borderLeft: active ? "2px solid #0969DA" : "2px solid transparent",
                  textAlign: "left",
                  padding: "9px 16px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#24292F" }}>{`run-${run.id.slice(0, 8)}`}</span>
                  {typeof run.adfiScore === "number" && (
                    <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#0D1117" }}>{run.adfiScore.toFixed(3)}</span>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace" }}>
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: statusColor(run.status), textTransform: "uppercase" }}>
                    {run.status}
                  </span>
                </div>
              </button>
            );
          })}
          {runs.length === 0 && (
            <div style={{ padding: "12px 16px", fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace" }}>
              No runs yet. Click Analyze on a dataset to start orchestration.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #F6F8FA" }}>
      <span style={{ fontSize: 11.5, color: "#8B949E", fontFamily: "IBM Plex Sans, sans-serif" }}>{label}</span>
      <span style={{ fontSize: 12, color: "#24292F", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
