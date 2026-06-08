import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const contact = await prisma.notificationContact.update({
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
  await prisma.notificationContact.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
