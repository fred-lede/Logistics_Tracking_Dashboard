import { NextResponse } from 'next/server'
import { requireLocalRequest } from '@/lib/request-access'
import { getOrCreateClient } from '@/lib/notification/providers/whatsapp-web'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params

  try {
    const state = await getOrCreateClient(id)

    const response: Record<string, unknown> = {
      status: state.status,
    }
    if (state.error) response.error = state.error
    if (state.qrCode) response.hasQr = true

    return NextResponse.json(response)
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 })
  }
}
