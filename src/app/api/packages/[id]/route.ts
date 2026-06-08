import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await prisma.package.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }
}
