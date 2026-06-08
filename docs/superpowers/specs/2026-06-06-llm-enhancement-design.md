# LLM Enhancement — AI Root Cause Analysis & Smart Summary

**Date:** 2026-06-06
**Status:** Approved

## Problem

The FedEx Tracking Dashboard shows raw tracking events and status codes. When a package has an EXCEPTION or DELAYED status, users must manually interpret the event timeline to guess the root cause. There is no natural-language summary or AI-powered insight.

## Solution

Add an LLM enhancement layer that:
1. **Smart Summary** — generates a one-sentence natural-language summary for every package after refresh
2. **Root Cause Analysis** — for exception/delayed/return-to-sender packages, generates a root cause hypothesis and recommended action

Analysis triggers automatically on every package refresh. Results are stored in the database and displayed inline on the PackageCard.

## Architecture

```
[Package Refresh] → [/api/packages/:id/refresh]
                         ↓
              [LLM Analysis Service]
                         ↓
         (Vercel AI SDK — generateText)
                         ↓
    [Provider: OpenAI / Anthropic / Google / Ollama]
                         ↓
    [Store in Package.aiSummary / aiRootCause]
                         ↓
    [PackageCard displays inline]
```

### Provider Registry Pattern

Follows the existing project pattern (TrackingProvider, NotificationProvider):

```typescript
// src/lib/llm/types.ts
interface LLMProvider {
  name: string
  generateText(prompt: string, options?: { maxTokens?: number }): Promise<string>
}

// src/lib/llm/registry.ts
function registerLLMProvider(provider: LLMProvider): void
function getLLMProvider(name: string): LLMProvider | undefined
```

### 4 Provider Implementations

| Provider | Package | Default Model | Auth |
|----------|---------|---------------|------|
| OpenAI | `@ai-sdk/openai` | `gpt-4o-mini` | API Key |
| Anthropic | `@ai-sdk/anthropic` | `claude-sonnet-4-20250514` | API Key |
| Google | `@ai-sdk/google` | `gemini-2.5-flash` | API Key |
| Ollama | `@ai-sdk/ollama` | `llama3` | None (local) |

Core dependency: `ai` (Vercel AI SDK).

## Data Model

### Package model additions

```prisma
model Package {
  // ... existing fields ...
  aiSummary      String?   // One-sentence LLM summary
  aiRootCause    String?   // Root cause analysis (exception packages only)
  aiAnalyzedAt   DateTime? // Last analysis timestamp
}
```

### New LLMSetting model

```prisma
model LLMSetting {
  id        String   @id @default("global")
  provider  String   @default("openai")  // openai | anthropic | google | ollama
  apiKey    String?  // encrypted at rest (env var recommended)
  baseUrl   String?  // Ollama/custom endpoint URL
  model     String   @default("gpt-4o-mini")
  enabled   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## Analysis Flow

1. `/api/packages/:id/refresh` refreshes FedEx tracking data
2. If LLM is enabled and API key is configured, calls `analyzePackage(pkg, locale)`
3. Constructs prompt based on package status:
   - **Normal packages**: summary prompt only → `aiSummary`
   - **Exception packages** (EXCEPTION/DELAYED/RETURN_TO_SENDER): summary + root cause prompt → `aiSummary` + `aiRootCause`
4. Calls `generateText()` via the selected provider
5. Writes results to `aiSummary`, `aiRootCause`, `aiAnalyzedAt`
6. If LLM call fails (timeout, invalid key, network error), silently skips — does not block refresh

### Rate Gate

Same package will not be re-analyzed within 5 minutes (check `aiAnalyzedAt`) to avoid duplicate API costs on rapid refreshes.

## Prompts

### Summary Prompt

```
You are a FedEx package tracking assistant. Summarize this package's current status in ONE concise sentence (under 80 words) in {locale}. Include: current location, status, and ETA if available.

Package: {trackingNumber}
Status: {status}
Origin: {origin}
Destination: {destination}
ETA: {eta}
Recent events: {events JSON}
```

### Root Cause Analysis Prompt (exception packages only)

```
You are a logistics expert analyzing a FedEx package exception. Based on the tracking events, provide:
1) Likely root cause (1-2 sentences)
2) Recommended action (1 sentence)
Be specific and actionable.

Package: {trackingNumber}
Status: {status}
Events: {events JSON}
```

## UI

### PackageCard Inline Display

```
┌──────────────────────────────────────────┐
│ 794798798798  [IN TRANSIT]          ✕    │
│ 📍 Memphis → Taipei                      │
│                                          │
│ 🤖 包裹已離開孟菲斯樞紐，預計6/8送達     │  ← aiSummary
│                                          │
├──────────────────────────────────────────┤
│ 794798798799  [EXCEPTION]           ✕    │
│                                          │
│ 🤖 根因：清關文件不完整，建議聯絡FedEx... │  ← aiRootCause
└──────────────────────────────────────────┘
```

- **Normal summary**: `bg-purple-50 text-purple-800 border-purple-200` with 🤖 icon
- **Root cause analysis**: `bg-red-50 text-red-800 border-red-200` with 🤖 icon
- **Analyzing state**: shows `🤖 {t('llm.analyzing')}…`
- **LLM disabled / no analysis**: nothing shown (no empty space)

### Settings Page — LLM Section

New "LLM Enhancement" section at top of `/settings`:

- **Enable/Disable** toggle
- **Provider** dropdown (OpenAI / Anthropic / Google / Ollama)
- **API Key** input (password type, masked) — hidden when Ollama selected
- **Base URL** input — shown when Ollama selected, default `http://localhost:11434`
- **Model** input — pre-filled per provider, editable
- **Test Connection** button — sends a tiny prompt, shows success/failure

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/llm/settings` | GET | Get LLM settings |
| `/api/llm/settings` | PUT | Update LLM settings |
| `/api/llm/test` | POST | Test LLM connection |
| `/api/packages/:id/analyze` | POST | Manual trigger analysis |

## Error Handling

- LLM call failure does not block refresh — logged silently
- Missing API key: skip analysis, no error shown on dashboard
- Settings page "Test Connection" validates the full pipeline
- Rate gate: 5-minute cooldown per package to prevent redundant API calls
- Timeout: 30s for LLM calls; if exceeded, skip silently

## i18n Keys

New namespace `llm` in all 4 locales (en, zh-TW, zh-CN, es-MX):

```
llm.title, llm.provider, llm.apiKey, llm.baseUrl, llm.model,
llm.enabled, llm.analyzing, llm.summary, llm.rootCause,
llm.testConnection, llm.testSuccess, llm.testFailed,
llm.providerOpenai, llm.providerAnthropic, llm.providerGoogle,
llm.providerOllama, llm.notConfigured
```

## Dependencies

```
npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/ollama
```

## Security

- API keys stored in DB — env var `LLM_API_KEY` takes precedence if set
- API key input uses `type="password"` with masked display
- Never expose API keys in client-side code — all LLM calls happen server-side
- Prompt injection mitigated by structured input (no raw user text in prompt)
