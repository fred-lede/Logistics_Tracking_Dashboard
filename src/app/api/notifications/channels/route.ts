import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireLocalRequest } from '@/lib/request-access'

export async function GET(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const channels = await db.notificationChannel.findMany({
    include: { contacts: { where: { enabled: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(channels.map(parseChannel))
}

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json()
  const channel = await db.notificationChannel.create({
    data: {
      type: body.type,
      label: body.label || '',
      config: body.config ? JSON.stringify(body.config) : '{}',
      notifyOnStatuses: body.notifyOnStatuses ? JSON.stringify(body.notifyOnStatuses) : '[]',
      mode: body.mode || null,
      sendSummary: body.sendSummary || false,
      locale: body.locale || 'en',
    },
    include: { contacts: true },
  })
  if (body.type === 'whatsapp-web') {
    const config = { ...(body.config || {}), _channelId: channel.id }
    await db.notificationChannel.update({
      where: { id: channel.id },
      data: { config: JSON.stringify(config) },
    })
    channel.config = JSON.stringify(config)
  }
  return NextResponse.json(parseChannel(channel), { status: 201 })
}

function parseChannel(channel: Record<string, unknown>) {
  return {
    ...channel,
    config: safeParse(channel.config),
    notifyOnStatuses: safeParse(channel.notifyOnStatuses),
  }
}

function safeParse(data: unknown): unknown {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return data
  }
}
