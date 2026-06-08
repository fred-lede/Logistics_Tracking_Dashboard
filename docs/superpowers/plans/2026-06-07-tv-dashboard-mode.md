# TV Dashboard Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a TV/Kanban mode overlay to the FedEx dashboard, optimized for wall-mounted displays with dark theme, large fonts, auto-carousel, and live clock.

**Architecture:** TV mode is a full-screen overlay (`fixed inset-0 z-50`) toggled by a button in the dashboard header. It reuses the same `PackageData` from `/api/packages`. Four new components: `TvView` (overlay container), `TvCard` (package card), `TvStatsBar` (stats), `TvClock` (clock). Carousel pagination when >6 packages.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind CSS v4, next-intl

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/tv/tv-view.tsx` | Full-screen overlay: header with clock, stats bar, card grid, carousel, footer |
| Create | `src/components/tv/tv-card.tsx` | Single package card for TV mode (dark, large) |
| Create | `src/components/tv/tv-stats-bar.tsx` | Stats row for TV mode (large numbers, dark) |
| Create | `src/components/tv/tv-clock.tsx` | Real-time HH:MM:SS clock |
| Modify | `src/app/page.tsx` | Add `tvMode` state, TV button in header, render `TvView` overlay |
| Modify | `messages/en.json` | Add TV mode i18n keys |
| Modify | `messages/zh-TW.json` | Add TV mode i18n keys |
| Modify | `messages/zh-CN.json` | Add TV mode i18n keys |
| Modify | `messages/es-MX.json` | Add TV mode i18n keys |

---

### Task 1: i18n keys for TV mode

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add TV keys to en.json**

Add inside `"dashboard"` object, after `"statusDelayed"`:

```json
"tvMode": "TV Mode",
"exitTvMode": "Exit TV Mode",
"lastUpdated": "Last updated",
"pageXofY": "Page {current} of {total}"
```

- [ ] **Step 2: Add TV keys to zh-TW.json**

Add inside `"dashboard"` object:

```json
"tvMode": "TV 模式",
"exitTvMode": "退出 TV 模式",
"lastUpdated": "上次更新",
"pageXofY": "第 {current} 頁，共 {total} 頁"
```

- [ ] **Step 3: Add TV keys to zh-CN.json**

Add inside `"dashboard"` object:

```json
"tvMode": "TV 模式",
"exitTvMode": "退出 TV 模式",
"lastUpdated": "上次更新",
"pageXofY": "第 {current} 页，共 {total} 页"
```

- [ ] **Step 4: Add TV keys to es-MX.json**

Add inside `"dashboard"` object:

```json
"tvMode": "Modo TV",
"exitTvMode": "Salir del Modo TV",
"lastUpdated": "Última actualización",
"pageXofY": "Página {current} de {total}"
```

- [ ] **Step 5: Build to verify JSON is valid**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add messages/
git commit -m "feat(tv): add i18n keys for TV dashboard mode"
```

---

### Task 2: TvClock component

**Files:**
- Create: `src/components/tv/tv-clock.tsx`

- [ ] **Step 1: Create TvClock component**

```tsx
'use client'

import { useState, useEffect } from 'react'

export function TvClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="text-2xl font-semibold tabular-nums text-gray-400">
      {time}
    </span>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/
git commit -m "feat(tv): add TvClock component"
```

---

### Task 3: TvStatsBar component

**Files:**
- Create: `src/components/tv/tv-stats-bar.tsx`

- [ ] **Step 1: Create TvStatsBar component**

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

type DashboardLabelKey = 'allTracked' | 'statusDelivered' | 'statusInTransit' | 'statusException' | 'statusDelayed'

interface PackageData {
  id: string
  status: string | null
}

interface StatCard {
  key: string | null
  labelKey: DashboardLabelKey
  count: number
  color: string
}

const DELIVERED_STATUSES = ['DELIVERED', 'PICKUP_AVAILABLE']
const IN_TRANSIT_STATUSES = ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE']
const EXCEPTION_STATUSES = ['EXCEPTION', 'RETURN_TO_SENDER']

