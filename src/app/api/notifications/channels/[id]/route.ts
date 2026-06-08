import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const channel = await prisma.notificationChannel.findUnique({
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
  const { id } = await params
  const body = await request.json()
  const channel = await prisma.notificationChannel.update({
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
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.notificationChannel.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

function safeParse(data: unknown): unknown {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return data
  }
}
