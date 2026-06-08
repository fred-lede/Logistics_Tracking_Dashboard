import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testConnection, resolveProvider } from '@/lib/llm/service'
import { sendNotifications } from '@/lib/notification/service'
import type { StatusChangeMessage } from '@/lib/notification/types'

const LLM_TIMEOUT_MS = 60_000

const LOCALE_MAP: Record<string, string> = {
  en: 'English',
  'zh-TW': 'Traditional Chinese',
  'zh-CN': 'Simplified Chinese',
  'es-MX': 'Spanish',
}

export async function POST(request: Request) {
  const body = await request.json()
  const saved = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })

  if (!saved?.enabled) {
    return NextResponse.json({ success: false, error: 'LLM is not enabled' }, { status: 400 })
  }

  const apiKey = (body.apiKey && body.apiKey !== '••••••••') ? body.apiKey : (saved?.apiKey ?? null)
  const baseUrl = body.baseUrl ?? saved?.baseUrl ?? null
  const model = body.model ?? saved?.model ?? null
  const provider = body.provider ?? saved?.provider ?? 'openai'
  const providerLabel = body.providerLabel ?? saved?.providerLabel ?? null
  const compatMode = body.compatMode ?? saved?.compatMode ?? 'chat'

  const connResult = await testConnection(provider, apiKey, baseUrl, model, providerLabel, compatMode)
  if (!connResult.success) {
    return NextResponse.json({ success: false, error: `LLM connection failed: ${connResult.error}` }, { status: 502 })
  }

  const locale = body.locale ?? saved?.locale ?? 'en'
  const langLabel = LOCALE_MAP[locale] ?? 'English'
  const prompt = `You are a FedEx package tracking assistant. Write a brief test summary (under 50 words) for a fictional package in ${langLabel}. Package: 794798798798, Status: IN_TRANSIT, Origin: Taipei, Destination: Los Angeles, ETA: 2026-06-10. Say this is a test notification.`

  const llmProvider = resolveProvider(provider, apiKey, baseUrl, model, providerLabel, { compatMode })
  if (!llmProvider) {
    return NextResponse.json({ success: false, error: 'Failed to resolve LLM provider' }, { status: 500 })
  }

  let aiSummary: string
  try {
    aiSummary = await llmProvider.generateText(prompt, { maxTokens: 100, timeout: LLM_TIMEOUT_MS })
  } catch (err) {
    return NextResponse.json({ success: false, error: `LLM generation failed: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 502 })
  }

  const message: StatusChangeMessage = {
    type: 'status_change',
    packageId: 'test-package-id',
    trackingNumber: '794798798798',
    nickname: '[Test] Demo Package',
    status: 'IN_TRANSIT',
    eta: '2026-06-10',
    origin: 'Taipei',
    destination: 'Los Angeles',
    events: [
      { date: new Date().toISOString(), description: 'Package in transit', location: 'Anchorage, AK', status: 'IN_TRANSIT' },
    ],
    aiSummary,
    aiRootCause: null,
  }

  const results = await sendNotifications(message)
  const allSuccess = results.every((r) => r.result.success)
  const noChannels = results.length === 0

  if (noChannels) {
    return NextResponse.json({ success: false, error: 'No enabled notification channels found', aiSummary })
  }

  return NextResponse.json({
    success: allSuccess,
    aiSummary,
    channels: results.map((r) => ({ channelId: r.channelId, success: r.result.success, error: r.result.error })),
  })
}
