# Delay Risk Prediction & System Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-powered delay risk assessment (low/medium/high/critical) to every package, displayed in dashboard cards, TV cards, and notifications. Rename "FedEx Tracking Dashboard" → "Logistics Tracking Dashboard".

**Architecture:** Sequential LLM calls: summary → risk (both in `analyzePackage`). Risk returns strict JSON parsed on the server. Risk runs on every refresh with 5-min cooldown. Rename is a surface-level text change across layout, messages, package.json, and AGENTS.md.

**Tech Stack:** Next.js 16, Prisma 7 (SQLite), TypeScript, Tailwind v4, next-intl, 4 LLM providers (OpenAI/Anthropic/Google/Ollama/Custom)

---

## File Structure

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `aiDelayRisk String?` to Package |
| `src/lib/llm/types.ts` | Add `DelayRisk` interface, update `AnalysisResult` |
| `src/lib/llm/service.ts` | Add `buildRiskPrompt()`, update `analyzePackage()` |
| `src/app/api/packages/[id]/refresh/route.ts` | Call `analyzePackage()` on every refresh, return `aiDelayRisk` |
| `src/lib/notification/types.ts` | Add `aiDelayRisk` to `StatusChangeMessage` and `OverdueMessage` |
| `src/lib/notification/service.ts` | Handle `delayRisk` in AI field translation |
| `src/lib/notification/providers/telegram.ts` | Add risk section |
| `src/lib/notification/providers/teams.ts` | Add risk section |
| `src/lib/notification/providers/wechat.ts` | Add risk section |
| `src/lib/notification/providers/whatsapp.ts` | Add risk section |
| `src/components/package-card.tsx` | Add risk badge + suggestion block |
| `src/components/tv/tv-card.tsx` | Add risk badge + suggestion block |
| `src/components/tv/tv-view.tsx` | Pass `aiDelayRisk` through; update title |
| `messages/en.json` | Add `delayRisk` keys, rename title |
| `messages/zh-TW.json` | Add `delayRisk` keys, rename title |
| `messages/zh-CN.json` | Add `delayRisk` keys, rename title |
| `messages/es-MX.json` | Add `delayRisk` keys, rename title |
| `package.json` | Rename to `logistics-tracking-dashboard` |
| `src/app/layout.tsx` | Update metadata title |
| `AGENTS.md` | Update project name and description |

---

### Task 1: Prisma Migration — Add aiDelayRisk Column

**Files:**
- Modify: `prisma/schema.prisma:26`
- Run: `npx prisma migrate dev --name add_ai_delay_risk`

- [ ] **Step 1: Add field to schema**

Insert `aiDelayRisk String?` after line 25 (`aiAnalyzedAt`):

```prisma
  aiAnalyzedAt DateTime?
  aiDelayRisk  String?
```

- [ ] **Step 2: Generate migration**

Run:

```bash
npx prisma migrate dev --name add_ai_delay_risk
```

Expected output:
```
Your database is now in sync with your schema.
```

- [ ] **Step 3: Rebuild native addon for Node 20**

Run:

```bash
PATH="/Users/fred/.nvm/versions/node/v20.20.2/bin:$PATH" npx node-gyp rebuild --directory=node_modules/better-sqlite3 --release
node -e "require('better-sqlite3'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Verify build**

Run:

```bash
npm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma/
git commit -m "feat: add aiDelayRisk column to Package"
```

---

### Task 2: LLM Types — Add DelayRisk Interface

**Files:**
- Modify: `src/lib/llm/types.ts`

- [ ] **Step 1: Add DelayRisk interface and update AnalysisResult**

Replace the entire file:

```typescript
export interface LLMProvider {
  name: string
  generateText(prompt: string, options?: { maxTokens?: number; timeout?: number }): Promise<string>
}

export interface DelayRisk {
  level: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  suggestion: string | null
  assessedAt: string
}

