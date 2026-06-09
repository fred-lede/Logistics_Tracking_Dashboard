let Database;
try {
  Database = require('better-sqlite3');
} catch {
  const standaloneModules = require('path').join(__dirname, '..', '.next', 'standalone', 'node_modules');
  require('module').paths.push(standaloneModules);
  Database = require('better-sqlite3');
}

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('[setup-db] Missing database path argument');
  process.exit(1);
}

console.log('[setup-db] ' + dbPath);

const db = new Database(dbPath);

db.exec(`
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS "Package" (
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
      "autoRefresh" INTEGER NOT NULL DEFAULT 0,
      "aiSummary" TEXT,
      "aiRootCause" TEXT,
      "aiAnalyzedAt" DATETIME,
      "aiDelayRisk" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "Package_trackingNumber_key" ON "Package"("trackingNumber");

  CREATE TABLE IF NOT EXISTS "NotificationSetting" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
      "enabled" INTEGER NOT NULL DEFAULT 1,
      "dailySummaryEnabled" INTEGER NOT NULL DEFAULT 0,
      "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00',
      "periodicInterval" INTEGER NOT NULL DEFAULT 0,
      "lastDailySent" TEXT,
      "lastPeriodicSent" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "NotificationChannel" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "type" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "enabled" INTEGER NOT NULL DEFAULT 1,
      "mode" TEXT,
      "config" TEXT NOT NULL DEFAULT '{}',
      "notifyOnStatuses" TEXT NOT NULL DEFAULT '[]',
      "sendSummary" INTEGER NOT NULL DEFAULT 0,
      "locale" TEXT NOT NULL DEFAULT 'en',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "NotificationContact" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "channelId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "identifier" TEXT NOT NULL,
      "enabled" INTEGER NOT NULL DEFAULT 1,
      "locale" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "NotificationLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "packageId" TEXT NOT NULL,
      "channelId" TEXT NOT NULL,
      "notificationType" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "success" INTEGER NOT NULL,
      "errorMessage" TEXT,
      "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "LLMSetting" (
      "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
      "provider" TEXT NOT NULL DEFAULT 'openai',
      "providerLabel" TEXT,
      "compatMode" TEXT NOT NULL DEFAULT 'chat',
      "locale" TEXT NOT NULL DEFAULT 'en',
      "apiKey" TEXT,
      "baseUrl" TEXT,
      "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
      "enabled" INTEGER NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
  );

  INSERT OR IGNORE INTO "NotificationSetting" ("id") VALUES ('global');
  INSERT OR IGNORE INTO "LLMSetting" ("id") VALUES ('global');
`);

db.close();
console.log('[setup-db] Ready');
