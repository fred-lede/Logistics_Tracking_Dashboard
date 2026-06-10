import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notificationRegistry } from '@/lib/notification/registry'
import type { NotificationMessage } from '@/lib/notification/types'
import { requireLocalRequest } from '@/lib/request-access'

export async function POST(
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

  const provider = notificationRegistry.getProvider(channel.type)
  if (!provider) {
    return NextResponse.json({ error: `Unknown channel type: ${channel.type}` }, { status: 400 })
  }

  const config: Record<string, unknown> = safeParse(channel.config)

  const message: NotificationMessage = {
    type: 'status_change',
    packageId: 'test',
    trackingNumber: 'TEST-000000',
    status: 'TEST',
    origin: 'Test Location',
    destination: 'Test Destination',
    events: [{
      date: new Date().toISOString(),
      description: 'Test notification from FedEx Tracking Dashboard',
      location: 'Test Location',
      status: 'TEST',
    }],
  }

  const contacts = channel.contacts.map((c) => ({
    name: c.name,
    identifier: c.identifier,
  }))

  try {
    const result = await provider.send(config, contacts, message)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) })
  }
}

function safeParse(data: unknown): Record<string, unknown> {
  try {
    return typeof data === 'string' ? JSON.parse(data) : (data as Record<string, unknown>)
  } catch {
    return {}
  }
}
