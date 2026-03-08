-- CreateTable
CREATE TABLE "datasets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "sourceKey" TEXT,
    "rowCount" INTEGER,
    "columnCount" INTEGER,
    "columns" JSONB,
    "profileMeta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMsg" TEXT,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "datasetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'analyzing',
    "adfiScore" DOUBLE PRECISION,
    "complianceStatus" TEXT,
    "task" TEXT,
    "result" JSONB,
    "analysis" JSONB,
    "syntheticDataS3Key" TEXT,
    "errorMsg" TEXT,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "datasets_s3Key_key" ON "datasets"("s3Key");

-- CreateIndex
CREATE INDEX "agent_runs_datasetId_idx" ON "agent_runs"("datasetId");

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
