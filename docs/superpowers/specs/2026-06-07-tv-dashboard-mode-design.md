# TV Dashboard Mode — Design Spec

**Date:** 2026-06-07
**Status:** Approved

## Goal

Add a TV/Kanban mode to the FedEx Tracking Dashboard, optimized for wall-mounted displays in warehouses and logistics centers. Remote-readable, high-contrast, zero-interaction display.

## User Requirements

- **Use case:** Wall-mounted TV in warehouse, team views from distance
- **Layout:** Stats bar top + card grid (3×2 = 6 cards/page)
- **Info displayed:** Package status cards, stats numbers, AI summaries, live clock + last update time
- **Pagination:** Dynamic — single page when ≤6 packages, auto-carousel when >6
- **Carousel interval:** User-configurable, default 15s, stored in localStorage
- **Entry point:** TV button in dashboard header

## Design

### Entry & Exit

- **Enter:** Click TV icon button in dashboard header area (next to settings link)
- **Exit:** ESC key or X button in top-right corner
- **Transition:** Full-screen overlay, no separate route (`/tv` not used)

### Visual Theme

- **Background:** `#0f172a` (slate-900) — dark, high-contrast, power-efficient on OLED
- **Cards:** `#1e293b` (slate-800) with 4px left border color-coded by status
- **Text:** White/gray-300 for primary, gray-400 for secondary, purple for AI summaries
- **Status badge colors:** Same as existing (green=delivered, blue=in-transit, red=exception, yellow=delayed, orange=on-vehicle)
- **Font sizes:** 2-3x larger than normal mode for remote readability

### Layout (Option A: Stats Bar + Card Grid)

```
┌─────────────────────────────────────────────────────────┐
│ FedEx Dashboard                          14:32:05    ✕  │
├─────────┬─────────┬─────────┬─────────┬─────────────────┤
│   12    │    5    │    4    │    2    │       1         │
│  ALL    │  DELV   │ TRANSIT │  EXCP   │    DELAYED      │
├─────────┴─────────┴─────────┴─────────┴─────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ ■ DELIVERED│ │ ■ IN TRANSIT│ │ ■ EXCEPTION│              │
│ │ 7947…798 │ │ 7947…799 │ │ 7947…800 │                  │
│ │ TPA→LAX  │ │ TPE→SFO  │ │ ICN→JFK  │                  │
│ │ ETA:06/05│ │ ETA:06/10│ │ ETA: —   │                  │
│ │ ✨ AI... │ │ ✨ AI... │ │ ⚠ AI... │                  │
│ └──────────┘ └──────────┘ └──────────┘                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ ■ DELAYED │ │ ■ DELIVERED│ │ ■ ON VEH. │              │
│ │ 7947…801 │ │ 7947…802 │ │ 7947…803 │                  │
│ │ HKG→DFW  │ │ NRT→ORD  │ │ SIN→MIA  │                  │
│ │ ETA:06/12│ │ ETA:06/03│ │ ETA:06/08│                  │
│ └──────────┘ └──────────┘ └──────────┘                  │
│           Last updated: 14:30 · Page 1/2               │
└─────────────────────────────────────────────────────────┘
```

### Card Content

Each card shows:
1. **Status badge** — color-coded, left-aligned
2. **Tracking number** — bold, large (nickname if available, tracking# as secondary)
3. **Route** — Origin → Destination
4. **ETA** — right-aligned
5. **AI summary** — purple text below divider, red for exception/root cause
6. **Left border** — 4px solid color matching status

### Stats Bar

Same 5 stat cards as current StatsBar, but:
- Background `#1e293b`
- Number in 36px bold
- Label in 12px gray uppercase

### Clock & Footer

- **Clock:** Real-time digital clock (HH:MM:SS), top-right, updates every second
- **Footer:** "Last updated: HH:MM · Page X/Y" (or "Page 1/1" when no carousel)
- **Update indicator:** Subtle pulse animation when data refreshes

### Carousel Logic

- **PerPage:** 6 cards (3 columns × 2 rows)
- **Total pages:** `Math.ceil(packages.length / 6)`
- **When totalPages > 1:** Auto-advance every `carouselInterval` ms (default 15000)
- **When totalPages ≤ 1:** No carousel, single page
- **Wrap:** After last page, return to page 1
- **Pause on hover:** Optional — pause carousel when mouse is over the TV view (for debugging)

### Settings

- **Carousel interval:** Configurable via settings, stored in localStorage key `tv-carousel-interval`
- Default: 15000 (15s)
- Range: 5s–60s

### Data Flow

- Reuses existing `/api/packages` endpoint — no new API
- Auto-refresh interval: 60s (same as current dashboard)
- Uses same `PackageData` interface
- TV mode state managed locally in `DashboardPage` component

### What TV Mode Hides

- Search bar
- Add package form
- Delete/refresh buttons on cards
- Auto-refresh toggle
- Settings link (only X/ESC to exit)
- StatsBar filter interaction (stats are display-only)

### i18n

- All labels use existing translation keys (stats labels, status names)
- New keys needed: `tvMode`, `exitTvMode`, `tvCarouselSpeed`, `lastUpdated`, `pageXofY`
- All 4 locales (en, zh-TW, zh-CN, es-MX)

### Components to Create

1. **`TvView`** — Full-screen overlay component with all TV mode rendering
2. **`TvCard`** — Single package card for TV mode (large, dark theme)
3. **`TvStatsBar`** — Stats bar for TV mode (larger numbers, dark cards)
4. **`TvClock`** — Real-time clock component

### No Changes To

- Database schema (no new tables/columns)
- API routes (reuse existing)
- Existing dashboard components (TV mode is a separate overlay)

## Implementation Notes

- TV mode is a React state toggle in `DashboardPage`
- `TvView` renders as a fixed full-screen overlay (`fixed inset-0 z-50`)
- Carousel uses `useEffect` with `setInterval` + cleanup
- Clock uses `useEffect` with `setInterval(1000)`
- Carousel interval from `localStorage.getItem('tv-carousel-interval')` with fallback to 15000
- Page Visibility API already pauses auto-refresh in parent — no extra handling needed
