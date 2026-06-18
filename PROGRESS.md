# Progress Log

## v0.3.2 — 2026-06-18

- Replaced `whatsapp-web.js` + `puppeteer` (~300MB Chromium) with `@whiskeysockets/baileys` (WebSocket, zero browser deps)
- Removed `@aws-sdk/client-s3` (unused transitive dep)
- Cleaned up `serverExternalPackages` in `next.config.ts`
- Session storage: `.wwjs-sessions/` → `.baileys-sessions/` (JSON files, no Chrome profile)
- QR auth via Baileys `connection.update` event instead of Puppeteer browser launch
- JID format: `phoneNumber@s.whatsapp.net` (internal `toJid()`)
- All 89 tests pass, build clean

## v0.3.3 — 2026-06-18

### Bug Fixes
- **AI summary not displaying** — Fixed `dev:next` using `--webpack` which broke `sql.js` WASM loading (Turbopack ESM handles `createRequire` correctly). The sql.js module failed to initialize, causing 500 errors on all API routes. Removed `--webpack` flag from dev script.
- **Startup crash** — Wrapped `initNotifications()` in `try/catch` in `instrumentation.ts` to prevent scheduler init failure from crashing server.
- **Empty summary saving** — Added `.trim()` guard in `analyzePackage()`: if LLM returns empty/whitespace-only summary, only `aiAnalyzedAt` is updated (to rate-limit retries) without overwriting the existing summary.
- **aiDelayRisk object parse** — Added `safeParseJSONObj()` in `GET /api/packages` to parse `aiDelayRisk` from JSON string to object (was incorrectly left as raw string, would crash `PackageCard` component on access).
- Added `sql.js` to `serverExternalPackages` in `next.config.ts` for Turbopack compatibility.
