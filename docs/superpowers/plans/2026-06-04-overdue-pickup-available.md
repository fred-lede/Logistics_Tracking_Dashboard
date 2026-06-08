# Overdue Warning + PICKUP_AVAILABLE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add overdue ETA warning (UI + notifications) and PICKUP_AVAILABLE status code to the FedEx tracking dashboard.

**Architecture:** Overdue is a UI-layer computation comparing ETA to now, excluding DELIVERED/PICKUP_AVAILABLE. PICKUP_AVAILABLE is a new status code mapped from FedEx's long code, with its own badge style and i18n label. Overdue notifications use a new `OverdueMessage` discriminated union type that bypasses the `notifyOnStatuses` filter.

**Tech Stack:** React 19, TypeScript, Tailwind v4, next-intl 4.x (ICU interpolation), Prisma 7, Vitest + React Testing Library

---

### File Map

```
src/lib/tracking/providers/fedex.ts          (modify — PICKUP_AVAILABLE mapping)
src/lib/notification/types.ts                (modify — add OverdueMessage, update union)
src/lib/notification/service.ts              (modify — handle overdue bypass filter)
src/lib/notification/providers/teams.ts      (modify — render overdue message)
src/lib/notification/providers/telegram.ts   (modify — render overdue message)
src/lib/notification/providers/wechat.ts     (modify — render overdue message)
src/lib/notification/providers/whatsapp.ts   (modify — render overdue message)
src/app/api/packages/[id]/refresh/route.ts   (modify — overdue detection + notification)
src/components/package-card.tsx              (modify — overdue display + PICKUP_AVAILABLE badge)
src/components/stats-bar.tsx                 (modify — Delivered predicate includes PICKUP_AVAILABLE)
messages/en.json                             (modify — add i18n keys)
messages/zh-TW.json                          (modify — add i18n keys)
messages/zh-CN.json                          (modify — add i18n keys)
messages/es-MX.json                          (modify — add i18n keys)
src/lib/notification/__tests__/providers.test.ts  (modify — add overdue message tests)
src/components/__tests__/stats-bar.test.tsx        (modify — test PICKUP_AVAILABLE grouped with Delivered)
```

---

### Task 1: Add OverdueMessage type + update FedEx status mapping

**Files:**
- Modify: `src/lib/notification/types.ts`
- Modify: `src/lib/tracking/providers/fedex.ts`
- Test: `src/lib/notification/__tests__/providers.test.ts`

- [ ] **Step 1: Add OverdueMessage to types.ts**

In `src/lib/notification/types.ts`, add the `OverdueMessage` interface before the `NotificationMessage` union, then update the union:

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

Keep the existing `StatusChangeMessage`, `SummaryMessage`, `ContactInfo`, `NotificationResult`, and `NotificationProvider` interfaces unchanged.

- [ ] **Step 2: Fix FedEx PICKUP_AVAILABLE mapping**

In `src/lib/tracking/providers/fedex.ts`, line 128, change:

```ts
PICKUP_AVAILABLE: 'UNKNOWN',
```

to:

```ts
PICKUP_AVAILABLE: 'PICKUP_AVAILABLE',
```

No other changes needed in this file.

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `npx vitest run 2>&1`

Expected: All 22 tests pass. The type change doesn't affect runtime; the FedEx mapping change only affects production API calls (sandbox test number `794798798798` returns `HL` → `IN_TRANSIT`, not `PICKUP_AVAILABLE`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/notification/types.ts src/lib/tracking/providers/fedex.ts
git commit -m "feat: add OverdueMessage type + map PICKUP_AVAILABLE status code"
```

---

### Task 2: Add overdue handling to notification service + refresh route

**Files:**
- Modify: `src/lib/notification/service.ts`
- Modify: `src/app/api/packages/[id]/refresh/route.ts`

- [ ] **Step 1: Update notification service to handle overdue messages**

In `src/lib/notification/service.ts`, the current filter logic (lines 23-30) is:

```ts
if (message.type === 'status_change') {
  const notifyOn = parseJsonArray<string>(channel.notifyOnStatuses)
  if (notifyOn.length > 0 && !notifyOn.includes(message.status)) {
    continue
  }
}

