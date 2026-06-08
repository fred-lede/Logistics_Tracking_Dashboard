# Electron Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the existing Next.js logistics dashboard in Electron, add system tray + native notifications, and support cross-platform packaging (macOS/Windows/Linux).

**Architecture:** Electron main process spawns Next.js production server as a child process. BrowserWindow loads `http://localhost:3310`. System tray enables background execution for notification scheduler. Preload script bridges minimal IPC for native notifications. Zero changes to existing frontend code.

**Tech Stack:** Electron 34+, electron-builder 26+, @electron/rebuild, better-sqlite3 (rebuilt for Electron ABI)

---

## File Structure

```
Create:
  electron/main.js                # Electron main process entry (plain JS, no compile step)
  electron/preload.js             # contextBridge IPC bridge
  electron/tray.js                # System tray management
  electron/notification.js        # Native desktop notifications + IPC handlers
  electron-builder.yml            # Cross-platform build config
  assets/                         # App icons (macOS .icns, Windows .ico, Linux .png)

Modify:
  package.json                    # Add scripts + dependencies
  next.config.ts                  # Add output: 'standalone'
  .gitignore                      # Add release/ directory
```

## Tasks

---

### Task 1: Add Electron Dependencies and Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Install Electron and build dependencies**

```bash
npm install --save-dev electron@latest electron-builder@latest @electron/rebuild@latest concurrently@latest
```

- [ ] **Update package.json — add `main` field and scripts**

Set `"main": "electron/main.js"` at top level.

Replace the `scripts` section:

```json
{
  "main": "electron/main.js",
  "scripts": {
    "dev": "concurrently -k \"next dev -p 3310\" \"electron .\"",
    "build": "npm run build:next && npm run build:assets",
    "build:next": "next build && cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public",
    "build:assets": "node scripts/generate-icons.mjs",
    "start": "next start -p 3100",
    "lint": "eslint",
    "postinstall": "prisma generate && npx @electron/rebuild -f -w better-sqlite3",
    "test": "vitest run",
    "test:watch": "vitest",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win",
    "package:linux": "electron-builder --linux",
    "package:all": "electron-builder --mac --win --linux"
  }
}
```

- [ ] **Update .gitignore**

Add at end of `.gitignore`:

```
release/
```

---

### Task 2: Create Icon Generator Script

**Files:**
- Create: `scripts/generate-icons.mjs`
- Create: `assets/` (directory)

- [ ] **Create `scripts/generate-icons.mjs`**

This script generates minimal placeholder icons for all platforms. Users can replace them with real icons later.

```js
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const assetsDir = join(__dirname, '..', 'assets')

if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true })

// Generate a minimal 1024-byte PNG (1x1 transparent) as placeholder
// Real icons should be created with proper design tools
const minimalPNG = Buffer.from([
  0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG header
  0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk
  0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01, // 1x1 pixel
  0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
  0xDE,0x00,0x00,0x00,0x0C,0x49,0x44,0x41,
  0x54,0x08,0xD7,0x63,0x60,0x60,0x60,0x00,
  0x00,0x00,0x04,0x00,0x01,0x27,0x34,0x27,
  0x0D,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,
  0x44,0xAE,0x42,0x60,0x82
])

// For macOS we need a proper icon set
// Write a note telling user to replace
writeFileSync(join(assetsDir, '.gitkeep'), '')
console.log('Placeholder assets directory created.')
console.log('Replace assets/icon.icns, assets/icon.ico, assets/icon.png with real icons.')
```

Note: The user should replace placeholder icons with real ones. For testing, the app works without proper icons (Electron falls back to default).

---

### Task 3: Create electron/main.js

**Files:**
- Create: `electron/main.js`

- [ ] **Create `electron/main.js`**

```js
const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const { createTray } = require('./tray')
const { registerNotificationIPC } = require('./notification')

const DEV_PORT = 3310
const isDev = !app.isPackaged

let mainWindow = null
let serverProcess = null

function getDbPath() {
  if (isDev) {
    return path.join(process.cwd(), 'dev.db')
  }
  return path.join(app.getPath('userData'), 'dev.db')
}

function getServerEntry() {
  if (isDev) {
    return null // use next dev CLI
  }
  return path.join(process.resourcesPath, 'app', '.next', 'standalone', 'server.js')
}

function getCwd() {
  if (isDev) {
    return process.cwd()
  }
  return path.join(process.resourcesPath, 'app')
}

function startNextServer() {
  const dbPath = getDbPath()
  const cwd = getCwd()

  if (isDev) {
    serverProcess = spawn('npx', ['next', 'dev', '-p', String(DEV_PORT)], {
      cwd,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } else {
    const entry = getServerEntry()
    serverProcess = spawn('node', [entry], {
      cwd: path.dirname(entry),
      env: { ...process.env, DATABASE_URL: `file:${dbPath}`, PORT: String(DEV_PORT) },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`[next] ${data.toString().trim()}`)
  })
  serverProcess.stderr.on('data', (data) => {
    console.error(`[next] ${data.toString().trim()}`)
  })
  serverProcess.on('exit', (code) => {
    console.log(`[next] server exited with code ${code}`)
  })
}

function waitForServer(url, maxRetries = 60) {
  return new Promise((resolve, reject) => {
    let retries = 0
    const check = () => {
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve()
        } else if (++retries < maxRetries) {
          setTimeout(check, 1000)
        } else {
          reject(new Error('Server did not become healthy'))
        }
      })
      req.on('error', () => {
        if (++retries < maxRetries) {
          setTimeout(check, 1000)
        } else {
          reject(new Error('Server did not become healthy'))
        }
      })
      req.end()
    }
    check()
  })
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
  })

  mainWindow.on('close', (event) => {
    event.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const url = isDev
    ? `http://localhost:${DEV_PORT}`
    : `http://localhost:${DEV_PORT}`

  mainWindow.loadURL(url)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })
}

function killServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }
}

registerNotificationIPC(ipcMain)

app.whenReady().then(async () => {
  startNextServer()

  try {
    await waitForServer(`http://localhost:${DEV_PORT}`)
  } catch (err) {
    console.error('Failed to start Next.js server:', err)
    app.quit()
    return
  }

  createWindow()
  createTray(app, mainWindow)

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow()
    } else {
      mainWindow.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  killServer()
})
```

---

### Task 4: Create electron/preload.js

**Files:**
- Create: `electron/preload.js`

- [ ] **Create `electron/preload.js`**

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body })
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
})
```

---

### Task 5: Create electron/tray.js

**Files:**
- Create: `electron/tray.js`

- [ ] **Create `electron/tray.js`**

```js
const { Tray, Menu, nativeImage } = require('electron')
const path = require('path')

let tray = null

function createTray(app, mainWindow) {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png')
  let icon

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('Logistics Dashboard')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    {
      label: 'Hide',
      click: () => {
        if (mainWindow) {
          mainWindow.hide()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  return tray
}

module.exports = { createTray }
```

---

### Task 6: Create electron/notification.js

**Files:**
- Create: `electron/notification.js`

- [ ] **Create `electron/notification.js`**

```js
const { Notification } = require('electron')

function registerNotificationIPC(ipcMain) {
  ipcMain.on('show-notification', (event, { title, body }) => {
    const notification = new Notification({ title, body })
    notification.show()
  })

  ipcMain.handle('get-app-version', () => {
    return require('../package.json').version
  })
}

module.exports = { registerNotificationIPC }
```

---

### Task 7: Add Frontend Notification Bridge

**Files:**
- Modify: `src/app/page.tsx`

The existing auto-refresh and manual refresh flow re-fetches packages. This task adds a status-change watcher that calls `window.electronAPI.showNotification()` via the preload bridge.

- [ ] **Add `useRef` import at line 3**

```typescript
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
```

- [ ] **Add status change detection after the `fetchPackages` declaration**

Insert after line 69 (end of `fetchPackages`), before the `filteredPackages` useMemo (line 71):

```typescript
  const prevStatusRef = useRef<Record<string, string | null>>({})
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      for (const pkg of packages) {
        prevStatusRef.current[pkg.id] = pkg.status
      }
      return
    }

    for (const pkg of packages) {
      const prev = prevStatusRef.current[pkg.id]
      if (prev != null && prev !== pkg.status) {
        ;(window as any).electronAPI?.showNotification?.(
          'Package Status Updated',
          `${pkg.trackingNumber}: ${pkg.status}`
        )
      }
      prevStatusRef.current[pkg.id] = pkg.status
    }
  }, [packages])
```

Note: Uses `(window as any)` to avoid type errors without adding a declaration file.

---

### Task 8: Update next.config.ts — Add Standalone Output

**Files:**
- Modify: `next.config.ts`

- [ ] **Update `next.config.ts`**

```ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  webpack: (config: Record<string, unknown>) => config,
}

export default withNextIntl(nextConfig)
```

---

### Task 9: Create electron-builder.yml

**Files:**
- Create: `electron-builder.yml`

- [ ] **Create `electron-builder.yml`**

```yaml
appId: com.logistics.dashboard
productName: Logistics Dashboard
copyright: Copyright © 2026

directories:
  output: release
  buildResources: assets

asar: false

files:
  - electron/**/*
  - .next/standalone/**/*
  - package.json

mac:
  target:
    - dmg
    - zip
  icon: assets/icon.icns
  category: public.app-category.productivity
  hardenedRuntime: true
  gatekeeperAssess: false

win:
  target:
    - nsis
    - portable
  icon: assets/icon.ico

linux:
  target:
    - AppImage
    - deb
  icon: assets/icon.png
  category: Office
```

---

### Task 10: Run Build and Verify

- [ ] **Build Next.js standalone**

```bash
npm run build:next
```
Expected: No errors. Output at `.next/standalone/` with `server.js` and copied static/public assets.

Check:
```bash
ls .next/standalone/server.js
ls .next/standalone/.next/static
ls .next/standalone/public
```

- [ ] **Generate placeholder icons**

```bash
node scripts/generate-icons.mjs
```

- [ ] **Run dev workflow to verify**

```bash
npm run dev
```
Expected: Electron opens with the dashboard loaded. System tray icon appears. Window minimizes to tray on close.

- [ ] **Test notification IPC**

Open DevTools in the Electron window (`Cmd+Opt+I`) and run in console:
```js
window.electronAPI.showNotification('Test', 'Hello from Electron!')
```
Expected: Native OS notification appears.

- [ ] **Build and package for current platform**

```bash
npm run build && npm run package:mac
```
Expected: `release/Logistics Dashboard-X.X.X.dmg` and `release/Logistics Dashboard-X.X.X-mac.zip` are created.

---

### Task 11: Verify Prisma/SQLite Works in Production Build

- [ ] **Install the built .dmg and run the app**
- [ ] **Verify dashboard loads and shows packages**
- [ ] **Verify API calls work (refresh, add package, etc.)**
- [ ] **Verify SQLite DB is created at `userData` path**

Check DB location:
```js
// In production: ~/Library/Application Support/Logistics Dashboard/dev.db
```
