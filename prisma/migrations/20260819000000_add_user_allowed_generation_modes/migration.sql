-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "allowedGenerationModes" TEXT[] NOT NULL DEFAULT ARRAY['reference', 'image']::TEXT[];
