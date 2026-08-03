-- CreateTable
CREATE TABLE "MemberEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "enrolledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemberEnrollment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MemberEnrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromotionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromYearId" TEXT NOT NULL,
    "toYearId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "runBy" TEXT,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "PromotionRun_fromYearId_fkey" FOREIGN KEY ("fromYearId") REFERENCES "AcademicYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PromotionRun_toYearId_fkey" FOREIGN KEY ("toYearId") REFERENCES "AcademicYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromotionRunItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promotionRunId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "sourceClassId" TEXT NOT NULL,
    "targetClassId" TEXT,
    "outcome" TEXT NOT NULL,
    "message" TEXT,
    CONSTRAINT "PromotionRunItem_promotionRunId_fkey" FOREIGN KEY ("promotionRunId") REFERENCES "PromotionRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PromotionRunItem_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MemberEnrollment_memberId_academicYearId_idx" ON "MemberEnrollment"("memberId", "academicYearId");

-- CreateIndex
CREATE INDEX "MemberEnrollment_memberId_status_idx" ON "MemberEnrollment"("memberId", "status");

-- CreateIndex
CREATE INDEX "MemberEnrollment_classId_idx" ON "MemberEnrollment"("classId");

-- CreateIndex
CREATE INDEX "MemberEnrollment_academicYearId_idx" ON "MemberEnrollment"("academicYearId");

-- CreateIndex
CREATE INDEX "MemberEnrollment_status_idx" ON "MemberEnrollment"("status");

-- CreateIndex
CREATE INDEX "PromotionRun_fromYearId_idx" ON "PromotionRun"("fromYearId");

-- CreateIndex
CREATE INDEX "PromotionRun_toYearId_idx" ON "PromotionRun"("toYearId");

-- CreateIndex
CREATE INDEX "PromotionRun_status_idx" ON "PromotionRun"("status");

-- CreateIndex
CREATE INDEX "PromotionRunItem_promotionRunId_idx" ON "PromotionRunItem"("promotionRunId");

-- CreateIndex
CREATE INDEX "PromotionRunItem_memberId_idx" ON "PromotionRunItem"("memberId");

-- CreateIndex
CREATE INDEX "PromotionRunItem_outcome_idx" ON "PromotionRunItem"("outcome");

