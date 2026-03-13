"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DatasetStatusBar from "./components/DatasetStatusBar";
import DatasetOverview from "./components/DatasetOverview";
import AgentResult from "./components/AgentResult";
import AgentAnalysis from "./components/AgentAnalysis";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

interface Dataset {
  id: string;
  name: string;
  status: string;
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
  complianceStatus: string | null;
  task: string | null;
  createdAt: string;
  updatedAt?: string;
  result?: Record<string, unknown> | null;
  errorMsg?: string | null;
  syntheticDataS3Key?: string | null;
}

interface AgentsViewProps {
  datasetId?: string;
  initialRunId?: string;
}

export default function AgentsView({ datasetId, initialRunId }: AgentsViewProps) {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string | null>(initialRunId ?? null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [dataset, setDataset] = useState<Dataset | null>(null);

  const activeDatasetId = datasetId ?? null;
  const hasInFlightRun = runs.some((run) => {
    const status = (run.status ?? '').toLowerCase();
    return status === 'analyzing' || status === 'running';
  });

  useEffect(() => {
    if (!activeDatasetId) return;
    try {
      localStorage.setItem("uris_active_dataset_id", activeDatasetId);
    } catch {
      // ignore storage errors
    }
  }, [activeDatasetId]);

  const handleRunCreated = (run: {
    id: string;
    status: string;
    datasetId?: string;
  }) => {
    setRuns((prev) => {
      const existing = prev.find((r) => r.id === run.id);
      if (existing) return prev;
      return [
        {
          id: run.id,
          status: run.status ?? 'analyzing',
          adfiScore: null,
          complianceStatus: null,
          task: null,
          createdAt: new Date().toISOString(),
          result: null,
          errorMsg: null,
        },
        ...prev,
      ];
    });
    setSelectedRun(run.id);
  };

  useEffect(() => {
    if (activeDatasetId) return;

    const fetchDatasets = async () => {
      setDatasetsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/dataset`, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch datasets");
        const data = (await res.json()) as Dataset[];
        setDatasets(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch datasets:", error);
      } finally {
        setDatasetsLoading(false);
      }
    };

    fetchDatasets();
  }, [activeDatasetId]);

  useEffect(() => {
    if (!activeDatasetId) {
      setRuns([]);
      setDataset(null);
      setSelectedRun(initialRunId ?? null);
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch dataset details
        const datasetRes = await fetch(`${API_BASE}/dataset/${activeDatasetId}`, { credentials: "include" });
        if (datasetRes.ok) {
          const datasetData = await datasetRes.json();
          setDataset(datasetData);
        }

        // Fetch current/latest run for this dataset
        const runsRes = await fetch(`${API_BASE}/agents/${activeDatasetId}`, { credentials: "include" });
        if (runsRes.ok) {
          const runsData = await runsRes.json();
          if (runsData.runs && runsData.runs.length > 0) {
            setRuns(runsData.runs);
            if (!initialRunId) {
              setSelectedRun(runsData.runs[0].id);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    };

    fetchData();
  }, [activeDatasetId, initialRunId]);

  useEffect(() => {
    if (!activeDatasetId) return;

    if (!hasInFlightRun) return;

    const interval = setInterval(async () => {
      try {
        const runsRes = await fetch(`${API_BASE}/agents/${activeDatasetId}`, { credentials: "include" });
        if (!runsRes.ok) return;
        const runsData = await runsRes.json();
        if (Array.isArray(runsData?.runs)) {
          setRuns(runsData.runs);
        }
      } catch (error) {
        console.error('Failed to refresh runs:', error);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [activeDatasetId, hasInFlightRun]);

  if (!activeDatasetId) {
    return (
      <div
        style={{
          fontFamily: "IBM Plex Sans, sans-serif",
          background: "#F4F5F7",
          minHeight: "100vh",
          padding: "24px 28px",
        }}
      >
        <div
          style={{
            background: "#fff",
            border: "1px solid #E1E4E8",
            borderRadius: 14,
            boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            padding: "16px 18px",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0D1117", fontFamily: "IBM Plex Mono, monospace" }}>
              Agents
            </div>
            <div style={{ fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 4 }}>
              Select a dataset to open agent analysis
            </div>
          </div>
          <div style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#57606A" }}>
            Total datasets: <span style={{ color: "#0D1117", fontWeight: 700 }}>{datasets.length}</span>
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          {datasetsLoading && (
            <div style={{ padding: "28px", color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}>
              Loading datasets...
            </div>
          )}

          {!datasetsLoading && datasets.length === 0 && (
            <div style={{ padding: "28px", color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}>
              No datasets available.
            </div>
          )}

          {!datasetsLoading && datasets.map((item) => (
            <button
              key={item.id}
              onClick={() => router.push(`/Agents?datasetId=${encodeURIComponent(item.id)}`)}
              style={{
                width: "100%",
                border: "none",
                borderTop: "1px solid #F0F2F4",
                background: "#fff",
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                cursor: "pointer",
                textAlign: "left",
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.name}
                </div>
                <div style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 4 }}>
                  {item.rowCount ?? "-"} rows · {item.columnCount ?? "-"} cols
                </div>
              </div>

              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="#8B949E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const currentRun =
    (selectedRun ? runs.find((run) => run.id === selectedRun) : undefined) ??
    runs[0] ??
    null;

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
      <DatasetStatusBar 
        dataset={dataset}
        currentRun={currentRun}
      />

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
        <DatasetOverview
          dataset={dataset}
          runs={runs}
          selectedRun={currentRun?.id ?? null}
          onSelectRun={setSelectedRun}
        />

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
          <AgentAnalysis dataset={dataset} currentRun={currentRun} onRunCreated={handleRunCreated} />

          {/* Right */}
          <AgentResult currentRun={currentRun} runs={runs} datasetId={activeDatasetId} />
        </div>
      </div>
    </div>
  );
}