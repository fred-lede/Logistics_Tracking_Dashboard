import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireLocalRequest } from '@/lib/request-access'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params
  const channel = await db.notificationChannel.findUnique({
    where: { id },
    include: { contacts: { where: { enabled: true } } },
  })
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }
  return NextResponse.json({
    ...channel,
    config: safeParse(channel.config),
    notifyOnStatuses: safeParse(channel.notifyOnStatuses),
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params
  const body = await request.json()
  const existing = await db.notificationChannel.findUnique({ where: { id } })
  if (body.type === 'whatsapp-web' || existing?.type === 'whatsapp-web') {
    if (body.config) {
      body.config._channelId = id
    }
  }
  const channel = await db.notificationChannel.update({
    where: { id },
      data: {
        label: body.label,
        enabled: body.enabled,
        mode: body.mode ?? null,
        config: body.config ? JSON.stringify(body.config) : undefined,
        notifyOnStatuses: body.notifyOnStatuses ? JSON.stringify(body.notifyOnStatuses) : undefined,
        sendSummary: body.sendSummary,
        locale: body.locale,
      },
    include: { contacts: { where: { enabled: true } } },
  })
  return NextResponse.json({
    ...channel,
    config: safeParse(channel.config),
    notifyOnStatuses: safeParse(channel.notifyOnStatuses),
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params
  await db.notificationChannel.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

function safeParse(data: unknown): unknown {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return data
  }
}
