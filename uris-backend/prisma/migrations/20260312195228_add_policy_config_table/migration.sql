-- CreateTable
CREATE TABLE "policy_configs" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policy_configs_datasetId_key" ON "policy_configs"("datasetId");
