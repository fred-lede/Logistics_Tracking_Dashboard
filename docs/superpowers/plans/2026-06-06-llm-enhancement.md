# LLM Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LLM-powered smart summary and root cause analysis to the FedEx Tracking Dashboard, with multi-provider support (OpenAI, Anthropic, Google, Ollama).

**Architecture:** Follows the existing Provider Registry pattern (TrackingProvider, NotificationProvider). Vercel AI SDK (`ai`) provides a unified `generateText()` API across all LLM providers. Analysis runs server-side after each package refresh; results stored in DB and displayed inline on PackageCard.

**Tech Stack:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/ollama`), Prisma 7 (new `LLMSetting` model + `Package` field additions), Next.js 16 App Router API routes, next-intl i18n.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/llm/types.ts` | LLMProvider interface, AnalysisResult type |
| Create | `src/lib/llm/registry.ts` | Provider registration and lookup |
| Create | `src/lib/llm/providers/openai.ts` | OpenAI provider via @ai-sdk/openai |
| Create | `src/lib/llm/providers/anthropic.ts` | Anthropic provider via @ai-sdk/anthropic |
| Create | `src/lib/llm/providers/google.ts` | Google provider via @ai-sdk/google |
| Create | `src/lib/llm/providers/ollama.ts` | Ollama provider via @ai-sdk/ollama |
| Create | `src/lib/llm/service.ts` | analyzePackage() orchestrator |
| Create | `src/app/api/llm/settings/route.ts` | GET/PUT LLM settings |
| Create | `src/app/api/llm/test/route.ts` | POST test LLM connection |
| Create | `src/app/api/packages/[id]/analyze/route.ts` | POST manual trigger analysis |
| Create | `src/components/settings/llm-settings.tsx` | LLM settings section component |
| Modify | `prisma/schema.prisma` | Add Package fields + LLMSetting model |
| Modify | `src/app/api/packages/[id]/refresh/route.ts` | Call analyzePackage after refresh |
| Modify | `src/components/package-card.tsx` | Display aiSummary / aiRootCause |
| Modify | `src/components/settings/settings-page.tsx` | Add LLM settings section |
| Modify | `src/app/api/packages/route.ts` | Return aiSummary/aiRootCause in GET |
| Modify | `messages/en.json` | Add llm namespace keys |
| Modify | `messages/zh-TW.json` | Add llm namespace keys |
| Modify | `messages/zh-CN.json` | Add llm namespace keys |
| Modify | `messages/es-MX.json` | Add llm namespace keys |

---

### Task 1: Install Dependencies & Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Install npm packages**
Run:
```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/ollama
```

- [ ] **Step 2: Add Package model fields and LLMSetting model to `prisma/schema.prisma`**

Add 3 fields to the `Package` model (after `autoRefresh`):
```prisma
  aiSummary    String?
  aiRootCause  String?
  aiAnalyzedAt DateTime?
```

Add new `LLMSetting` model after `NotificationLog`:
```prisma
model LLMSetting {
  id        String   @id @default("global")
  provider  String   @default("openai")
  apiKey    String?
  baseUrl   String?
  model     String   @default("gpt-4o-mini")
  enabled   Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 3: Run Prisma migration**
Run:
```bash
npx prisma migrate dev --name add-llm-fields
```
Expected: Migration created and applied successfully.

- [ ] **Step 4: Commit**
```bash
git add prisma/schema.prisma prisma/migrations/ package.json package-lock.json
git commit -m "feat: add LLM schema fields and AI SDK dependencies"
```

---

### Task 2: LLM Provider Types & Registry

**Files:**
- Create: `src/lib/llm/types.ts`
- Create: `src/lib/llm/registry.ts`

- [ ] **Step 1: Create `src/lib/llm/types.ts`**
```typescript
export interface LLMProvider {
  name: string
  generateText(prompt: string, options?: { maxTokens?: number }): Promise<string>
}

export interface AnalysisResult {
  summary: string
  rootCause: string | null
}
```

- [ ] **Step 2: Create `src/lib/llm/registry.ts`**
```typescript
import type { LLMProvider } from './types'

const providers = new Map<string, LLMProvider>()

