"use client";

import { useState } from "react";

// ── Icons ─────────────────────────────────────────────────────────────────────
const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const CloseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Source logos (inline SVG/text) ────────────────────────────────────────────
const SourceIcon = ({ name }: { name: string }) => {
  const base = "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono flex-shrink-0";
  switch (name) {
    case "Amazon S3":
      return (
        <div className={`${base} bg-[#FF9900] text-white`}>
          <svg width="20" height="20" viewBox="0 0 80 80" fill="none">
            <ellipse cx="40" cy="22" rx="16" ry="6" fill="white" />
            <path d="M24 22v18c0 3.314 7.163 6 16 6s16-2.686 16-6V22" stroke="white" strokeWidth="3" fill="none" />
            <path d="M24 31c0 3.314 7.163 6 16 6s16-2.686 16-6" stroke="white" strokeWidth="2" strokeDasharray="3 2" fill="none" />
          </svg>
        </div>
      );
    case "Snowflake":
      return <div className={`${base} bg-[#29B5E8] text-white`}>❄</div>;
    case "BigQuery":
      return <div className={`${base} bg-[#4285F4] text-white`}>BQ</div>;
    case "PostgreSQL":
      return <div className={`${base} bg-[#336791] text-white`}>PG</div>;
    default:
      return <div className={`${base} bg-surface-100 text-ink-400`}>DB</div>;
  }
};

// ── API base URL ──────────────────────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// ── Local DTO types (mirror backend) ─────────────────────────────────────────
interface S3ObjectInfo {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
  isFolder: boolean;
}
interface ConnectResult {
  connected: boolean;
  bucket: string;
  region: string;
  objectCount: number;
}
interface ImportedObject {
  key: string;
  size: number;
  contentType: string;
  importedAt: string;
}

type S3Step = "connect" | "browse" | "done";

