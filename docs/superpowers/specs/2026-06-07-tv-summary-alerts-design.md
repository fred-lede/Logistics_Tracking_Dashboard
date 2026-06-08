# TV Mode: Summary Overlay + Status Change Alerts — Design Spec

**Date:** 2026-06-07  
**Status:** Approved

## Overview

Add two features to TV mode:
1. **Summary overlay** — show daily/periodic summaries as a floating overlay
2. **Status change alerts** — glow animation + sound when a package status changes

Both features have user-configurable settings in the Settings page TV Mode section.

---

## 1. Summary Overlay

### API

New endpoint `GET /api/notifications/summary`:

- Returns the latest daily and periodic summary data
- Reads `NotificationSetting.lastDailySent` and `lastPeriodicSent` timestamps
- Fetches all packages with AI summaries (translated to current locale via cookie)
- Response shape:
```json
{
  "daily": {
    "date": "2026-06-07",
    "packages": [
      { "trackingNumber": "...", "nickname": "...", "status": "IN_TRANSIT", "destination": "...", "aiSummary": "..." }
    ]
  },
  "periodic": {
    "date": "2026-06-07 14:30:00",
    "interval": 2,
    "packages": [...]
  }
}
```
- Returns `null` for a section if no summary has been sent for that type yet

### TV Mode Integration

- `TvView` polls `/api/notifications/summary` every 60 seconds
- When a new summary is detected (by comparing `date` with previously shown summary), show overlay
- **Overlay UI:**
  - Full-screen semi-transparent overlay: `bg-black/70 backdrop-blur-sm`
  - Centered content card (max-width 60rem) with dark bg `#1e293b`
  - Header: "📦 Daily Summary" or "📊 Periodic Summary (every N hr)"
  - Package list: each row = status badge + nickname/tracking + AI summary
  - Auto-dismiss after 20 seconds
  - Manual dismiss: click overlay or press any key
- Track shown summaries via `useRef` to avoid re-showing:
  - `lastDailyShownDate` and `lastPeriodicShownDate` refs
- Overlay has z-index above card grid but below header clock

---

## 2. Status Change Alerts

### Detection

- `TvView` maintains a `useRef<Record<string, string>>` mapping package ID → previous status
- On each `packages` prop change, compare each package's current `status` with previous
- Collect set of changed package IDs
- If non-empty and TV mode is active:
  1. Trigger glow animation on changed cards
  2. Play sound if enabled

### Glow Animation

- CSS `@keyframes pulse-glow` animation added to `globals.css`
- Changed cards get a temporary class `tv-card--pulse`
- Animation: border-color pulses 3 times (0.6s per pulse = ~1.8s total), then stops
- Color matches the **new** status:
  - DELIVERED / PICKUP_AVAILABLE → `#22c55e` (green)
  - IN_TRANSIT / PICKED_UP / ON_FEDEX_VEHICLE → `#3b82f6` (blue)
  - EXCEPTION / RETURN_TO_SENDER → `#ef4444` (red)
  - DELAYED → `#eab308` (yellow)
  - Others → `#9ca3af` (gray)
- Implementation: `TvCard` accepts `pulse` boolean + `pulseColor` string props
- `TvView` clears pulse state after 2 seconds via `setTimeout`

### Sound

Two sound sources, user-selectable:

**Built-in sound file:**
- File: `public/sounds/ding.mp3` — short chime (~1 second)
- Playback: `new Audio('/sounds/ding.mp3').play()`

**Web Audio API synthesis:**
- 880Hz sine wave, 200ms duration, smooth envelope (10ms attack, 190ms decay)
- Code: `AudioContext` → `OscillatorNode` → `GainNode` → destination
- Only created once (lazy init), reused on subsequent plays

### Settings

localStorage keys (no DB migration needed):
- `tv-alert-glow` = `'true'` | `'false'` (default: `'true'`)
- `tv-alert-sound` = `'builtin'` | `'webaudio'` | `'off'` (default: `'builtin'`)

---

## 3. Settings UI

In Settings page, under existing TV Mode section (below Carousel Speed), add:

**光影提示 (Glow Alert)**
- Toggle switch, label: settings i18n key `tvGlowAlert`
- Default: on
- Stores to `tv-alert-glow` localStorage

**音效提示 (Sound Alert)**
- Dropdown select with 3 options:
  - 關閉 (Off) → value `'off'`
  - 內建音效 (Built-in) → value `'builtin'`
  - 合成音效 (Web Audio) → value `'webaudio'`
- Label: settings i18n key `tvSoundAlert`
- Default: `'builtin'`
- Stores to `tv-alert-sound` localStorage

---

## 4. i18n Keys

### Dashboard section (TV overlay)
| Key | en | zh-TW | zh-CN | es-MX |
|-----|-----|-------|-------|-------|
| `dailySummary` | Daily Summary | 每日摘要 | 每日摘要 | Resumen diario |
| `periodicSummary` | Periodic Summary | 週期性摘要 | 周期性摘要 | Resumen periódico |
| `everyNHours` | Every {n} hr | 每 {n} 小時 | 每 {n} 小时 | Cada {n} h |
| `noSummaryYet` | No summary available | 尚無摘要 | 尚无摘要 | Sin resumen disponible |
| `summaryDismiss` | Click or press any key to dismiss | 點擊或按任意鍵關閉 | 点击或按任意键关闭 | Clic o tecla para cerrar |

### Settings section (TV alerts)
| Key | en | zh-TW | zh-CN | es-MX |
|-----|-----|-------|-------|-------|
| `tvGlowAlert` | Glow Alert | 光影提示 | 光影提示 | Alerta luminosa |
| `tvGlowAlertHint` | Pulse animation when status changes | 狀態變化時脈動光影 | 状态变化时脉动光影 | Animación pulsante al cambiar estado |
| `tvSoundAlert` | Sound Alert | 音效提示 | 音效提示 | Alerta sonora |
| `tvSoundAlertHint` | Play sound when status changes | 狀態變化時播放音效 | 状态变化时播放音效 | Reproducir sonido al cambiar estado |
| `tvSoundOff` | Off | 關閉 | 关闭 | Desactivado |
| `tvSoundBuiltin` | Built-in Sound | 內建音效 | 内建音效 | Sonido integrado |
| `tvSoundWebAudio` | Web Audio Synthesis | 合成音效 | 合成音效 | Síntesis Web Audio |

---

## 5. File Changes

### New files
- `src/app/api/notifications/summary/route.ts` — summary API endpoint
- `src/components/tv/tv-summary-overlay.tsx` — summary overlay component
- `public/sounds/ding.mp3` — built-in chime sound

### Modified files
- `src/components/tv/tv-view.tsx` — add polling, overlay state, status change detection, sound playback
- `src/components/tv/tv-card.tsx` — add `pulse` + `pulseColor` props
- `src/app/globals.css` — add `@keyframes pulse-glow` + `.tv-card--pulse` class
- `src/components/settings/settings-page.tsx` — add glow/sound settings in TV Mode section
- `messages/en.json` — add i18n keys
- `messages/zh-TW.json` — add i18n keys
- `messages/zh-CN.json` — add i18n keys
- `messages/es-MX.json` — add i18n keys

---

## 6. Constraints

- No DB schema changes — all TV alert settings use localStorage
- Sound only plays in TV mode (not in normal dashboard)
- Sound requires user interaction first (browser autoplay policy) — handle gracefully: attempt play, catch `NotAllowedError`, show no error
- Glow animation uses CSS only (no JS animation frames) for performance
- Summary overlay auto-dismisses even if user doesn't interact (TV is zero-interaction display)
