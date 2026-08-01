-- AlterTable
ALTER TABLE "BookCopy" RENAME COLUMN "acquisitionPrice" TO "acquisitionCost";
ALTER TABLE "BookCopy" ADD COLUMN "acquisitionSourceDetail" TEXT;