if (message.type === 'summary' && !channel.sendSummary) continue
```

Replace with:

```ts
if (message.type === 'status_change') {
  const notifyOn = parseJsonArray<string>(channel.notifyOnStatuses)
  if (notifyOn.length > 0 && !notifyOn.includes(message.status)) {
    continue
  }
}

if (message.type === 'summary' && !channel.sendSummary) continue

if (message.type === 'overdue') {
  // Overdue always sends to enabled channels — no status filter
}
```

This adds the `overdue` case explicitly (no filtering). The loop body after this point (provider.send, log creation) already works for any `NotificationMessage` type.

- [ ] **Step 2: Add overdue detection to refresh route**

In `src/app/api/packages/[id]/refresh/route.ts`, after the existing status change notification block (after line 63 `await sendNotifications(message)`), add overdue detection:

```ts
// Overdue detection
const etaDate = updated.eta ? new Date(updated.eta) : null
const isOverdue = etaDate
  && etaDate < new Date()
  && updated.status !== 'DELIVERED'
  && updated.status !== 'PICKUP_AVAILABLE'

if (isOverdue) {
  const overdueDays = Math.max(1, Math.ceil(
    (Date.now() - etaDate.getTime()) / 86400000
  ))
  const overdueMessage: OverdueMessage = {
    type: 'overdue',
    packageId: updated.id,
    trackingNumber: updated.trackingNumber,
    nickname: updated.nickname,
    status: updated.status!,
    eta: updated.eta,
    overdueDays,
  }
  await sendNotifications(overdueMessage)
}
```

Also update the import at the top of the file. Change:

```ts
import type { StatusChangeMessage } from '@/lib/notification/types'
```

to:

```ts
import type { StatusChangeMessage, OverdueMessage } from '@/lib/notification/types'
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run 2>&1`

Expected: All 22 tests pass. The refresh route changes are server-side only and don't affect existing unit tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/notification/service.ts src/app/api/packages/[id]/refresh/route.ts
git commit -m "feat: add overdue detection + notification dispatch in refresh route"
```

---

### Task 3: Add overdue message rendering to all 4 notification providers

**Files:**
- Modify: `src/lib/notification/providers/teams.ts`
- Modify: `src/lib/notification/providers/telegram.ts`
- Modify: `src/lib/notification/providers/wechat.ts`
- Modify: `src/lib/notification/providers/whatsapp.ts`
- Test: `src/lib/notification/__tests__/providers.test.ts`

- [ ] **Step 1: Add overdue rendering to Teams provider**

In `src/lib/notification/providers/teams.ts`, update `buildAdaptiveCard` (line 4-6). The current title line is:

```ts
const title = message.type === 'status_change'
  ? `📦 ${message.status} - ${message.nickname || message.trackingNumber}`
  : `📊 Package Summary - ${message.summaryDate}`
```

Replace with:

```ts
const title = message.type === 'status_change'
  ? `📦 ${message.status} - ${message.nickname || message.trackingNumber}`
  : message.type === 'overdue'
    ? `⚠️ Overdue ${message.overdueDays}d - ${message.nickname || message.trackingNumber}`
    : `📊 Package Summary - ${message.summaryDate}`
```

Also update the `facts` block (lines 8-19). The current ternary is:

```ts
const facts: { title: string; value: string }[] = message.type === 'status_change'
  ? [
    { title: 'Status', value: message.status },
    { title: 'Tracking', value: message.trackingNumber },
    { title: 'Destination', value: message.destination || '' },
    { title: 'ETA', value: message.eta || '' },
    ...(message.events?.length ? [{ title: 'Latest Event', value: `${message.events[0].description} — ${message.events[0].location}` }] : []),
  ]
  : (message.packages?.map((p) => ({
    title: `${p.status} - ${p.nickname || p.trackingNumber}`,
    value: `Dest: ${p.destination || 'N/A'} | ETA: ${p.eta || 'N/A'}`,
  })) || [])
```

