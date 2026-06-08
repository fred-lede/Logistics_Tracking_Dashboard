# Logistics Tracking Dashboard — Agent Guide

## Project intent

A multi-carrier package tracking dashboard with multi-channel notification system. Fully implemented.

## Current state

v2 complete — single-user dashboard with:
- Package tracking via carrier APIs (FedEx Sandbox)
- Multi-channel notifications (Teams/Telegram/WeChat/WhatsApp)
- Daily and periodic summary notifications
- i18n in 4 languages (en/zh-TW/zh-CN/es-MX)
- Settings page for notification channel management

## Tech stack

- **Framework:** Next.js 16.2.7 (App Router, `'use client'` where needed)
- **Language:** TypeScript (strict)
- **Database:** SQLite via Prisma 7 (`@prisma/client` + `@prisma/adapter-better-sqlite3`)
- **Styling:** Tailwind CSS v4 (CSS-based config with `@theme`)
- **i18n:** next-intl (cookie-based locale, no URL prefix)
- **Package manager:** npm
- **Test:** Vitest + React Testing Library

## Key conventions

- No secrets in code — use env vars (`FEDEX_API_KEY`, `FEDEX_API_SECRET`)
- Server data access via `prisma.ts` singleton (Prisma 7 adapter pattern)
- Carrier provider abstraction via `TrackingProvider` interface + registry
- Notification provider abstraction via `NotificationProvider` interface + registry
- Status codes: DELIVERED, IN_TRANSIT, PICKED_UP, ON_FEDEX_VEHICLE, EXCEPTION, DELAYED, RETURN_TO_SENDER, UNKNOWN
- FedEx Sandbox test number: `794798798798`
- Events stored as JSON string; use `safeParseEvents()` to handle bad data
- API route params: `Promise<{ id: string }>` pattern (Next.js 16 await params)
- Rate gate: 15s minimum between refreshes (429 response)
- Auto-refresh: 60s interval, per-package toggle, Page Visibility API pause
- i18n: cookie `locale`, 4 locales (`en`/`zh-TW`/`zh-CN`/`es-MX`), proxy.ts sets default
- For Prisma schema changes: `npx prisma migrate dev --name <name>`
- DB browser: `npx prisma studio`

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (port 3100) |
| `npm run build` | TypeScript check + production build |
| `npm test` | Run Vitest suite (28 tests) |
| `npm run lint` | Lint check |
| `npx prisma studio` | DB browser |
| `npx prisma migrate dev --name <name>` | New migration |
| `npm run dev -- -p 3100` | Start with explicit port |

## Critical: Node.js version mismatch

The user's shell runs **Node 20** (nvm, ABI 115). My bash tool runs **Node 22** (Hermes, ABI 127).
`better-sqlite3` is a native module — the binary at `node_modules/better-sqlite3/build/Release/better_sqlite3.node` is ABI-locked to one Node major.
**If the binary was compiled for the wrong Node version, rebuild it:**

```bash
PATH="/Users/fred/.nvm/versions/node/v20.20.2/bin:$PATH" \
  npx node-gyp rebuild --directory=node_modules/better-sqlite3 --release
```

After rebuilding, verify: `node -e "require('better-sqlite3'); console.log('OK')"`

## Project structure

```
src/
  app/
    layout.tsx           # Root layout (IntlProvider, ToastProvider, metadata)
    page.tsx             # Dashboard page (grid, empty state, refresh, search)
    globals.css          # Tailwind v4 config + theme tokens
    proxy.ts             # Next.js 16 proxy — sets default locale cookie
    settings/
      page.tsx           # Notification settings page
    api/
      packages/
        route.ts         # GET list, POST create
        [id]/
          route.ts       # DELETE package
          refresh/
            route.ts     # POST refresh (rate-gated, sends notifications)
      notifications/
        settings/route.ts    # GET/PUT global notification settings
        channels/route.ts    # GET list, POST create channels
        channels/[id]/route.ts  # GET/PUT/DELETE single channel
        contacts/route.ts    # POST create contact
        contacts/[id]/route.ts   # PUT/DELETE contact
  components/
    add-package-form.tsx     # Form with validation, 409 handling
    auto-refresh-toggle.tsx  # Per-package auto-refresh checkbox
    locale-switcher.tsx      # Language switcher dropdown
    package-card.tsx         # Status badge, timeline, exception banner, part numbers
    refresh-button.tsx       # Manual refresh button
    toast.tsx                # ToastProvider, useToast hook
    settings/
      settings-page.tsx      # Notification settings page
      channel-card.tsx        # Channel display card with toggle + contacts
      channel-dialog.tsx      # Channel edit modal dialog
      add-channel-form.tsx   # New channel form
  i18n/
    request.ts           # next-intl config (cookie-based locale)
  lib/
    prisma.ts            # PrismaClient singleton (Prisma 7 adapter)
    utils.ts             # parseJsonArray helper
    tracking/
      types.ts           # TrackingProvider interface, TrackingResult, TrackingEvent
      registry.ts        # Provider registry (registerProvider/getProvider)
      providers/
        fedex.ts         # FedEx Sandbox OAuth + Track API (safeParseEvents)
    notification/
      index.ts           # Barrel export
      types.ts           # NotificationProvider interface, StatusChangeMessage|SummaryMessage
      registry.ts        # NotificationProviderRegistry singleton
      service.ts         # sendNotifications orchestrator
      scheduler.ts       # Daily + periodic summary scheduler
      init.ts            # Provider registration + scheduler startup
      providers/
        teams.ts         # Teams (webhook + Graph API)
        telegram.ts      # Telegram Bot API
        wechat.ts        # WeCom group robot webhook
        whatsapp.ts      # WhatsApp Cloud API
  generated/prisma/      # Prisma Client (gitignored)
messages/
  en.json                # English translations
  zh-TW.json             # Traditional Chinese
  zh-CN.json             # Simplified Chinese
  es-MX.json             # Spanish (Mexico)
prisma/
  schema.prisma          # Package + NotificationSetting/Channel/Contact/Log models
  migrations/            # DB migrations
docs/superpowers/
  specs/                 # Design specifications
  plans/                 # Implementation plans
```
