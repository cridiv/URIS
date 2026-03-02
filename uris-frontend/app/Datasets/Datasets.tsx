"use client";

import { useState, useEffect, useCallback } from "react";
import ImportModal from "../components/ImportModal";

// ── API ───────────────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// ── Types — mirror backend DatasetResponse ────────────────────────────────────
interface ColumnMeta {
  name: string;
  dtype: string;
  nullCount: number;
  uniqueCount: number;
}

interface Dataset {
  id: string;
  name: string;
  s3Key: string;
  sizeBytes: string;
  mimeType: string;
  rowCount: number | null;
  columnCount: number | null;
  columns: ColumnMeta[] | null;
  status: "pending" | "profiling" | "ready" | "error";
  source: "upload" | "s3";
  createdAt: string;
  errorMsg?: string | null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const FilterIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const MoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
);

const ChevronIcon = ({ dir = "up" }: { dir?: "up" | "down" }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {dir === "up"
      ? <polyline points="18 15 12 9 6 15" />
      : <polyline points="6 9 12 15 18 9" />}
  </svg>
);

const DatabaseIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS = [
  { key: "name",        label: "Dataset",   sortable: true  },
  { key: "rowCount",    label: "Rows",      sortable: true  },
  { key: "columnCount", label: "Cols",      sortable: true  },
  { key: "sizeBytes",   label: "Size",      sortable: true  },
  { key: "mimeType",    label: "Format",    sortable: false },
  { key: "source",      label: "Source",    sortable: false },
  { key: "status",      label: "Profile",   sortable: false },
  { key: "createdAt",   label: "Imported",  sortable: true  },
  { key: "actions",     label: "",          sortable: false },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<Dataset["status"], { label: string; dot: string; text: string }> = {
  ready:     { label: "Ready",     dot: "bg-emerald-400",              text: "text-emerald-700" },
  profiling: { label: "Profiling", dot: "bg-amber-400 animate-pulse",  text: "text-amber-700"   },
  pending:   { label: "Pending",   dot: "bg-gray-300",                 text: "text-ink-400"     },
  error:     { label: "Error",     dot: "bg-red-400",                  text: "text-red-600"     },
};

const MIME_LABELS: Record<string, string> = {
  "text/csv":                "CSV",
  "application/json":        "JSON",
  "application/octet-stream":"Parquet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

const MIME_COLORS: Record<string, string> = {
  "CSV":     "bg-sky-50 text-sky-600 border-sky-100",
  "JSON":    "bg-amber-50 text-amber-600 border-amber-100",
  "Parquet": "bg-violet-50 text-violet-600 border-violet-100",
  "XLSX":    "bg-emerald-50 text-emerald-600 border-emerald-100",
};

function formatBytes(bytes: string | number): string {
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (!n || n === 0) return "—";
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576)     return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1_024)         return `${(n / 1_024).toFixed(1)} KB`;
  return `${n} B`;
}