export function registerLLMProvider(name: string, provider: LLMProvider): void {
  providers.set(name, provider)
}

export function getLLMProvider(name: string): LLMProvider | undefined {
  return providers.get(name)
}
```

- [ ] **Step 3: Commit**
```bash
git add src/lib/llm/types.ts src/lib/llm/registry.ts
git commit -m "feat: add LLM provider types and registry"
```

---

### Task 3: Provider Implementations

**Files:**
- Create: `src/lib/llm/providers/openai.ts`
- Create: `src/lib/llm/providers/anthropic.ts`
- Create: `src/lib/llm/providers/google.ts`
- Create: `src/lib/llm/providers/ollama.ts`

- [ ] **Step 1: Create `src/lib/llm/providers/openai.ts`**
```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createOpenAIProvider(apiKey: string, modelName?: string): LLMProvider {
  const openai = createOpenAI({ apiKey })
  const model = modelName ?? 'gpt-4o-mini'
  return {
    name: 'openai',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: openai(model),
        prompt,
        maxTokens: options?.maxTokens ?? 200,
      })
      return text
    },
  }
}
```

- [ ] **Step 2: Create `src/lib/llm/providers/anthropic.ts`**
```typescript
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createAnthropicProvider(apiKey: string, modelName?: string): LLMProvider {
  const anthropic = createAnthropic({ apiKey })
  const model = modelName ?? 'claude-sonnet-4-20250514'
  return {
    name: 'anthropic',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: anthropic(model),
        prompt,
        maxTokens: options?.maxTokens ?? 200,
      })
      return text
    },
  }
}
```

- [ ] **Step 3: Create `src/lib/llm/providers/google.ts`**
```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createGoogleProvider(apiKey: string, modelName?: string): LLMProvider {
  const google = createGoogleGenerativeAI({ apiKey })
  const model = modelName ?? 'gemini-2.5-flash'
  return {
    name: 'google',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: google(model),
        prompt,
        maxTokens: options?.maxTokens ?? 200,
      })
      return text
    },
  }
}
```

- [ ] **Step 4: Create `src/lib/llm/providers/ollama.ts`**
```typescript
import { createOllama } from '@ai-sdk/ollama'
import { generateText } from 'ai'
import type { LLMProvider } from '../types'

export function createOllamaProvider(baseUrl?: string, modelName?: string): LLMProvider {
  const ollama = createOllama({ baseURL: baseUrl ?? 'http://localhost:11434' })
  const model = modelName ?? 'llama3'
  return {
    name: 'ollama',
    async generateText(prompt, options) {
      const { text } = await generateText({
        model: ollama(model),
        prompt,
        maxTokens: options?.maxTokens ?? 200,
      })
      return text
    },
  }
}
```

- [ ] **Step 5: Commit**
```bash
git add src/lib/llm/providers/
git commit -m "feat: add OpenAI, Anthropic, Google, Ollama LLM providers"
```

---

### Task 4: Analysis Service

**Files:**
- Create: `src/lib/llm/service.ts`

- [ ] **Step 1: Create `src/lib/llm/service.ts`**

This is the core orchestrator. It reads LLM settings from DB, constructs prompts based on package status, calls the appropriate provider, and stores results.

```typescript
import { prisma } from '@/lib/prisma'
import { getLLMProvider } from './registry'
import { createOpenAIProvider } from './providers/openai'
import { createAnthropicProvider } from './providers/anthropic'
import { createGoogleProvider } from './providers/google'
import { createOllamaProvider } from './providers/ollama'
import type { AnalysisResult } from './types'
import { safeParseEvents } from '@/lib/utils'

const EXCEPTION_STATUSES = ['EXCEPTION', 'DELAYED', 'RETURN_TO_SENDER']

const ANALYSIS_COOLDOWN_MS = 5 * 60 * 1000

function buildSummaryPrompt(pkg: {
  trackingNumber: string
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  events: string
}, locale: string): string {
  return `You are a FedEx package tracking assistant. Summarize this package's current status in ONE concise sentence (under 80 words) in ${locale}. Include: current location, status, and ETA if available.

Package: ${pkg.trackingNumber}
Status: ${pkg.status ?? 'Unknown'}
Origin: ${pkg.origin ?? 'N/A'}
Destination: ${pkg.destination ?? 'N/A'}
ETA: ${pkg.eta ?? 'N/A'}
Recent events: ${pkg.events}`
}

