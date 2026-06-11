import { NextResponse } from 'next/server'
import { loadCarrierConfig, saveCarrierConfig } from '@/lib/carrier-config'
import { requireLocalRequest } from '@/lib/request-access'

const MASKED = '••••••••'

export async function GET(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const config = loadCarrierConfig()
  return NextResponse.json({
    fedexApiKey: config?.fedexApiKey ? MASKED : '',
    fedexApiSecret: config?.fedexApiSecret ? MASKED : '',
    fedexProduction: config?.fedexProduction ?? false,
    dhlApiKey: config?.dhlApiKey ? MASKED : '',
  })
}

export async function PUT(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json()
  const existing = loadCarrierConfig() || { fedexApiKey: '', fedexApiSecret: '', dhlApiKey: '' }

  if (body.fedexApiKey !== undefined) {
    existing.fedexApiKey = body.fedexApiKey === MASKED ? existing.fedexApiKey : body.fedexApiKey
  }
  if (body.fedexApiSecret !== undefined) {
    existing.fedexApiSecret = body.fedexApiSecret === MASKED ? existing.fedexApiSecret : body.fedexApiSecret
  }
  if (body.fedexProduction !== undefined) {
    existing.fedexProduction = body.fedexProduction
  }
  if (body.dhlApiKey !== undefined) {
    existing.dhlApiKey = body.dhlApiKey === MASKED ? existing.dhlApiKey : body.dhlApiKey
  }

  saveCarrierConfig(existing)
  return NextResponse.json({
    fedexApiKey: existing.fedexApiKey ? MASKED : '',
    fedexApiSecret: existing.fedexApiSecret ? MASKED : '',
    fedexProduction: existing.fedexProduction ?? false,
    dhlApiKey: existing.dhlApiKey ? MASKED : '',
  })
}
