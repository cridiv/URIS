"use client";

import { useState } from "react";
import DatasetStatusBar from "./components/DatasetStatusBar";
import DatasetOverview from "./components/DatasetOverview";
import AgentResult from "./components/AgentResult";
import AgentAnalysis from "./components/AgentAnalysis";

export default function AgentsView() {
  const [selectedRun, setSelectedRun] = useState("run_004");

  return (
    <div
      style={{
        height: "100vh",
        background: "#F4F5F7",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <DatasetStatusBar />

      <div style={{
        fontFamily: "IBM Plex Sans, sans-serif",
        display: "flex",
        gap: 0,
        padding: 24,
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        alignItems: "stretch",
      }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <DatasetOverview selectedRun={selectedRun} onSelectRun={setSelectedRun} />

        {/* ── CENTER + RIGHT ─────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            gap: 12,
            marginLeft: 12,
            minHeight: 0,
            alignItems: "stretch",
            overflow: "hidden",
          }}
        >

          {/* Center */}
          <AgentAnalysis />

          {/* Right */}
          <AgentResult />
        </div>
      </div>
    </div>
  );
}