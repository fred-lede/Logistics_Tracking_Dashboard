/*
  Warnings:

  - You are about to drop the column `partNumber` on the `Package` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00',
    "periodicInterval" INTEGER NOT NULL DEFAULT 0,
    "lastDailySent" TEXT,
    "lastPeriodicSent" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    "notifyOnStatuses" TEXT NOT NULL DEFAULT '[]',
    "sendSummary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NotificationContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationContact_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'fedex',
    "nickname" TEXT,
    "partNumbers" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT,
    "eta" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "events" TEXT NOT NULL DEFAULT '[]',
    "subPackages" TEXT NOT NULL DEFAULT '[]',
    "lastCheckedAt" DATETIME,
    "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Package" ("autoRefresh", "carrier", "createdAt", "destination", "eta", "events", "id", "lastCheckedAt", "nickname", "origin", "status", "subPackages", "trackingNumber", "updatedAt") SELECT "autoRefresh", "carrier", "createdAt", "destination", "eta", "events", "id", "lastCheckedAt", "nickname", "origin", "status", "subPackages", "trackingNumber", "updatedAt" FROM "Package";
DROP TABLE "Package";
ALTER TABLE "new_Package" RENAME TO "Package";
CREATE UNIQUE INDEX "Package_trackingNumber_key" ON "Package"("trackingNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
