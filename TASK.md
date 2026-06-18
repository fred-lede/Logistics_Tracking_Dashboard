# Task State

## Completed
- DHL Express Tracking Integration: New DHLTrackingProvider (Unified API), carrier config/settings, carrier selector in add-package form, 10 new tests, i18n
- Added carrier badge (FedEx/DHL) to package card + TV card UI
- TV card scroll area minHeight increased 3.5rem → 5rem
- Added author "Fred Wang" to package.json
- New app icon: package box + tracking radar theme (all platforms: PNG, .icns, .ico, favicon)
- Redesigned logo: bolder package box + orange location pin for better recognition at all sizes
- TV card AI summary scrolling: janky setInterval → smooth requestAnimationFrame marquee (55px/s, 2s pause at end)
- Custom About dialog in Electron showing author + version + description
- Added author "Fred Wang" to electron-builder.yml copyright
- UI Review: Audited all frontend components against Web Interface Guidelines
- High P1: Added aria-label to all icon buttons (delete, edit, timeline toggle, dialog close, toast)
- High P2: Added role=switch + aria-checked to all 5 toggle buttons (settings page x2, channel card, channel dialog)
- High P3: Added role=dialog + aria-modal + focus trap + Escape key to channel-dialog
- High P4: Added aria-live=polite to toast container
- High P5: Changed toast div onClick → button element
- High P6: Added confirm() for destructive actions (delete package, delete channel, delete contact)
- High P7: Added skip-to-main-content link in layout + id=main-content on pages
- Med P8: Passed locale to toLocaleDateString/toLocaleString in package-card
- Med P9: Translated getRelativeTime() + timeline toggle strings via i18n
- Med P10: Fixed '...' → '…' (ellipsis character) in refresh-button, channel-card, add-channel-form
- Med P11: Added spellCheck={false} + autoComplete='off' to tracking number input
- Low P12: Added tabular-nums to numbers (stats bar counts, package counts, tracking numbers, relative time)
- Low P13: Added focus-visible:ring-* to all interactive elements across all components
- Low P14: Fixed transition-all → transition-[opacity,transform] in toast.tsx
- Low P15: Added prefers-reduced-motion media query to globals.css
- Low P16: Added overscroll-behavior-contain to channel-dialog backdrop
- Low P17: Added meta themeColor + aria-hidden=true to decorative icons (📦🔧📍⚙🅣✈💬🆆)
- Med P18: Fixed error close button label from ct('success') → ct('dismiss')
- Added new i18n keys to all 4 locale files (en, zh-TW, zh-CN, es-MX)
- LLM Enhancement feature: schema, providers, service, API routes, UI, i18n
- Per-contact locale translation: contact→channel→LLMSetting fallback chain
- TV Dashboard mode: TvClock, TvStatsBar, TvCard, TvView overlay with carousel
- TV mode integration: button in dashboard header, full-screen overlay toggle
- TV carousel speed setting in settings page
- TV i18n keys in all 4 locales (dashboard + settings sections)
- Build passes, 89/89 tests pass
- WhatsApp Web (whatsapp-web.js + Puppeteer) notification provider — replaced by Baileys in v0.3.2
- WHATSAPP-WEB MIGRATION v0.3.2: Replaced whatsapp-web.js (Puppeteer ~300MB) with @whiskeysockets/baileys (WebSocket, zero browser deps)
  - Removed whatsapp-web.js, puppeteer, @aws-sdk/client-s3 dependencies
  - Rewrote provider using Baileys `makeWASocket` + `useMultiFileAuthState` for session persistence
  - QR flow via `connection.update` event (no browser launch)
  - Session stored in `.baileys-sessions/` as JSON files (no Chrome user profile)
  - JID format: `phoneNumber@s.whatsapp.net` (handled internally by `toJid()`)
  - Cleaned up `serverExternalPackages` in next.config.ts
  - All 89 tests pass, build clean

## v0.3.3 — AI Summary Bug Fixes
- **Root Cause**: `dev:next` used `--webpack` flag → sql.js WASM failed to load (Turbopack ESM handles `createRequire` correctly) → API returned 500 or stale data
- **Fix**: Removed `--webpack` flag, added `sql.js` to `serverExternalPackages`, wrapped `initNotifications()` in try/catch
- **Guard**: `analyzePackage()` now trims LLM output and rejects empty summaries (only updates `aiAnalyzedAt` to prevent retry spam)
- **aiDelayRisk**: Parsed from JSON string to object in GET /api/packages (was raw string, would crash PackageCard)
- 89 tests pass, build clean

## In Progress
- (none)

## Pending
- (none)
