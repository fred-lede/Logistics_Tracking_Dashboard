'use strict';
const fs = require('fs');
const path = require('path');

const standaloneDir = path.resolve('.next/standalone');

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
  console.log('[post-build] Copied', src, '→', dest);
}

function cleanStandalone() {
  const removes = [
    'release', 'docs', 'src', 'scripts',
    '.env', '.env.local', '.env.production',
    '.carrier-creds.json',
    'dev.db', 'dev.db-journal', 'dev.db-wal', 'dev.db-shm',
    'next-env.d.ts', 'tsconfig.json', 'vitest.config.ts',
    'eslint.config.mjs', 'postcss.config.mjs', 'tailwind.config.ts',
  ];
  for (const name of removes) {
    const p = path.join(standaloneDir, name);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      console.log('[post-build] Removed', p);
    }
  }
}

copyDir(
  path.resolve('.next/static'),
  path.join(standaloneDir, '.next/static')
);
copyDir(
  path.resolve('public'),
  path.join(standaloneDir, 'public')
);
cleanStandalone();

async function exportLlmSettings() {
  try {
    const dbPath = path.resolve('dev.db');
    if (!fs.existsSync(dbPath)) return;

    const initSqlJs = require('sql.js/dist/sql-asm.js');
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const result = db.exec('SELECT provider, "providerLabel", apiKey, baseUrl, model, "compatMode", locale FROM LLMSetting WHERE id = $id', {
      $id: 'global',
    });
    db.close();

    const columns = result[0]?.columns;
    const values = result[0]?.values[0];
    if (columns && values) {
      const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
      const outPath = path.join(standaloneDir, '.llm-settings.json');
      fs.writeFileSync(outPath, JSON.stringify(row, null, 2));
      console.log('[post-build] Exported LLM settings →', outPath);
    }
  } catch (e) {
    console.log('[post-build] LLM settings export skipped:', e.message);
  }
}

exportLlmSettings()
  .then(() => console.log('[post-build] Done'))
  .catch((e) => {
    console.error('[post-build] Failed:', e);
    process.exit(1);
  });
