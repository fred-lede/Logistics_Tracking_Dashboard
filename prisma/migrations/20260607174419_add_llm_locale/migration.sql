-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LLMSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "providerLabel" TEXT,
    "compatMode" TEXT NOT NULL DEFAULT 'chat',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "apiKey" TEXT,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LLMSetting" ("apiKey", "baseUrl", "compatMode", "createdAt", "enabled", "id", "model", "provider", "providerLabel", "updatedAt") SELECT "apiKey", "baseUrl", "compatMode", "createdAt", "enabled", "id", "model", "provider", "providerLabel", "updatedAt" FROM "LLMSetting";
DROP TABLE "LLMSetting";
ALTER TABLE "new_LLMSetting" RENAME TO "LLMSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
