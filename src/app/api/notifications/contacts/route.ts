import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  const body = await request.json()
  const contact = await db.notificationContact.create({
    data: {
      channelId: body.channelId,
      name: body.name,
      identifier: body.identifier,
      enabled: body.enabled ?? true,
      locale: body.locale || null,
    },
  })
  return NextResponse.json(contact, { status: 201 })
}