function buildRootCausePrompt(pkg: {
  trackingNumber: string
  status: string | null
  events: string
}, locale: string): string {
  return `You are a logistics expert analyzing a FedEx package exception. Based on the tracking events, provide:
1) Likely root cause (1-2 sentences)
2) Recommended action (1 sentence)
Be specific and actionable. Respond in ${locale}.

Package: ${pkg.trackingNumber}
Status: ${pkg.status ?? 'Unknown'}
Events: ${pkg.events}`
}

function resolveProvider(providerName: string, apiKey: string | null, baseUrl: string | null, model: string | null) {
  switch (providerName) {
    case 'openai':
      if (!apiKey) return null
      return createOpenAIProvider(apiKey, model ?? undefined)
    case 'anthropic':
      if (!apiKey) return null
      return createAnthropicProvider(apiKey, model ?? undefined)
    case 'google':
      if (!apiKey) return null
      return createGoogleProvider(apiKey, model ?? undefined)
    case 'ollama':
      return createOllamaProvider(baseUrl ?? undefined, model ?? undefined)
    default:
      return getLLMProvider(providerName)
  }
}

const LOCALE_MAP: Record<string, string> = {
  en: 'English',
  'zh-TW': 'Traditional Chinese',
  'zh-CN': 'Simplified Chinese',
  'es-MX': 'Spanish',
}

export async function analyzePackage(
  pkgId: string,
  locale: string = 'en'
): Promise<AnalysisResult | null> {
  const settings = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
  if (!settings?.enabled) return null

  const pkg = await prisma.package.findUnique({ where: { id: pkgId } })
  if (!pkg) return null

  if (pkg.aiAnalyzedAt && Date.now() - pkg.aiAnalyzedAt.getTime() < ANALYSIS_COOLDOWN_MS) {
    return {
      summary: pkg.aiSummary ?? '',
      rootCause: pkg.aiRootCause,
    }
  }

  const provider = resolveProvider(settings.provider, settings.apiKey, settings.baseUrl, settings.model)
  if (!provider) return null

  const langLabel = LOCALE_MAP[locale] ?? 'English'
  const isException = EXCEPTION_STATUSES.includes(pkg.status ?? '')

  try {
    const summaryPrompt = buildSummaryPrompt(
      {
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        origin: pkg.origin,
        destination: pkg.destination,
        eta: pkg.eta,
        events: pkg.events,
      },
      langLabel
    )

    const summary = await provider.generateText(summaryPrompt, { maxTokens: 200 })

    let rootCause: string | null = null
    if (isException) {
      const rootCausePrompt = buildRootCausePrompt(
        {
          trackingNumber: pkg.trackingNumber,
          status: pkg.status,
          events: pkg.events,
        },
        langLabel
      )
      rootCause = await provider.generateText(rootCausePrompt, { maxTokens: 200 })
    }

    await prisma.package.update({
      where: { id: pkgId },
      data: {
        aiSummary: summary,
        aiRootCause: rootCause,
        aiAnalyzedAt: new Date(),
      },
    })

    return { summary, rootCause }
  } catch {
    return null
  }
}

