"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";

interface AgentRun {
  id: string;
  status: string;
  adfiScore: number | null;
  complianceStatus: string | null;
  task: string | null;
  createdAt: string;
  updatedAt?: string;
  result?: Record<string, unknown> | null;
  errorMsg?: string | null;
}

function MetaRow({ label, children, noBorder }: { label: string; children: ReactNode; noBorder?: boolean }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      padding: "7px 0",
      borderBottom: noBorder ? "none" : "1px solid #F6F8FA",
    }}>
      <span style={{
        fontSize: 11.5,
        color: "#8B949E",
        fontFamily: "IBM Plex Sans, sans-serif",
        fontWeight: 400,
        flexShrink: 0,
        lineHeight: 1.5,
      }}>
        {label}
      </span>
      <div style={{
        fontSize: 12,
        fontFamily: "IBM Plex Mono, monospace",
        fontWeight: 500,
        color: "#24292F",
        textAlign: "right",
        lineHeight: 1.5,
      }}>
        {children}
      </div>
    </div>
  );
}

function RingProgress({ value, size = 24, stroke = 2, color = "#34D399" }: { value: number; size?: number; stroke?: number; color?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F0F2F4" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.4,0,.2,1)" }}
      />
    </svg>
  );
}

function Sparkline({ data, width = 160, height = 40 }: { data: number[]; width?: number; height?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });
  const area = `M${pts[0]} ` + pts.slice(1).map(p => `L${p}`).join(" ") + ` L${width},${height} L0,${height} Z`;
  const line = `M${pts[0]} ` + pts.slice(1).map(p => `L${p}`).join(" ");
  const lastX = parseFloat(pts[pts.length - 1].split(",")[0]);
  const lastY = parseFloat(pts[pts.length - 1].split(",")[1]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0969DA" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0969DA" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sg)" />
      <path d={line} fill="none" stroke="#0969DA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="3" fill="#0969DA" />
      <circle cx={lastX} cy={lastY} r="5.5" fill="#0969DA" fillOpacity="0.15" />
    </svg>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#F0F2F4", margin: "12px 0" }} />;
}

