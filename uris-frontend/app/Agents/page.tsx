"use client";

import { useSearchParams } from "next/navigation";
import AgentsView from "./Agent";

export default function AgentsPage() {
  const searchParams = useSearchParams();
  const datasetId = searchParams.get("datasetId");
  const runId = searchParams.get("runId") ?? undefined;

  return <AgentsView datasetId={datasetId ?? undefined} initialRunId={runId} />;
}