export interface AnalysisResult {
  summary: string
  rootCause: string | null
  delayRisk: DelayRisk | null
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/llm/types.ts
git commit -m "feat: add DelayRisk type to LLM types"
```

---

### Task 3: LLM Service — Add Risk Prompt + Update analyzePackage

**Files:**
- Modify: `src/lib/llm/service.ts`

- [ ] **Step 1: Add `buildRiskPrompt()` function**

Insert after `buildRootCausePrompt()` (after line 45):

```typescript
function buildRiskPrompt(pkg: {
  trackingNumber: string
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  events: string
  subPackages: string
}): string {
  return `You are a logistics risk analyst. Analyze this package and return ONLY a JSON object (no other text):

{
  "level": "low" | "medium" | "high" | "critical",
  "reason": "string (1-2 sentences explaining the risk)",
  "suggestion": "string (actionable recommendation, including who to contact if applicable)"
}

Consider:
1. Dwell time at each location vs normal transit windows
2. Sub-package completeness — if any sub-packages are missing or delayed, that is a critical risk because US customs will not clear incomplete shipments
3. Customs clearance risks for international shipments
4. Overall probability of meeting the ETA based on current progress

Package: ${pkg.trackingNumber}
Status: ${pkg.status ?? 'Unknown'}
Route: ${pkg.origin ?? 'N/A'} → ${pkg.destination ?? 'N/A'}
ETA: ${pkg.eta ?? 'N/A'}

Timeline (most recent first):
${pkg.events}

${((): string => {
  try {
    const subs = JSON.parse(pkg.subPackages)
    if (Array.isArray(subs) && subs.length > 0) {
      return `Sub-packages:\n${subs.map((s: { trackingNumber?: string; status?: string }) =>
        `  - ${s.trackingNumber ?? 'unknown'}: ${s.status ?? 'unknown'}`
      ).join('\n')}`
    }
  } catch {}
  return 'No sub-packages'
})()}`
}
```

- [ ] **Step 2: Update `analyzePackage()` return to include delayRisk**

Change the early-return (cached) block (lines 90-95) to:

```typescript
  if (pkg.aiAnalyzedAt && Date.now() - pkg.aiAnalyzedAt.getTime() < ANALYSIS_COOLDOWN_MS) {
    let cachedDelayRisk: DelayRisk | null = null
    if (pkg.aiDelayRisk) {
      try { cachedDelayRisk = JSON.parse(pkg.aiDelayRisk) } catch {}
    }
    return {
      summary: pkg.aiSummary ?? '',
      rootCause: pkg.aiRootCause,
      delayRisk: cachedDelayRisk,
    }
  }
```

Add the import at top:

```typescript
import type { AnalysisResult, DelayRisk } from './types'
```

Change the import of `AnalysisResult` to include `DelayRisk`.

- [ ] **Step 3: Add risk generation after summary**

Inside the try block, after the rootCause generation (after line 122), add:

```typescript
    let delayRisk: DelayRisk | null = null
    try {
      const riskPrompt = buildRiskPrompt({
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        origin: pkg.origin,
        destination: pkg.destination,
        eta: pkg.eta,
        events: pkg.events,
        subPackages: pkg.subPackages,
      })
      const riskText = await provider.generateText(riskPrompt, { maxTokens: 300, timeout: LLM_TIMEOUT_MS })
      const parsed = JSON.parse(riskText)
      if (parsed && typeof parsed.level === 'string') {
        delayRisk = {
          level: parsed.level,
          reason: parsed.reason ?? '',
          suggestion: parsed.suggestion ?? null,
          assessedAt: new Date().toISOString(),
        }
      }
    } catch {
      // Risk analysis is optional — silently skip on failure
    }
```

- [ ] **Step 4: Update prisma update to save aiDelayRisk**

Change the `prisma.package.update` call (lines 124-131) to include `aiDelayRisk`:

```typescript
    await prisma.package.update({
      where: { id: pkgId },
      data: {
        aiSummary: summary,
        aiRootCause: rootCause,
        aiDelayRisk: delayRisk ? JSON.stringify(delayRisk) : null,
        aiAnalyzedAt: new Date(),
      },
    })

