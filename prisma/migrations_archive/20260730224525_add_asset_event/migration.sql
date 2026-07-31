-- CreateTable
-- AssetEvent: catatan histori aset (BookCopy)
CREATE TABLE "AssetEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookCopyId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "metadata" TEXT,
    "notes" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetEvent_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "BookCopy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AssetEvent_bookCopyId_idx" ON "AssetEvent"("bookCopyId");
CREATE INDEX "AssetEvent_eventType_idx" ON "AssetEvent"("eventType");
