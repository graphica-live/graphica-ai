-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "GenerationJob_userId_pinnedAt_idx" ON "GenerationJob"("userId", "pinnedAt");
