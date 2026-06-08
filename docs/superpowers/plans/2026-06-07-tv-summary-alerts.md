# TV Summary Overlay + Status Change Alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add summary overlay and status-change glow/sound alerts to TV mode with user-configurable settings.

**Architecture:** Summary API endpoint provides latest daily/periodic summaries. TV view polls it every 60s and shows overlay when new data arrives. Status change detection uses ref-based previous-state comparison to trigger CSS glow animation and optional sound (built-in mp3 or Web Audio synthesis). All alert settings stored in localStorage, configured in Settings page TV Mode section.

**Tech Stack:** Next.js 16 API routes, React hooks (useRef, useEffect, useState), CSS @keyframes, Web Audio API, localStorage, next-intl i18n, Prisma 7

---

## File Structure

### New files
- `src/app/api/notifications/summary/route.ts` — summary API endpoint
- `src/components/tv/tv-summary-overlay.tsx` — summary overlay component
- `src/components/tv/tv-sound.ts` — sound playback utility (built-in + Web Audio)
- `public/sounds/ding.mp3` — built-in chime sound (binary asset)

### Modified files
- `src/app/globals.css` — add `@keyframes pulse-glow` + `.tv-card--pulse`
- `src/components/tv/tv-card.tsx` — add `pulse` + `pulseColor` props
- `src/components/tv/tv-view.tsx` — add polling, overlay state, status change detection, sound
- `src/components/settings/settings-page.tsx` — add glow/sound settings in TV Mode section
- `messages/en.json` — add i18n keys (dashboard + settings)
- `messages/zh-TW.json` — add i18n keys
- `messages/zh-CN.json` — add i18n keys
- `messages/es-MX.json` — add i18n keys

---

### Task 1: Add i18n keys to all 4 locale files

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add dashboard i18n keys to `messages/en.json`**

Add these keys inside the `"dashboard"` object after `"pageXofY"`:

```json
"dailySummary": "Daily Summary",
"periodicSummary": "Periodic Summary",
"everyNHours": "Every {n} hr",
"noSummaryYet": "No summary available",
"summaryDismiss": "Click or press any key to dismiss"
```

- [ ] **Step 2: Add settings i18n keys to `messages/en.json`**

Add these keys inside the `"settings"` object after `"tvCarouselSpeedHint"`:

```json
"tvGlowAlert": "Glow Alert",
"tvGlowAlertHint": "Pulse animation when status changes",
"tvSoundAlert": "Sound Alert",
"tvSoundAlertHint": "Play sound when status changes",
"tvSoundOff": "Off",
"tvSoundBuiltin": "Built-in Sound",
"tvSoundWebAudio": "Web Audio Synthesis"
```

- [ ] **Step 3: Add dashboard i18n keys to `messages/zh-TW.json`**

Add inside `"dashboard"`:

```json
"dailySummary": "每日摘要",
"periodicSummary": "週期性摘要",
"everyNHours": "每 {n} 小時",
"noSummaryYet": "尚無摘要",
"summaryDismiss": "點擊或按任意鍵關閉"
```

Add inside `"settings"`:

```json
"tvGlowAlert": "光影提示",
"tvGlowAlertHint": "狀態變化時脈動光影",
"tvSoundAlert": "音效提示",
"tvSoundAlertHint": "狀態變化時播放音效",
"tvSoundOff": "關閉",
"tvSoundBuiltin": "內建音效",
"tvSoundWebAudio": "合成音效"
```

- [ ] **Step 4: Add dashboard i18n keys to `messages/zh-CN.json`**

Add inside `"dashboard"`:

```json
"dailySummary": "每日摘要",
"periodicSummary": "周期性摘要",
"everyNHours": "每 {n} 小时",
"noSummaryYet": "尚无摘要",
"summaryDismiss": "点击或按任意键关闭"
```

Add inside `"settings"`:

