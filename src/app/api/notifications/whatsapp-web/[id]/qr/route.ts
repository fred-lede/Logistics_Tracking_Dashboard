import { NextResponse } from 'next/server'
import { requireLocalRequest } from '@/lib/request-access'
import {
  getOrCreateClient,
  destroyClient,
  type WhatsAppWebClientState,
} from '@/lib/notification/providers/whatsapp-web'
import QRCode from 'qrcode'

async function waitForQrOrReady(
  state: WhatsAppWebClientState,
  timeoutMs = 30_000
): Promise<{ status: string; qr?: string; error?: string; message?: string }> {
  if (state.status === 'ready') return { status: 'ready', message: 'Already authenticated' }
  if (state.status === 'error') return { status: 'error', error: state.error }
  if (state.qrCode) {
    const qrDataUrl = await QRCode.toDataURL(state.qrCode, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
    return { status: 'qr', qr: qrDataUrl }
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500))
    if (state.qrCode) {
      const qrDataUrl = await QRCode.toDataURL(state.qrCode, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      })
      return { status: 'qr', qr: qrDataUrl }
    }
    if (state.status === 'ready') return { status: 'ready', message: 'Already authenticated' }
    if (state.status === 'error') return { status: 'error', error: state.error }
  }

  return { status: 'initializing', message: 'Still initializing, try again' }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params

  try {
    const state = await getOrCreateClient(id)
    const result = await waitForQrOrReady(state)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ status: 'error', error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const { id } = await params
  await destroyClient(id)
  return NextResponse.json({ success: true })
}
