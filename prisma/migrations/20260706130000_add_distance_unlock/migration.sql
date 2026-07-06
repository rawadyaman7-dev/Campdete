-- CreateEnum
CREATE TYPE "ChallengeUnlockType" AS ENUM ('PHOTO_SUBMISSION', 'DISTANCE_WALKED');

-- AlterTable
ALTER TABLE "teams" ADD COLUMN "totalDistanceMeters" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "challenges" ADD COLUMN "unlockType" "ChallengeUnlockType" NOT NULL DEFAULT 'PHOTO_SUBMISSION';
ALTER TABLE "challenges" ADD COLUMN "requiredDistanceMeters" INTEGER;