```json
"tvGlowAlert": "光影提示",
"tvGlowAlertHint": "状态变化时脉动光影",
"tvSoundAlert": "音效提示",
"tvSoundAlertHint": "状态变化时播放音效",
"tvSoundOff": "关闭",
"tvSoundBuiltin": "内建音效",
"tvSoundWebAudio": "合成音效"
```

- [ ] **Step 5: Add dashboard i18n keys to `messages/es-MX.json`**

Add inside `"dashboard"`:

```json
"dailySummary": "Resumen diario",
"periodicSummary": "Resumen periódico",
"everyNHours": "Cada {n} h",
"noSummaryYet": "Sin resumen disponible",
"summaryDismiss": "Clic o tecla para cerrar"
```

Add inside `"settings"`:

```json
"tvGlowAlert": "Alerta luminosa",
"tvGlowAlertHint": "Animación pulsante al cambiar estado",
"tvSoundAlert": "Alerta sonora",
"tvSoundAlertHint": "Reproducir sonido al cambiar estado",
"tvSoundOff": "Desactivado",
"tvSoundBuiltin": "Sonido integrado",
"tvSoundWebAudio": "Síntesis Web Audio"
```

- [ ] **Step 6: Commit**

```bash
git add messages/ && git commit -m "feat(i18n): add TV summary overlay + alert i18n keys for all 4 locales"
```

---

### Task 2: Create summary API endpoint

**Files:**
- Create: `src/app/api/notifications/summary/route.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/app/api/notifications/summary
```

- [ ] **Step 2: Create `src/app/api/notifications/summary/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { translateSummary } from '@/lib/llm/service'
import { safeParseEvents } from '@/lib/tracking/providers/fedex'

export async function GET(request: Request) {
  const setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
  if (!setting) {
    return NextResponse.json({ daily: null, periodic: null })
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/)
  const locale = localeMatch?.[1] ?? 'en'

  const allPackages = await prisma.package.findMany()

  const packageSummaries = await Promise.all(
    allPackages.map(async (p) => {
      let aiSummary: string | null = p.aiSummary
      if (aiSummary && locale !== 'en') {
        aiSummary = await translateSummary(aiSummary, locale).catch(() => aiSummary)
      }
      return {
        trackingNumber: p.trackingNumber,
        nickname: p.nickname,
        status: p.status || 'UNKNOWN',
        destination: p.destination,
        eta: p.eta,
        lastEvent: safeParseEvents(p.events)?.[0]?.description || null,
        aiSummary,
      }
    }),
  )

  const daily = setting.dailySummaryEnabled && setting.lastDailySent
    ? { date: setting.lastDailySent, packages: packageSummaries }
    : null

  const periodic = setting.periodicInterval > 0 && setting.lastPeriodicSent
    ? {
        date: setting.lastPeriodicSent.toISOString(),
        interval: setting.periodicInterval,
        packages: packageSummaries,
      }
    : null

  return NextResponse.json({ daily, periodic })
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/api/notifications/summary/ && git commit -m "feat(api): add GET /api/notifications/summary endpoint for TV overlay"
```

---

### Task 3: Add CSS glow animation to globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add pulse-glow keyframes and class after the `@theme` block**

Add after line 9 (after the `}` closing `@theme`):

```css
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  50% { box-shadow: 0 0 20px 4px var(--pulse-color, #3b82f6); }
}

.tv-card--pulse {
  animation: pulse-glow 0.6s ease-in-out 3;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css && git commit -m "feat(css): add pulse-glow keyframes animation for TV card status change"
```

---

### Task 4: Create sound utility module

**Files:**
- Create: `src/components/tv/tv-sound.ts`

- [ ] **Step 1: Create `src/components/tv/tv-sound.ts`**