export async function testConnection(
  providerName: string,
  apiKey: string | null,
  baseUrl: string | null,
  model: string | null
): Promise<{ success: boolean; error?: string }> {
  const provider = resolveProvider(providerName, apiKey, baseUrl, model)
  if (!provider) return { success: false, error: 'Invalid provider or missing API key' }

  try {
    await provider.generateText('Say "OK" in one word.', { maxTokens: 10 })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}
```

Note: `safeParseEvents` already exists in `src/lib/utils.ts` — we reference it but don't use it directly here since we pass raw JSON strings to the prompt. The function is imported for future use if needed.

- [ ] **Step 2: Commit**
```bash
git add src/lib/llm/service.ts
git commit -m "feat: add LLM analysis service with prompt construction"
```

---

### Task 5: LLM Settings API Routes

**Files:**
- Create: `src/app/api/llm/settings/route.ts`
- Create: `src/app/api/llm/test/route.ts`

- [ ] **Step 1: Create `src/app/api/llm/settings/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  let settings = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
  if (!settings) {
    settings = await prisma.lLMSetting.create({ data: { id: 'global' } })
  }
  return NextResponse.json({
    ...settings,
    apiKey: settings.apiKey ? '••••••••' : null,
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const prev = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })

  const data: Record<string, unknown> = {
    provider: body.provider,
    model: body.model,
    enabled: body.enabled,
    baseUrl: body.baseUrl ?? null,
  }

  if (body.apiKey && body.apiKey !== '••••••••') {
    data.apiKey = body.apiKey
  } else if (prev && !body.apiKey) {
    data.apiKey = null
  }

  const updated = await prisma.lLMSetting.upsert({
    where: { id: 'global' },
    update: data,
    create: { id: 'global', ...data },
  })

  return NextResponse.json({
    ...updated,
    apiKey: updated.apiKey ? '••••••••' : null,
  })
}
```

- [ ] **Step 2: Create `src/app/api/llm/test/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { testConnection } from '@/lib/llm/service'

export async function POST(request: Request) {
  const body = await request.json()
  const result = await testConnection(
    body.provider,
    body.apiKey ?? null,
    body.baseUrl ?? null,
    body.model ?? null
  )
  return NextResponse.json(result, { status: result.success ? 200 : 502 })
}
```

- [ ] **Step 3: Commit**
```bash
git add src/app/api/llm/
git commit -m "feat: add LLM settings and test connection API routes"
```

---

### Task 6: Manual Analyze API Route

**Files:**
- Create: `src/app/api/packages/[id]/analyze/route.ts`

- [ ] **Step 1: Create `src/app/api/packages/[id]/analyze/route.ts`**
```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzePackage } from '@/lib/llm/service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const pkg = await prisma.package.findUnique({ where: { id } })
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/)
  const locale = localeMatch?.[1] ?? 'en'

  const result = await analyzePackage(id, locale)
  if (!result) {
    return NextResponse.json({ error: 'LLM analysis not available' }, { status: 503 })
  }

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Commit**
```bash
git add src/app/api/packages/[id]/analyze/
git commit -m "feat: add manual package analysis API route"
```

---

### Task 7: Integrate Analysis into Refresh Route

**Files:**
- Modify: `src/app/api/packages/[id]/refresh/route.ts`

- [ ] **Step 1: Add LLM analysis call after FedEx refresh in `src/app/api/packages/[id]/refresh/route.ts`**

Add import at top (after existing imports):
```typescript
import { analyzePackage } from '@/lib/llm/service'
```

After the overdue detection block (after line 84 `await sendNotifications(overdueMessage)}`), and before the `safeParseJSON` function definition (line 86), add:
```typescript
  // LLM analysis (fire-and-forget, does not block response)
  const cookieHeader = request.headers.get('cookie') ?? ''
  const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/)
  const locale = localeMatch?.[1] ?? 'en'
  analyzePackage(id, locale).catch(() => {})
```

Note: The function signature must be changed from `_request` to `request` since we now use the request object to read cookies.

Change the function signature from:
```typescript
export async function POST(
  _request: Request,
```
to:
```typescript
export async function POST(
  request: Request,
```

- [ ] **Step 2: Also include aiSummary/aiRootCause in the refresh response**

In the `NextResponse.json({...updated, ...})` return block, add after the `partNumbers` line:
```typescript
    aiSummary: updated.aiSummary,
    aiRootCause: updated.aiRootCause,
```

- [ ] **Step 3: Build and verify**
Run:
```bash
npm run build
```
Expected: Build passes with no TypeScript errors.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/packages/[id]/refresh/route.ts
git commit -m "feat: integrate LLM analysis into package refresh flow"
```

---

### Task 8: Return AI Fields in Packages GET

**Files:**
- Modify: `src/app/api/packages/route.ts`

- [ ] **Step 1: Read `src/app/api/packages/route.ts`** to understand current structure

The GET handler returns packages from DB. We need to ensure `aiSummary`, `aiRootCause`, and `aiAnalyzedAt` are included in the response.

- [ ] **Step 2: Add aiSummary/aiRootCause to the response mapping**

After reading the file, ensure the GET response includes the new fields. If the route uses `findMany()` with a select, add the 3 new fields. If it returns raw DB objects (Prisma default includes all columns), no code change is needed — just verify the fields appear.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/packages/route.ts
git commit -m "feat: include AI analysis fields in packages API response"
```

