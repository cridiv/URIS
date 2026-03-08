"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

interface DatasetItem {
	id: string;
	name: string;
	status: string;
	rowCount: number | null;
	columnCount: number | null;
}

interface RunItem {
	id: string;
	status: string;
	createdAt: string;
	updatedAt?: string;
	adfiScore: number | null;
	complianceStatus: string | null;
	task: string | null;
}

interface DatasetWithRuns extends DatasetItem {
	runs: RunItem[];
}

function statusTone(status: string) {
	const s = (status ?? "").toLowerCase();
	if (s === "completed") return { bg: "#ECFDF5", color: "#047857", border: "#D1FAE5" };
	if (s === "failed" || s === "error") return { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA" };
	return { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" };
}

export default function AuditIndexPage() {
	const router = useRouter();
	const [datasets, setDatasets] = useState<DatasetWithRuns[]>([]);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const load = async () => {
			setLoading(true);
			try {
				const datasetRes = await fetch(`${API_BASE}/dataset`);
				if (!datasetRes.ok) throw new Error("Failed to fetch datasets");
				const baseDatasets = (await datasetRes.json()) as DatasetItem[];

				const withRuns = await Promise.all(
					baseDatasets.map(async (d) => {
						try {
							const runsRes = await fetch(`${API_BASE}/agents/${d.id}`);
							if (!runsRes.ok) return { ...d, runs: [] as RunItem[] };
							const payload = await runsRes.json();
							const runs = Array.isArray(payload?.runs) ? (payload.runs as RunItem[]) : [];
							return { ...d, runs };
						} catch {
							return { ...d, runs: [] as RunItem[] };
						}
					}),
				);

				setDatasets(withRuns);
			} catch (error) {
				console.error("Failed to load audit index:", error);
			} finally {
				setLoading(false);
			}
		};

		load();
	}, []);

	const totalRuns = useMemo(
		() => datasets.reduce((sum, d) => sum + d.runs.length, 0),
		[datasets],
	);

	return (
		<div style={{ fontFamily: "IBM Plex Sans, sans-serif", background: "#F4F5F7", minHeight: "100vh", padding: "24px 28px" }}>
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
						Audit Logs
					</div>
					<div style={{ fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 4 }}>
						Dataset run history
					</div>
				</div>
				<div style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "#57606A" }}>
					Total runs: <span style={{ color: "#0D1117", fontWeight: 700 }}>{totalRuns}</span>
				</div>
			</div>

			<div style={{ background: "#fff", border: "1px solid #E1E4E8", borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", overflow: "hidden" }}>
				{loading && (
					<div style={{ padding: "28px", color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}>
						Loading datasets...
					</div>
				)}

				{!loading && datasets.length === 0 && (
					<div style={{ padding: "28px", color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}>
						No datasets available.
					</div>
				)}

				{!loading && datasets.map((dataset) => {
					const isOpen = expanded === dataset.id;
					return (
						<div key={dataset.id} style={{ borderTop: "1px solid #F0F2F4" }}>
							<button
								onClick={() => setExpanded(isOpen ? null : dataset.id)}
								style={{
									width: "100%",
									border: "none",
									background: isOpen ? "#F6F8FA" : "#fff",
									padding: "14px 16px",
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									cursor: "pointer",
									textAlign: "left",
									gap: 10,
								}}
							>
								<div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
										<path d="M9 18l6-6-6-6" stroke="#C8D0D8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
									<div style={{ minWidth: 0 }}>
										<div style={{ fontSize: 12.5, fontFamily: "IBM Plex Mono, monospace", color: "#0D1117", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
											{dataset.name}
										</div>
										<div style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 4 }}>
											{dataset.rowCount ?? "-"} rows · {dataset.columnCount ?? "-"} cols
										</div>
									</div>
								</div>
								<span style={{ fontSize: 11, color: "#57606A", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600, flexShrink: 0 }}>
									{dataset.runs.length} runs
								</span>
							</button>

							{isOpen && (
								<div style={{ padding: "4px 16px 14px 38px", background: "#fff" }}>
									{dataset.runs.length === 0 && (
										<div style={{ fontSize: 11, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", padding: "8px 0" }}>
											No runs found for this dataset.
										</div>
									)}

									{dataset.runs.map((run) => {
										const tone = statusTone(run.status);
										return (
											<button
												key={run.id}
												onClick={() => router.push(`/Audit-Log/logs/${dataset.id}/${run.id}`)}
												style={{
													width: "100%",
													border: "1px solid #E1E4E8",
													borderRadius: 10,
													background: "#FAFBFC",
													padding: "10px 12px",
													marginTop: 8,
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
													gap: 10,
													cursor: "pointer",
													textAlign: "left",
												}}
											>
												<div>
													<div style={{ fontSize: 11.5, color: "#0D1117", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>
														run-{run.id.slice(0, 8)}
													</div>
													<div style={{ fontSize: 10.5, color: "#8B949E", fontFamily: "IBM Plex Mono, monospace", marginTop: 3 }}>
														{new Date(run.createdAt).toLocaleString()}
													</div>
												</div>

												<div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
													{typeof run.adfiScore === "number" && (
														<span style={{ fontSize: 11, color: "#24292F", fontFamily: "IBM Plex Mono, monospace", fontWeight: 700 }}>
															ADFI {run.adfiScore.toFixed(3)}
														</span>
													)}
													<span style={{ fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, color: tone.color, background: tone.bg, border: `1px solid ${tone.border}`, borderRadius: 6, padding: "3px 7px", textTransform: "uppercase" }}>
														{run.status}
													</span>
												</div>
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
