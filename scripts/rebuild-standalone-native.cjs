'use strict';
const fs = require('fs');
const path = require('path');

const rootNativeDir = path.resolve('node_modules/better-sqlite3');
const standaloneNativeDir = path.resolve('.next/standalone/node_modules/better-sqlite3');
const binaryPath = path.join(standaloneNativeDir, 'build', 'Release', 'better_sqlite3.node');

const sourceFiles = ['binding.gyp', 'src', 'deps'];

function copySource() {
  for (const name of sourceFiles) {
    const src = path.join(rootNativeDir, name);
    const dest = path.join(standaloneNativeDir, name);
    if (!fs.existsSync(src)) {
      console.error('[rebuild-native] Missing source:', src);
      return false;
    }
    if (fs.existsSync(dest)) {
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
      fs.rmSync(dest, { recursive: true, force: true });
    }
  }
}

async function runRebuild() {
  const electronVer = JSON.parse(fs.readFileSync(path.resolve('node_modules/electron/package.json'), 'utf-8')).version;
  const hostArch = process.arch;
  console.log('[rebuild-native] Host arch:', hostArch);
  console.log('[rebuild-native] Electron version:', electronVer);

  const standaloneDir = path.resolve('.next/standalone');

  fs.rmSync(binaryPath, { force: true });
  console.log('[rebuild-native] Removed old binary, forcing rebuild');

  try {
    const { rebuild: electronRebuild } = require('@electron/rebuild');
    await electronRebuild({
      buildPath: standaloneDir,
      electronVersion: electronVer,
      arch: hostArch,
      onlyModules: ['better-sqlite3'],
      force: true,
    });
  } catch (err) {
    console.error('[rebuild-native] @electron/rebuild failed:', err.message);
    return false;
  }

  if (!fs.existsSync(binaryPath)) {
    console.error('[rebuild-native] Binary not found after rebuild at', binaryPath);
    return false;
  }

  const sizeKB = Math.round(fs.statSync(binaryPath).size / 1024);
  console.log('[rebuild-native] Binary rebuilt:', sizeKB, 'KB');

  return true;
}

async function main() {
  console.log('[rebuild-native] === Standalone native module rebuild ===');

  const targetPlatform = process.argv[2];
  const hostPlatform = process.platform;
  if (targetPlatform && targetPlatform !== hostPlatform) {
    console.error('[rebuild-native] Cross-compile detected: host=' + hostPlatform + ' target=' + targetPlatform);
    console.error('[rebuild-native] Native modules cannot be cross-compiled. Use CI (native runners) instead.');
    process.exit(1);
  }

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
