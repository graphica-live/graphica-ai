-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "allowedResolutions" TEXT[] NOT NULL DEFAULT ARRAY['480p']::TEXT[],
  ADD COLUMN "allowedDurations" INTEGER[] NOT NULL DEFAULT ARRAY[5]::INTEGER[],
  ADD COLUMN "allowedAspectRatios" TEXT[] NOT NULL DEFAULT ARRAY['4:3']::TEXT[];
