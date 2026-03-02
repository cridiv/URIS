"use client";

import { ReactNode } from "react";

const runHistory = [
  { id: "run_004", date: "Feb 28, 2026", adfi: 0.912, status: "COMPLETED", delta: "+10.3%" },
  { id: "run_003", date: "Feb 14, 2026", adfi: 0.827, status: "COMPLETED", delta: "+2.1%" },
  { id: "run_002", date: "Jan 30, 2026", adfi: 0.810, status: "ERROR",     delta: null },
  { id: "run_001", date: "Jan 12, 2026", adfi: 0.793, status: "COMPLETED", delta: null },
];

const piiFields = ["passport_no", "email", "dob"];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 10,
      fontFamily: "IBM Plex Mono, monospace",
      fontWeight: 600,
      letterSpacing: "0.09em",
      color: "#8B949E",
      textTransform: "uppercase",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      {children}
      <div style={{ flex: 1, height: 1, background: "#F0F2F4" }} />
    </div>
  );
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

function StatusDot({ status }: { status: string }) {
  const colors: { [key: string]: string } = {
    COMPLETED: "#34D399",
    ERROR:     "#F87171",
    RUNNING:   "#FBBF24",
  };
  return (
    <span style={{
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: colors[status] || "#D0D7DE",
      display: "inline-block",
      flexShrink: 0,
      boxShadow: status === "COMPLETED" ? "0 0 0 2px #D1FAE5" : status === "ERROR" ? "0 0 0 2px #FEE2E2" : "none",
    }} />
  );
}

function RiskBar({ value }: { value: number }) {
  const color = value < 30 ? "#34D399" : value < 65 ? "#FBBF24" : "#F87171";
  const label = value < 30 ? "Low" : value < 65 ? "Medium" : "High";
  const labelColor = value < 30 ? "#047857" : value < 65 ? "#B45309" : "#DC2626";
  const labelBg   = value < 30 ? "#ECFDF5" : value < 65 ? "#FFFBEB" : "#FEF2F2";
  const labelBdr  = value < 30 ? "#D1FAE5" : value < 65 ? "#FEF3C7" : "#FEE2E2";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
          color: labelColor, background: labelBg, border: `1px solid ${labelBdr}`,
          borderRadius: 5, padding: "1px 7px",
        }}>
          {label}
        </span>
        <span style={{ fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", color: "#57606A" }}>
          {value}%
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 99, background: "#F0F2F4", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: 99,
          transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
        }} />
      </div>
    </div>
  );
}

interface DatasetOverviewProps {
  selectedRun: string;
  onSelectRun: (id: string) => void;
}

export default function DatasetOverview({ selectedRun, onSelectRun }: DatasetOverviewProps) {
  return (
    <div style={{
      width: 272,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      gap: 12,
      height: "100%",
      minHeight: 0,
      overflowY: "auto",
    }}>

      {/* ── Dataset Overview Card ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #E1E4E8",
        borderRadius: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflowY: "auto",
        maxHeight: 360,
      }}>

        <div style={{ padding: "4px 16px 10px" }}>
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <SectionLabel>Overview</SectionLabel>
          </div>

          <MetaRow label="Columns">
            <span style={{ color: "#0D1117" }}>14</span>
          </MetaRow>
          <MetaRow label="Rows">
            <span style={{ color: "#0D1117" }}>891</span>
          </MetaRow>
          <MetaRow label="Imbalance">
            <span style={{
              color: "#B45309", background: "#FFFBEB",
              border: "1px solid #FEF3C7",
              borderRadius: 5, fontSize: 11, padding: "1px 6px",
            }}>61 / 39 %</span>
          </MetaRow>
          <MetaRow label="Missing">
            <span style={{ color: "#57606A" }}>2 fields</span>
          </MetaRow>
          <MetaRow label="Size">
            <span style={{ color: "#57606A" }}>84.2 KB</span>
          </MetaRow>
        </div>

        {/* PII */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel>PII Fields</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {piiFields.map(f => (
              <span key={f} style={{
                fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500,
                color: "#DC2626", background: "#FEF2F2",
                border: "1px solid #FEE2E2",
                borderRadius: 5, padding: "2px 7px",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Policy & Risk */}
        <div style={{ padding: "0 16px 14px" }}>
          <SectionLabel>Policy</SectionLabel>
          <MetaRow label="Policy">
            <span style={{
              fontSize: 11, fontFamily: "IBM Plex Mono, monospace",
              color: "#0969DA",
            }}>GDPR / ISO-27001</span>
          </MetaRow>
          <MetaRow label="Jurisdiction">
            <span style={{ color: "#57606A" }}>EU</span>
          </MetaRow>

          <div style={{ marginTop: 12 }}>
            <div style={{
              fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
              letterSpacing: "0.07em", color: "#8B949E", textTransform: "uppercase", marginBottom: 8,
            }}>
              Compliance Risk
            </div>
            <RiskBar value={24} />
          </div>
        </div>
      </div>

      {/* ── Run History Card ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #E1E4E8",
        borderRadius: 14,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden",
        flex: 1,
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{
          padding: "12px 16px 10px",
          borderBottom: "1px solid #F0F2F4",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#8B949E" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span style={{
              fontSize: 11, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
              letterSpacing: "0.07em", color: "#57606A", textTransform: "uppercase",
            }}>Run History</span>
          </div>
          <span style={{
            fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace",
            color: "#8B949E",
          }}>{runHistory.length} runs</span>
        </div>

        <div style={{ padding: "6px 0", flex: 1, minHeight: 0, overflowY: "auto" }}>
          {runHistory.map((run) => {
            const isSelected = selectedRun === run.id;
            return (
              <div
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                style={{
                  padding: "9px 16px",
                  cursor: "pointer",
                  background: isSelected ? "#F6F8FA" : "transparent",
                  borderLeft: isSelected ? "2px solid #0969DA" : "2px solid transparent",
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusDot status={run.status} />
                    <span style={{
                      fontSize: 11.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      color: isSelected ? "#0D1117" : "#24292F",
                    }}>{run.id}</span>
                  </div>
                  {run.adfi && (
                    <span style={{
                      fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      color: isSelected ? "#0D1117" : "#57606A",
                    }}>{run.adfi.toFixed(3)}</span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace" }}>
                    {run.date}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {run.delta && (
                      <span style={{
                        fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                        color: "#047857", background: "#ECFDF5", border: "1px solid #D1FAE5",
                        borderRadius: 4, padding: "1px 5px",
                      }}>▲ {run.delta}</span>
                    )}
                    <span style={{
                      fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fontWeight: 600,
                      color: run.status === "COMPLETED" ? "#047857" : run.status === "ERROR" ? "#DC2626" : "#B45309",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>{run.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          borderTop: "1px solid #F0F2F4",
          padding: "10px 16px",
          display: "flex",
          justifyContent: "center",
        }}>
          <button style={{
            fontSize: 12, fontFamily: "IBM Plex Sans, sans-serif", fontWeight: 500,
            color: "#0969DA", background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            View all runs
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M9 5l7 7-7 7" stroke="#0969DA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}