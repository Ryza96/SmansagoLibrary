-- Add defaultBookValue column to Setting (default 25000).
ALTER TABLE "Setting" ADD COLUMN "defaultBookValue" INTEGER NOT NULL DEFAULT 25000;
