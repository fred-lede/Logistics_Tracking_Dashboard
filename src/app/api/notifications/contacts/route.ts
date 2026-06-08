import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const body = await request.json()
  const contact = await prisma.notificationContact.create({
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