// ── S3 Sub-modal ──────────────────────────────────────────────────────────────
function S3Modal({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  // Form fields — match ConnectS3Dto exactly
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");

  // Multi-step state
  const [step, setStep] = useState<S3Step>("connect");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Browse state
  const [connectResult, setConnectResult] = useState<ConnectResult | null>(null);
  const [objects, setObjects] = useState<S3ObjectInfo[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Done state
  const [importResult, setImportResult] = useState<ImportedObject | null>(null);

  const creds = { accessKeyId, secretAccessKey, region, bucket };

  // ── Step 1: POST /api/s3/connect then POST /api/s3/objects ──────────────────
  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/s3/connect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Connection failed (${res.status})`);
      }
      const data: ConnectResult = await res.json();
      setConnectResult(data);

      // Immediately list objects in the bucket
      const objRes = await fetch(`${API_BASE}/s3/objects`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      });
      if (!objRes.ok) throw new Error("Failed to list bucket objects");
      const objData: S3ObjectInfo[] = await objRes.json();
      setObjects(objData);
      setStep("browse");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: POST /api/dataset/import-s3 (proper endpoint that saves to DB) ──
  const handleImport = async () => {
    if (!selectedKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/dataset/import-s3`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ...creds, 
          key: selectedKey 
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Import failed (${res.status})`);
      }
      const data: ImportedObject = await res.json();
      setImportResult(data);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0" onClick={onBack} />

      <div className="relative z-10 bg-white rounded-2xl border border-surface-200 shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-100 hover:text-ink-700 transition-colors flex-shrink-0"
          >
            <ChevronLeftIcon />
          </button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-8 h-8 rounded-lg bg-[#FF9900] flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 80 80" fill="none">
                <ellipse cx="40" cy="22" rx="16" ry="6" fill="white" />
                <path d="M24 22v18c0 3.314 7.163 6 16 6s16-2.686 16-6V22" stroke="white" strokeWidth="3" fill="none" />
                <path d="M24 31c0 3.314 7.163 6 16 6s16-2.686 16-6" stroke="white" strokeWidth="2" strokeDasharray="3 2" fill="none" />
              </svg>
            </div>
            <div>
              <p className="text-[13.5px] font-semibold text-ink-900 leading-none">Amazon S3</p>
              <p className="text-[11px] text-ink-400 mt-0.5">
                {step === "connect" && "Connect your S3 bucket"}
                {step === "browse"  && `${connectResult?.objectCount ?? 0} objects · ${connectResult?.bucket}`}
                {step === "done"    && "Import complete"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-100 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3">

          {/* ── STEP: connect ── */}
          {step === "connect" && (
            <>
              <div>
                <label className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1.5 font-mono">
                  Bucket Name
                </label>
                <input
                  type="text"
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  placeholder="my-data-bucket"
                  className="w-full px-3 py-2 text-[12.5px] rounded-lg border border-surface-200 bg-surface-50 text-ink-800 placeholder-ink-300 focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/10 font-mono transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1.5 font-mono">
                  Region
                </label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3 py-2 text-[12.5px] rounded-lg border border-surface-200 bg-surface-50 text-ink-700 focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/10 font-mono transition-all appearance-none cursor-pointer"
                >
                  {["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-south-1","sa-east-1","ca-central-1"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 my-0.5">
                <div className="flex-1 h-px bg-surface-200" />
                <span className="text-[10.5px] text-ink-300 font-mono">credentials</span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1.5 font-mono">
                  Access Key ID
                </label>
                <input
                  type="text"
                  value={accessKeyId}
                  onChange={(e) => setAccessKeyId(e.target.value)}
                  placeholder="AKIAIOSFODNN7EXAMPLE"
                  className="w-full px-3 py-2 text-[12.5px] rounded-lg border border-surface-200 bg-surface-50 text-ink-800 placeholder-ink-300 focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/10 font-mono transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider block mb-1.5 font-mono">
                  Secret Access Key
                </label>
                <input
                  type="password"
                  value={secretAccessKey}
                  onChange={(e) => setSecretAccessKey(e.target.value)}
                  placeholder="••••••••••••••••••••"
                  className="w-full px-3 py-2 text-[12.5px] rounded-lg border border-surface-200 bg-surface-50 text-ink-800 placeholder-ink-300 focus:outline-none focus:border-[#FF9900] focus:ring-2 focus:ring-[#FF9900]/10 font-mono transition-all"
                />
              </div>

              {error && (
                <p className="text-[11.5px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <p className="text-[11px] text-ink-400 leading-relaxed">
                Credentials are encrypted in transit. We recommend an IAM role with read-only S3 permissions.
              </p>
            </>
          )}

          {/* ── STEP: browse ── */}
          {step === "browse" && (
            <>
              {objects.filter((o) => !o.isFolder).length === 0 ? (
                <p className="text-[12.5px] text-ink-400 text-center py-6">No files found in bucket.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto pr-0.5">
                  {objects.filter((o) => !o.isFolder).map((obj) => (
                    <button
                      key={obj.key}
                      onClick={() => setSelectedKey(obj.key === selectedKey ? null : obj.key)}
                      className={[
                        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all w-full",
                        selectedKey === obj.key
                          ? "border-[#FF9900]/50 bg-[#FF9900]/5"
                          : "border-surface-200 hover:border-surface-300 hover:bg-surface-50",
                      ].join(" ")}
                    >
                      <div
                        className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors"
                        style={selectedKey === obj.key
                          ? { background: "#FF9900", borderColor: "#FF9900", color: "white" }
                          : { borderColor: "#d1d5db", background: "white" }}
                      >
                        {selectedKey === obj.key && <CheckIcon />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-ink-800 font-mono truncate">{obj.key}</p>
                        <p className="text-[10.5px] text-ink-400">
                          {formatBytes(obj.size)} · {new Date(obj.lastModified).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {error && (
                <p className="text-[11.5px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </>
          )}

          {/* ── STEP: done ── */}
          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500">
                <CheckIcon />
              </div>
              <div className="text-center">
                <p className="text-[13px] font-semibold text-ink-900">Import Complete</p>
                <p className="text-[11.5px] text-ink-400 mt-1">
                  <span className="font-mono text-ink-600">{importResult?.key}</span> was imported successfully.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex justify-end gap-2">
          {step === "connect" && (
            <>
              <button
                onClick={onBack}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-ink-600 hover:bg-surface-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConnect}
                disabled={loading || !bucket || !accessKeyId || !secretAccessKey}
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#FF9900] text-white hover:bg-[#e88a00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Connecting…" : "Connect"}
              </button>
            </>
          )}
          {step === "browse" && (
            <>
              <button
                onClick={() => { setStep("connect"); setError(null); }}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-ink-600 hover:bg-surface-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={loading || !selectedKey}
                className="px-4 py-2 rounded-lg text-[13px] font-medium bg-[#FF9900] text-white hover:bg-[#e88a00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Importing…" : "Import"}
              </button>
            </>
          )}
          {step === "done" && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
            >
              <CheckIcon />
              Done
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes animate-in {
          from { opacity: 0; transform: scale(0.96) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-in { animation: animate-in 0.18s cubic-bezier(0.22,1,0.36,1) both; }
      `}</style>
    </div>
  );
}

// ── External sources list ─────────────────────────────────────────────────────
const SOURCES = ["Amazon S3", "Snowflake", "BigQuery", "PostgreSQL"] as const;
type Source = typeof SOURCES[number];

const AVAILABLE_SOURCES: ReadonlySet<Source> = new Set(["Amazon S3"]);

