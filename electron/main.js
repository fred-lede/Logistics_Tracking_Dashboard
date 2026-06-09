const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { createTray } = require('./tray');
const { registerNotificationIPC } = require('./notification');

const DEV_PORT = 3310;
const isDev = !app.isPackaged;

let mainWindow = null;
let nextServer = null;
let isQuitting = false;

function logPath() {
  if (isDev) return path.resolve('./electron.log');
  return path.join(app.getPath('userData'), 'electron.log');
}

function log(...args) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logPath(), line); } catch {}
  console.log(msg);
}

function fatalError(msg) {
  log('FATAL:', msg);
  try { dialog.showErrorBox('Logistics Dashboard - Fatal Error', msg); } catch {}
  app.quit();
}

function getDbPath() {
  if (isDev) return path.resolve('./dev.db');
  return path.join(app.getPath('userData'), 'dev.db');
}

function getNextBin() {
  return path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
}

function getServerEntry() {
  if (isDev) return null;
  return path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js');
}

function getNextServerEnv(dbPath, port) {
  const env = { ...process.env };
  const strip = [
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'ELECTRON_OVERRIDE_DIST_PATH',
    'NODE_OPTIONS',
  ];
  for (const key of strip) delete env[key];
  env.DATABASE_URL = 'file:' + dbPath;
  env.ELECTRON_RUN_AS_NODE = '1';
  env.CARRIER_CONFIG_DIR = isDev ? process.cwd() : app.getPath('userData');
  if (port) env.PORT = String(port);
  return env;
}

function getCwd() {
  if (isDev) return process.cwd();
  return path.join(process.resourcesPath, 'app');
}

function setupDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'setup-db.cjs');
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
    if (!isDev) {
      env.NODE_PATH = path.join(process.resourcesPath, 'app', '.next', 'standalone', 'node_modules');
    }
    log('setup-db: spawning', script, 'dbPath:', dbPath);
    const proc = spawn(process.execPath, [script, dbPath], { env, stdio: 'pipe' });
    let stderr = '';
    proc.stdout.on('data', (d) => log('[setup-db] ' + d.toString().trim()));
    proc.stderr.on('data', (d) => { stderr += d.toString(); log('[setup-db:err] ' + d.toString().trim()); });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('setup-db exited with code ' + code + (stderr ? ': ' + stderr.trim() : '')));
    });
  });
}

function startNextServer() {
  const dbPath = getDbPath();
  const cwd = getCwd();

  if (isDev) {
    const nextBin = getNextBin();
    log('starting Next.js dev server from', cwd);
    nextServer = spawn(process.execPath, [nextBin, 'dev', '--webpack', '-p', String(DEV_PORT)], {
      cwd, env: getNextServerEnv(dbPath), stdio: 'pipe',
    });
  } else {
    const entry = getServerEntry();
    log('starting Next.js production server, entry:', entry);
    nextServer = spawn(process.execPath, [entry], {
      cwd: path.dirname(entry), env: getNextServerEnv(dbPath, DEV_PORT), stdio: 'pipe',
    });
  }

  nextServer.stdout.on('data', (data) => log('[next] ' + data.toString().trim()));
  nextServer.stderr.on('data', (data) => log('[next:err] ' + data.toString().trim()));
  nextServer.on('exit', (code) => {
    log('[next] Server exited with code ' + code);
    nextServer = null;
  });
}

function waitForServer(url, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.request(url, { method: 'HEAD' }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) resolve();
        else if (retries < maxRetries) { retries++; setTimeout(check, 1000); }
        else reject(new Error('Server did not become ready'));
      });
      req.on('error', () => {
        if (retries < maxRetries) { retries++; setTimeout(check, 1000); }
        else reject(new Error('Server did not become ready'));
      });
      req.end();
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
    show: false,
    title: 'Logistics Dashboard',
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.loadURL('http://localhost:' + DEV_PORT);
}

function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' }, { role: 'hide' },
        { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function killServer() {
  if (nextServer) { nextServer.kill('SIGTERM'); nextServer = null; }
}

registerNotificationIPC(ipcMain);

app.whenReady().then(async () => {
  log('App started, isDev:', isDev);
  log('resourcesPath:', process.resourcesPath);
  log('userData:', app.getPath('userData'));
  log('cwd:', process.cwd());

  createAppMenu();

  const dbPath = getDbPath();
  log('dbPath:', dbPath);

  try {
    await setupDatabase(dbPath);
    log('Database setup complete');
  } catch (err) {
    log('Database setup failed:', err.message);
    fatalError('Database setup failed: ' + err.message + '\n\nLog file: ' + logPath());
    return;
  }

  startNextServer();
  log('Waiting for server on port', DEV_PORT);

  try {
    await waitForServer('http://localhost:' + DEV_PORT);
    log('Server is ready');
  } catch (err) {
    log('Server startup failed:', err.message);
    fatalError('Next.js server failed to start: ' + err.message + '\n\nLog file: ' + logPath());
    return;
  }

  createWindow();
  createTray(app, mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  killServer();
});
