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

  const data: Record<string, unknown> = {}

  if (body.provider !== undefined) data.provider = body.provider
  if (body.providerLabel !== undefined) data.providerLabel = body.providerLabel ?? null
  if (body.model !== undefined) data.model = body.model
  if (body.enabled !== undefined) data.enabled = body.enabled
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl ?? null
  if (body.compatMode !== undefined) data.compatMode = body.compatMode
  if (body.locale !== undefined) data.locale = body.locale

  if (body.apiKey && body.apiKey !== '••••••••') {
    data.apiKey = body.apiKey
  } else if (body.apiKey === '' || body.apiKey === null) {
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
