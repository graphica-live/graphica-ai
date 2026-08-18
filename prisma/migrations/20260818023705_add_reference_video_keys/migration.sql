-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "referenceVideoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