---

### Task 9: i18n Keys for LLM

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add `llm` namespace to `messages/en.json`**

Add after the `"locale"` section, before the closing `}`:
```json
  "llm": {
    "title": "LLM Enhancement",
    "provider": "Provider",
    "apiKey": "API Key",
    "apiKeyPlaceholder": "Enter API key",
    "baseUrl": "Base URL",
    "baseUrlPlaceholder": "e.g. http://localhost:11434",
    "model": "Model",
    "modelPlaceholder": "e.g. gpt-4o-mini",
    "enabled": "Enable LLM Analysis",
    "enabledHint": "Auto-analyze packages on refresh using AI",
    "analyzing": "Analyzing",
    "summary": "AI Summary",
    "rootCause": "Root Cause Analysis",
    "testConnection": "Test Connection",
    "testing": "Testing\u2026",
    "testSuccess": "Connection successful",
    "testFailed": "Connection failed",
    "providerOpenai": "OpenAI",
    "providerAnthropic": "Anthropic",
    "providerGoogle": "Google Gemini",
    "providerOllama": "Ollama (Local)",
    "notConfigured": "LLM not configured"
  }
```

- [ ] **Step 2: Add `llm` namespace to `messages/zh-TW.json`**

```json
  "llm": {
    "title": "LLM 增強",
    "provider": "供應商",
    "apiKey": "API 金鑰",
    "apiKeyPlaceholder": "輸入 API 金鑰",
    "baseUrl": "基底 URL",
    "baseUrlPlaceholder": "例：http://localhost:11434",
    "model": "模型",
    "modelPlaceholder": "例：gpt-4o-mini",
    "enabled": "啟用 LLM 分析",
    "enabledHint": "重新整理時自動使用 AI 分析包裹",
    "analyzing": "分析中",
    "summary": "AI 摘要",
    "rootCause": "根因分析",
    "testConnection": "測試連線",
    "testing": "測試中\u2026",
    "testSuccess": "連線成功",
    "testFailed": "連線失敗",
    "providerOpenai": "OpenAI",
    "providerAnthropic": "Anthropic",
    "providerGoogle": "Google Gemini",
    "providerOllama": "Ollama（本機）",
    "notConfigured": "LLM 未設定"
  }
```

- [ ] **Step 3: Add `llm` namespace to `messages/zh-CN.json`**

```json
  "llm": {
    "title": "LLM 增强",
    "provider": "供应商",
    "apiKey": "API 密钥",
    "apiKeyPlaceholder": "输入 API 密钥",
    "baseUrl": "基础 URL",
    "baseUrlPlaceholder": "例：http://localhost:11434",
    "model": "模型",
    "modelPlaceholder": "例：gpt-4o-mini",
    "enabled": "启用 LLM 分析",
    "enabledHint": "刷新时自动使用 AI 分析包裹",
    "analyzing": "分析中",
    "summary": "AI 摘要",
    "rootCause": "根因分析",
    "testConnection": "测试连接",
    "testing": "测试中\u2026",
    "testSuccess": "连接成功",
    "testFailed": "连接失败",
    "providerOpenai": "OpenAI",
    "providerAnthropic": "Anthropic",
    "providerGoogle": "Google Gemini",
    "providerOllama": "Ollama（本机）",
    "notConfigured": "LLM 未配置"
  }
```

- [ ] **Step 4: Add `llm` namespace to `messages/es-MX.json`**

