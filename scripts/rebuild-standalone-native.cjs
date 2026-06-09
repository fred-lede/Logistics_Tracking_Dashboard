'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootNativeDir = path.resolve('node_modules/better-sqlite3');
const standaloneNativeDir = path.resolve('.next/standalone/node_modules/better-sqlite3');

const sourceFiles = [
  'binding.gyp',
  'src',
  'deps',
];

function copySource() {
  for (const name of sourceFiles) {
    const src = path.join(rootNativeDir, name);
    const dest = path.join(standaloneNativeDir, name);
    if (!fs.existsSync(src)) {
      console.error('[rebuild-native] Missing source:', src);
      return false;
    }
    if (fs.existsSync(dest)) {
      console.log('[rebuild-native] Removing existing:', dest);
      fs.rmSync(dest, { recursive: true, force: true });
    }
    console.log('[rebuild-native] Copying', src, '→', dest);
    fs.cpSync(src, dest, { recursive: true });
  }
  return true;
}

function removeSource() {
  for (const name of sourceFiles) {
    const dest = path.join(standaloneNativeDir, name);
    if (fs.existsSync(dest)) {
      console.log('[rebuild-native] Cleaning up:', dest);
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }
}

function getBinaryPath(baseDir) {
  return path.join(baseDir, 'build', 'Release', 'better_sqlite3.node');
}

function getBinaryMtime(baseDir) {
  try {
    return fs.statSync(getBinaryPath(baseDir)).mtimeMs;
  } catch {
    return 0;
  }
}

async function runRebuild() {
  const electronVer = JSON.parse(fs.readFileSync(path.resolve('node_modules/electron/package.json'), 'utf-8')).version;
  console.log('[rebuild-native] Electron version:', electronVer);

  const mtimeBefore = getBinaryMtime(standaloneNativeDir);

  const standaloneDir = path.resolve('.next/standalone');
  console.log('[rebuild-native] Standalone dir:', standaloneDir);
  console.log('[rebuild-native] Standalone package.json exists:', fs.existsSync(path.join(standaloneDir, 'package.json')));

  try {
    const { rebuild: electronRebuild } = require('@electron/rebuild');
    console.log('[rebuild-native] Running @electron/rebuild programmatic API...');
    await electronRebuild({
      buildPath: standaloneDir,
      electronVersion: electronVer,
      onlyModules: ['better-sqlite3'],
      force: true,
    });
  } catch (err) {
    console.error('[rebuild-native] @electron/rebuild failed:', err.message);
    return false;
  }

  const mtimeAfter = getBinaryMtime(standaloneNativeDir);

  if (mtimeAfter === 0) {
    console.error('[rebuild-native] Binary not found after rebuild at', getBinaryPath(standaloneNativeDir));
    return false;
  }

  if (mtimeAfter === mtimeBefore) {
    console.warn('[rebuild-native] Binary mtime unchanged - rebuild may not have occurred');
  } else {
    console.log('[rebuild-native] Binary rebuilt successfully (mtime changed)');
  }

  const sizeKB = Math.round(fs.statSync(getBinaryPath(standaloneNativeDir)).size / 1024);
  console.log('[rebuild-native] Binary size:', sizeKB, 'KB');

  return true;
}

async function main() {
  console.log('[rebuild-native] === Standalone native module rebuild ===');

  if (!fs.existsSync(standaloneNativeDir)) {
    console.error('[rebuild-native] Standalone better-sqlite3 not found at', standaloneNativeDir);
    process.exit(1);
  }

  if (!copySource()) {
    console.error('[rebuild-native] Failed to copy source files');
    process.exit(1);
  }

  const success = await runRebuild();
  removeSource();

  if (!success) {
    console.error('[rebuild-native] Rebuild failed');
    process.exit(1);
  }

  console.log('[rebuild-native] === Done ===');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[rebuild-native] Unhandled error:', err);
    process.exit(1);
  });
}
