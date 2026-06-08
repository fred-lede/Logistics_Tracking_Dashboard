# Delay Risk Prediction & System Rename Design

## Overview

Two changes:

1. **Delay risk prediction** — AI-powered risk assessment (low/medium/high/critical) with dwell-time analysis, sub-package customs risk, and actionable recommendations. Generated for every package on every refresh, displayed in all surfaces (dashboard cards, TV cards, notifications).

2. **System rename** — "FedEx Tracking Dashboard" → "Logistics Tracking Dashboard", to reflect multi-carrier future.

---

## 1. Data Model

### Package model (Prisma migration)

Add a single column:

```
aiDelayRisk    String?   // JSON: { level, reason, suggestion, assessedAt }
```

The `aiAnalyzedAt` field already exists and serves as the cooldown timestamp for all AI analysis (including risk).

### Risk JSON structure

```json
{
  "level": "high",
  "reason": "Package has been in Memphis for 2 days, exceeding normal transit time",
  "suggestion": "Contact FedEx customer service at 1-800-GoFedEx to request priority handling",
  "assessedAt": "2026-06-08T14:00:00Z"
}
```

**Risk levels:**

| Level | Color | Meaning |
|-------|-------|---------|
| `low` | Green | On track, normal transit |
| `medium` | Yellow | Some delay indicators, watch closely |
| `high` | Orange | Significant delay likely, action needed |
| `critical` | Red | Severe risk (customs block, missing sub-packages, stuck >3 days) |

---

## 2. Prompt Design

New function `buildRiskPrompt()` in `src/lib/llm/service.ts`.

### Input data

- trackingNumber, status, origin, destination, eta
- Events array (with dates, locations, descriptions, statuses)
- Sub-packages array (trackingNumber, status)
- Derived: approximate dwell time at each location

### Prompt text

```
You are a logistics risk analyst. Analyze this package and return ONLY a JSON object (no other text):

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

Package: ${trackingNumber}
Status: ${status}
Route: ${origin} → ${destination}
ETA: ${eta}

Timeline (most recent first):
${events}

${subPackages ? `Sub-packages:\n${subPackages}` : 'No sub-packages'}
```

The LLM is instructed to output JSON only. The server parses it with `JSON.parse()` inside a try/catch — on failure, risk is silently skipped (existing summary/rootCause still work).

---

## 3. Analysis Flow Changes

### `analyzePackage()` in `src/lib/llm/service.ts`

Current flow:
1. Check cooldown → return cached if within 5 min
2. Call `provider.generateText(summaryPrompt)` → aiSummary
3. If exception: call `provider.generateText(rootCausePrompt)` → aiRootCause
4. Save + return

New flow:
1. Check cooldown → return cached if within 5 min
2. **Parallel** calls:
   - `provider.generateText(summaryPrompt)` → aiSummary
   - `provider.generateText(riskPrompt)` → aiDelayRisk (parsed from JSON)
   - If exception: `provider.generateText(rootCausePrompt)` → aiRootCause
3. **Sequential** (if preferred): summary → risk (since risk depends on events from the same fetch)
4. Save all + return

Decision: use **sequential** for reliability — summary first (fast, small), then risk (larger prompt). This also lets future versions use the summary content in the risk prompt if needed.

### Cooldown

The existing `ANALYSIS_COOLDOWN_MS = 5 * 60 * 1000` (5 min) applies to all three outputs together. One `aiAnalyzedAt` timestamp gates all re-analysis.

### Trigger points (no change needed)

| Trigger | File | Behavior |
|---------|------|----------|
| Status change on refresh | `refresh/route.ts:58` | Calls `analyzePackage(id)` — now includes risk |
| Overdue detection | `refresh/route.ts:103` | Same call, same behavior |
| Manual analyze | `packages/[id]/analyze/route.ts` | Standalone endpoint, same call |