export default function AgentResult({ 
  currentRun, 
  runs,
  datasetId,
}: { 
  currentRun: AgentRun | null;
  runs: AgentRun[];
  datasetId: string;
}) {
  const router = useRouter();
  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };

  // Extract data from currentRun.result (supports both direct and wrapped payloads)
  const runResult = (currentRun?.result as Record<string, unknown> | undefined) ?? {};
  const pipelineResult =
    ((runResult.pipeline_result as Record<string, unknown> | undefined) ?? runResult);
  const evaluation = (pipelineResult.evaluation as Record<string, unknown> | undefined) ?? {};
  const compliance = (pipelineResult.compliance as Record<string, unknown> | undefined) ?? {};
  const synthesis =
    ((pipelineResult.synthesis as Record<string, unknown> | undefined)?.result as Record<string, unknown> | undefined) ??
    ((pipelineResult.synthesis as Record<string, unknown> | undefined) ?? {});
  const validation = (pipelineResult.validation as Record<string, unknown> | undefined) ?? {};
  const schemaSummary = (evaluation.schema_summary as Record<string, unknown> | undefined) ?? {};
  const schemaColumns = (schemaSummary.columns as Array<Record<string, unknown>> | undefined) ?? [];
  const regulatoryExposure =
    (compliance.regulatory_exposure as Record<string, string> | undefined) ?? {};
  const synthesisReport =
    (synthesis.synthesis_report as Record<string, unknown> | undefined) ?? {};
  const correlationReport =
    (synthesis.correlation_report as Record<string, unknown> | undefined) ??
    (synthesis.correlation_result as Record<string, unknown> | undefined) ?? {};
  
  // Calculate PII Risk level from compliance data
  const privacyRiskScore = toNumber(compliance.privacy_risk_score);
  const piiRiskLevel = privacyRiskScore === undefined ? "High" : 
    privacyRiskScore <= 0.35 ? "Low" : 
    privacyRiskScore <= 0.65 ? "Medium" : "High";
  
  const piiRiskBars = privacyRiskScore === undefined ? 2 :
    privacyRiskScore <= 0.35 ? 1 :
    privacyRiskScore <= 0.65 ? 3 : 5;
  
  // Compliance Score
  const complianceScore = Math.round(
    (toNumber(validation.confidence) ?? currentRun?.adfiScore ?? toNumber(evaluation.adfi) ?? 0) * 100,
  );
  
  // Policy Match
  const policyMatch = Object.keys(regulatoryExposure)[0]?.toUpperCase() ?? "N/A";
  
  // Missing Fields
  const missingFieldsCount = schemaColumns.filter((col) => (toNumber(col.missing_pct) ?? 0) > 0).length;
  
  // Run metrics
  const trace = (synthesis.trace as string[] | undefined) ?? [];
  const synthesisAttempts = trace.filter((line) => /^Attempt\s+\d+\//i.test(line)).length || toNumber(synthesis.attempt) || 0;
  
  // Correlation drift: handle skip status gracefully
  const correlationStatus = correlationReport.status;
  const corrDriftRaw = correlationStatus === "skip" ? null :
    toNumber(correlationReport.max_pair_difference) ??
    toNumber((correlationReport.drift_metrics as Record<string, unknown> | undefined)?.max_pair_difference) ??
    0;
  const corrDriftMax = corrDriftRaw === null ? null : corrDriftRaw * 100;
  const rowsGenerated =
    toNumber((pipelineResult.synthesis as Record<string, unknown> | undefined)?.augmented_rows) ??
    toNumber(synthesis.augmented_rows) ??
    toNumber(synthesisReport.rows_generated) ??
    0;
  const policyRules =
    ((compliance.recommended_actions as Array<unknown> | undefined)?.length ?? 0) +
    ((compliance.blocked_columns as Array<unknown> | undefined)?.length ?? 0);
  const createdMs = currentRun?.createdAt ? new Date(currentRun.createdAt).getTime() : NaN;
  const updatedMs = currentRun?.updatedAt ? new Date(currentRun.updatedAt).getTime() : NaN;
  const durationSecs =
    Number.isFinite(createdMs) && Number.isFinite(updatedMs) && updatedMs >= createdMs
      ? (updatedMs - createdMs) / 1000
      : Math.max(0.01, trace.length * 0.12);
  
  // ADFI Score data
  const adfiScore = currentRun?.adfiScore ?? toNumber(evaluation.adfi) ?? 0;
  const historicalAdfi = runs
    .map((r) => r.adfiScore)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .slice(0, 8)
    .reverse();
  const rawSparkData = [...historicalAdfi, adfiScore]
    .filter((v) => Number.isFinite(v))
    .slice(-9);
  const sparkData = rawSparkData.length >= 2 ? rawSparkData : [adfiScore, adfiScore];
  const baseAdfi = sparkData.length > 0 ? sparkData[0] : adfiScore;
  const adfiIncrease = baseAdfi > 0 ? ((adfiScore - baseAdfi) / baseAdfi * 100).toFixed(1) : "0.0";
  const adfiTrend = Math.abs(Number(adfiIncrease));
  
  // Run ID
  const runId = currentRun?.id?.slice(0, 6) ?? "—";
  
  return (
    <div style={{
      width: 252,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
    }}>

      {/* ── Risk Summary Card ── */}
      <div style={{
        background: "#fff", border: "1px solid #E1E4E8",
        borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #F0F2F4",
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "#FEF2F2", border: "1px solid #FEE2E2",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{
            fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
            letterSpacing: "0.07em", color: "#57606A", textTransform: "uppercase",
          }}>Risk Summary</span>
        </div>

        <div style={{ padding: "10px 16px 14px" }}>

          {/* PII Risk */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 0", borderBottom: "1px solid #F6F8FA",
          }}>
            <span style={{ fontSize: 11.5, color: "#8B949E" }}>PII Risk</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{
                    width: 6, height: 14, borderRadius: 2,
                    background: i <= piiRiskBars ? "#F87171" : "#F0F2F4",
                  }} />
                ))}
              </div>
              <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#DC2626" }}>{piiRiskLevel}</span>
            </div>
          </div>

          {/* Compliance Score */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 0", borderBottom: "1px solid #F6F8FA",
          }}>
            <span style={{ fontSize: 11.5, color: "#8B949E" }}>Compliance</span>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <RingProgress value={complianceScore} size={24} stroke={2} color="#34D399" />
              <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#047857" }}>{complianceScore}%</span>
            </div>
          </div>

          {/* Policy Match */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 0", borderBottom: "1px solid #F6F8FA",
          }}>
            <span style={{ fontSize: 11.5, color: "#8B949E" }}>Policy Match</span>
            <span style={{
              fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
              color: "#047857", background: "#ECFDF5", border: "1px solid #D1FAE5",
              borderRadius: 5, padding: "2px 7px",
            }}>{policyMatch}</span>
          </div>

          {/* Missing Fields */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 0",
          }}>
            <span style={{ fontSize: 11.5, color: "#8B949E" }}>Missing Fields</span>
            <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#DC2626" }}>{missingFieldsCount}</span>
          </div>
        </div>
      </div>

      {/* ── Run Metrics Card ── */}
      <div style={{
        background: "#fff", border: "1px solid #E1E4E8",
        borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden", flex: 1, display: "flex", flexDirection: "column",
        minHeight: 0,
      }}>
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #F0F2F4",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "#F0F9FF", border: "1px solid #E0F2FE",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  stroke="#0284C7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{
              fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
              letterSpacing: "0.07em", color: "#57606A", textTransform: "uppercase",
            }}>Run Metrics</span>
          </div>
          <span style={{
            fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
            color: "#047857", background: "#ECFDF5", border: "1px solid #D1FAE5",
            borderRadius: 5, padding: "2px 7px",
          }}>run_{runId}</span>
        </div>

        <div style={{ padding: "10px 16px", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          <MetaRow label="Synthesis Attempts">
            <span style={{ color: "#0D1117" }}>{synthesisAttempts}</span>
          </MetaRow>
          <MetaRow label="Corr. Drift (max)">
            <span style={{
              color: corrDriftMax === null ? "#8B949E" : "#B45309",
              background: corrDriftMax === null ? "transparent" : "#FFFBEB",
              border: corrDriftMax === null ? "none" : "1px solid #FEF3C7",
              borderRadius: 5, fontSize: 11, padding: corrDriftMax === null ? "0" : "1px 6px",
            }}>{corrDriftMax === null ? "–" : `${corrDriftMax.toFixed(1)}%`}</span>
          </MetaRow>
          <MetaRow label="Rows Generated">
            <span style={{ color: "#0D1117" }}>{rowsGenerated}</span>
          </MetaRow>
          <MetaRow label="Policy Rules">
            <span style={{ color: "#0D1117" }}>{policyRules}</span>
          </MetaRow>
          <MetaRow label="Duration" noBorder>
            <span style={{ color: "#0D1117" }}>{durationSecs.toFixed(2)}s</span>
          </MetaRow>

          <Divider />

          {/* ADFI Score + Sparkline */}
          <div>
            <div style={{
              display: "flex", alignItems: "center",
              justifyContent: "space-between", marginBottom: 10,
            }}>
              <span style={{
                fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                letterSpacing: "0.09em", color: "#8B949E", textTransform: "uppercase",
              }}>ADFI Score</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 18, fontWeight: 700, color: "#0D1117",
                  fontFamily: "IBM Plex Mono, monospace", letterSpacing: -0.5, lineHeight: 1,
                }}>{adfiScore.toFixed(3)}</span>
                <span style={{
                  fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700,
                  color: "#047857", background: "#ECFDF5", border: "1px solid #D1FAE5",
                  borderRadius: 5, padding: "2px 6px",
                }}>▲ +{adfiTrend.toFixed(1)}%</span>
              </div>
            </div>

            {/* Sparkline */}
            <div style={{
              background: "#F6F8FA", borderRadius: 10,
              border: "1px solid #E1E4E8", padding: "10px 12px 8px",
            }}>
              <Sparkline data={sparkData} width={196} height={44} />
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginTop: 6,
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontSize: 9.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>Before</span>
                  <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, color: "#57606A" }}>{baseAdfi.toFixed(3)}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-end" }}>
                  <span style={{ fontSize: 9.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>% Increase</span>
                  <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: "#047857" }}>+{Number(adfiIncrease).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ flex: 1 }} />

          <Divider />

          {/* View Full Report */}
          <button style={{
            width: "100%", padding: "9px 0",
            borderRadius: 9, border: "1px solid #E1E4E8",
            background: "#F6F8FA",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            cursor: "pointer", transition: "all 0.15s",
            fontFamily: "IBM Plex Sans, sans-serif",
          }}
            onClick={() => {
              if (!currentRun?.id || !datasetId) return;
              router.push(`/Audit-Log/logs/${encodeURIComponent(datasetId)}/${encodeURIComponent(currentRun.id)}`);
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#0969DA";
              const span = e.currentTarget.querySelector("span") as HTMLElement;
              const svg = e.currentTarget.querySelector("svg") as SVGElement;
              if (span) span.style.color = "#fff";
              if (svg) svg.style.stroke = "#fff";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "#F6F8FA";
              const span = e.currentTarget.querySelector("span") as HTMLElement;
              const svg = e.currentTarget.querySelector("svg") as SVGElement;
              if (span) span.style.color = "#0969DA";
              if (svg) svg.style.stroke = "#0969DA";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ stroke: "#0969DA", transition: "stroke 0.15s" }}>
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{
              fontSize: 12.5, fontWeight: 600, color: "#0969DA",
              transition: "color 0.15s",
            }}>View Full Report</span>
          </button>
        </div>
      </div>
    </div>
  );
}