```json
  "llm": {
    "title": "Mejora LLM",
    "provider": "Proveedor",
    "apiKey": "Clave API",
    "apiKeyPlaceholder": "Ingrese la clave API",
    "baseUrl": "URL base",
    "baseUrlPlaceholder": "ej. http://localhost:11434",
    "model": "Modelo",
    "modelPlaceholder": "ej. gpt-4o-mini",
    "enabled": "Habilitar análisis LLM",
    "enabledHint": "Analizar paquetes automáticamente al actualizar usando IA",
    "analyzing": "Analizando",
    "summary": "Resumen IA",
    "rootCause": "Análisis de causa raíz",
    "testConnection": "Probar conexión",
    "testing": "Probando\u2026",
    "testSuccess": "Conexión exitosa",
    "testFailed": "Conexión fallida",
    "providerOpenai": "OpenAI",
    "providerAnthropic": "Anthropic",
    "providerGoogle": "Google Gemini",
    "providerOllama": "Ollama (Local)",
    "notConfigured": "LLM no configurado"
  }
```

- [ ] **Step 5: Commit**
```bash
git add messages/
git commit -m "feat: add LLM i18n keys for all 4 locales"
```

---

### Task 10: LLM Settings Component

**Files:**
- Create: `src/components/settings/llm-settings.tsx`

- [ ] **Step 1: Create `src/components/settings/llm-settings.tsx`**

This component follows the existing settings-page.tsx patterns (toggle style, form layout, `useTranslations`).

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

interface LLMSettingData {
  provider: string
  apiKey: string | null
  baseUrl: string | null
  model: string
  enabled: boolean
}

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
  ollama: 'llama3',
}