export function TvStatsBar({ packages }: { packages: PackageData[] }) {
  const dt = useTranslations('dashboard')

  const cards: StatCard[] = useMemo(() => [
    { key: null, labelKey: 'allTracked', count: packages.length, color: 'text-white' },
    { key: 'delivered', labelKey: 'statusDelivered', count: packages.filter((p) => DELIVERED_STATUSES.includes(p.status ?? '')).length, color: 'text-green-400' },
    { key: 'inTransit', labelKey: 'statusInTransit', count: packages.filter((p) => IN_TRANSIT_STATUSES.includes(p.status ?? '')).length, color: 'text-blue-400' },
    { key: 'exception', labelKey: 'statusException', count: packages.filter((p) => EXCEPTION_STATUSES.includes(p.status ?? '')).length, color: 'text-red-400' },
    { key: 'delayed', labelKey: 'statusDelayed', count: packages.filter((p) => p.status === 'DELAYED').length, color: 'text-yellow-400' },
  ], [packages])

  return (
    <div className="flex gap-2">
      {cards.map((card) => (
        <div
          key={card.key ?? '__all__'}
          className="flex flex-1 flex-col items-center rounded-xl bg-slate-800 px-3 py-3"
        >
          <span className={`text-4xl font-extrabold leading-none tabular-nums ${card.color}`}>
            {card.count}
          </span>
          <span className="mt-1 text-xs text-gray-400 uppercase tracking-wide">
            {dt(card.labelKey)}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/tv-stats-bar.tsx
git commit -m "feat(tv): add TvStatsBar component"
```

---

### Task 4: TvCard component

**Files:**
- Create: `src/components/tv/tv-card.tsx`

- [ ] **Step 1: Create TvCard component**

```tsx
'use client'

interface TvCardProps {
  trackingNumber: string
  nickname: string | null
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  aiSummary: string | null
  aiRootCause: string | null
}

const STATUS_BORDER: Record<string, string> = {
  DELIVERED: 'border-l-green-500',
  PICKUP_AVAILABLE: 'border-l-teal-500',
  IN_TRANSIT: 'border-l-blue-500',
  PICKED_UP: 'border-l-gray-400',
  ON_FEDEX_VEHICLE: 'border-l-orange-500',
  EXCEPTION: 'border-l-red-500',
  DELAYED: 'border-l-yellow-500',
  RETURN_TO_SENDER: 'border-l-red-600',
}

const STATUS_BG: Record<string, string> = {
  DELIVERED: 'bg-green-500 text-slate-900',
  PICKUP_AVAILABLE: 'bg-teal-500 text-slate-900',
  IN_TRANSIT: 'bg-blue-500 text-white',
  PICKED_UP: 'bg-gray-400 text-slate-900',
  ON_FEDEX_VEHICLE: 'bg-orange-500 text-white',
  EXCEPTION: 'bg-red-500 text-white',
  DELAYED: 'bg-yellow-500 text-slate-900',
  RETURN_TO_SENDER: 'bg-red-600 text-white',
}

function formatStatus(s: string | null): string {
  return s?.replace(/_/g, ' ') ?? 'UNKNOWN'
}

export function TvCard({ trackingNumber, nickname, status, origin, destination, eta, aiSummary, aiRootCause }: TvCardProps) {
  const borderClass = STATUS_BORDER[status ?? ''] ?? 'border-l-gray-500'
  const badgeClass = STATUS_BG[status ?? ''] ?? 'bg-gray-500 text-white'
  const isException = status === 'EXCEPTION' || status === 'DELAYED' || status === 'RETURN_TO_SENDER'

  return (
    <div className={`rounded-xl bg-slate-800 p-4 border-l-4 ${borderClass} flex flex-col gap-1.5`}>
      <div className="flex items-center justify-between">
        <span className={`rounded px-2.5 py-0.5 text-sm font-bold ${badgeClass}`}>
          {formatStatus(status)}
        </span>
        {eta && (
          <span className="text-sm text-gray-400">ETA: {eta}</span>
        )}
      </div>
      <div className="text-lg font-bold text-white truncate">
        {nickname || trackingNumber}
      </div>
      {!nickname && (
        <div className="text-xs text-gray-500 truncate">{trackingNumber}</div>
      )}
      {nickname && (
        <div className="text-xs text-gray-500 truncate">{trackingNumber}</div>
      )}
      <div className="text-sm text-gray-400">
        {origin || '?'} → {destination || '?'}
      </div>
      {aiSummary && (
        <div className={`mt-1 border-t border-slate-700 pt-1.5 text-sm ${isException ? 'text-red-300' : 'text-purple-300'}`}>
          {isException && aiRootCause ? `⚠ ${aiRootCause}` : `✨ ${aiSummary}`}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/tv-card.tsx
git commit -m "feat(tv): add TvCard component"
```

---

### Task 5: TvView component (overlay with carousel)

**Files:**
- Create: `src/components/tv/tv-view.tsx`

- [ ] **Step 1: Create TvView component**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { TvClock } from './tv-clock'
import { TvStatsBar } from './tv-stats-bar'
import { TvCard } from './tv-card'

interface PackageData {
  id: string
  trackingNumber: string
  nickname: string | null
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  aiSummary: string | null
  aiRootCause: string | null
}

const PER_PAGE = 6
const CAROUSEL_KEY = 'tv-carousel-interval'
const DEFAULT_INTERVAL = 15000

function getCarouselInterval(): number {
  const stored = localStorage.getItem(CAROUSEL_KEY)
  const ms = stored ? parseInt(stored, 10) : DEFAULT_INTERVAL
  return Number.isFinite(ms) && ms >= 5000 && ms <= 60000 ? ms : DEFAULT_INTERVAL
}

interface TvViewProps {
  packages: PackageData[]
  lastUpdated: string | null
  onExit: () => void
}

export function TvView({ packages, lastUpdated, onExit }: TvViewProps) {
  const dt = useTranslations('dashboard')
  const [page, setPage] = useState(0)
  const [paused, setPaused] = useState(false)

  const totalPages = Math.max(1, Math.ceil(packages.length / PER_PAGE))
  const interval = getCarouselInterval()

  const nextPage = useCallback(() => {
    setPage((p) => (p + 1) % totalPages)
  }, [totalPages])

  useEffect(() => {
    if (totalPages <= 1 || paused) return
    const id = setInterval(nextPage, interval)
    return () => clearInterval(id)
  }, [totalPages, interval, paused, nextPage])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onExit()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onExit])

  useEffect(() => {
    if (totalPages <= 1) {
      setPage(0)
    } else if (page >= totalPages) {
      setPage(0)
    }
  }, [totalPages, page])

  const pagePackages = packages.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const lastUpdatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--'

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900 flex flex-col p-6 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-white tracking-wide">FedEx Dashboard</h1>
        <div className="flex items-center gap-6">
          <TvClock />
          <button
            onClick={onExit}
            className="text-gray-500 hover:text-white text-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded"
            aria-label={dt('exitTvMode')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4">
        <TvStatsBar packages={packages} />
      </div>

      {/* Card Grid */}
      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 min-h-0">
        {pagePackages.map((pkg) => (
          <TvCard
            key={pkg.id}
            trackingNumber={pkg.trackingNumber}
            nickname={pkg.nickname}
            status={pkg.status}
            origin={pkg.origin}
            destination={pkg.destination}
            eta={pkg.eta}
            aiSummary={pkg.aiSummary}
            aiRootCause={pkg.aiRootCause}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
        <span>{dt('lastUpdated')}: {lastUpdatedStr}</span>
        {totalPages > 1 && (
          <span className="tabular-nums">
            {dt('pageXofY', { current: page + 1, total: totalPages })}
            {paused && <span className="ml-2 text-gray-600">⏸</span>}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/tv/tv-view.tsx
git commit -m "feat(tv): add TvView overlay with carousel and clock"
```

---

### Task 6: Integrate TV mode into DashboardPage

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add import and state**

In `src/app/page.tsx`, add import after existing imports:

```tsx
import { TvView } from '@/components/tv/tv-view'
```

Add state inside `DashboardPage`, after `const [statsFilter, setStatsFilter] = useState<string | null>(null)`:

```tsx
const [tvMode, setTvMode] = useState(false)
```

- [ ] **Step 2: Add TV button in header**

In the header area, inside the `<div className="flex items-center gap-3">` that contains settings link and LocaleSwitcher, add the TV button before the settings link:

```tsx
<button
  onClick={() => setTvMode(true)}
  className="text-sm text-gray-500 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 rounded"
  aria-label={dt('tvMode')}
>
  <span aria-hidden="true">📺</span> {dt('tvMode')}
</button>
```

- [ ] **Step 3: Add TvView overlay at end of return**

After the closing `</div>` of the main content, before the final `)`, add:

```tsx
{tvMode && (
  <TvView
    packages={packages}
    lastUpdated={packages.find((p) => p.lastCheckedAt)?.lastCheckedAt ?? null}
    onExit={() => setTvMode(false)}
  />
)}
```

- [ ] **Step 4: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(tv): integrate TV mode button and overlay into dashboard"
```

---

### Task 7: Carousel interval settings in settings page

**Files:**
- Modify: `src/app/settings/page.tsx` or `src/components/settings/settings-page.tsx`

- [ ] **Step 1: Add carousel interval control in settings page**

In `src/components/settings/settings-page.tsx`, add a new section after the Summary Settings block (after the periodic summary section), inside the main return:

```tsx
{/* TV Mode Settings */}
<div className="mb-6 rounded-xl border border-gray-200 p-5">
  <h2 className="font-semibold text-gray-900 mb-4">{st('tvModeSettings')}</h2>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-gray-500">{st('tvCarouselSpeed')}</p>
      <p className="text-xs text-gray-400">{st('tvCarouselSpeedHint')}</p>
    </div>
    <select
      id="tvCarouselSpeedSelect"
      value={(() => {
        const v = parseInt(localStorage.getItem('tv-carousel-interval') || '15000', 10)
        return Number.isFinite(v) ? v : 15000
      })()}
      onChange={(e) => {
        localStorage.setItem('tv-carousel-interval', e.target.value)
        window.dispatchEvent(new Event('storage'))
      }}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
    >
      <option value="5000">5s</option>
      <option value="10000">10s</option>
      <option value="15000">15s</option>
      <option value="20000">20s</option>
      <option value="30000">30s</option>
      <option value="60000">60s</option>
    </select>
  </div>
</div>
```

- [ ] **Step 2: Add i18n keys for TV settings**

Add to each locale's `"settings"` section:

**en.json:**
```json
"tvModeSettings": "TV Mode",
"tvCarouselSpeed": "Carousel Speed",
"tvCarouselSpeedHint": "How long each page stays before auto-advancing"
```

**zh-TW.json:**
```json
"tvModeSettings": "TV 模式",
"tvCarouselSpeed": "輪播速度",
"tvCarouselSpeedHint": "每頁停留多久後自動切換"
```

**zh-CN.json:**
```json
"tvModeSettings": "TV 模式",
"tvCarouselSpeed": "轮播速度",
"tvCarouselSpeedHint": "每页停留多久后自动切换"
```

**es-MX.json:**
```json
"tvModeSettings": "Modo TV",
"tvCarouselSpeed": "Velocidad de Carrusel",
"tvCarouselSpeedHint": "Cuánto tiempo se muestra cada página antes de avanzar"
```

- [ ] **Step 3: Build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/settings-page.tsx messages/
git commit -m "feat(tv): add carousel speed setting in settings page"
```

---

## Self-Review Checklist

- [x] Spec coverage: Each spec section maps to a task (i18n→T1, TvClock→T2, TvStatsBar→T3, TvCard→T4, TvView→T5, integration→T6, settings→T7)
- [x] Placeholder scan: No TBD/TODO/placeholder patterns
- [x] Type consistency: `PackageData` interface used consistently across TvView/TvCard/TvStatsBar
- [x] No new API routes needed (per spec)
- [x] No DB schema changes (per spec)
- [x] All 4 locales covered for every new i18n key
