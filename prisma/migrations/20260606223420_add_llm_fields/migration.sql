-- AlterTable
ALTER TABLE "Package" ADD COLUMN "aiAnalyzedAt" DATETIME;
ALTER TABLE "Package" ADD COLUMN "aiRootCause" TEXT;
ALTER TABLE "Package" ADD COLUMN "aiSummary" TEXT;

-- CreateTable
CREATE TABLE "LLMSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "apiKey" TEXT,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
