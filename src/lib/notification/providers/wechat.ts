import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'
import { getSummaryTitle } from '../types'

function buildWechatMarkdown(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let md = `📦 **${message.status}** - ${message.nickname || message.trackingNumber}\n`
    md += `> Status: ${message.status}\n`
    md += `> Tracking: ${message.trackingNumber}\n`
    md += `> Destination: ${message.destination || 'N/A'}\n`
    md += `> ETA: ${message.eta || 'N/A'}\n`
    if (message.events?.length) {
      md += `> Latest: ${message.events[0].description} @ ${message.events[0].location}\n`
    }
    if (message.aiSummary) {
      md += `\n🤖 **AI Summary:** ${message.aiSummary}\n`
    }
    if (message.aiRootCause) {
      md += `🔍 **Root Cause:** ${message.aiRootCause}\n`
    }
    if (message.aiDelayRisk) {
      md += `\n⚠️ **Risk: ${message.aiDelayRisk.level.toUpperCase()}**\n${message.aiDelayRisk.reason}\n`
      if (message.aiDelayRisk.suggestion) {
        md += `💡 ${message.aiDelayRisk.suggestion}\n`
      }
    }
    return md
  }

  if (message.type === 'overdue') {
    let md = `⚠️ **Overdue ${message.overdueDays}d** - ${message.nickname || message.trackingNumber}\n`
    md += `> Current Status: ${message.status}\n`
    md += `> Tracking: ${message.trackingNumber}\n`
    md += `> Original ETA: ${message.eta || 'N/A'}\n`
    if (message.aiSummary) {
      md += `\n🤖 **AI Summary:** ${message.aiSummary}\n`
    }
    if (message.aiRootCause) {
      md += `🔍 **Root Cause:** ${message.aiRootCause}\n`
    }
    if (message.aiDelayRisk) {
      md += `\n⚠️ **Risk: ${message.aiDelayRisk.level.toUpperCase()}**\n${message.aiDelayRisk.reason}\n`
      if (message.aiDelayRisk.suggestion) {
        md += `💡 ${message.aiDelayRisk.suggestion}\n`
      }
    }
    return md
  }

  let md = `📊 **${getSummaryTitle(message)}**\n`
  if (message.packages) {
    for (const p of message.packages) {
      md += `> ${p.status} — ${p.nickname || p.trackingNumber}\n`
      if (p.destination) md += `> Dest: ${p.destination}\n`
      if (p.eta) md += `> ETA: ${p.eta}\n`
      if (p.aiSummary) md += `> 🤖 ${p.aiSummary}\n`
    }
  }
  return md
}

export const wechatProvider: NotificationProvider = {
  channelType: 'wechat',

  async send(config, contacts, message): Promise<NotificationResult> {
    try {
      const mode = String(config.mode || 'webhook')

      if (mode === 'app') {
        const corpId = String(config.corpId || '')
        const corpSecret = String(config.corpSecret || '')
        const agentId = String(config.agentId || '')
        if (!corpId || !corpSecret || !agentId) {
          return { success: false, error: 'Corp ID, Corp Secret, and Agent ID required' }
        }

        const tokenRes = await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${corpSecret}`
        )
        const tokenData = await tokenRes.json()
        if (!tokenData.access_token) {
          return { success: false, error: `Failed to get access token: ${tokenData.errmsg || tokenData.errcode}` }
        }
        const accessToken = tokenData.access_token
        const content = buildWechatMarkdown(message)
        let lastError = ''

        for (const contact of contacts) {
          if (!contact.identifier) continue
          const res = await fetch(
            `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                touser: contact.identifier,
                msgtype: 'markdown',
                markdown: { content },
                agentid: Number(agentId),
              }),
            }
          )
          const data = await res.json()
          if (data.errcode !== 0) {
            lastError = `Failed for ${contact.name}: ${data.errmsg}`
          }
        }

        return lastError ? { success: false, error: lastError } : { success: true }
      }

      // Webhook (group robot) mode
      const webhookUrl = String(config.webhookUrl || '')
      if (!webhookUrl) {
        return { success: false, error: 'Webhook URL not configured' }
      }

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: { content: buildWechatMarkdown(message) },
        }),
      })

      return res.ok
        ? { success: true }
        : { success: false, error: `WeChat webhook returned ${res.status}` }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
