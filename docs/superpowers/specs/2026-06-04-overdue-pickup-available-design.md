# Overdue Warning + PICKUP_AVAILABLE Status Design

**Date:** 2026-06-04
**Status:** Approved

## Problem

1. **ETA overdue with no visual cue** — When a package's ETA has passed but status is still IN_TRANSIT/DELAYED/etc., the card only shows "預計送達: 2023/5/19" with no indication the date has passed.
2. **PICKUP_AVAILABLE mapped to UNKNOWN** — FedEx returns `PICKUP_AVAILABLE` when a package has arrived at the destination but hasn't been picked up. Currently `mapFedExStatus` maps this to `UNKNOWN`, losing the semantic meaning.
3. **No notifications for either case** — Overdue packages and pickup-available packages don't trigger notifications.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Overdue handling | UI-layer computation (not a new status code) | Overdue is derived from ETA vs now, not a FedEx status. Avoids conflating local computation with carrier-reported states. |
| PICKUP_AVAILABLE | New status code in the 8-value system (now 9) | It's a legitimate FedEx status that deserves its own badge and i18n label. |
| Stats Bar grouping | PICKUP_AVAILABLE grouped under "Delivered" card | Package has physically arrived; logically belongs with delivered packages. |
| Overdue notification | Triggered on refresh when ETA passed and status ∉ {DELIVERED, PICKUP_AVAILABLE} | Leverages existing notification infrastructure; only fires when data is fresh. |
| PICKUP_AVAILABLE notification | Existing status change mechanism | No new code needed — IN_TRANSIT → PICKUP_AVAILABLE triggers the same path as any other status change. |

## 1. Overdue Warning (UI Layer)

### Computation

In `package-card.tsx`, compute overdue inline:

```ts
const now = new Date()
const etaDate = pkg.eta ? new Date(pkg.eta) : null
const isOverdue = etaDate && etaDate < now && pkg.status !== 'DELIVERED' && pkg.status !== 'PICKUP_AVAILABLE'
const overdueDays = isOverdue ? Math.max(1, Math.ceil((now.getTime() - etaDate.getTime()) / 86400000)) : 0
```

### Display

Replace the current ETA line:

```tsx
// Current:
{pkg.eta && (
  <div className="text-sm font-medium text-gray-700 mb-2">
    {pkg.status === 'DELIVERED' ? `${t('status')}: ` : `${t('eta')}: `}
    {new Date(pkg.eta).toLocaleDateString()}
  </div>
)}

// New:
{pkg.eta && (
  <div className={`text-sm font-medium mb-2 ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
    {pkg.status === 'DELIVERED' || pkg.status === 'PICKUP_AVAILABLE'
      ? `${t('status')}: `
      : isOverdue
        ? t('overdueWarning', { days: overdueDays, date: new Date(pkg.eta).toLocaleDateString() })
        : `${t('eta')}: `}
    {(!isOverdue || pkg.status === 'DELIVERED' || pkg.status === 'PICKUP_AVAILABLE') &&
      new Date(pkg.eta).toLocaleDateString()}
  </div>
)}
```

**Overdue text format:** `⚠ 逾期 X 天 — 原預計 2023/5/19`

The overdue warning replaces the ETA label entirely (no redundant date shown twice). For DELIVERED/PICKUP_AVAILABLE, the existing "Status: date" pattern is preserved.

### Overdue Notification

In `/api/packages/[id]/refresh/route.ts`, after status change notification, add overdue detection:

```ts
// After the existing status change notification block:
const etaDate = updated.eta ? new Date(updated.eta) : null
const isOverdue = etaDate
  && etaDate < new Date()
  && updated.status !== 'DELIVERED'
  && updated.status !== 'PICKUP_AVAILABLE'

if (isOverdue) {
  const overdueDays = Math.max(1, Math.ceil(
    (Date.now() - etaDate.getTime()) / 86400000
  ))
  const message: OverdueMessage = {
    type: 'overdue',
    packageId: updated.id,
    trackingNumber: updated.trackingNumber,
    nickname: updated.nickname,
    status: updated.status!,
    eta: updated.eta,
    overdueDays,
  }
  await sendNotifications(message)
}
```

**Notification message format** (per provider): "📦 包裹 794798798798 已逾期 3 天（目前狀態：IN_TRANSIT），原預計送達 2023/5/19"

**Deduplication:** The refresh API is rate-gated (15s minimum). Overdue notifications fire on every successful refresh while overdue. This is acceptable for a single-user dashboard — the rate gate prevents spam. If desired, a future optimization could track `lastOverdueNotifiedAt` in the Package model, but that's out of scope.

## 2. PICKUP_AVAILABLE Status Code

### Status Mapping

`src/lib/tracking/providers/fedex.ts` — change line 128:

```ts
// Before:
PICKUP_AVAILABLE: 'UNKNOWN',

// After:
PICKUP_AVAILABLE: 'PICKUP_AVAILABLE',
```

### Badge Styling

In `package-card.tsx`:

```ts
// statusBadgeClass
PICKUP_AVAILABLE: 'bg-teal-500 text-white',

// statusLabelKey
PICKUP_AVAILABLE: 'statusPickupAvailable',