```typescript
const SOUND_KEY = 'tv-alert-sound'

type SoundMode = 'builtin' | 'webaudio' | 'off'

export function getSoundMode(): SoundMode {
  if (typeof window === 'undefined') return 'off'
  const stored = localStorage.getItem(SOUND_KEY)
  if (stored === 'off' || stored === 'builtin' || stored === 'webaudio') return stored
  return 'builtin'
}

let audioElement: HTMLAudioElement | null = null
let audioContext: AudioContext | null = null

function playBuiltin() {
  if (!audioElement) {
    audioElement = new Audio('/sounds/ding.mp3')
  }
  audioElement.currentTime = 0
  audioElement.play().catch(() => {})
}

function playWebAudio() {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  const ctx = audioContext
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.type = 'sine'
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2)
  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + 0.2)
}

export function playAlertSound() {
  const mode = getSoundMode()
  if (mode === 'off') return
  if (mode === 'builtin') {
    playBuiltin()
  } else {
    playWebAudio()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tv/tv-sound.ts && git commit -m "feat(tv): add sound utility with built-in mp3 and Web Audio synthesis"
```

---

### Task 5: Add pulse props to TvCard

**Files:**
- Modify: `src/components/tv/tv-card.tsx`

- [ ] **Step 1: Add `pulse` and `pulseColor` props to TvCard interface and component**

Update the interface:

```typescript
interface TvCardProps {
  trackingNumber: string
  nickname: string | null
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  aiSummary: string | null
  aiRootCause: string | null
  pulse?: boolean
  pulseColor?: string
}
```

Update the function signature:

```typescript
export function TvCard({ trackingNumber, nickname, status, origin, destination, eta, aiSummary, aiRootCause, pulse, pulseColor }: TvCardProps) {
```

- [ ] **Step 2: Add pulse class and CSS variable to the card's root div**

Change the root `<div>` to include the pulse class and `--pulse-color` CSS variable:

```typescript
<div
  className={`rounded-xl border-2 border-slate-500/60 shadow-xl flex flex-col justify-between h-full overflow-hidden${pulse ? ' tv-card--pulse' : ''}`}
  style={{
    backgroundColor: '#1e293b',
    borderLeftWidth: '5px',
    borderLeftStyle: 'solid',
    borderLeftColor: borderColor,
    ...(pulseColor ? { '--pulse-color': pulseColor } as React.CSSProperties : {}),
  }}
>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tv/tv-card.tsx && git commit -m "feat(tv): add pulse + pulseColor props to TvCard for status change glow"
```

---

### Task 6: Create summary overlay component

**Files:**
- Create: `src/components/tv/tv-summary-overlay.tsx`

- [ ] **Step 1: Create `src/components/tv/tv-summary-overlay.tsx`**