function formatRows(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-12 h-12 rounded-xl bg-surface-100 border border-surface-200 flex items-center justify-center text-ink-300">
        <DatabaseIcon />
      </div>
      <div className="text-center">
        <p className="text-[14px] font-semibold text-ink-700">No datasets yet</p>
        <p className="text-[12.5px] text-ink-400 mt-1">
          Import a dataset to get started — upload a file or connect an S3 bucket.
        </p>
      </div>
      <button
        onClick={onImport}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-accent/90 transition-colors"
      >
        <UploadIcon />
        Import Dataset
      </button>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────
function FetchError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <p className="text-[13px] text-red-500">{message}</p>
      <button onClick={onRetry} className="text-[12.5px] font-medium text-accent hover:underline">
        Try again
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DatasetsPage() {
  const [showModal, setShowModal] = useState(false);
  const [datasets, setDatasets]   = useState<Dataset[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [sortKey, setSortKey]     = useState<string>("createdAt");
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("desc");
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<Set<string>>(new Set());

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/dataset`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: Dataset[] = await res.json();
      setDatasets(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  // Poll while any dataset is still profiling / pending
  useEffect(() => {
    const hasPending = datasets.some(
      (d) => d.status === "profiling" || d.status === "pending",
    );
    if (!hasPending) return;
    const id = setInterval(fetchDatasets, 3000);
    return () => clearInterval(id);
  }, [datasets, fetchDatasets]);

  // Re-fetch after modal closes so the new dataset appears immediately
  const handleModalClose = () => {
    setShowModal(false);
    fetchDatasets();
  };

  // ── Sort + filter ────────────────────────────────────────────────────────
  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = datasets
    .filter((d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.s3Key.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      let av: string | number = (a as never)[sortKey] ?? "";
      let bv: string | number = (b as never)[sortKey] ?? "";
      if (sortKey === "sizeBytes") {
        av = parseInt(a.sizeBytes, 10);
        bv = parseInt(b.sizeBytes, 10);
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  // ── Checkbox helpers ─────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allChecked = filtered.length > 0 && filtered.every((d) => selected.has(d.id));
  const toggleAll  = () =>
    allChecked
      ? setSelected(new Set())
      : setSelected(new Set(filtered.map((d) => d.id)));

  return (
    <>
      {showModal && <ImportModal onClose={handleModalClose} />}

      <div className="p-8">
        {/* ── Page header ── */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">Datasets</h1>
            <p className="text-[13px] text-ink-400 mt-1">Manage and explore your connected data sources</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDatasets}
              title="Refresh"
              className="w-9 h-9 rounded-lg border border-surface-200 flex items-center justify-center text-ink-400 hover:bg-surface-100 hover:text-ink-700 transition-colors"
            >
              <RefreshIcon />
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm"
            >
              <UploadIcon />
              Import Dataset
            </button>
          </div>
        </div>

        {/* ── Table card ── */}
        <div className="bg-white rounded-xl border border-surface-200 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-100 gap-3">
            <div className="relative flex items-center">
              <span className="absolute left-3 text-ink-400 pointer-events-none"><SearchIcon /></span>
              <input
                type="text"
                placeholder="Search datasets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-[12.5px] rounded-lg border border-surface-200 bg-surface-50 text-ink-700 placeholder-ink-400 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 w-56 transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-surface-200 text-[12.5px] font-medium text-ink-500 hover:bg-surface-50 hover:text-ink-700 transition-colors">
                <FilterIcon />
                Filter
              </button>
              <span className="text-[11px] text-ink-400 font-mono">
                {filtered.length} dataset{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* States */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-2.5 text-ink-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <span className="text-[13px]">Loading datasets…</span>
              </div>
            </div>
          ) : error ? (
            <FetchError message={error} onRetry={fetchDatasets} />
          ) : filtered.length === 0 && search === "" ? (
            <EmptyState onImport={() => setShowModal(true)} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-100">
                      <th className="w-10 px-4 py-3">
                        <button
                          onClick={toggleAll}
                          className={[
                            "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                            allChecked
                              ? "bg-accent border-accent text-white"
                              : "border-surface-300 bg-white hover:border-accent/60",
                          ].join(" ")}
                        >
                          {allChecked && <CheckIcon />}
                        </button>
                      </th>
                      {COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => col.sortable && handleSort(col.key)}
                          className={[
                            "px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400 font-mono whitespace-nowrap select-none",
                            col.sortable ? "cursor-pointer hover:text-ink-600" : "",
                            col.key === "actions" ? "w-10" : "",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-1.5">
                            {col.label}
                            {col.sortable && (
                              <span className={sortKey === col.key ? "text-accent" : "text-surface-300"}>
                                {sortKey === col.key && sortDir === "asc"
                                  ? <ChevronIcon dir="up" />
                                  : <ChevronIcon dir="down" />}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={COLUMNS.length + 1} className="text-center py-10 text-[13px] text-ink-400">
                          No datasets match &quot;{search}&quot;
                        </td>
                      </tr>
                    ) : (
                      filtered.map((dataset) => {
                        const st       = STATUS_CONFIG[dataset.status];
                        const fmtLabel = MIME_LABELS[dataset.mimeType] ?? dataset.mimeType.split("/").pop()?.toUpperCase() ?? "FILE";
                        const fmtColor = MIME_COLORS[fmtLabel] ?? "bg-surface-50 text-ink-500 border-surface-200";
                        const isChecked = selected.has(dataset.id);

                        return (
                          <tr key={dataset.id} className="border-b border-surface-50 hover:bg-surface-50/60 transition-colors group">

                            {/* Checkbox */}
                            <td className="px-4 py-4">
                              <button
                                onClick={() => toggleSelect(dataset.id)}
                                className={[
                                  "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                  isChecked
                                    ? "bg-accent border-accent text-white"
                                    : "border-surface-300 bg-white hover:border-accent/60",
                                ].join(" ")}
                              >
                                {isChecked && <CheckIcon />}
                              </button>
                            </td>

                            {/* Name + s3 key */}
                            <td className="px-3 py-4 min-w-[220px]">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-500 flex-shrink-0">
                                  <DatabaseIcon />
                                </div>
                                <div>
                                  <p className="text-[13px] font-medium text-ink-900 font-mono truncate max-w-[200px]">
                                    {dataset.name}
                                  </p>
                                  <p className="text-[11px] text-ink-400 font-mono mt-0.5 truncate max-w-[200px]" title={dataset.s3Key}>
                                    {dataset.s3Key}
                                  </p>
                                </div>
                              </div>
                            </td>

                            {/* Rows — only when profiling is done */}
                            <td className="px-3 py-4">
                              <span className="text-[12.5px] text-ink-600 font-mono tabular-nums">
                                {dataset.status === "ready" ? formatRows(dataset.rowCount) : (
                                  dataset.status === "profiling"
                                    ? <span className="text-amber-500 animate-pulse">…</span>
                                    : "—"
                                )}
                              </span>
                            </td>

                            {/* Cols */}
                            <td className="px-3 py-4">
                              <span className="text-[12.5px] text-ink-600 font-mono tabular-nums">
                                {dataset.status === "ready" ? (dataset.columnCount ?? "—") : (
                                  dataset.status === "profiling"
                                    ? <span className="text-amber-500 animate-pulse">…</span>
                                    : "—"
                                )}
                              </span>
                            </td>

                            {/* Size */}
                            <td className="px-3 py-4">
                              <span className="text-[12.5px] text-ink-600 font-mono">
                                {formatBytes(dataset.sizeBytes)}
                              </span>
                            </td>

                            {/* Format badge */}
                            <td className="px-3 py-4">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border font-mono ${fmtColor}`}>
                                {fmtLabel}
                              </span>
                            </td>

                            {/* Source badge */}
                            <td className="px-3 py-4">
                              {dataset.source === "s3" ? (
                                <span className="text-[11px] font-medium text-[#FF9900] bg-[#FF9900]/10 border border-[#FF9900]/20 px-2 py-0.5 rounded-md font-mono">
                                  S3
                                </span>
                              ) : (
                                <span className="text-[11px] font-medium text-ink-500 bg-surface-100 border border-surface-200 px-2 py-0.5 rounded-md font-mono">
                                  Upload
                                </span>
                              )}
                            </td>

                            {/* Profile status */}
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${st.dot}`} />
                                <span className={`text-[12px] font-medium ${st.text}`}>{st.label}</span>
                              </div>
                              {dataset.status === "error" && dataset.errorMsg && (
                                <p className="text-[10.5px] text-red-400 mt-0.5 truncate max-w-[120px]" title={dataset.errorMsg}>
                                  {dataset.errorMsg}
                                </p>
                              )}
                            </td>

                            {/* Imported at */}
                            <td className="px-3 py-4 whitespace-nowrap">
                              <span className="text-[12px] text-ink-400">{formatDate(dataset.createdAt)}</span>
                            </td>

                            {/* Actions */}
                            <td className="px-3 py-4">
                              <button className="w-7 h-7 rounded-lg text-ink-400 hover:bg-surface-100 hover:text-ink-700 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100">
                                <MoreIcon />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-surface-100 flex items-center justify-between">
                <span className="text-[11.5px] text-ink-400 font-mono">
                  Showing {filtered.length} of {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
                </span>
                {selected.size > 0 && (
                  <span className="text-[11.5px] text-accent font-medium font-mono">
                    {selected.size} selected
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}