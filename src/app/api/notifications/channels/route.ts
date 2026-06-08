import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const channels = await prisma.notificationChannel.findMany({
    include: { contacts: { where: { enabled: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(channels.map(parseChannel))
}

export async function POST(request: Request) {
  const body = await request.json()
  const channel = await prisma.notificationChannel.create({
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
