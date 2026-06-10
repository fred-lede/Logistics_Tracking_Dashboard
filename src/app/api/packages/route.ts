import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireLocalRequest } from '@/lib/request-access'
import { getProvider } from '@/lib/tracking/registry'

function safeParseJSON(value: string): unknown[] {
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

function normalizePartNumbers(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((p): p is string => typeof p === 'string').map((p) => p.trim()).filter(Boolean)
  }
  if (typeof input === 'string') {
    return input.split(',').map((p) => p.trim()).filter(Boolean)
  }
  return []
}
export async function GET() {
  const packages = await db.package.findMany({
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(
    packages.map((p) => ({
      ...p,
      events: safeParseJSON(p.events),
      subPackages: safeParseJSON(p.subPackages),
      partNumbers: safeParseJSON(p.partNumbers),
    }))
  )
}

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json()
  const { trackingNumber, nickname, partNumbers } = body as Record<string, unknown>

  if (!trackingNumber || typeof trackingNumber !== 'string') {
    return NextResponse.json(
      { error: 'trackingNumber is required' },
      { status: 400 }
    )
  }

  if (nickname !== undefined && typeof nickname !== 'string') {
    return NextResponse.json(
      { error: 'nickname must be a string' },
      { status: 400 }
    )
  }

  if (partNumbers !== undefined && !Array.isArray(partNumbers) && typeof partNumbers !== 'string') {
    return NextResponse.json(
      { error: 'partNumbers must be a string or array of strings' },
      { status: 400 }
    )
  }

  const existing = await db.package.findUnique({
    where: { trackingNumber },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Tracking number already exists' },
      { status: 409 }
    )
  }

  const safeNickname = typeof nickname === 'string' ? nickname : null
  const safePartNumbers = normalizePartNumbers(partNumbers)

  // Fetch initial tracking data
  let result
  try {
    const provider = getProvider('fedex')
    result = await provider.track(trackingNumber)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tracking data'
    return NextResponse.json(
      { error: 'Tracking data unavailable', details: message },
      { status: 502 }
    )
  }

  const pkg = await db.package.create({
    data: {
      trackingNumber,
      nickname: safeNickname,
      partNumbers: JSON.stringify(safePartNumbers),
      status: result.status,
      eta: result.eta,
      origin: result.origin,
      destination: result.destination,
      events: JSON.stringify(result.events),
      subPackages: JSON.stringify(result.subPackages ?? []),
      lastCheckedAt: new Date(),
    },
  })

  return NextResponse.json(
    { ...pkg, events: result.events, subPackages: result.subPackages ?? [], partNumbers: safePartNumbers },
    { status: 201 }
  )
}
