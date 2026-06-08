import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'
import { getSummaryTitle } from '../types'

function buildAdaptiveCard(message: NotificationMessage): unknown {
  const title = message.type === 'status_change'
  ? `📦 ${message.status} - ${message.nickname || message.trackingNumber}`
  : message.type === 'overdue'
  ? `⚠️ Overdue ${message.overdueDays}d - ${message.nickname || message.trackingNumber}`
  : `📊 ${getSummaryTitle(message)}`

  const facts: { title: string; value: string }[] = message.type === 'status_change'
  ? [
    { title: 'Status', value: message.status },
    { title: 'Tracking', value: message.trackingNumber },
    { title: 'Destination', value: message.destination || '' },
    { title: 'ETA', value: message.eta || '' },
    ...(message.events?.length ? [{ title: 'Latest Event', value: `${message.events[0].description} — ${message.events[0].location}` }] : []),
    ...(message.aiSummary ? [{ title: 'AI Summary', value: message.aiSummary }] : []),
    ...(message.aiRootCause ? [{ title: 'Root Cause', value: message.aiRootCause }] : []),
    ...(message.aiDelayRisk ? [{ title: 'Risk Level', value: message.aiDelayRisk.level.toUpperCase() }, { title: 'Risk Detail', value: message.aiDelayRisk.reason }, ...(message.aiDelayRisk.suggestion ? [{ title: 'Recommendation', value: message.aiDelayRisk.suggestion }] : [])] : []),
  ]
  : message.type === 'overdue'
  ? [
    { title: 'Overdue', value: `${message.overdueDays} days` },
    { title: 'Tracking', value: message.trackingNumber },
    { title: 'Current Status', value: message.status },
    { title: 'Original ETA', value: message.eta || 'N/A' },
    ...(message.aiSummary ? [{ title: 'AI Summary', value: message.aiSummary }] : []),
    ...(message.aiRootCause ? [{ title: 'Root Cause', value: message.aiRootCause }] : []),
    ...(message.aiDelayRisk ? [{ title: 'Risk Level', value: message.aiDelayRisk.level.toUpperCase() }, { title: 'Risk Detail', value: message.aiDelayRisk.reason }, ...(message.aiDelayRisk.suggestion ? [{ title: 'Recommendation', value: message.aiDelayRisk.suggestion }] : [])] : []),
  ]
  : (message.packages?.flatMap((p) => {
    const items: { title: string; value: string }[] = [{ title: `${p.status} - ${p.nickname || p.trackingNumber}`, value: `Dest: ${p.destination || 'N/A'} | ETA: ${p.eta || 'N/A'}` }]
    if (p.aiSummary) items.push({ title: 'AI Summary', value: p.aiSummary })
    return items
  }) || [])

  return {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: title, weight: 'bolder', size: 'medium' },
          { type: 'FactSet', facts },
        ],
      },
    }],
  }
}

function buildGraphHtml(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let html = `<h3>📦 ${message.status} - ${message.nickname || message.trackingNumber}</h3>
<p><b>Tracking:</b> ${message.trackingNumber}<br>
<b>Destination:</b> ${message.destination || 'N/A'}<br>
<b>ETA:</b> ${message.eta || 'N/A'}</p>`
    if (message.aiSummary) html += `<p><b>AI Summary:</b> ${message.aiSummary}</p>`
    if (message.aiRootCause) html += `<p><b>Root Cause:</b> ${message.aiRootCause}</p>`
    if (message.aiDelayRisk) {
      html += `<p><b>Risk Level:</b> ${message.aiDelayRisk.level.toUpperCase()}<br><b>Risk:</b> ${message.aiDelayRisk.reason}${message.aiDelayRisk.suggestion ? `<br><b>Recommendation:</b> ${message.aiDelayRisk.suggestion}` : ''}</p>`
    }
    return html
  }
  if (message.type === 'overdue') {
    let html = `<h3>⚠️ Overdue ${message.overdueDays}d - ${message.nickname || message.trackingNumber}</h3>
<p><b>Tracking:</b> ${message.trackingNumber}<br>
<b>Current Status:</b> ${message.status}<br>
<b>Original ETA:</b> ${message.eta || 'N/A'}</p>`
    if (message.aiSummary) html += `<p><b>AI Summary:</b> ${message.aiSummary}</p>`
    if (message.aiRootCause) html += `<p><b>Root Cause:</b> ${message.aiRootCause}</p>`
    if (message.aiDelayRisk) {
      html += `<p><b>Risk Level:</b> ${message.aiDelayRisk.level.toUpperCase()}<br><b>Risk:</b> ${message.aiDelayRisk.reason}${message.aiDelayRisk.suggestion ? `<br><b>Recommendation:</b> ${message.aiDelayRisk.suggestion}` : ''}</p>`
    }
    return html
  }
  const rows = message.packages?.map((p) =>
    `<tr><td>${p.status}</td><td>${p.nickname || p.trackingNumber}</td><td>${p.destination || 'N/A'}</td><td>${p.eta || 'N/A'}</td>${p.aiSummary ? `<td>${p.aiSummary}</td>` : ''}</tr>`
  ).join('') || ''
  return `<h3>📊 ${getSummaryTitle(message)}</h3><table border="1"><tr><th>Status</th><th>Package</th><th>Destination</th><th>ETA</th>${message.packages?.some(p => p.aiSummary) ? '<th>AI Summary</th>' : ''}</tr>${rows}</table>`
}

export const teamsProvider: NotificationProvider = {
  channelType: 'teams',

  async send(config, contacts, message): Promise<NotificationResult> {
    try {
      const mode = String(config.mode || 'webhook')

      if (mode === 'graph') {
        const tenantId = String(config.tenantId || '')
        const clientId = String(config.clientId || '')
        const clientSecret = String(config.clientSecret || '')
        const teamId = String(config.teamId || '')
        const channelId = String(config.channelId || '')

        if (!tenantId || !clientId || !clientSecret) {
          return { success: false, error: 'Graph API credentials not configured' }
        }

        const tokenRes = await fetch(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              scope: 'https://graph.microsoft.com/.default',
              grant_type: 'client_credentials',
            }),
          }
        )
        if (!tokenRes.ok) {
          return { success: false, error: 'Failed to get Graph API token' }
        }
        const tokenData = await tokenRes.json()
        const accessToken = tokenData.access_token

        const html = buildGraphHtml(message)

        if (channelId && teamId) {
          await fetch(
            `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ body: { contentType: 'html', content: html } }),
            }
          )
        }

        // Individual user DMs via Graph API require Azure AD object IDs
        // and chat creation flow — planned future enhancement

        return { success: true }
      }

      const webhookUrl = String(config.webhookUrl || '')
      if (!webhookUrl) {
        return { success: false, error: 'Webhook URL not configured' }
      }

      const card = buildAdaptiveCard(message)
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      })

      return res.ok
        ? { success: true }
        : { success: false, error: `Webhook returned ${res.status}` }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
