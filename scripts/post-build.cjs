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
console.log('[post-build] Done');
