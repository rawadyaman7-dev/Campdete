-- AlterTable: add the new multi-file array column with a temporary default
-- so existing rows are satisfied
ALTER TABLE "submissions" ADD COLUMN "proofPhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill existing single-photo data into the new array column
UPDATE "submissions" SET "proofPhotoUrls" = ARRAY["proofPhotoUrl"];

-- Drop the old single-url column
ALTER TABLE "submissions" DROP COLUMN "proofPhotoUrl";

-- Match the schema going forward: no default, callers always specify the list
ALTER TABLE "submissions" ALTER COLUMN "proofPhotoUrls" DROP DEFAULT;
