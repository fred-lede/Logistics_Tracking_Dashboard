-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'fedex',
    "nickname" TEXT,
    "status" TEXT,
    "eta" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "events" TEXT NOT NULL DEFAULT '[]',
    "lastCheckedAt" DATETIME,
    "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Package_trackingNumber_key" ON "Package"("trackingNumber");