// ── Main Modal ────────────────────────────────────────────────────────────────
export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [s3Open, setS3Open] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSourceClick = (src: Source) => {
    if (!AVAILABLE_SOURCES.has(src)) return;
    if (src === "Amazon S3") setS3Open(true);
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/dataset/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message ?? `Upload failed (${response.status})`);
      }

      const result = await response.json();
      console.log('Upload successful:', result);
      
      // Close modal on success
      onClose();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleBrowseClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json,.parquet,.xlsx';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    };
    input.click();
  };

  return (
    <>
      {/* ── S3 sub-modal ── */}
      {s3Open && (
        <S3Modal onClose={onClose} onBack={() => setS3Open(false)} />
      )}

      {/* ── Main modal ── */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-150 ${
          s3Open ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/10 backdrop-blur-[2px]"
          onClick={onClose}
        />

        {/* Panel */}
        <div className="relative z-10 bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-[580px] mx-4 overflow-hidden">

          {/* Header */}
          <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
            <div>
              <h2 className="text-[14px] font-semibold text-ink-900">Import Dataset</h2>
              <p className="text-[11.5px] text-ink-400 mt-0.5">Upload a file or connect an external source</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-400 hover:bg-surface-100 hover:text-ink-700 transition-colors"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Body — strict two-column, equal height */}
          <div className="grid grid-cols-2 divide-x divide-surface-100 min-h-0">

{/* ── LEFT: Upload ── */}
<div className="p-4 flex flex-col gap-3">
  <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400 font-mono">
    Upload File
  </p>

  <div
    onClick={handleBrowseClick}
    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={handleDrop}
    className={[
      "flex-1 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer py-6",
      uploading
        ? "border-accent/40 bg-accent/5 pointer-events-none"
        : dragging
        ? "border-accent bg-accent/5"
        : "border-surface-200 hover:border-surface-300 bg-surface-50/60",
    ].join(" ")}
  >
    <div className="w-8 h-8 rounded-lg bg-white border border-surface-200 shadow-sm flex items-center justify-center text-ink-400">
      {uploading ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <UploadIcon />
      )}
    </div>
    <div className="text-center">
      <p className="text-[12px] font-medium text-ink-700">
        {uploading ? "Uploading…" : "Drop your file here"}
      </p>
      <p className="text-[11px] text-ink-400 mt-0.5">up to 500 MB</p>
    </div>
    {!uploading && (
      <button
        onClick={(e) => { e.stopPropagation(); handleBrowseClick(); }}
        className="text-[11px] font-medium text-accent hover:underline mt-0.5"
      >
        Browse files
      </button>
    )}
  </div>

  <div className="flex flex-wrap gap-1">
    {(["CSV", "JSON", "Parquet", "XLSX"] as const).map((f) => (
      <span
        key={f}
        className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded border font-mono bg-surface-50 text-ink-500 border-surface-200"
      >
        {f}
      </span>
    ))}
  </div>

  {uploadError && (
    <p className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
      {uploadError}
    </p>
  )}
</div>
            {/* ── RIGHT: External sources ── */}
            <div className="p-4 flex flex-col gap-3">
              {/* Column label */}
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-400 font-mono">
                External Source
              </p>

              {/* Source list */}
              <div className="flex flex-col gap-1.5 flex-1">
                {SOURCES.map((src) => {
                  const isAvailable = AVAILABLE_SOURCES.has(src);

                  return (
                    <button
                      key={src}
                      onClick={() => handleSourceClick(src)}
                      disabled={!isAvailable}
                      aria-disabled={!isAvailable}
                      className={[
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all text-left group w-full",
                        isAvailable
                          ? "border-[#FF9900]/25 hover:border-[#FF9900]/50 hover:bg-[#FF9900]/5"
                          : "border-surface-200 bg-surface-50/70 cursor-not-allowed",
                      ].join(" ")}
                    >
                      <div className={isAvailable ? "contents" : "contents blur-[1.5px] opacity-60 saturate-0"}>
                        <SourceIcon name={src} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-ink-800 leading-none">{src}</p>
                          <p className="text-[10.5px] text-ink-400 mt-0.5">
                            {src === "Amazon S3"  && "S3 bucket · IAM credentials"}
                            {src === "Snowflake"  && "Cloud data warehouse"}
                            {src === "BigQuery"   && "Google cloud analytics"}
                            {src === "PostgreSQL" && "Relational database"}
                          </p>
                        </div>
                        <span className="text-ink-300 group-hover:text-ink-500 transition-colors shrink-0">
                          <ChevronRightIcon />
                        </span>
                      </div>
                      {!isAvailable && (
                        <span className="ml-auto shrink-0 rounded-full border border-surface-200 bg-white px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-400">
                          Unavailable
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-surface-100 flex items-center justify-between">
            <p className="text-[11px] text-ink-400">
              Need help?{" "}
              <a href="#" className="text-accent hover:underline">
                View import docs
              </a>
            </p>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium text-ink-600 hover:bg-surface-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}