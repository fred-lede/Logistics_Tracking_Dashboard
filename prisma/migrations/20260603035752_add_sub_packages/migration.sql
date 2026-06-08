-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'fedex',
    "nickname" TEXT,
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
INSERT INTO "new_Package" ("autoRefresh", "carrier", "createdAt", "destination", "eta", "events", "id", "lastCheckedAt", "nickname", "origin", "status", "trackingNumber", "updatedAt") SELECT "autoRefresh", "carrier", "createdAt", "destination", "eta", "events", "id", "lastCheckedAt", "nickname", "origin", "status", "trackingNumber", "updatedAt" FROM "Package";
DROP TABLE "Package";
ALTER TABLE "new_Package" RENAME TO "Package";
CREATE UNIQUE INDEX "Package_trackingNumber_key" ON "Package"("trackingNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