export function LLMSettings() {
  const t = useTranslations('llm')
  const [setting, setSetting] = useState<LLMSettingData | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [testError, setTestError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/llm/settings').then((r) => r.json()).then(setSetting)
  }, [])

  if (!setting) return null

  async function updateSetting(update: Partial<LLMSettingData>) {
    const res = await fetch('/api/llm/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) setSetting(await res.json())
  }

  async function handleTestConnection() {
    setTestStatus('testing')
    setTestError(null)
    const res = await fetch('/api/llm/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: setting.provider,
        apiKey: setting.apiKey === '••••••••' ? undefined : setting.apiKey,
        baseUrl: setting.baseUrl,
        model: setting.model,
      }),
    })
    const data = await res.json()
    if (data.success) {
      setTestStatus('success')
    } else {
      setTestStatus('failed')
      setTestError(data.error ?? 'Unknown error')
    }
  }

  function handleProviderChange(provider: string) {
    const model = PROVIDER_DEFAULTS[provider] ?? setting.model
    updateSetting({ provider, model })
    setTestStatus('idle')
  }

  const isOllama = setting.provider === 'ollama'

  return (
    <div className="mb-6 rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">{t('title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('enabledHint')}</p>
        </div>
        <button
          onClick={() => updateSetting({ enabled: !setting.enabled })}
          role="switch"
          aria-checked={setting.enabled}
          className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${setting.enabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${setting.enabled ? 'left-full -translate-x-full' : 'left-0.5'}`} />
        </button>
      </div>

      {setting.enabled && (
        <div className="space-y-4">
          <div>
            <label htmlFor="llm-provider" className="block text-sm font-medium text-gray-700 mb-1">{t('provider')}</label>
            <select
              id="llm-provider"
              value={setting.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            >
              <option value="openai">{t('providerOpenai')}</option>
              <option value="anthropic">{t('providerAnthropic')}</option>
              <option value="google">{t('providerGoogle')}</option>
              <option value="ollama">{t('providerOllama')}</option>
            </select>
          </div>

          {!isOllama && (
            <div>
              <label htmlFor="llm-api-key" className="block text-sm font-medium text-gray-700 mb-1">{t('apiKey')}</label>
              <input
                id="llm-api-key"
                type="password"
                value={setting.apiKey ?? ''}
                onChange={(e) => updateSetting({ apiKey: e.target.value })}
                placeholder={t('apiKeyPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
              />
            </div>
          )}

          {isOllama && (
            <div>
              <label htmlFor="llm-base-url" className="block text-sm font-medium text-gray-700 mb-1">{t('baseUrl')}</label>
              <input
                id="llm-base-url"
                type="url"
                value={setting.baseUrl ?? 'http://localhost:11434'}
                onChange={(e) => updateSetting({ baseUrl: e.target.value })}
                placeholder={t('baseUrlPlaceholder')}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
              />
            </div>
          )}

          <div>
            <label htmlFor="llm-model" className="block text-sm font-medium text-gray-700 mb-1">{t('model')}</label>
            <input
              id="llm-model"
              type="text"
              value={setting.model}
              onChange={(e) => updateSetting({ model: e.target.value })}
              placeholder={t('modelPlaceholder')}
              spellCheck={false}
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            />
          </div>

          <div>
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            >
              {testStatus === 'testing' ? t('testing') : t('testConnection')}
            </button>
            {testStatus === 'success' && (
              <span className="ml-3 text-sm text-green-600">{t('testSuccess')}</span>
            )}
            {testStatus === 'failed' && (
              <span className="ml-3 text-sm text-red-600">{t('testFailed')}{testError ? `: ${testError}` : ''}</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/settings/llm-settings.tsx
git commit -m "feat: add LLM settings component"
```

---

### Task 11: Integrate LLM Settings into Settings Page

**Files:**
- Modify: `src/components/settings/settings-page.tsx`

- [ ] **Step 1: Import LLMSettings and add to settings page**

Add import at top (after existing imports):
```typescript
import { LLMSettings } from './llm-settings'
```

Add `<LLMSettings />` in the JSX, right before the `{/* Global Toggle */}` section (before line 166). This places the LLM section at the top of settings:

```tsx
      {/* LLM Enhancement */}
      <LLMSettings />
```

- [ ] **Step 2: Commit**
```bash
git add src/components/settings/settings-page.tsx
git commit -m "feat: add LLM settings section to settings page"
```

---

### Task 12: Display AI Analysis on PackageCard

**Files:**
- Modify: `src/components/package-card.tsx`

- [ ] **Step 1: Add AI analysis display to PackageCard**

Add the `aiSummary` and `aiRootCause` fields to the `PackageData` interface:
```typescript
  aiSummary: string | null
  aiRootCause: string | null
```

Add `const lt = useTranslations('llm')` after existing `const st = useTranslations('settings')`.

Add the AI display block in the JSX, after the origin/destination section (after the `{(pkg.origin || pkg.destination) && ...}` block, around line 184) and before the ETA section:

```tsx
      {pkg.aiSummary && (
        <div className="mb-2 rounded-md bg-purple-50 border border-purple-200 px-3 py-2 text-xs text-purple-800">
          <span aria-hidden="true" className="mr-1">🤖</span>{lt('summary')}: {pkg.aiSummary}
        </div>
      )}
      {pkg.aiRootCause && (
        <div className="mb-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          <span aria-hidden="true" className="mr-1">🤖</span>{lt('rootCause')}: {pkg.aiRootCause}
        </div>
      )}
```

- [ ] **Step 2: Commit**
```bash
git add src/components/package-card.tsx
git commit -m "feat: display AI summary and root cause on package card"
```

---

### Task 13: Update Dashboard Page PackageData Interface

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add AI fields to PackageData interface in `src/app/page.tsx`**

Add to the `PackageData` interface (after `autoRefresh: boolean`):
```typescript
  aiSummary: string | null
  aiRootCause: string | null
```

- [ ] **Step 2: Build and verify**
Run:
```bash
npm run build
```
Expected: Build passes with no TypeScript errors.

- [ ] **Step 3: Commit**
```bash
git add src/app/page.tsx
git commit -m "feat: add AI analysis fields to dashboard page interface"
```

---

### Task 14: Build Verification & Final Test

- [ ] **Step 1: Run full build**
Run:
```bash
npm run build
```
Expected: Build passes.

- [ ] **Step 2: Run existing tests**
Run:
```bash
npm test
```
Expected: Component tests (6/6) pass. The Prisma Node module version test may still fail (pre-existing issue).

- [ ] **Step 3: Run lint**
Run:
```bash
npm run lint
```
Expected: Only pre-existing lint errors (locale-switcher set-state-in-effect). No new lint errors.

- [ ] **Step 4: Final commit if any fixes needed**
```bash
git add -A
git commit -m "fix: address build/lint issues from LLM integration"
```
