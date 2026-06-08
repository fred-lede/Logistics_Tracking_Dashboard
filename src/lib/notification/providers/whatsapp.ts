import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'
import { getSummaryTitle } from '../types'

function buildWhatsAppText(message: NotificationMessage): string {
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

export const whatsappProvider: NotificationProvider = {
  channelType: 'whatsapp',

  async send(config, contacts, message): Promise<NotificationResult> {
    try {
      const apiKey = String(config.apiKey || '')
      const phoneNumberId = String(config.phoneNumberId || '')
      if (!apiKey || !phoneNumberId) {
        return { success: false, error: 'API key or Phone Number ID not configured' }
      }

      const text = buildWhatsAppText(message)
      let lastError = ''

      for (const contact of contacts) {
        if (!contact.identifier) continue
        const res = await fetch(
          `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: contact.identifier,
              type: 'text',
              text: { body: text },
            }),
          }
        )
        if (!res.ok) {
          lastError = `Failed for ${contact.name}: ${res.status}`
        }
      }

      return lastError ? { success: false, error: lastError } : { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
