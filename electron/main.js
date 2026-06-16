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
let serverSettings = null;

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

function getSystemConfigPath() {
  if (isDev) return path.resolve('./.system-settings.json');
  return path.join(app.getPath('userData'), '.system-settings.json');
}

function normalizeSystemSettings(raw = {}) {
  const accessMode = raw.accessMode === 'server' ? 'server' : 'standalone';
  const configuredPort = Number(raw.serverPort);
  const serverPort = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
    ? configuredPort
    : DEV_PORT;
  return {
    accessMode,
    serverPort,
    serverHost: raw.serverHost || (accessMode === 'server' ? '0.0.0.0' : '127.0.0.1'),
    sqlitePath: raw.sqlitePath || ('file:' + getDbPath()),
  };
}

function loadSystemSettings() {
  try {
    return normalizeSystemSettings(JSON.parse(fs.readFileSync(getSystemConfigPath(), 'utf-8')));
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      const message = err && err.message ? err.message : String(err);
      log('Failed to read system settings, using defaults:', message);
    }
    return normalizeSystemSettings();
  }
}

function getNextBin() {
  return path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
}

function getServerEntry() {
  if (isDev) return null;
  return path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js');
}

function getNextServerEnv(settings) {
  const env = { ...process.env };
  const strip = [
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'ELECTRON_OVERRIDE_DIST_PATH',
    'NODE_OPTIONS',
  ];
  for (const key of strip) delete env[key];
  env.DATABASE_URL = settings.sqlitePath;
  env.ELECTRON_RUN_AS_NODE = '1';
  env.CARRIER_CONFIG_DIR = isDev ? process.cwd() : app.getPath('userData');
  env.SYSTEM_CONFIG_DIR = isDev ? process.cwd() : app.getPath('userData');
  env.HOSTNAME = settings.serverHost;
  env.PORT = String(settings.serverPort);
  return env;
}

function getCwd() {
  if (isDev) return process.cwd();
  return path.join(process.resourcesPath, 'app');
}

function startNextServer() {
  serverSettings = loadSystemSettings();
  const cwd = getCwd();

  if (isDev) {
    const nextBin = getNextBin();
    log('starting Next.js dev server from', cwd, 'host:', serverSettings.serverHost, 'port:', serverSettings.serverPort);
    nextServer = spawn(process.execPath, [
      nextBin,
      'dev',
      '--webpack',
      '-p',
      String(serverSettings.serverPort),
      '-H',
      serverSettings.serverHost,
    ], {
      cwd, env: getNextServerEnv(serverSettings), stdio: 'pipe',
    });
  } else {
    const entry = getServerEntry();
    log('starting Next.js production server, entry:', entry, 'host:', serverSettings.serverHost, 'port:', serverSettings.serverPort);
    nextServer = spawn(process.execPath, [entry], {
      cwd: path.dirname(entry), env: getNextServerEnv(serverSettings), stdio: 'pipe',
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
  const settings = serverSettings || loadSystemSettings();
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
  mainWindow.loadURL('http://localhost:' + settings.serverPort);
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Logistics Dashboard',
    message: 'Logistics Dashboard',
    detail: [
      'Version: ' + app.getVersion(),
      '',
      'Author: Fred Wang',
      'Multi-carrier package tracking dashboard',
      'with multi-channel notification system.',
      '',
      'Built with Next.js + Electron',
      'Copyright © 2026 Fred Wang',
    ].join('\n'),
    icon: path.join(__dirname, '..', 'assets', 'icon-256.png'),
    buttons: ['OK'],
  });
}

function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { label: 'About Logistics Dashboard', click: showAboutDialog },
        { type: 'separator' }, { role: 'hide' },
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

ipcMain.handle('show-about', showAboutDialog);

app.whenReady().then(async () => {
  log('App started, isDev:', isDev);
  log('resourcesPath:', process.resourcesPath);
  log('userData:', app.getPath('userData'));
  log('cwd:', process.cwd());

  createAppMenu();

  const dbPath = getDbPath();
  log('dbPath:', dbPath);
  log('systemConfigPath:', getSystemConfigPath());

  // Copy .carrier-creds.json to userData if not present
  if (!isDev) {
    const userDataPath = app.getPath('userData');
    const targetPath = path.join(userDataPath, '.carrier-creds.json');
    if (!fs.existsSync(targetPath)) {
      const bundledPath = path.join(process.resourcesPath, 'app', '.carrier-creds.json');
      if (fs.existsSync(bundledPath)) {
        try {
          fs.cpSync(bundledPath, targetPath);
          log('Copied .carrier-creds.json to', targetPath);
        } catch (e) {
          log('Failed to copy .carrier-creds.json:', e.message);
        }
      } else {
        log('No bundled .carrier-creds.json found at', bundledPath);
      }
    }
  }

  startNextServer();
  const settings = serverSettings || loadSystemSettings();
  log('Waiting for server on port', settings.serverPort);

  try {
    await waitForServer('http://localhost:' + settings.serverPort);
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
