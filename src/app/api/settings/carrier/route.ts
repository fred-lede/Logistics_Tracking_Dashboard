import { NextResponse } from 'next/server'
import { loadCarrierConfig, saveCarrierConfig } from '@/lib/carrier-config'

const MASKED = '••••••••'

export async function GET() {
  const config = loadCarrierConfig()
  return NextResponse.json({
    fedexApiKey: config?.fedexApiKey ? MASKED : '',
    fedexApiSecret: config?.fedexApiSecret ? MASKED : '',
    fedexProduction: config?.fedexProduction ?? false,
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const existing = loadCarrierConfig() || { fedexApiKey: '', fedexApiSecret: '' }

  if (body.fedexApiKey !== undefined) {
    existing.fedexApiKey = body.fedexApiKey === MASKED ? existing.fedexApiKey : body.fedexApiKey
  }
  if (body.fedexApiSecret !== undefined) {
    existing.fedexApiSecret = body.fedexApiSecret === MASKED ? existing.fedexApiSecret : body.fedexApiSecret
  }
  if (body.fedexProduction !== undefined) {
    existing.fedexProduction = body.fedexProduction
  }

  saveCarrierConfig(existing)
  return NextResponse.json({
    fedexApiKey: existing.fedexApiKey ? MASKED : '',
    fedexApiSecret: existing.fedexApiSecret ? MASKED : '',
    fedexProduction: existing.fedexProduction ?? false,
  })
}
