# Progress Log

## v0.3.2 — 2026-06-18

- Replaced `whatsapp-web.js` + `puppeteer` (~300MB Chromium) with `@whiskeysockets/baileys` (WebSocket, zero browser deps)
- Removed `@aws-sdk/client-s3` (unused transitive dep)
- Cleaned up `serverExternalPackages` in `next.config.ts`
- Session storage: `.wwjs-sessions/` → `.baileys-sessions/` (JSON files, no Chrome profile)
- QR auth via Baileys `connection.update` event instead of Puppeteer browser launch
- JID format: `phoneNumber@s.whatsapp.net` (internal `toJid()`)
- All 89 tests pass, build clean