Replace with:

```ts
const facts: { title: string; value: string }[] = message.type === 'status_change'
  ? [
    { title: 'Status', value: message.status },
    { title: 'Tracking', value: message.trackingNumber },
    { title: 'Destination', value: message.destination || '' },
    { title: 'ETA', value: message.eta || '' },
    ...(message.events?.length ? [{ title: 'Latest Event', value: `${message.events[0].description} — ${message.events[0].location}` }] : []),
  ]
  : message.type === 'overdue'
    ? [
      { title: 'Overdue', value: `${message.overdueDays} days` },
      { title: 'Tracking', value: message.trackingNumber },
      { title: 'Current Status', value: message.status },
      { title: 'Original ETA', value: message.eta || 'N/A' },
    ]
    : (message.packages?.map((p) => ({
      title: `${p.status} - ${p.nickname || p.trackingNumber}`,
      value: `Dest: ${p.destination || 'N/A'} | ETA: ${p.eta || 'N/A'}`,
    })) || [])
```

Also update `buildGraphHtml` (line 38-49). The current function starts with:

```ts
function buildGraphHtml(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    return `<h3>📦 ${message.status} - ${message.nickname || message.trackingNumber}</h3>
<p><b>Tracking:</b> ${message.trackingNumber}<br>
<b>Destination:</b> ${message.destination || 'N/A'}<br>
<b>ETA:</b> ${message.eta || 'N/A'}</p>`
  }
```

Add the overdue case after the `status_change` block:

```ts
function buildGraphHtml(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    return `<h3>📦 ${message.status} - ${message.nickname || message.trackingNumber}</h3>
<p><b>Tracking:</b> ${message.trackingNumber}<br>
<b>Destination:</b> ${message.destination || 'N/A'}<br>
<b>ETA:</b> ${message.eta || 'N/A'}</p>`
  }
  if (message.type === 'overdue') {
    return `<h3>⚠️ Overdue ${message.overdueDays}d - ${message.nickname || message.trackingNumber}</h3>
<p><b>Tracking:</b> ${message.trackingNumber}<br>
<b>Current Status:</b> ${message.status}<br>
<b>Original ETA:</b> ${message.eta || 'N/A'}</p>`
  }
```

- [ ] **Step 2: Add overdue rendering to Telegram provider**

In `src/lib/notification/providers/telegram.ts`, update `buildTelegramText`. The current function (lines 3-25) handles `status_change` and falls through to summary. Add an overdue case after the `status_change` block:

```ts
function buildTelegramText(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    return [
      `📦 *${message.status}* - ${message.nickname || message.trackingNumber}`,
      ``,
      `Status: ${message.status}`,
      `Tracking: ${message.trackingNumber}`,
      `Destination: ${message.destination || 'N/A'}`,
      `ETA: ${message.eta || 'N/A'}`,
      ...(message.events?.length ? [`Latest: ${message.events[0].description} @ ${message.events[0].location}`] : []),
    ].join('\n')
  }

  if (message.type === 'overdue') {
    return [
      `⚠️ *Overdue ${message.overdueDays}d* - ${message.nickname || message.trackingNumber}`,
      ``,
      `Current Status: ${message.status}`,
      `Tracking: ${message.trackingNumber}`,
      `Original ETA: ${message.eta || 'N/A'}`,
    ].join('\n')
  }

  const lines = [`📊 *Package Summary - ${message.summaryDate}*`, '']
  // ... rest unchanged
```

- [ ] **Step 3: Add overdue rendering to WeChat provider**

In `src/lib/notification/providers/wechat.ts`, update `buildWechatMarkdown`. Add an overdue case after the `status_change` block:

```ts
function buildWechatMarkdown(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let md = `📦 **${message.status}** - ${message.nickname || message.trackingNumber}\n`
    md += `> Status: ${message.status}\n`
    md += `> Tracking: ${message.trackingNumber}\n`
    md += `> Destination: ${message.destination || 'N/A'}\n`
    md += `> ETA: ${message.eta || 'N/A'}\n`
    if (message.events?.length) {
      md += `> Latest: ${message.events[0].description} @ ${message.events[0].location}\n`
    }
    return md
  }

  if (message.type === 'overdue') {
    let md = `⚠️ **Overdue ${message.overdueDays}d** - ${message.nickname || message.trackingNumber}\n`
    md += `> Current Status: ${message.status}\n`
    md += `> Tracking: ${message.trackingNumber}\n`
    md += `> Original ETA: ${message.eta || 'N/A'}\n`
    return md
  }

  let md = `📊 **Package Summary - ${message.summaryDate}**\n`
  // ... rest unchanged
```

- [ ] **Step 4: Add overdue rendering to WhatsApp provider**

In `src/lib/notification/providers/whatsapp.ts`, update `buildWhatsAppText`. Add an overdue case after the `status_change` block:

```ts
function buildWhatsAppText(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let text = `📦 ${message.status} - ${message.nickname || message.trackingNumber}\n`
    text += `Status: ${message.status}\n`
    text += `Tracking: ${message.trackingNumber}\n`
    text += `Destination: ${message.destination || 'N/A'}\n`
    text += `ETA: ${message.eta || 'N/A'}`
    if (message.events?.length) {
      text += `\nLatest: ${message.events[0].description} @ ${message.events[0].location}`
    }
    return text
  }

  if (message.type === 'overdue') {
    let text = `⚠️ Overdue ${message.overdueDays}d - ${message.nickname || message.trackingNumber}\n`
    text += `Current Status: ${message.status}\n`
    text += `Tracking: ${message.trackingNumber}\n`
    text += `Original ETA: ${message.eta || 'N/A'}`
    return text
  }

  let text = `📊 Package Summary - ${message.summaryDate}\n`
  // ... rest unchanged
```

- [ ] **Step 5: Add overdue message test to providers.test.ts**

In `src/lib/notification/__tests__/providers.test.ts`, add an overdue sample message and test that each provider handles it without error. After the existing `sampleMessage` (line 12), add:

```ts
const overdueMessage: OverdueMessage = {
  type: 'overdue',
  packageId: '2',
  trackingNumber: 'TN456',
  status: 'IN_TRANSIT',
  eta: '2023-05-19',
  overdueDays: 3,
}
```

Add the import at the top:

```ts
import type { StatusChangeMessage, OverdueMessage } from '../types'
```

Add test cases for WeChat and WhatsApp with overdue messages:

```ts
describe('WeChatProvider with overdue', () => {
  it('returns error when no webhook URL configured for overdue message', async () => {
    const result = await wechatProvider.send({}, [], overdueMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Webhook URL not configured')
  })
})

describe('WhatsAppProvider with overdue', () => {
  it('returns error when no API key configured for overdue message', async () => {
    const result = await whatsappProvider.send({}, [], overdueMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('API key or Phone Number ID not configured')
  })
})
```

These tests confirm overdue messages don't crash the providers (the error is about missing config, same as for status_change messages — proving the overdue branch runs without throwing).

- [ ] **Step 6: Run tests**

Run: `npx vitest run 2>&1`