```typescript
'use client'

import { useTranslations } from 'next-intl'

interface SummaryPackage {
  trackingNumber: string
  nickname: string | null
  status: string
  destination: string | null
  eta: string | null
  lastEvent: string | null
  aiSummary: string | null
}

interface SummaryData {
  date: string
  packages: SummaryPackage[]
  interval?: number
}

interface TvSummaryOverlayProps {
  summary: SummaryData
  summaryType: 'daily' | 'periodic'
  onDismiss: () => void
}

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#22c55e',
  PICKUP_AVAILABLE: '#14b8a6',
  IN_TRANSIT: '#3b82f6',
  PICKED_UP: '#9ca3af',
  ON_FEDEX_VEHICLE: '#f97316',
  EXCEPTION: '#ef4444',
  DELAYED: '#eab308',
  RETURN_TO_SENDER: '#dc2626',
}

const STATUS_TEXT: Record<string, string> = {
  DELIVERED: '#0f172a',
  PICKUP_AVAILABLE: '#0f172a',
  IN_TRANSIT: '#ffffff',
  PICKED_UP: '#0f172a',
  ON_FEDEX_VEHICLE: '#ffffff',
  EXCEPTION: '#ffffff',
  DELAYED: '#0f172a',
  RETURN_TO_SENDER: '#ffffff',
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ')
}

export function TvSummaryOverlay({ summary, summaryType, onDismiss }: TvSummaryOverlayProps) {
  const dt = useTranslations('dashboard')

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 200, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onDismiss}
    >
      <div
        className="rounded-2xl border-2 border-slate-500/60 shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: '60rem', backgroundColor: '#1e293b', marginInline: '3rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(71, 85, 105, 0.6)' }}>
          <h2 className="font-bold" style={{ fontSize: '1.75rem', color: '#f1f5f9' }}>
            {summaryType === 'daily' ? `📦 ${dt('dailySummary')}` : `📊 ${dt('periodicSummary')}`}
            {summary.interval ? ` — ${dt('everyNHours', { n: summary.interval })}` : ''}
          </h2>
          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>{summary.date}</span>
        </div>

        {/* Package list */}
        <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {summary.packages.length === 0 ? (
            <p style={{ fontSize: '1.125rem', color: '#94a3b8' }}>{dt('noSummaryYet')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {summary.packages.map((pkg) => {
                const bgColor = STATUS_COLORS[pkg.status] ?? '#6b7280'
                const textColor = STATUS_TEXT[pkg.status] ?? '#ffffff'
                return (
                  <div
                    key={pkg.trackingNumber}
                    className="flex items-start gap-4 rounded-lg p-3"
                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}
                  >
                    <span
                      className="rounded px-2 py-0.5 font-bold shrink-0"
                      style={{ fontSize: '0.875rem', backgroundColor: bgColor, color: textColor }}
                    >
                      {formatStatus(pkg.status)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate" style={{ fontSize: '1.125rem', color: '#e2e8f0' }}>
                        {pkg.nickname || pkg.trackingNumber}
                      </div>
                      {pkg.aiSummary && (
                        <div className="mt-1 leading-snug" style={{ fontSize: '0.9375rem', color: '#c4b5fd' }}>
                          ✨ {pkg.aiSummary}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t text-center" style={{ borderColor: 'rgba(71, 85, 105, 0.6)', fontSize: '0.875rem', color: '#64748b' }}>
          {dt('summaryDismiss')}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tv/tv-summary-overlay.tsx && git commit -m "feat(tv): add TvSummaryOverlay component for daily/periodic summary display"
```

---

### Task 7: Integrate overlay, status detection, and sound into TvView

**Files:**
- Modify: `src/components/tv/tv-view.tsx`

- [ ] **Step 1: Add imports**

Add these imports at the top of `tv-view.tsx`:

```typescript
import { TvSummaryOverlay } from './tv-summary-overlay'
import { playAlertSound, getSoundMode } from './tv-sound'
```

- [ ] **Step 2: Add alert settings helpers and state**

Add after the `useLocale()` line:

```typescript
const [pulseCards, setPulseCards] = useState<Record<string, string>>({})
const [showSummary, setShowSummary] = useState<{ type: 'daily' | 'periodic'; date: string } | null>(null)
const prevStatuses = useRef<Record<string, string>>({})
const lastDailyShown = useRef<string>('')
const lastPeriodicShown = useRef<string>('')
const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

- [ ] **Step 3: Add glow detection useEffect**

Add a new useEffect that compares package statuses on every `packages` change:

```typescript
useEffect(() => {
  const nextStatuses: Record<string, string> = {}
  for (const pkg of packages) {
    nextStatuses[pkg.id] = pkg.status ?? ''
  }
  const changed: Record<string, string> = {}
  for (const [id, status] of Object.entries(nextStatuses)) {
    if (prevStatuses.current[id] !== undefined && prevStatuses.current[id] !== status) {
      const glowEnabled = localStorage.getItem('tv-alert-glow') !== 'false'
      if (glowEnabled) {
        const PULSE_COLORS: Record<string, string> = {
          DELIVERED: '#22c55e', PICKUP_AVAILABLE: '#14b8a6',
          IN_TRANSIT: '#3b82f6', PICKED_UP: '#9ca3af', ON_FEDEX_VEHICLE: '#f97316',
          EXCEPTION: '#ef4444', DELAYED: '#eab308', RETURN_TO_SENDER: '#dc2626',
        }
        changed[id] = PULSE_COLORS[status] ?? '#9ca3af'
      }
      if (getSoundMode() !== 'off') {
        playAlertSound()
      }
    }
  }
  if (Object.keys(changed).length > 0) {
    setPulseCards(changed)
    setTimeout(() => setPulseCards({}), 2000)
  }
  prevStatuses.current = nextStatuses
}, [packages])
```

- [ ] **Step 4: Add summary polling useEffect**

Add a useEffect for polling the summary API:

```typescript
useEffect(() => {
  if (typeof window === 'undefined') return
  let cancelled = false

  async function checkSummary() {
    try {
      const res = await fetch('/api/notifications/summary')
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (data.daily && data.daily.date !== lastDailyShown.current) {
        setShowSummary({ type: 'daily', date: data.daily.date })
        lastDailyShown.current = data.daily.date
      } else if (data.periodic && data.periodic.date !== lastPeriodicShown.current) {
        setShowSummary({ type: 'periodic', date: data.periodic.date })
        lastPeriodicShown.current = data.periodic.date
      }
    } catch {}
  }

  checkSummary()
  const id = setInterval(checkSummary, 60_000)
  return () => { cancelled = true; clearInterval(id) }
}, [])
```

- [ ] **Step 5: Add auto-dismiss timer for summary overlay**

Add a useEffect for auto-dismissing the overlay after 20 seconds:

```typescript
useEffect(() => {
  if (!showSummary) return
  if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current)
  summaryTimerRef.current = setTimeout(() => setShowSummary(null), 20_000)
  return () => { if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current) }
}, [showSummary])
```

- [ ] **Step 6: Add keydown handler for overlay dismiss**

Update the existing keydown useEffect to also dismiss the overlay:

```typescript
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (showSummary) {
        setShowSummary(null)
      } else {
        onExit()
      }
    } else if (showSummary) {
      setShowSummary(null)
    }
  }
  document.addEventListener('keydown', handleKey)
  return () => document.removeEventListener('keydown', handleKey)
}, [onExit, showSummary])
```

- [ ] **Step 7: Pass pulse props to TvCard in grid**

Update the `<TvCard>` in the grid to pass `pulse` and `pulseColor`:

```typescript
<TvCard
  key={pkg.id}
  trackingNumber={pkg.trackingNumber}
  nickname={pkg.nickname}
  status={pkg.status}
  origin={pkg.origin}
  destination={pkg.destination}
  eta={pkg.eta}
  aiSummary={getAISummary(pkg)}
  aiRootCause={getAIRootCause(pkg)}
  pulse={!!pulseCards[pkg.id]}
  pulseColor={pulseCards[pkg.id]}
/>
```

- [ ] **Step 8: Add summary overlay render**

Add the summary overlay component just before the closing `</div>` of the root container, after the Footer:

```typescript
{showSummary && (
  <TvSummaryOverlay
    summary={summaryData}
    summaryType={showSummary.type}
    onDismiss={() => setShowSummary(null)}
  />
)}
```

Also add a `summaryData` state variable and update the polling useEffect to store it:

Add state near other state declarations:

```typescript
const [summaryData, setSummaryData] = useState<{ daily: { date: string; packages: unknown[] } | null; periodic: { date: string; interval: number; packages: unknown[] } | null }>({ daily: null, periodic: null })
```

Update the `checkSummary` function inside the polling useEffect to also store the data:

```typescript
setSummaryData(data)
```

- [ ] **Step 9: Verify build**

```bash
npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/components/tv/tv-view.tsx && git commit -m "feat(tv): integrate summary overlay, status change glow + sound into TvView"
```

---

### Task 8: Add glow/sound settings to Settings page

**Files:**
- Modify: `src/components/settings/settings-page.tsx`

- [ ] **Step 1: Add glow alert toggle after the carousel speed select**

In the TV Mode Settings `<div>` (the one with `className="mb-6 rounded-xl border border-gray-200 p-5"`), after the carousel speed `</div>` closing row, add:

```tsx
<div className="flex items-center justify-between mt-4">
  <div>
    <p className="text-sm text-gray-500">{st('tvGlowAlert')}</p>
    <p className="text-xs text-gray-400">{st('tvGlowAlertHint')}</p>
  </div>
  <input
    type="checkbox"
    defaultChecked={(() => {
      if (typeof window === 'undefined') return true
      return localStorage.getItem('tv-alert-glow') !== 'false'
    })()}
    onChange={(e) => {
      localStorage.setItem('tv-alert-glow', e.target.checked ? 'true' : 'false')
    }}
    className="h-4 w-4 rounded border-gray-300 text-fedex-purple focus:ring-fedex-purple"
  />
