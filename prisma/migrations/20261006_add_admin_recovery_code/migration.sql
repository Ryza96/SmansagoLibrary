-- Add recovery code fields to Admin (nullable).
ALTER TABLE "Admin" ADD COLUMN "recoveryCodeHash" TEXT;
ALTER TABLE "Admin" ADD COLUMN "recoveryCodeCreatedAt" DATETIME;
