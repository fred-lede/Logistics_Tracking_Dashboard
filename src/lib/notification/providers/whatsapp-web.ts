import { Client, LocalAuth } from 'whatsapp-web.js'
import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'
import { getSummaryTitle } from '../types'
import path from 'path'

const SESSION_PATH = process.env.WWJS_SESSION_PATH || path.join(process.cwd(), '.wwjs-sessions')
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
  client: Client
  initPromise: Promise<void>
}

const clients = new Map<string, WhatsAppWebClientState>()

function getSessionPath(channelId: string): string {
  return path.join(SESSION_PATH, `channel-${channelId}`)
}

function getClientId(channelId: string): string {
  return channelId
}

export async function getOrCreateClient(channelId: string): Promise<WhatsAppWebClientState> {
  const existing = clients.get(channelId)
  if (existing) return existing

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: getSessionPath(channelId),
      clientId: getClientId(channelId),
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
    qrMaxRetries: 0,
    takeoverOnConflict: true,
  })

  const state: WhatsAppWebClientState = {
    status: 'initializing',
    client,
    initPromise: new Promise(() => {}),
  }
  clients.set(channelId, state)

  client.on('qr', (qr) => {
    state.status = 'qr'
    state.qrCode = qr
    state.error = undefined
  })

  client.on('ready', () => {
    state.status = 'ready'
    state.qrCode = undefined
    state.error = undefined
    resolveInit(state)
  })

  client.on('auth_failure', (msg) => {
    state.status = 'error'
    state.error = typeof msg === 'string' ? msg : 'Authentication failure'
    resolveInit(state)
  })

  client.on('disconnected', (reason) => {
    state.status = 'closed'
    state.error = typeof reason === 'string' ? reason : 'Disconnected'
  })

  state.initPromise = client.initialize()

  return state
}

function resolveInit(state: WhatsAppWebClientState): void {
  const p = state.initPromise
  state.initPromise = Promise.resolve()
  void p
}

export async function destroyClient(channelId: string): Promise<void> {
  const state = clients.get(channelId)
  if (!state) return
  clients.delete(channelId)
  try {
    await state.client.destroy()
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
        return { success: false, error: 'WhatsApp Web not authenticated. Scan the QR code in channel settings first.' }
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

      const text = buildMessageText(message)
      let lastError = ''

      for (const contact of contacts) {
        if (!contact.identifier) continue
        const phoneId = contact.identifier.includes('@')
          ? contact.identifier
          : `${contact.identifier}@c.us`
        try {
          await withTimeout(
            state.client.sendMessage(phoneId, text),
            30_000
          )
        } catch (err) {
          lastError = `Failed for ${contact.name || contact.identifier}: ${String(err)}`
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