Both status change AND every refresh: the refresh route already calls `analyzePackage(id)` in the status-change path. If the user wants risk assessment even when status hasn't changed (every refresh), the refresh route already updates `lastCheckedAt` and re-fetches tracking data — but `analyzePackage` is only called on status change. To make risk run on every refresh, add a call to `analyzePackage(id)` unconditionally after each refresh.

**Design decision**: trigger risk analysis on **every refresh** (not just status change). This ensures dwell time tracking stays current.

---

## 4. UI Display

### Dashboard card (`src/components/package-card.tsx`)

Add after the `aiRootCause` block:

```tsx
{pkg.aiDelayRisk && (
  <div className={`mb-2 rounded-md border px-3 py-2 text-xs ${riskColorClass}`}>
    <span>{riskIcon} {pkg.aiDelayRisk.level.toUpperCase()}</span>: {pkg.aiDelayRisk.reason}
    {pkg.aiDelayRisk.suggestion && (
      <div className="mt-1 opacity-80">💡 {pkg.aiDelayRisk.suggestion}</div>
    )}
  </div>
)}
```

Color mapping:
- low → `bg-green-50 border-green-200 text-green-800`
- medium → `bg-yellow-50 border-yellow-200 text-yellow-800`
- high → `bg-orange-50 border-orange-200 text-orange-800`
- critical → `bg-red-50 border-red-200 text-red-800`

### TV card (`src/components/tv/tv-card.tsx`)

Similar block, using TV-appropriate styling (dark background, lighter text).

### Notification messages

`StatusChangeMessage` and `OverdueMessage` types get a new field:

```typescript
aiDelayRisk?: { level: string; reason: string; suggestion: string; assessedAt: string } | null
```

All 4 notification providers (Teams, Telegram, WeChat, WhatsApp) include a risk section when present.

---

## 5. System Rename: Logistics Tracking Dashboard

### Files to change

| File | Change |
|------|--------|
| `package.json` | `name` → `logistics-tracking-dashboard`, `description` update |
| `src/app/layout.tsx` | `metadata.title` → "Logistics Tracking Dashboard" |
| `src/app/page.tsx` | Header h1 "Logistics Tracking" or "Dashboard" |
| `src/components/tv/tv-view.tsx` | Title "Logistics Tracking" |
| `messages/*/dashboard.json` or equivalent | App title keys |
| `AGENTS.md` | Update project name and description |
| `README.md` (if exists) | Update |

### i18n implications

No new keys needed for the title change — just update the existing `appTitle` or equivalent key values in all 4 locales.

---

## 6. Migration

Generate a new Prisma migration:

```bash
npx prisma migrate dev --name add_ai_delay_risk
```

This adds the `aiDelayRisk` column to the `Package` table. The column is nullable, so existing rows are unaffected.

---

## 7. i18n

New translation keys (all 4 locales):

```
"delayRisk": {
  "level": "Risk Level",
  "low": "Low",
  "medium": "Medium",
  "high": "High",
  "critical": "Critical",
  "suggestion": "Recommendation"
}
```

Each locale gets translated equivalents.

---

## 8. Error Handling

- If risk prompt JSON parsing fails → skip risk, log warning, continue with summary/rootCause
- If risk prompt LLM call fails (timeout/error) → skip risk, continue
- If summary LLM call fails → entire `analyzePackage` returns null (current behavior, unchanged)
- Backward compatibility: old packages without `aiDelayRisk` → no risk block displayed

---

## Implementation Order

1. Prisma migration (`add_ai_delay_risk`)
2. `src/lib/llm/service.ts` — add `buildRiskPrompt()`, update `analyzePackage()`
3. `src/lib/llm/types.ts` — update `AnalysisResult` with `delayRisk`
4. `src/lib/notification/types.ts` — add `aiDelayRisk` to message types
5. `src/lib/notification/service.ts` — translate risk fields
6. `src/app/api/packages/[id]/refresh/route.ts` — call risk on every refresh
7. `src/components/package-card.tsx` — add risk display
8. `src/components/tv/tv-card.tsx` — add risk display
9. Notification providers (4 files) — add risk to message format
10. i18n — add delay risk translation keys
11. Rename: update all title/branding references