    return { summary, rootCause, delayRisk }
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/llm/service.ts
git commit -m "feat: add delay risk prompt to analyzePackage"
```

---

### Task 4: Refresh Route — Call analyzePackage on Every Refresh

**Files:**
- Modify: `src/app/api/packages/[id]/refresh/route.ts`

- [ ] **Step 1: Call analyzePackage outside status-change block for risk**

After the status-change block closes (after line 86, the `}` closing `if (result.status && oldStatus !== result.status)`), add a risk-only analyzePackage call:

```typescript
    // Risk analysis on every refresh (cooldown gated)
    let riskAiResult: Awaited<ReturnType<typeof analyzePackage>> | null = null
    try {
      riskAiResult = await analyzePackage(id)
    } catch {}
    const aiDelayRisk = riskAiResult?.delayRisk ?? null
```

- [ ] **Step 2: Include aiDelayRisk in response**

Add `aiDelayRisk` to the JSON response object (after line 153):

```typescript
      aiDelayRisk,
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/packages/[id]/refresh/route.ts
git commit -m "feat: call analyzePackage on every refresh for risk"
```

---

### Task 5: Notification Types — Add aiDelayRisk to Messages

**Files:**
- Modify: `src/lib/notification/types.ts`

- [ ] **Step 1: Import DelayRisk and add to message types**

Insert at top:

```typescript
import type { DelayRisk } from '@/lib/llm/types'
```

Add `aiDelayRisk` to `StatusChangeMessage`:

```typescript
export interface StatusChangeMessage {
  type: 'status_change'
  packageId: string
  trackingNumber: string
  nickname?: string | null
  status: string
  eta?: string | null
  origin?: string | null
  destination?: string | null
  events: TrackingEvent[]
  aiSummary?: string | null
  aiRootCause?: string | null
  aiDelayRisk?: DelayRisk | null
}
```

Add `aiDelayRisk` to `OverdueMessage`:

```typescript
export interface OverdueMessage {
  type: 'overdue'
  packageId: string
  trackingNumber: string
  nickname?: string | null
  status: string
  eta: string | null
  overdueDays: number
  aiSummary?: string | null
  aiRootCause?: string | null
  aiDelayRisk?: DelayRisk | null
}
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/notification/types.ts
git commit -m "feat: add aiDelayRisk to notification message types"
```

---

### Task 6: Notification Service — Translate Risk Fields

**Files:**
- Modify: `src/lib/notification/service.ts`

- [ ] **Step 1: Update `AIFields` type and `getAIFields` to include delayRisk**

Change `AIFields` type:

```typescript
type AIFields = { aiSummary?: string | null; aiRootCause?: string | null; aiDelayRisk?: DelayRisk | null }
```

Update `getAIFields`:

```typescript
function getAIFields(message: NotificationMessage): AIFields {
  if (message.type === 'status_change' || message.type === 'overdue') {
    return { aiSummary: message.aiSummary, aiRootCause: message.aiRootCause, aiDelayRisk: message.aiDelayRisk }
  }
  return {}
}
```

Update `withAIFields`:

```typescript
function withAIFields<T extends NotificationMessage>(message: T, ai: AIFields): T {
  if (message.type === 'status_change' || message.type === 'overdue') {
    return { ...message, aiSummary: ai.aiSummary, aiRootCause: ai.aiRootCause, aiDelayRisk: ai.aiDelayRisk } as T
  }
  ...
```

Add import:

```typescript
import type { DelayRisk } from '@/lib/llm/types'
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/notification/service.ts
git commit -m "feat: propagate aiDelayRisk in notification service"
```

---

### Task 7: Notification Providers — Add Risk to Messages

**Files:**
- Modify: `src/lib/notification/providers/telegram.ts`
- Modify: `src/lib/notification/providers/teams.ts`
- Modify: `src/lib/notification/providers/wechat.ts`
- Modify: `src/lib/notification/providers/whatsapp.ts`

All four follow the same pattern. Add a shared helper or duplicate in each.

- [ ] **Step 1: Add risk section helper to each provider**

In `telegram.ts`, after the `aiRootCause` line in `buildTelegramText`, add:

```typescript
  ...(message.aiDelayRisk ? [
    ``,
    `⚠️ Risk: ${message.aiDelayRisk.level.toUpperCase()}`,
    `${message.aiDelayRisk.reason}`,
    ...(message.aiDelayRisk.suggestion ? [`💡 ${message.aiDelayRisk.suggestion}`] : []),
  ] : []),
```

Insert this after the `aiRootCause` line in the `status_change` block (after line 19) and in the `overdue` block (after line 31).

In the `summary` block, risk is not shown (summaries show many packages; risk is per-package).

- [ ] **Step 2: Apply the same pattern to `teams.ts`, `wechat.ts`, `whatsapp.ts`**

Each has a message builder function. After each `aiRootCause` line in status_change and overdue blocks, add the risk block above. Read each file first to find the exact location.

Pattern for all:

```typescript
  ...(message.aiDelayRisk ? [
    ``,
    `⚠️ Risk: ${message.aiDelayRisk.level.toUpperCase()} — ${message.aiDelayRisk.reason}`,
    ...(message.aiDelayRisk.suggestion ? [`💡 ${message.aiDelayRisk.suggestion}`] : []),
  ] : []),
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/notification/providers/
git commit -m "feat: add delay risk to notification providers"
```

---

### Task 8: Dashboard Card — Risk Display

**Files:**
- Modify: `src/components/package-card.tsx`

- [ ] **Step 1: Add `aiDelayRisk` to `PackageData` interface**

Add after line 37:

```typescript
  aiDelayRisk: { level: string; reason: string; suggestion: string | null; assessedAt: string } | null
```

- [ ] **Step 2: Add risk display block after the aiRootCause block**

Insert after the `aiRootCause` div (after line 198):

```tsx
      {pkg.aiDelayRisk && (() => {
        const riskColors: Record<string, { bg: string; border: string; text: string }> = {
          low: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
          medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
          high: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800' },
          critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
        }
        const c = riskColors[pkg.aiDelayRisk.level.toLowerCase()] ?? riskColors.low
        return (
          <div className={`mb-2 rounded-md border px-3 py-2 text-xs ${c.bg} ${c.border} ${c.text}`}>
            <span className="font-semibold">
              {pkg.aiDelayRisk.level === 'critical' ? '🔴' : pkg.aiDelayRisk.level === 'high' ? '🟠' : pkg.aiDelayRisk.level === 'medium' ? '🟡' : '🟢'}
              {' '}{pkg.aiDelayRisk.level.toUpperCase()}
            </span>
            : {pkg.aiDelayRisk.reason}
            {pkg.aiDelayRisk.suggestion && (
              <div className="mt-1 opacity-80">💡 {pkg.aiDelayRisk.suggestion}</div>
            )}
          </div>
        )
      })()}
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/package-card.tsx
git commit -m "feat: show delay risk on package card"
```

---

### Task 9: TV Card — Risk Display

**Files:**
- Modify: `src/components/tv/tv-card.tsx`
- Modify: `src/components/tv/tv-view.tsx`

- [ ] **Step 1: Add `aiDelayRisk` prop to `TvCard`**

Update `TvCardProps`:

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
  aiDelayRisk: { level: string; reason: string; suggestion: string | null; assessedAt: string } | null
  pulse?: boolean
  pulseColor?: string
}
```

- [ ] **Step 2: Add risk display in `TvCard`**

After the AI summary block (after the `</div>` closing the summary at line 97, inside the main div before the closing `</div>`), add:

```tsx
        {/* Delay risk */}
        {aiDelayRisk && (
          <div
            className="mt-auto pt-2 border-t leading-snug"
            style={{
              fontSize: '1rem',
              borderColor: 'rgba(71, 85, 105, 0.6)',
              color:
                aiDelayRisk.level === 'critical' ? '#f87171' :
                aiDelayRisk.level === 'high' ? '#fb923c' :
                aiDelayRisk.level === 'medium' ? '#facc15' :
                '#4ade80',
            }}
          >
            <span className="font-bold">{aiDelayRisk.level.toUpperCase()}</span>: {aiDelayRisk.reason}
            {aiDelayRisk.suggestion && (
              <div style={{ opacity: 0.8, marginTop: '0.25rem' }}>💡 {aiDelayRisk.suggestion}</div>
            )}
          </div>
        )}
```

- [ ] **Step 3: Pass `aiDelayRisk` from `TvView`**

In `src/components/tv/tv-view.tsx`, add `aiDelayRisk` to `PackageData`:

```typescript
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
  aiDelayRisk: { level: string; reason: string; suggestion: string | null; assessedAt: string } | null
}
```

Add the `aiDelayRisk` prop to the `TvCard` in the grid:

```tsx
              aiSummary={getAISummary(pkg)}
              aiRootCause={getAIRootCause(pkg)}
              aiDelayRisk={pkg.aiDelayRisk}
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/tv/tv-card.tsx src/components/tv/tv-view.tsx
git commit -m "feat: show delay risk on TV cards"
```

---

### Task 10: i18n — Add Delay Risk Translation Keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add `delayRisk` key to `en.json`**

Insert after the `llm` block:

```json
  "delayRisk": {
    "level": "Risk Level",
    "low": "Low",
    "medium": "Medium",
    "high": "High",
    "critical": "Critical",
    "suggestion": "Recommendation",
    "assessedAt": "Assessed At"
  }
```

- [ ] **Step 2: Add translations to `zh-TW.json`**

```json
  "delayRisk": {
    "level": "風險等級",
    "low": "低",
    "medium": "中",
    "high": "高",
    "critical": "嚴重",
    "suggestion": "建議",
    "assessedAt": "評估時間"
  }
```

- [ ] **Step 3: Add translations to `zh-CN.json`**

```json
  "delayRisk": {
    "level": "风险等级",
    "low": "低",
    "medium": "中",
    "high": "高",
    "critical": "严重",
    "suggestion": "建议",
    "assessedAt": "评估时间"
  }
```

- [ ] **Step 4: Add translations to `es-MX.json`**

```json
  "delayRisk": {
    "level": "Nivel de Riesgo",
    "low": "Bajo",
    "medium": "Medio",
    "high": "Alto",
    "critical": "Crítico",
    "suggestion": "Recomendación",
    "assessedAt": "Evaluado el"
  }
```

- [ ] **Step 5: Build**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add messages/
git commit -m "feat: add delay risk i18n keys"
```

---

### Task 11: System Rename — FedEx → Logistics Tracking Dashboard

**Files:**
- Modify: `package.json`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/tv/tv-view.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update `package.json`**

Change:
```json
  "name": "fedex-tracking-dashboard",
```
To:
```json
  "name": "logistics-tracking-dashboard",
```

- [ ] **Step 2: Update `src/app/layout.tsx`**

Change:
```typescript
  title: 'FedEx Tracking Dashboard',
  description: 'Track your FedEx packages',
```
To:
```typescript
  title: 'Logistics Tracking Dashboard',
  description: 'Track your packages in real time',
```

- [ ] **Step 3: Update `src/components/tv/tv-view.tsx`**

Change line 210:
```tsx
          FedEx Dashboard
```
To:
```tsx
          Logistics Tracking
```

- [ ] **Step 4: Update `messages/en.json`**

Change:
```json
    "title": "FedEx Tracking Dashboard",
    "subtitle": "Track your FedEx packages in real time",
```
To:
```json
    "title": "Logistics Tracking Dashboard",
    "subtitle": "Track your packages in real time",
```

- [ ] **Step 5: Update `messages/zh-TW.json`, `zh-CN.json`, `es-MX.json`**

Read each file, find the dashboard `title` and `subtitle`, update similarly:

**zh-TW:**
```
"title": "物流追蹤儀表板",
"subtitle": "即時追蹤您的包裹"
```

**zh-CN:**
```
"title": "物流追踪仪表板",
"subtitle": "实时追踪您的包裹"
```

**es-MX:**
```
"title": "Panel de Seguimiento Logístico",
"subtitle": "Rastrea tus paquetes en tiempo real"
```

- [ ] **Step 6: Update `AGENTS.md`**

Change the first line:
```
# FedEx Tracking Dashboard — Agent Guide
```
To:
```
# Logistics Tracking Dashboard — Agent Guide
```

Change line 5:
```
A FedEx package tracking dashboard with multi-channel notification system. Fully implemented.
```
To:
```
A multi-carrier package tracking dashboard with multi-channel notification system. Fully implemented.
```

Change lines 10-11:
```
- FedEx package tracking via Sandbox API
- Multi-channel notifications (Teams/Telegram/WeChat/WhatsApp)
```
To:
```
- Package tracking via carrier APIs (FedEx, with more to come)
- Multi-channel notifications (Teams/Telegram/WeChat/WhatsApp)
```

Update the project structure description comment for `fedex.ts` to be generic.

- [ ] **Step 7: Run full test suite**

```bash
npm test
```

Expected: 28 tests passing.

- [ ] **Step 8: Build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`

- [ ] **Step 9: Commit**

```bash
git add package.json src/app/layout.tsx src/components/tv/tv-view.tsx messages/ AGENTS.md
git commit -m "refactor: rename FedEx Tracking Dashboard to Logistics Tracking Dashboard"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Add `aiDelayRisk` column to Package model | Task 1 |
| `DelayRisk` interface (`level`, `reason`, `suggestion`, `assessedAt`) | Task 2 |
| `buildRiskPrompt()` with dwell-time + sub-package analysis | Task 3 |
| Sequential summary → risk in `analyzePackage()` | Task 3 |
| Risk-only call on every refresh | Task 4 |
| 5-min cooldown reuse | Task 3 (existing cooldown) |
| `aiDelayRisk` in `StatusChangeMessage` / `OverdueMessage` | Task 5 |
| Risk in notification service translation | Task 6 |
| Risk in all 4 notification providers | Task 7 |
| Risk display on package card (color-coded) | Task 8 |
| Risk display on TV card (color-coded) | Task 9 |
| i18n keys for risk labels (4 locales) | Task 10 |
| Error handling: JSON parse failure → skip risk | Task 3 Step 3 |
| System rename across all surfaces | Task 11 |

### Placeholder scan

No TBD, TODO, or placeholder patterns present. All code blocks contain complete TypeScript/Prisma code.

### Type consistency

- `DelayRisk.level` is `'low' | 'medium' | 'high' | 'critical'` everywhere
- `aiDelayRisk` stored as JSON string in DB, parsed to `DelayRisk | null` in TypeScript
- `AnalysisResult.delayRisk` is `DelayRisk | null`
- Propagation: `analyzePackage` → `refresh/route.ts` → response JSON + notification messages
- Color mapping consistent between package-card and tv-card

### Escaped characters

- Backticks in template literals inside the risk prompt are handled via function scope — the prompt string is a regular template literal, no nested backticks
- The `subPackages` section uses an IIFE to avoid breaking template literal parsing

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-08-delay-risk-prediction-and-rename.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
