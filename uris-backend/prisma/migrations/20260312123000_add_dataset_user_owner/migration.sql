-- AlterTable
ALTER TABLE "datasets"
ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "datasets_userId_idx" ON "datasets"("userId");

-- AddForeignKey
ALTER TABLE "datasets"
ADD CONSTRAINT "datasets_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
