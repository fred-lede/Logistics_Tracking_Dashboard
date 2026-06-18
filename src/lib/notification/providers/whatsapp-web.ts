import {
  makeWASocket,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'
import { getSummaryTitle } from '../types'
import path from 'path'
import { rmSync } from 'fs'

const SESSION_PATH = process.env.BAILEYS_SESSION_PATH || path.join(process.cwd(), '.baileys-sessions')
const CLIENT_TIMEOUT_MS = 60_000

function buildMessageText(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let text = `📦 ${message.status} - ${message.nickname || message.trackingNumber}\n`
    text += `Status: ${message.status}\n`
    text += `Tracking: ${message.trackingNumber}\n`
    text += `Destination: ${message.destination || 'N/A'}\n`
    text += `ETA: ${message.eta || 'N/A'}`
    if (message.events?.length) {
      text += `\nLatest: ${message.events[0].description} @ ${message.events[0].location}`
    }
    if (message.aiSummary) {
      text += `\n\n🤖 AI Summary: ${message.aiSummary}`
    }
    if (message.aiRootCause) {
      text += `\n🔍 Root Cause: ${message.aiRootCause}`
    }
    if (message.aiDelayRisk) {
      text += `\n\n⚠️ Risk: ${message.aiDelayRisk.level.toUpperCase()}`
      text += `\n${message.aiDelayRisk.reason}`
      if (message.aiDelayRisk.suggestion) {
        text += `\n💡 ${message.aiDelayRisk.suggestion}`
      }
    }
    return text
  }

  if (message.type === 'overdue') {
    let text = `⚠️ Overdue ${message.overdueDays}d - ${message.nickname || message.trackingNumber}\n`
    text += `Current Status: ${message.status}\n`
    text += `Tracking: ${message.trackingNumber}\n`
    text += `Original ETA: ${message.eta || 'N/A'}`
    if (message.aiSummary) {
      text += `\n\n🤖 AI Summary: ${message.aiSummary}`
    }
    if (message.aiRootCause) {
      text += `\n🔍 Root Cause: ${message.aiRootCause}`
    }
    if (message.aiDelayRisk) {
      text += `\n\n⚠️ Risk: ${message.aiDelayRisk.level.toUpperCase()}`
      text += `\n${message.aiDelayRisk.reason}`
      if (message.aiDelayRisk.suggestion) {
        text += `\n💡 ${message.aiDelayRisk.suggestion}`
      }
    }
    return text
  }

  let text = `📊 ${getSummaryTitle(message)}\n`
  if (message.packages) {
    for (const p of message.packages) {
      text += `\n• ${p.status} — ${p.nickname || p.trackingNumber}`
      if (p.destination) text += ` (${p.destination})`
      if (p.eta) text += ` ETA: ${p.eta}`
      if (p.aiSummary) text += `\n  🤖 ${p.aiSummary}`
    }
  }
  return text
}

export interface WhatsAppWebClientState {
  status: 'initializing' | 'qr' | 'ready' | 'error' | 'closed'
  qrCode?: string
  error?: string
  socket: WASocket | null
  initPromise: Promise<void>
}

const clients = new Map<string, WhatsAppWebClientState>()

function getSessionPath(channelId: string): string {
  return path.join(SESSION_PATH, `channel-${channelId}`)
}

function clearSessionData(dataDir: string): void {
  try {
    rmSync(dataDir, { recursive: true, force: true })
  } catch {
  }
}

