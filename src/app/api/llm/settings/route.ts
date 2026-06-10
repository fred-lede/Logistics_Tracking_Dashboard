import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  let settings = await db.lLMSetting.findUnique({ where: { id: 'global' } })
  if (!settings) {
    settings = await db.lLMSetting.create({ data: { id: 'global' } })
  }
  return NextResponse.json({
    ...settings,
    apiKey: settings.apiKey ? '••••••••' : null,
  })
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, unknown>

  const data: {
    provider?: string
    providerLabel?: string | null
    model?: string
    enabled?: boolean
    baseUrl?: string | null
    compatMode?: string
    locale?: string
    apiKey?: string | null
  } = {}

  if (typeof body.provider === 'string') data.provider = body.provider
  if (typeof body.providerLabel === 'string' || body.providerLabel === null) data.providerLabel = body.providerLabel
  if (typeof body.model === 'string') data.model = body.model
  if (typeof body.enabled === 'boolean') data.enabled = body.enabled
  if (typeof body.baseUrl === 'string' || body.baseUrl === null) data.baseUrl = body.baseUrl
  if (typeof body.compatMode === 'string') data.compatMode = body.compatMode
  if (typeof body.locale === 'string') data.locale = body.locale

  if (typeof body.apiKey === 'string' && body.apiKey && body.apiKey !== '••••••••') {
    data.apiKey = body.apiKey
  } else if (body.apiKey === '' || body.apiKey === null) {
    data.apiKey = null
  }

  const updated = await db.lLMSetting.upsert({
    where: { id: 'global' },
    update: data,
    create: { id: 'global', ...data },
  })

  return NextResponse.json({
    ...updated,
    apiKey: updated.apiKey ? '••••••••' : null,
  })
}
