'use strict';
const fs = require('fs');
const path = require('path');

module.exports = async function (context) {
  const projectDir = context.packager.projectDir;
  const appDir = context.appOutDir;

  const rootBinary = path.join(projectDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  const standaloneBinary = path.join(appDir, '.next', 'standalone', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

  if (!fs.existsSync(rootBinary)) {
    console.warn('[after-pack] root better_sqlite3.node not found at', rootBinary);
    return;
  }
  if (!fs.existsSync(standaloneBinary)) {
    console.warn('[after-pack] standalone better_sqlite3.node not found at', standaloneBinary);
    return;
  }

  fs.copyFileSync(rootBinary, standaloneBinary);
  console.log('[after-pack] Copied Electron-rebuilt better_sqlite3.node to standalone');
};
