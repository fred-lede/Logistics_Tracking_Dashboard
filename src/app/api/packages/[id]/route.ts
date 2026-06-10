import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireLocalRequest } from '@/lib/request-access'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params

  try {
    await db.package.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }
}
