export const postgresSchemaSql = `
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
  "lastCheckedAt" TIMESTAMPTZ,
  "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
  "aiSummary" TEXT,
  "aiRootCause" TEXT,
  "aiAnalyzedAt" TIMESTAMPTZ,
  "aiDelayRisk" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "Package_trackingNumber_key" ON "Package"("trackingNumber");

CREATE TABLE IF NOT EXISTS "NotificationSetting" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00',
  "periodicInterval" INTEGER NOT NULL DEFAULT 0,
  "lastDailySent" TEXT,
  "lastPeriodicSent" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationChannel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mode" TEXT,
  "config" TEXT NOT NULL DEFAULT '{}',
  "notifyOnStatuses" TEXT NOT NULL DEFAULT '[]',
  "sendSummary" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationContact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelId" TEXT NOT NULL REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "locale" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "packageId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE,
  "notificationType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now()
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
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "NotificationSetting" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "LLMSetting" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;
`
