import { db } from '@/lib/db'
import { getLLMProvider } from './registry'
import type { AnalysisResult, DelayRisk } from './types'

const EXCEPTION_STATUSES = ['EXCEPTION', 'DELAYED', 'RETURN_TO_SENDER']
const TERMINAL_STATUSES = ['DELIVERED', 'PICKUP_AVAILABLE']
const ANALYSIS_COOLDOWN_MS = 5 * 60 * 1000
const LLM_TIMEOUT_MS = 30_000

function buildSummaryPrompt(pkg: {
  trackingNumber: string
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  events: string
}): string {
  return `You are a logistics package tracking assistant. Summarize this package's current status in ONE concise sentence (under 80 words) in English. Include: current location, status, and ETA if available.

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
}): string {
  return `You are a logistics expert analyzing a package exception. Based on the tracking events, provide:
1) Likely root cause (1-2 sentences)
2) Recommended action (1 sentence)
Be specific and actionable. Respond in English.

Package: ${pkg.trackingNumber}
Status: ${pkg.status ?? 'Unknown'}
Events: ${pkg.events}`
}

function buildRiskPrompt(pkg: {
  trackingNumber: string
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  events: string
  subPackages: string
}): string {
  let subText = 'No sub-packages'
  try {
    const subs = JSON.parse(pkg.subPackages)
    if (Array.isArray(subs) && subs.length > 0) {
      subText = subs.map((s: { trackingNumber?: string; status?: string }) =>
        `  - ${s.trackingNumber ?? 'unknown'}: ${s.status ?? 'unknown'}`
      ).join('\n')
      subText = `Sub-packages:\n${subText}`
    }
  } catch {}
  const isTerminal = pkg.status && ['DELIVERED', 'PICKUP_AVAILABLE'].includes(pkg.status)
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
${isTerminal ? '5. This package has already reached a terminal status (DELIVERED or PICKUP_AVAILABLE) — risk is automatically LOW regardless of the original ETA.' : ''}

Package: ${pkg.trackingNumber}
Status: ${pkg.status ?? 'Unknown'}
Route: ${pkg.origin ?? 'N/A'} → ${pkg.destination ?? 'N/A'}
ETA: ${pkg.eta ?? 'N/A'}

Timeline (most recent first):
${pkg.events}

${subText}`
}

function buildTranslatePrompt(text: string, targetLang: string): string {
  return `Translate the following text to ${targetLang}. Keep it concise and natural. Only output the translation, nothing else.

${text}`
}

export async function resolveProvider(providerName: string, apiKey: string | null, baseUrl: string | null, model: string | null, providerLabel?: string | null, extra?: { compatMode?: string }) {
  try {
    switch (providerName) {
      case 'openai':
        if (!apiKey) return null
        const { createOpenAIProvider } = await import('./providers/openai')
        return createOpenAIProvider(apiKey, model ?? undefined)
      case 'anthropic':
        if (!apiKey) return null
        const { createAnthropicProvider } = await import('./providers/anthropic')
        return createAnthropicProvider(apiKey, model ?? undefined)
      case 'google':
        if (!apiKey) return null
        const { createGoogleProvider } = await import('./providers/google')
        return createGoogleProvider(apiKey, model ?? undefined)
      case 'ollama':
        const { createOllamaProvider } = await import('./providers/ollama')
        return createOllamaProvider(baseUrl ?? undefined, model ?? undefined)
      case 'custom':
        if (!baseUrl) return null
        const { createCustomProvider } = await import('./providers/custom')
        return createCustomProvider(baseUrl, model ?? 'gpt-4o-mini', apiKey, providerLabel, extra?.compatMode)
      default:
        return getLLMProvider(providerName)
    }
  } catch (err) {
    console.error(`[llm] Failed to load provider "${providerName}":`, err)
    return null
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
): Promise<AnalysisResult | null> {
  const settings = await db.lLMSetting.findUnique({ where: { id: 'global' } })
  if (!settings?.enabled) return null

  const pkg = await db.package.findUnique({ where: { id: pkgId } })
  if (!pkg) return null

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

  const provider = await resolveProvider(settings.provider, settings.apiKey, settings.baseUrl, settings.model, settings.providerLabel, { compatMode: settings.compatMode ?? 'chat' })
  if (!provider) return null

  const isException = EXCEPTION_STATUSES.includes(pkg.status ?? '')

  try {
    const summaryPrompt = buildSummaryPrompt({
      trackingNumber: pkg.trackingNumber,
      status: pkg.status,
      origin: pkg.origin,
      destination: pkg.destination,
      eta: pkg.eta,
      events: pkg.events,
    })

    const summary = await provider.generateText(summaryPrompt, { maxTokens: 200, timeout: LLM_TIMEOUT_MS })

    let rootCause: string | null = null
    if (isException) {
      const rootCausePrompt = buildRootCausePrompt({
        trackingNumber: pkg.trackingNumber,
        status: pkg.status,
        events: pkg.events,
      })
      rootCause = await provider.generateText(rootCausePrompt, { maxTokens: 200, timeout: LLM_TIMEOUT_MS })
    }

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

    await db.package.update({
      where: { id: pkgId },
      data: {
        aiSummary: summary,
        aiRootCause: rootCause,
        aiDelayRisk: delayRisk ? JSON.stringify(delayRisk) : null,
        aiAnalyzedAt: new Date(),
      },
    })

    return { summary, rootCause, delayRisk }
  } catch {
    return null
  }
}

export async function translateSummary(
  text: string,
  locale: string,
): Promise<string | null> {
  if (locale === 'en' || !text) return text

  const langLabel = LOCALE_MAP[locale]
  if (!langLabel) return text

  const settings = await db.lLMSetting.findUnique({ where: { id: 'global' } })
  if (!settings?.enabled) return text

  const provider = await resolveProvider(settings.provider, settings.apiKey, settings.baseUrl, settings.model, settings.providerLabel, { compatMode: settings.compatMode ?? 'chat' })
  if (!provider) return text

  try {
    const prompt = buildTranslatePrompt(text, langLabel)
    return await provider.generateText(prompt, { maxTokens: 200, timeout: LLM_TIMEOUT_MS })
  } catch {
    return text
  }
}

export async function testConnection(
  providerName: string,
  apiKey: string | null,
  baseUrl: string | null,
  model: string | null,
  providerLabel?: string | null,
  compatMode?: string,
): Promise<{ success: boolean; error?: string }> {
  const provider = await resolveProvider(providerName, apiKey, baseUrl, model, providerLabel, { compatMode })
  if (!provider) return { success: false, error: `Provider "${providerName}" failed to initialize` }

  try {
    await provider.generateText('Say "OK" in one word.', { maxTokens: 10, timeout: LLM_TIMEOUT_MS })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Connection failed' }
  }
}
