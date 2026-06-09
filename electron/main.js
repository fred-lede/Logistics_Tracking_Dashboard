const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const { createTray } = require('./tray');
const { registerNotificationIPC } = require('./notification');

const DEV_PORT = 3310;
const isDev = !app.isPackaged;

let mainWindow = null;
let nextServer = null;
let isQuitting = false;

function getDbPath() {
  if (isDev) {
    return path.resolve('./dev.db');
  }
  return path.join(app.getPath('userData'), 'dev.db');
}

function getNextBin() {
  return path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
}

function getServerEntry() {
  if (isDev) {
    return null;
  }
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
  for (const key of strip) {
    delete env[key];
  }
  env.DATABASE_URL = 'file:' + dbPath;
  env.ELECTRON_RUN_AS_NODE = '1';
  env.CARRIER_CONFIG_DIR = isDev ? process.cwd() : app.getPath('userData');
  if (port) {
    env.PORT = String(port);
  }
  return env;
}

function getCwd() {
  if (isDev) {
    return process.cwd();
  }
  return path.join(process.resourcesPath, 'app');
}

function setupDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'setup-db.cjs');
    const env = { ELECTRON_RUN_AS_NODE: '1' };
    if (!isDev) {
      env.NODE_PATH = path.join(process.resourcesPath, 'app', '.next', 'standalone', 'node_modules');
    }
    const proc = spawn(process.execPath, [script, dbPath], { env, stdio: 'pipe' });
    proc.stdout.on('data', (d) => process.stdout.write('[setup-db] ' + d));
    proc.stderr.on('data', (d) => process.stderr.write('[setup-db] ' + d));
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error('setup-db exited with code ' + code));
    });
  });
}

function startNextServer() {
  const dbPath = getDbPath();
  const cwd = getCwd();

  if (isDev) {
    const nextBin = getNextBin();
    nextServer = spawn(process.execPath, [nextBin, 'dev', '--webpack', '-p', String(DEV_PORT)], {
      cwd,
      env: getNextServerEnv(dbPath),
      stdio: 'pipe',
    });
  } else {
    const entry = getServerEntry();
    nextServer = spawn(process.execPath, [entry], {
      cwd: path.dirname(entry),
      env: getNextServerEnv(dbPath, DEV_PORT),
      stdio: 'pipe',
    });
  }

  nextServer.stdout.on('data', (data) => {
    console.log(`[next] ${data.toString().trim()}`);
  });

  nextServer.stderr.on('data', (data) => {
    console.error(`[next] ${data.toString().trim()}`);
  });

  nextServer.on('exit', (code) => {
    console.log(`[next] Server exited with code ${code}`);
    nextServer = null;
  });
}

function waitForServer(url, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.request(url, { method: 'HEAD' }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else if (retries < maxRetries) {
          retries++;
          setTimeout(check, 1000);
        } else {
          reject(new Error('Server did not become ready'));
        }
      });
      req.on('error', () => {
        if (retries < maxRetries) {
          retries++;
          setTimeout(check, 1000);
        } else {
          reject(new Error('Server did not become ready'));
        }
      });
      req.end();
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    title: 'Logistics Dashboard',
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL('http://localhost:' + DEV_PORT);
}

function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function killServer() {
  if (nextServer) {
    nextServer.kill('SIGTERM');
    nextServer = null;
  }
}

registerNotificationIPC(ipcMain);

app.whenReady().then(async () => {
  createAppMenu();

  const dbPath = getDbPath();
  try {
    await setupDatabase(dbPath);
  } catch (err) {
    console.error('[main] Database setup failed:', err.message);
    app.quit();
    return;
  }

  startNextServer();

  try {
    await waitForServer('http://localhost:' + DEV_PORT);
  } catch (err) {
    console.error('[main] Failed to start Next.js server:', err.message);
    app.quit();
    return;
  }

  createWindow();
  createTray(app, mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  killServer();
});
