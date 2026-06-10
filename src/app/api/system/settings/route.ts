import { NextResponse } from 'next/server'
import { requireLocalRequest } from '@/lib/request-access'
import { buildServerUrls } from '@/lib/system-network'
import {
  getPublicSystemSettings,
  loadSystemSettings,
  saveSystemSettings,
  updateSystemSettings,
  type SystemSettings,
} from '@/lib/system-config'

function withUrls(settings = loadSystemSettings()) {
  return {
    ...getPublicSystemSettings(settings),
    serverUrls: buildServerUrls(settings.serverPort),
  }
}

export async function GET(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden
  return NextResponse.json(withUrls())
}

export async function PUT(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const existing = loadSystemSettings()
  const body = (await request.json()) as Partial<SystemSettings>
  const updated = updateSystemSettings(existing, body)
  saveSystemSettings(updated)

  return NextResponse.json({ ...withUrls(updated), restartRequired: true })
}