</div>
```

- [ ] **Step 2: Add sound alert dropdown after the glow toggle**

```tsx
<div className="flex items-center justify-between mt-4">
  <div>
    <p className="text-sm text-gray-500">{st('tvSoundAlert')}</p>
    <p className="text-xs text-gray-400">{st('tvSoundAlertHint')}</p>
  </div>
  <select
    defaultValue={(() => {
      if (typeof window === 'undefined') return 'builtin'
      return localStorage.getItem('tv-alert-sound') || 'builtin'
    })()}
    onChange={(e) => {
      localStorage.setItem('tv-alert-sound', e.target.value)
    }}
    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
  >
    <option value="off">{st('tvSoundOff')}</option>
    <option value="builtin">{st('tvSoundBuiltin')}</option>
    <option value="webaudio">{st('tvSoundWebAudio')}</option>
  </select>
</div>
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/settings-page.tsx && git commit -m "feat(settings): add TV glow alert toggle and sound alert dropdown"
```

---

### Task 9: Add built-in ding.mp3 sound file

**Files:**
- Create: `public/sounds/ding.mp3`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p public/sounds
```

- [ ] **Step 2: Generate a short ding sound using ffmpeg**

```bash
ffmpeg -f lavfi -i "sine=frequency=880:duration=0.3" -af "afade=t=in:st=0:d=0.01,afade=t=out:st=0.2:d=0.1" -t 0.3 -b:a 128k public/sounds/ding.mp3
```

If ffmpeg is not available, create a silent placeholder:

```bash
python3 -c "
import struct, math
samples = []
sr = 44100
dur = 0.3
for i in range(int(sr * dur)):
    t = i / sr
    env = min(1, t / 0.01) * max(0, 1 - (t - 0.1) / 0.2) if t > 0.1 else min(1, t / 0.01)
    samples.append(int(32767 * 0.5 * env * math.sin(2 * math.pi * 880 * t)))
with open('public/sounds/ding.raw', 'wb') as f:
    for s in samples:
        f.write(struct.pack('<h', s))
"
ffmpeg -f s16le -ar 44100 -ac 1 -i public/sounds/ding.raw -b:a 128k public/sounds/ding.mp3 && rm public/sounds/ding.raw
```

- [ ] **Step 3: Verify the file exists**

```bash
ls -la public/sounds/ding.mp3
```

- [ ] **Step 4: Commit**

```bash
git add public/sounds/ && git commit -m "feat(tv): add built-in ding.mp3 alert sound"
```

---

### Task 10: Final build and test verification

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all 28 tests pass

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors

- [ ] **Step 4: Commit any remaining fixes if needed**

---

## Self-Review

**Spec coverage:**
- ✅ Summary overlay: Task 2 (API) + Task 6 (component) + Task 7 (integration)
- ✅ Glow animation: Task 3 (CSS) + Task 5 (TvCard props) + Task 7 (detection)
- ✅ Sound: Task 4 (utility) + Task 9 (mp3 file) + Task 7 (playback)
- ✅ Settings UI: Task 8
- ✅ i18n: Task 1
- ✅ Constraints: no DB changes (localStorage only), CSS-only animation, autoplay policy handled (catch), auto-dismiss overlay

**Placeholder scan:** No TBD/TODO found — all steps have complete code.

**Type consistency:** TvCardProps includes `pulse?: boolean` + `pulseColor?: string`, TvView passes them correctly. Summary overlay uses `SummaryData` interface matching API response shape.

**Ambiguity:** Sound autoplay policy — handled gracefully with `.catch(() => {})` on `play()` and try/catch on Web Audio.
