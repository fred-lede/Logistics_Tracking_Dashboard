# FedEx Tracking Dashboard — Design Spec

## Overview

A single-user web dashboard for tracking FedEx (and future carrier) packages. Users add tracking numbers, the dashboard polls FedEx Sandbox API and displays current status, ETA, timeline of events, and exceptions.

## Tech Stack

- **Framework:** Next.js 14+ (App Router) + TypeScript
- **Database:** SQLite via Prisma ORM
- **Persistence:** Local SQLite file (survives browser clears)
- **Dev server:** `npm run dev` (Next.js built-in)
- **Package manager:** npm

## Project Structure

```
fedex-tracking-dashboard/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout (header, auto-refresh global state)
│   │   ├── page.tsx              # Dashboard: package grid + add form
│   │   ├── globals.css           # Tailwind + custom styles
│   │   └── api/
│   │       ├── packages/
│   │       │   ├── route.ts      # GET (list), POST (add)
│   │       │   └── [id]/
│   │       │       ├── route.ts  # DELETE (remove)
│   │       │       └── refresh/route.ts  # POST (trigger FedEx poll)
│   │       └── track/route.ts    # FedEx API proxy (server-only)
│   ├── lib/
│   │   ├── prisma.ts             # PrismaClient singleton
│   │   └── tracking/
│   │       ├── types.ts          # TrackingResult, TrackingEvent, TrackingProvider
│   │       ├── registry.ts       # getProvider(carrier) → TrackingProvider
│   │       └── providers/
│   │           └── fedex.ts      # FedExTrackingProvider (sandbox API)
│   └── components/
│       ├── add-package-form.tsx
│       ├── package-card.tsx
│       ├── package-timeline.tsx
│       ├── refresh-button.tsx
│       └── auto-refresh-toggle.tsx
├── .env.local                    # FEDEX_API_KEY, FEDEX_API_SECRET
└── package.json
```

## Data Model (Prisma)

```prisma
model Package {
  id            String   @id @default(cuid())
  trackingNumber String   @unique
  carrier       String   @default("fedex")
  nickname      String?
  status        String?
  eta           String?
  origin        String?
  destination   String?
  events        Json
  lastCheckedAt DateTime?
  autoRefresh   Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

`events` is a JSON array of `TrackingEvent` objects — kept denormalized for simple read/write. Can be normalized if carrier-agnostic event queries are needed later.

## Carrier Abstraction

```typescript
interface TrackingEvent {
  date: string
  status: string
  location: string
  description: string
}

interface TrackingResult {
  trackingNumber: string
  status: string
  eta: string | null
  origin: string | null
  destination: string | null
  events: TrackingEvent[]
}

interface TrackingProvider {
  track(trackingNumber: string): Promise<TrackingResult>
}
```

A registry maps carrier strings to providers:
- `getProvider('fedex')` → `FedExTrackingProvider`
- Future: `getProvider('ups')` → `UPSTrackingProvider`

All providers are server-side only (called from API routes).

## FedEx Sandbox API Integration

- Uses FedEx Track API v1 with OAuth 2.0 client credentials grant
- Credentials stored in `.env.local` (`FEDEX_API_KEY`, `FEDEX_API_SECRET`)
- All calls proxied through `/api/track/route.ts` and `/api/packages/[id]/refresh/route.ts`
- Access token cached and refreshed automatically per FedEx OAuth expiry
- Sandbox test tracking numbers used for development (e.g., `794798798798`)

## Dashboard UI

### Layout: Card Grid

Responsive CSS grid of package cards. Grid adjusts columns based on viewport width.

### Package Card (Detailed variant)

Each card shows:
- Tracking number (bold, monospace font)
- Carrier name/logo
- Nickname (optional — user-assigned label or PO/part number)
- Status badge with semantic color
- Origin → Destination (e.g., "Memphis, TN → Portland, OR")
- ETA prominently displayed
- Last checked timestamp
- Manual refresh button
- Auto-refresh toggle switch

### Status Badge Colors

| Status | Style |
|--------|-------|
| `DELIVERED` | Green solid |
| `IN_TRANSIT` | Blue solid |
| `PICKED_UP` | Gray solid |
| `ON_FEDEX_VEHICLE` | Orange solid |
| `EXCEPTION` | Red pulsing |
| `DELAYED` | Yellow solid |
| `RETURN_TO_SENDER` | Red solid |
| Unknown | Gray dashed |

### Card States

- **Normal** — shows current tracking info
- **Exception** — red banner across card top, exception description prominent in body
- **Loading** — skeleton shimmer while refreshing
- **Error** — "Unable to refresh" message with retry button, retains last known data
- **Empty dashboard** — illustration + "Add your first tracking number to get started"

### Expanded View

Clicking a card opens an inline expansion or modal showing:
- Full timeline of tracking events (date, location, status, description)
- Carrier-specific details

## Data Flow

### Add Package
1. User enters tracking number + optional nickname in form
2. Frontend POSTs to `/api/packages` with `{ trackingNumber, nickname }`
3. API route calls `FedExTrackingProvider.track(trackingNumber)`
4. Result (or initial empty state) saved to SQLite
5. Frontend re-renders grid

### Refresh Single Package
1. Frontend calls `POST /api/packages/[id]/refresh`
2. API route fetches fresh data from FedEx via provider
3. Updates DB row (status, events, ETA, lastCheckedAt)
4. Returns updated `TrackingResult`
5. Frontend updates card + fires toast if status changed

### Auto-Refresh
- Per-package toggle (default off)
- 60s interval via `setInterval` in `useEffect`
- Respects Page Visibility API — pauses when tab hidden
- Staggered start: package at index `i` starts after `i * 5s`
- Server enforces minimum 15s between refreshes (`lastCheckedAt` check)

### Remove Package
- Card has delete action
- Frontend calls `DELETE /api/packages/[id]`
- Server deletes DB row
- Frontend removes card

## Notification System

- Toast notifications for status changes (especially exceptions)
- Only fires when new poll result differs from previous status
- In-app only (no browser push). Uses a toast component at top-right.

## Refresh / Auto-Refresh Architecture

- `setInterval(60s)` per package when `autoRefresh=true`
- Shared interval registry prevents duplicate timers for same package
- Page Visibility API pauses all intervals when tab hidden
- Staggered start to avoid request burst
- Server-side rate gate: `lastCheckedAt < 15s ago` → 429 response
- Frontend retry logic: exponential backoff on rate-limit or network error

## Error Handling

- **API down:** Card retains last known good data, shows "Unable to refresh" with retry CTA
- **Rate limited:** Toast "Try again in X seconds", auto-retry after backoff
- **Invalid tracking number:** Inline form validation error with format guidance
- **Network error:** Card shows stale data + "Connection error" indicator
- **Server error:** Generic error toast, retry button on affected card

## Future Extensibility

Adding a new carrier requires:
1. Create `src/lib/tracking/providers/<carrier>.ts` implementing `TrackingProvider`
2. Register in `registry.ts`
3. Carrier is selectable when adding a tracking number

## Non-Goals (v1)

- Multi-user / authentication
- Browser push notifications
- Historical analytics / reporting
- Export functionality
- Webhook-based tracking updates (FedEx webhooks are more complex to set up)
