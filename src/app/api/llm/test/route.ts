import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testConnection } from '@/lib/llm/service'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const saved = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
    const apiKey = (body.apiKey && body.apiKey !== '••••••••') ? body.apiKey : (saved?.apiKey ?? null)
    const baseUrl = body.baseUrl ?? saved?.baseUrl ?? null
    const model = body.model ?? saved?.model ?? null
    const provider = body.provider ?? saved?.provider ?? 'openai'
    const providerLabel = body.providerLabel ?? saved?.providerLabel ?? null
    const compatMode = body.compatMode ?? saved?.compatMode ?? 'chat'
    const result = await testConnection(provider, apiKey, baseUrl, model, providerLabel, compatMode)
    return NextResponse.json(result, { status: result.success ? 200 : 502 })
  } catch (err) {
    console.error('[api/llm/test] Unhandled error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
