# Electron Migration Design

**Date:** 2026-06-08
**Status:** Design

## Overview

Migrate the existing Next.js Logistics Tracking Dashboard to an Electron desktop application, compilable for macOS, Windows, and Linux. The approach is **Embedded Next.js Server** — Electron's main process launches the Next.js server, and a `BrowserWindow` loads it via `localhost`. Zero changes to existing frontend code.

## Architecture

```
Electron Main Process
├── App Lifecycle Management
├── System Tray (background execution)
├── IPC Handlers (native notifications)
└── child_process: Next.js Server (:3310)
    ├── API routes (unchanged)
    ├── Prisma + SQLite
    ├── Notification scheduler (background)
    └── LLM providers

BrowserWindow (Renderer)
└── Loads http://localhost:3310
    ├── Next.js UI (unchanged)
    └── contextBridge IPC bridge
```

## File Structure

New/added files only:

```
electron/
├── main.ts              # Main process entry
├── preload.ts           # contextBridge IPC bridge
├── tray.ts              # System tray management
├── notification.ts      # Native desktop notifications
├── tsconfig.json        # Electron TypeScript config
assets/
├── icon.icns            # macOS icon
├── icon.ico             # Windows icon
└── icon.png             # Linux icon
electron-builder.yml     # Cross-platform build config
```

## Development Workflow

```bash
# Development
npm run dev
# → concurrently: next dev -p 3310 + electron .

# Production build
npm run build            # next build + tsc electron/
npm run package:mac      # electron-builder --mac
npm run package:win      # electron-builder --win
npm run package:linux    # electron-builder --linux
npm run package:all      # electron-builder --mac --win --linux
```

## System Tray

- Close button hides window to tray (does not quit)
- Tray icon with platform-appropriate format
- Left-click toggles window show/hide
- Right-click context menu: Show / Hide / Quit
- Background process keeps notification scheduler running

## Native Desktop Notifications

- IPC bridge via `contextBridge.exposeInMainWorld('electronAPI', ...)`
- Renderer calls `window.electronAPI.showNotification({ title, body })`
- Triggered on package status change (alongside existing Teams/Telegram/WeChat/WhatsApp)
- Uses Electron `Notification` API

## Native Module Strategy

`better-sqlite3` must be rebuilt for Electron's Node.js ABI:

- `@electron/rebuild` runs in `postinstall` to rebuild `better-sqlite3`
- `electron-builder` config includes native module handling

## SQLite Database Location

| Environment | Path |
|---|---|
| Development | `./dev.db` (unchanged) |
| Production | `app.getPath('userData')/dev.db` |

## Runtime Environment Variables

Electron main process sets environment variables before spawning Next.js server:

- `DATABASE_URL`: Set to `file:${app.getPath('userData')}/dev.db` in production
- `FEDEX_API_KEY`, `FEDEX_API_SECRET`: Passed through from `.env` or user's actual env
- Next.js config must read `DATABASE_URL` at runtime (already uses env var via `prisma.config.ts`)

## Prisma Client Bundling

- Prisma client is generated at `node_modules/.prisma/client/` during `postinstall`
- Next.js standalone output includes the generated client in its bundled `node_modules`
- The `prisma/` schema directory is included in the package for reference only (not needed at runtime if client is pre-generated)
- No `prisma generate` needed at production launch

## Security

| Setting | Value |
|---|---|
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| Preload | `electron/preload.ts` — minimal API surface |
| CSP | Inherited from Next.js |

## electron-builder Configuration

```yaml
appId: com.logistics.dashboard
productName: Logistics Dashboard
directories:
  output: release
files:
  - .next/standalone/**     # Next.js standalone server + all assets
  - electron/**             # Main process JS
  - package.json
  - prisma/**               # Schema (for DB creation at runtime)
extraResources:
  - from: node_modules/better-sqlite3/build
    to: better-sqlite3/build
mac:
  target: [dmg, zip]
  icon: assets/icon.icns
  category: public.app-category.productivity
win:
  target: [nsis, portable]
  icon: assets/icon.ico
linux:
  target: [AppImage, deb]
  icon: assets/icon.png
  category: Office
```

## Next.js Server Startup

Electron main process spawns Next.js as a child process:

```
spawn('node', [serverEntry], { cwd: appDir })
→ poll http://localhost:3310/api/packages until 200
→ then create BrowserWindow
→ on app 'will-quit': kill child process
```

## `next.config.ts` Change

Add `output: 'standalone'` to make the build self-contained for packaging:

```ts
const nextConfig: NextConfig = {
  output: 'standalone',  // required for Electron packaging
  webpack: (config: Record<string, unknown>) => config,
}
```

Standalone output produces `.next/standalone/` with:
- A `server.js` entry point with embedded minimal `node_modules`
- Internal `.next/` server files at `.next/standalone/.next/`

**Post-build copy step required** (added to build script):
```
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
```

Run with: `node .next/standalone/server.js` — no dependency on `next` CLI.

## Production Build Flow

1. `next build` — builds Next.js with `output: 'standalone'`
2. `cp -R .next/static .next/standalone/.next/static && cp -R public .next/standalone/public`
3. `tsc -p electron/tsconfig.json` — compiles `electron/*.ts` to JS
4. `electron-builder` — packages into platform distributable
   - Files: `.next/standalone/**`, `electron/**`, `prisma/**`, `package.json`
   - `extraResources`: `better-sqlite3` native binary
   - On first run, copies SQLite DB from resources to `app.getPath('userData')`

## Out of Scope (v1)

- Auto-update (electron-updater)
- Deep link / protocol handler
- Touch bar / native menu bar integration (macOS)
- Installer customization

## Implementation Order

1. Add Electron dependencies + configuration files
2. Create `electron/main.ts` (app lifecycle, window, Next.js server management)
3. Create `electron/preload.ts` (contextBridge)
4. Create `electron/tray.ts` (system tray)
5. Create `electron/notification.ts` (native notifications + IPC)
6. Create `electron/tsconfig.json`
7. Create `electron-builder.yml`
8. Create asset icons
9. Update `package.json` scripts + postinstall
10. Rebuild better-sqlite3 for Electron
11. Test dev workflow (macOS)
12. Test build workflow (macOS)
13. Test on Windows and Linux
