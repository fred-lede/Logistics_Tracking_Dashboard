import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const contact = await db.notificationContact.update({
    where: { id },
      data: {
        name: body.name,
        identifier: body.identifier,
        enabled: body.enabled,
        locale: body.locale,
      },
  })
  return NextResponse.json(contact)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await db.notificationContact.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
