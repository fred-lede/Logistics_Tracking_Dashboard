import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'
import { getSummaryTitle } from '../types'

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildTelegramText(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    return [
      `📦 <b>${escapeHtml(message.status)}</b> - ${escapeHtml(message.nickname || message.trackingNumber)}`,
      ``,
      `Status: ${escapeHtml(message.status)}`,
      `Tracking: ${escapeHtml(message.trackingNumber)}`,
      `Destination: ${escapeHtml(message.destination || 'N/A')}`,
      `ETA: ${escapeHtml(message.eta || 'N/A')}`,
      ...(message.events?.length ? [`Latest: ${escapeHtml(message.events[0].description)} @ ${escapeHtml(message.events[0].location)}`] : []),
      ...(message.aiSummary ? [``, `🤖 AI Summary: ${escapeHtml(message.aiSummary)}`] : []),
      ...(message.aiRootCause ? [`🔍 Root Cause: ${escapeHtml(message.aiRootCause)}`] : []),
      ...(message.aiDelayRisk ? [
        ``,
        `⚠️ <b>Risk: ${escapeHtml(message.aiDelayRisk.level.toUpperCase())}</b>`,
        `${escapeHtml(message.aiDelayRisk.reason)}`,
        ...(message.aiDelayRisk.suggestion ? [`💡 ${escapeHtml(message.aiDelayRisk.suggestion)}`] : []),
      ] : []),
    ].join('\n')
  }

  if (message.type === 'overdue') {
    return [
      `⚠️ <b>Overdue ${message.overdueDays}d</b> - ${escapeHtml(message.nickname || message.trackingNumber)}`,
      ``,
      `Current Status: ${escapeHtml(message.status)}`,
      `Tracking: ${escapeHtml(message.trackingNumber)}`,
      `Original ETA: ${escapeHtml(message.eta || 'N/A')}`,
      ...(message.aiSummary ? [``, `🤖 AI Summary: ${escapeHtml(message.aiSummary)}`] : []),
      ...(message.aiRootCause ? [`🔍 Root Cause: ${escapeHtml(message.aiRootCause)}`] : []),
      ...(message.aiDelayRisk ? [
        ``,
        `⚠️ <b>Risk: ${escapeHtml(message.aiDelayRisk.level.toUpperCase())}</b>`,
        `${escapeHtml(message.aiDelayRisk.reason)}`,
        ...(message.aiDelayRisk.suggestion ? [`💡 ${escapeHtml(message.aiDelayRisk.suggestion)}`] : []),
      ] : []),
    ].join('\n')
  }

  const lines = [`📊 <b>${escapeHtml(getSummaryTitle(message))}</b>`, '']
  if (message.packages) {
    for (const p of message.packages) {
      lines.push(`• ${escapeHtml(p.status)} — ${escapeHtml(p.nickname || p.trackingNumber)}`)
      if (p.destination) lines.push(`  Dest: ${escapeHtml(p.destination)}`)
      if (p.eta) lines.push(`  ETA: ${escapeHtml(p.eta)}`)
      if (p.aiSummary) lines.push(`  🤖 ${escapeHtml(p.aiSummary)}`)
    }
  }
  return lines.join('\n')
}

export const telegramProvider: NotificationProvider = {
  channelType: 'telegram',

  async send(config, contacts, message): Promise<NotificationResult> {
    try {
      const botToken = String(config.botToken || '')
      if (!botToken) {
        return { success: false, error: 'Bot token not configured' }
      }

      const text = buildTelegramText(message)
      let lastError = ''

      for (const contact of contacts) {
        if (!contact.identifier) continue
        const res = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: contact.identifier,
              text,
              parse_mode: 'HTML',
            }),
          }
        )
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          lastError = `Failed for ${contact.name}: ${res.status} ${body}`
        }
      }

      return lastError ? { success: false, error: lastError } : { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
