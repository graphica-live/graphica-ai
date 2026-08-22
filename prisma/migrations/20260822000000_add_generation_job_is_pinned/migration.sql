-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "GenerationJob_userId_isPinned_createdAt_idx" ON "GenerationJob"("userId", "isPinned", "createdAt");
