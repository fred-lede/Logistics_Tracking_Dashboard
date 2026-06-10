import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireLocalRequest } from '@/lib/request-access'

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

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