// statusBadgeDot
PICKUP_AVAILABLE: 'bg-teal-500',
```

### Stats Bar

In `src/components/stats-bar.tsx`, update the Delivered card predicate to include PICKUP_AVAILABLE:

```ts
// Before:
delivered: (p) => p.status === 'DELIVERED',

// After:
delivered: (p) => p.status === 'DELIVERED' || p.status === 'PICKUP_AVAILABLE',
```

`IN_TRANSIT_STATUSES` and `EXCEPTION_STATUSES` are unchanged — PICKUP_AVAILABLE doesn't belong in those groups.

### Notification

No new code — the existing status change notification in `refresh/route.ts` already handles any status transition. When status changes from IN_TRANSIT → PICKUP_AVAILABLE, the `sendNotifications` call fires automatically.

Users can configure which statuses trigger notifications per channel via `notifyOnStatuses`. They should add `PICKUP_AVAILABLE` to their channel config if they want pickup alerts.

## 3. Notification Type Extension

### OverdueMessage

Add to `src/lib/notification/types.ts`:

```ts
export interface OverdueMessage {
  type: 'overdue'
  packageId: string
  trackingNumber: string
  nickname?: string | null
  status: string
  eta: string | null
  overdueDays: number
}

export type NotificationMessage = StatusChangeMessage | SummaryMessage | OverdueMessage
```

### Service Handling

In `src/lib/notification/service.ts`, overdue messages bypass the `notifyOnStatuses` filter (like summaries). Overdue is always sent to enabled channels regardless of status filter config:

```ts
// Existing: status_change checks notifyOnStatuses
// Existing: summary checks channel.sendSummary
// New: overdue always sends (no filter)
if (message.type === 'overdue') {
  // No status filter — always send to enabled channels
}
```

### Provider Rendering

Each notification provider (`teams.ts`, `telegram.ts`, `wechat.ts`, `whatsapp.ts`) needs to handle `message.type === 'overdue'` in their `send()` method. The message format:

- **Teams:** Adaptive Card with ⚠ icon, tracking number, overdue days, original ETA, current status
- **Telegram:** Markdown text: `⚠ **Overdue**: 包裹 794798798798 已逾期 3 天，原預計 2023/5/19（目前：In Transit）`
- **WeChat:** Markdown format same as Telegram
- **WhatsApp:** Plain text format

## 4. i18n Keys

### packageCard namespace

| Key | en | zh-TW | zh-CN | es-MX |
|-----|-----|-------|-------|-------|
| `statusPickupAvailable` | Pickup Available | 待取貨 | 待取货 | Disponible para recoger |
| `overdueWarning` | ⚠ {days}d overdue — originally estimated {date} | ⚠ 逾期 {days} 天 — 原預計 {date} | ⚠ 逾期 {days} 天 — 原预计 {date} | ⚠ {days}d de retraso — estimado originalmente {date} |

### settings namespace

| Key | en | zh-TW | zh-CN | es-MX |
|-----|-----|-------|-------|-------|
| `statusPickupAvailable` | Pickup Available | 待取貨 | 待取货 | Disponible para recoger |

## 5. File Change Map

| File | Change |
|------|--------|
| `src/lib/tracking/providers/fedex.ts` | `PICKUP_AVAILABLE: 'PICKUP_AVAILABLE'` in mapFedExStatus |
| `src/components/package-card.tsx` | Overdue computation + display + PICKUP_AVAILABLE badge/dot/labelKey |
| `src/components/stats-bar.tsx` | Delivered predicate includes PICKUP_AVAILABLE |
| `src/lib/notification/types.ts` | Add OverdueMessage interface, update NotificationMessage union |
| `src/lib/notification/service.ts` | Handle overdue message type (bypass status filter) |
| `src/lib/notification/providers/teams.ts` | Render overdue message |
| `src/lib/notification/providers/telegram.ts` | Render overdue message |
| `src/lib/notification/providers/wechat.ts` | Render overdue message |
| `src/lib/notification/providers/whatsapp.ts` | Render overdue message |
| `src/app/api/packages/[id]/refresh/route.ts` | Overdue detection + notification dispatch |
| `messages/en.json` | Add statusPickupAvailable + overdueWarning |
| `messages/zh-TW.json` | Add statusPickupAvailable + overdueWarning |
| `messages/zh-CN.json` | Add statusPickupAvailable + overdueWarning |
| `messages/es-MX.json` | Add statusPickupAvailable + overdueWarning |

## 6. Status Code Reference (Updated)

The 9-value normalized status system:

| Code | Meaning | Stats Bar Group |
|------|---------|-----------------|
| DELIVERED | Signed/delivered | Delivered |
| PICKUP_AVAILABLE | Arrived, awaiting pickup | Delivered |
| IN_TRANSIT | In transit | In Transit |
| PICKED_UP | Picked up by carrier | In Transit |
| ON_FEDEX_VEHICLE | On delivery vehicle | In Transit |
| EXCEPTION | Exception/held | Exception |
| RETURN_TO_SENDER | Returning to sender | Exception |
| DELAYED | Delayed | Delayed |
| UNKNOWN | Unknown | (none) |