Expected: All tests pass (now 24 total — 2 new overdue provider tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/notification/providers/teams.ts src/lib/notification/providers/telegram.ts src/lib/notification/providers/wechat.ts src/lib/notification/providers/whatsapp.ts src/lib/notification/__tests__/providers.test.ts
git commit -m "feat: add overdue message rendering to all 4 notification providers"
```

---

### Task 4: Update package-card UI — overdue warning + PICKUP_AVAILABLE badge

**Files:**
- Modify: `src/components/package-card.tsx`

- [ ] **Step 1: Add PICKUP_AVAILABLE to badge maps**

In `src/components/package-card.tsx`, add `PICKUP_AVAILABLE` entries to all three maps:

In `statusBadgeClass` (after line 42 `DELIVERED: 'bg-green-500 text-white',`):

```ts
PICKUP_AVAILABLE: 'bg-teal-500 text-white',
```

In `statusLabelKey` (after line 54 `DELIVERED: 'statusDelivered',`):

```ts
PICKUP_AVAILABLE: 'statusPickupAvailable',
```

In `statusBadgeDot` (after line 68 `DELIVERED: 'bg-green-500',`):

```ts
PICKUP_AVAILABLE: 'bg-teal-500',
```

- [ ] **Step 2: Add overdue computation + update ETA display**

In the `PackageCard` component, after line 122 (`const isException = ...`), add the overdue computation:

```ts
const now = new Date()
const etaDate = pkg.eta ? new Date(pkg.eta) : null
const isOverdue = !!etaDate && etaDate < now && pkg.status !== 'DELIVERED' && pkg.status !== 'PICKUP_AVAILABLE'
const overdueDays = isOverdue ? Math.max(1, Math.ceil((now.getTime() - etaDate.getTime()) / 86400000)) : 0
```

Then replace the existing ETA display block (lines 172-177):

```tsx
{pkg.eta && (
  <div className="text-sm font-medium text-gray-700 mb-2">
    {pkg.status === 'DELIVERED' ? `${t('status')}: ` : `${t('eta')}: `}
    {new Date(pkg.eta).toLocaleDateString()}
  </div>
)}
```

with:

```tsx
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

- [ ] **Step 3: Run lint and tests**

Run: `npx vitest run 2>&1`

Expected: All tests pass. Package-card has no dedicated test file, but the build will catch type errors.

Run: `npm run lint 2>&1`

Expected: Only the pre-existing locale-switcher error.

- [ ] **Step 4: Commit**

```bash
git add src/components/package-card.tsx
git commit -m "feat: add overdue warning display + PICKUP_AVAILABLE badge to package card"
```

---

### Task 5: Update Stats Bar — PICKUP_AVAILABLE in Delivered group

**Files:**
- Modify: `src/components/stats-bar.tsx`
- Modify: `src/components/__tests__/stats-bar.test.tsx`

- [ ] **Step 1: Update Delivered predicate in stats-bar.tsx**

In `src/components/stats-bar.tsx`, line 54, change:

```ts
predicate: (p) => p.status === 'DELIVERED',
```

to:

```ts
predicate: (p) => p.status === 'DELIVERED' || p.status === 'PICKUP_AVAILABLE',
```

Also update the count on line 52 from:

```ts
count: packages.filter((p) => p.status === 'DELIVERED').length,
```

to:

```ts
count: packages.filter((p) => p.status === 'DELIVERED' || p.status === 'PICKUP_AVAILABLE').length,
```

- [ ] **Step 2: Add test for PICKUP_AVAILABLE grouping**

In `src/components/__tests__/stats-bar.test.tsx`, add a new test inside the existing `describe('StatsBar', ...)` block:

```ts
it('groups PICKUP_AVAILABLE with Delivered', () => {
  const packages = makePackages(['DELIVERED', 'PICKUP_AVAILABLE', 'IN_TRANSIT', null, null])
  render(<StatsBar packages={packages} activeFilter={null} onFilterChange={() => {}} />)
  const counts = screen.getAllByText(/^\d+$/)
  // All=5, Delivered=2 (DELIVERED+PICKUP_AVAILABLE), InTransit=1, Exception=0, Delayed=0
  expect(counts[0].textContent).toBe('5')
  expect(counts[1].textContent).toBe('2')
  expect(counts[2].textContent).toBe('1')
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/__tests__/stats-bar.test.tsx 2>&1`

Expected: All 6 tests pass (5 original + 1 new).

- [ ] **Step 4: Commit**

```bash
git add src/components/stats-bar.tsx src/components/__tests__/stats-bar.test.tsx
git commit -m "feat: group PICKUP_AVAILABLE with Delivered in Stats Bar"
```

---

### Task 6: Add i18n keys to all 4 locale files

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add keys to en.json**

In `messages/en.json`, in the `packageCard` section, after `"latestLocation": "Latest Location"` (line 34), add:

```json
"statusPickupAvailable": "Pickup Available",
"overdueWarning": "⚠ {days}d overdue — originally estimated {date}"
```

In the `settings` section, after `"statusUnknown": "Unknown"` (line 107), add:

```json
"statusPickupAvailable": "Pickup Available"
```

- [ ] **Step 2: Add keys to zh-TW.json**

In `messages/zh-TW.json`, in the `packageCard` section, after `"latestLocation": "最新位置"` (line 34), add:

```json
"statusPickupAvailable": "待取貨",
"overdueWarning": "⚠ 逾期 {days} 天 — 原預計 {date}"
```

In the `settings` section, after `"statusUnknown": "未知"` (line 107), add:

```json
"statusPickupAvailable": "待取貨"
```

- [ ] **Step 3: Add keys to zh-CN.json**

In `messages/zh-CN.json`, in the `packageCard` section, after `"latestLocation": "最新位置"` (line 34), add:

```json
"statusPickupAvailable": "待取货",
"overdueWarning": "⚠ 逾期 {days} 天 — 原预计 {date}"
```

In the `settings` section, after `"statusUnknown": "未知"` (line 107), add:

```json
"statusPickupAvailable": "待取货"
```

- [ ] **Step 4: Add keys to es-MX.json**

In `messages/es-MX.json`, in the `packageCard` section, after `"latestLocation": "Última Ubicación"` (line 34), add:

```json
"statusPickupAvailable": "Disponible para recoger",
"overdueWarning": "⚠ {days}d de retraso — estimado originalmente {date}"
```

In the `settings` section, after `"statusUnknown": "Desconocido"` (line 107), add:

```json
"statusPickupAvailable": "Disponible para recoger"
```

- [ ] **Step 5: Run build to verify JSON validity**

Run: `npm run build 2>&1`

Expected: Compiles successfully. next-intl validates JSON files at build time.

- [ ] **Step 6: Commit**

```bash
git add messages/en.json messages/zh-TW.json messages/zh-CN.json messages/es-MX.json
git commit -m "feat: add statusPickupAvailable + overdueWarning i18n keys for all 4 locales"
```

---

### Task 7: Update page.tsx STATS_FILTERS for PICKUP_AVAILABLE

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update STATS_FILTERS Delivered predicate**

In `src/app/page.tsx`, the `STATS_FILTERS` constant (defined outside the component) has:

```ts
delivered: (p) => p.status === 'DELIVERED',
```

Change to:

```ts
delivered: (p) => p.status === 'DELIVERED' || p.status === 'PICKUP_AVAILABLE',
```

This ensures the dashboard page filter also groups PICKUP_AVAILABLE with Delivered, matching the Stats Bar behavior.

- [ ] **Step 2: Run tests + lint + build**

Run: `npx vitest run 2>&1`

Expected: All tests pass.

Run: `npm run lint 2>&1`

Expected: Only the pre-existing locale-switcher error.

Run: `npm run build 2>&1`

Expected: Compiles successfully.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: group PICKUP_AVAILABLE with Delivered in dashboard filter"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1`

Expected: All tests pass (25 total: 22 original + 1 overdue WeChat + 1 overdue WhatsApp + 1 PICKUP_AVAILABLE stats bar grouping).

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1`

Expected: Only the pre-existing locale-switcher error. No new errors.

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1`

Expected: Compiles successfully with no TypeScript errors.

- [ ] **Step 4: Commit any fixes if needed**

```bash
git add -A && git commit -m "fix: address review feedback"
```

Only if fixes were needed; skip if everything passes clean.