export async function getOrCreateClient(channelId: string): Promise<WhatsAppWebClientState> {
  const existing = clients.get(channelId)
  if (existing) {
    if (existing.status === 'ready' || existing.status === 'qr' || existing.status === 'initializing') {
      return existing
    }
    await destroyClient(channelId)
  }

  const authDir = getSessionPath(channelId)
  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  let resolveInit!: (value: void | PromiseLike<void>) => void
  const initPromise = new Promise<void>((resolve) => {
    resolveInit = resolve
  })

  const stateObj: WhatsAppWebClientState = {
    status: 'initializing',
    socket: null,
    initPromise,
  }
  clients.set(channelId, stateObj)

  const socket = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
  })
  stateObj.socket = socket

  socket.ev.on('creds.update', saveCreds)

  socket.ev.on('connection.update', (update) => {
    const { qr, connection, lastDisconnect } = update

    if (qr) {
      stateObj.status = 'qr'
      stateObj.qrCode = qr
      stateObj.error = undefined
    }

    if (connection === 'open') {
      stateObj.status = 'ready'
      stateObj.qrCode = undefined
      stateObj.error = undefined
      resolveInit()
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
      if (statusCode === DisconnectReason.loggedOut) {
        stateObj.status = 'error'
        stateObj.error = 'Session logged out. Re-authentication required.'
        clearSessionData(authDir)
      } else {
        stateObj.status = 'closed'
        stateObj.error = `WhatsApp Web disconnected: ${lastDisconnect?.error?.message || 'Unknown reason'}`
      }
      resolveInit()
    }
  })

  return stateObj
}

export async function destroyClient(channelId: string): Promise<void> {
  const existing = clients.get(channelId)
  if (!existing) return
  clients.delete(channelId)
  try {
    existing.socket?.end(undefined)
  } catch {
  }
}

export async function destroyAllClients(): Promise<void> {
  const ids = Array.from(clients.keys())
  await Promise.allSettled(ids.map(destroyClient))
}

function getChannelId(config: Record<string, unknown>): string | null {
  return String(config._channelId || '') || null
}

function toJid(phoneNumber: string): string {
  const cleaned = phoneNumber.replace(/[^0-9]/g, '')
  return `${cleaned}@s.whatsapp.net`
}

export const whatsappWebProvider: NotificationProvider = {
  channelType: 'whatsapp-web',

  async send(config, contacts, message): Promise<NotificationResult> {
    try {
      const channelId = getChannelId(config)
      if (!channelId) {
        return { success: false, error: 'Channel ID not found in config' }
      }

      const state = await getOrCreateClient(channelId)

      if (state.status === 'qr') {
        try {
          await withTimeout(state.initPromise, CLIENT_TIMEOUT_MS)
        } catch {
          return { success: false, error: 'WhatsApp Web not authenticated. Scan the QR code in channel settings first.' }
        }
        const s: string = state.status
        if (s === 'error') {
          return { success: false, error: `WhatsApp client error: ${state.error || 'Authentication failure'}` }
        }
      }

      if (state.status === 'error') {
        return { success: false, error: `WhatsApp client error: ${state.error || 'Unknown error'}` }
      }

      if (state.status === 'initializing') {
        try {
          await withTimeout(state.initPromise, CLIENT_TIMEOUT_MS)
        } catch {
          const currentStatus: string = state.status
          if (currentStatus === 'qr') {
            return { success: false, error: 'WhatsApp Web not authenticated. Scan the QR code in channel settings first.' }
          }
          return { success: false, error: `WhatsApp client initialization timed out: ${state.error || 'Unknown'}` }
        }
      }

      if (!state.socket) {
        return { success: false, error: 'WhatsApp Web socket not available' }
      }

      const text = buildMessageText(message)
      let lastError = ''

      for (const contact of contacts) {
        if (!contact.identifier) continue
        const jid = toJid(contact.identifier)
        try {
          await withTimeout(
            state.socket.sendMessage(jid, { text }),
            30_000,
          )
        } catch (err) {
          const msg = String(err)
          if (msg.includes('evaluate') || msg.includes('Cannot read properties of null')) {
            await new Promise((r) => setTimeout(r, 3000))
            try {
              await withTimeout(state.socket!.sendMessage(jid, { text }), 30_000)
            } catch {
              void destroyClient(channelId)
              lastError = `Failed for ${contact.name || contact.identifier}: WhatsApp Web disconnected`
            }
          } else {
            lastError = `Failed for ${contact.name || contact.identifier}: ${msg}`
          }
        }
      }

      return lastError ? { success: false, error: lastError } : { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ])
}
