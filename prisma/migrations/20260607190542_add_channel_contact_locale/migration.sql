-- AlterTable
ALTER TABLE "NotificationContact" ADD COLUMN "locale" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NotificationChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    "notifyOnStatuses" TEXT NOT NULL DEFAULT '[]',
    "sendSummary" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NotificationChannel" ("config", "createdAt", "enabled", "id", "label", "mode", "notifyOnStatuses", "sendSummary", "type", "updatedAt") SELECT "config", "createdAt", "enabled", "id", "label", "mode", "notifyOnStatuses", "sendSummary", "type", "updatedAt" FROM "NotificationChannel";
DROP TABLE "NotificationChannel";
ALTER TABLE "new_NotificationChannel" RENAME TO "NotificationChannel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
