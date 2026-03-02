"use client";

import { useState } from "react";
import DatasetStatusBar from "./components/DatasetStatusBar";
import DatasetOverview from "./components/DatasetOverview";
import AgentResult from "./components/AgentResult";

export default function AgentsView() {
  const [selectedRun, setSelectedRun] = useState("run_004");

  return (
    <div style={{ minHeight: "100vh", background: "#F4F5F7" }}>
      <DatasetStatusBar />

      <div style={{
        fontFamily: "IBM Plex Sans, sans-serif",
        display: "flex",
        gap: 0,
        padding: 24,
      }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <DatasetOverview selectedRun={selectedRun} onSelectRun={setSelectedRun} />

        {/* ── CENTER + RIGHT ─────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", gap: 12, marginLeft: 12 }}>

          {/* Center */}
          <div style={{
            flex: 1,
            background: "#fff",
            border: "1px solid #E1E4E8",
            borderRadius: 14,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 8,
            minHeight: 500,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "#F6F8FA", border: "1px solid #E1E4E8",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#B1BAC4" strokeWidth="1.8"/>
                <path d="M9 9h6M9 12h6M9 15h4" stroke="#B1BAC4" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 12.5, color: "#B1BAC4", fontFamily: "IBM Plex Mono, monospace" }}>
              Center Panel
            </span>
          </div>

          {/* Right */}
          <AgentResult />
        </div>
      </div>
    </div>
  );
}