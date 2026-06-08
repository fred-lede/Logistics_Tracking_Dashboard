# 多頻道通知功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-channel notification system (Teams/Telegram/WeChat/WhatsApp) with status change alerts, daily/periodic summaries, settings page, and 4-language i18n support.

**Architecture:** NotificationProvider interface pattern (mirrors TrackingProvider), registry-based dispatch, NotificationService orchestrates checkAndNotify/sendSummary, scheduler uses setInterval for summaries. Settings use CRUD API routes backed by new Prisma models. i18n via next-intl with cookie-based locale.

**Tech Stack:** Next.js 16.2.7, Prisma 7/SQLite, next-intl, TypeScript

---

## File Structure

### New files:
- `src/lib/notification/types.ts` — NotificationProvider interface, NotificationMessage, NotificationResult
- `src/lib/notification/registry.ts` — NotificationProviderRegistry (registerProvider, getProvider)
- `src/lib/notification/service.ts` — NotificationService (checkAndNotify, sendSummary)
- `src/lib/notification/scheduler.ts` — SummaryScheduler (daily + periodic timers)
- `src/lib/notification/providers/teams.ts` — Teams provider (webhook + Graph API modes)
- `src/lib/notification/providers/telegram.ts` — Telegram bot provider
- `src/lib/notification/providers/wechat.ts` — WeCom bot provider
- `src/lib/notification/providers/whatsapp.ts` — WhatsApp Cloud API provider
- `src/lib/notification/index.ts` — barrel exports
- `src/app/api/settings/route.ts` — GET/PUT global notification settings
- `src/app/api/settings/channels/route.ts` — GET list / POST create channel
- `src/app/api/settings/channels/[id]/route.ts` — GET/PUT/DELETE channel
- `src/app/api/settings/channels/[id]/contacts/route.ts` — POST contact
- `src/app/api/settings/contacts/[id]/route.ts` — PUT/DELETE contact
- `src/app/settings/page.tsx` — Settings page (client component)
- `src/components/settings/settings-page.tsx` — Main settings layout (client)
- `src/components/settings/channel-card.tsx` — Channel card (client)
- `src/components/settings/channel-dialog.tsx` — Edit channel dialog (client)
- `src/components/settings/add-channel-form.tsx` — Add channel form (client)
- `src/components/language-switcher.tsx` — Locale switcher dropdown
- `src/i18n/request.ts` — next-intl request config
- `src/i18n/navigation.ts` — next-intl navigation helpers
- `messages/en.json`
- `messages/zh-TW.json`
- `messages/zh-CN.json`
- `messages/es-MX.json`

### Modified files:
- `prisma/schema.prisma` — add 4 new models
- `src/app/layout.tsx` — wrap with NextIntlClientProvider, add LanguageSwitcher
- `src/app/api/packages/[id]/refresh/route.ts` — trigger checkAndNotify on status change
- `src/app/globals.css` — add settings page styles if needed (Tailwind should suffice)
- `src/middleware.ts` — create (or create if not exists) for next-intl locale handling
- `src/app/page.tsx` — translate existing UI strings

---

### Task 1: Prisma Schema — Add Notification Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Add 4 new models to schema.prisma**

```prisma
model NotificationSetting {
  id                 String   @id @default("global")
  enabled            Boolean  @default(true)
  dailySummaryEnabled  Boolean  @default(false)
  dailySummaryTime   String   @default("09:00")
  periodicInterval   Int      @default(0)
  lastDailySent      String?
  lastPeriodicSent   DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model NotificationChannel {
  id               String   @id @default(cuid())
  type             String
  label            String
  enabled          Boolean  @default(true)
  mode             String?
  config           String   @default("{}")
  notifyOnStatuses String   @default("[]")
  sendSummary      Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  contacts         NotificationContact[]
  logs             NotificationLog[]
}

model NotificationContact {
  id         String   @id @default(cuid())
  channelId  String
  name       String
  identifier String
  enabled    Boolean  @default(true)
  createdAt  DateTime @default(now())
  channel    NotificationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
}

model NotificationLog {
  id               String   @id @default(cuid())
  packageId        String
  channelId        String
  notificationType String
  status           String
  success          Boolean
  errorMessage     String?
  sentAt           DateTime @default(now())
  channel          NotificationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
}
```

- [ ] **Run prisma db push to sync**

Run: `npx prisma db push`
Expected: Database synchronized, 4 new models created.

- [ ] **Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: add notification models to schema"
```

---

### Task 2: NotificationProvider Interface + Types

**Files:**
- Create: `src/lib/notification/types.ts`
- Create: `src/lib/notification/index.ts`

- [ ] **Create types.ts with NotificationProvider interface**

```typescript
import type { TrackingEvent } from '@/lib/tracking/types'

export interface NotificationMessage {
  type: 'status_change' | 'summary'
  packageId?: string
  trackingNumber?: string
  nickname?: string | null
  status?: string
  eta?: string | null
  origin?: string | null
  destination?: string | null
  events?: TrackingEvent[]
  summaryDate?: string
  packages?: {
    trackingNumber: string
    nickname: string | null
    status: string
    destination: string | null
    eta: string | null
    lastEvent: string | null
  }[]
}

export interface NotificationResult {
  success: boolean
  error?: string
}

export interface NotificationProvider {
  channelType: string
  send(
    config: Record<string, unknown>,
    contacts: { name: string; identifier: string }[],
    message: NotificationMessage
  ): Promise<NotificationResult>
}
```

- [ ] **Create index.ts barrel export**

```typescript
export * from './types'
export * from './registry'
export * from './service'
export * from './scheduler'
export * from './providers/teams'
export * from './providers/telegram'
export * from './providers/wechat'
export * from './providers/whatsapp'
```

- [ ] **Commit**

```bash
git add src/lib/notification/
git commit -m "feat: add NotificationProvider interface and types"
```

---

### Task 3: NotificationProvider Registry

**Files:**
- Create: `src/lib/notification/registry.ts`

- [ ] **Create registry.ts**

```typescript
import type { NotificationProvider } from './types'

class NotificationProviderRegistry {
  private providers = new Map<string, NotificationProvider>()

  registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.channelType, provider)
  }

  getProvider(channelType: string): NotificationProvider | undefined {
    return this.providers.get(channelType)
  }

  getAllProviders(): NotificationProvider[] {
    return Array.from(this.providers.values())
  }
}

export const notificationRegistry = new NotificationProviderRegistry()
```

- [ ] **Commit**

```bash
git add src/lib/notification/registry.ts
git commit -m "feat: add NotificationProviderRegistry"
```

---

### Task 4: Teams Provider

**Files:**
- Create: `src/lib/notification/providers/teams.ts`

- [ ] **Create teams.ts with webhook + Graph API modes**

```typescript
import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'

function buildAdaptiveCard(message: NotificationMessage): unknown {
  const title = message.type === 'status_change'
    ? `📦 ${message.status} - ${message.nickname || message.trackingNumber}`
    : `📊 Package Summary - ${message.summaryDate}`

  const facts: { title: string; value: string }[] = message.type === 'status_change'
    ? [
        { title: 'Status', value: message.status || '' },
        { title: 'Tracking', value: message.trackingNumber || '' },
        { title: 'Destination', value: message.destination || '' },
        { title: 'ETA', value: message.eta || '' },
        ...(message.events?.length ? [{ title: 'Latest Event', value: message.events[0].description }] : []),
      ]
    : (message.packages?.map((p) => ({
        title: `${p.status} - ${p.nickname || p.trackingNumber}`,
        value: `Dest: ${p.destination || 'N/A'} | ETA: ${p.eta || 'N/A'}`,
      })) || [])

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
    return `<h3>📦 ${message.status} - ${message.nickname || message.trackingNumber}</h3>
<p><b>Tracking:</b> ${message.trackingNumber}<br>
<b>Destination:</b> ${message.destination || 'N/A'}<br>
<b>ETA:</b> ${message.eta || 'N/A'}</p>`
  }
  const rows = message.packages?.map((p) =>
    `<tr><td>${p.status}</td><td>${p.nickname || p.trackingNumber}</td><td>${p.destination || 'N/A'}</td><td>${p.eta || 'N/A'}</td></tr>`
  ).join('') || ''
  return `<h3>📊 Package Summary - ${message.summaryDate}</h3><table border="1"><tr><th>Status</th><th>Package</th><th>Destination</th><th>ETA</th></tr>${rows}</table>`
}

export const teamsProvider: NotificationProvider = {
  channelType: 'teams',

  async send(config, contacts, message): Promise<NotificationResult> {
    try {
      const mode = String(config.mode || 'webhook')

      if (mode === 'graph') {
        // Graph API mode — send to channel + individual users
        const tenantId = String(config.tenantId || '')
        const clientId = String(config.clientId || '')
        const clientSecret = String(config.clientSecret || '')
        const teamId = String(config.teamId || '')
        const channelId = String(config.channelId || '')

        // Get access token
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

        // Send to channel
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

        // Send to individual contacts
        for (const contact of contacts) {
          if (!contact.identifier) continue
          // Create a 1:1 chat if not exists, then send message
          try {
            await fetch(`https://graph.microsoft.com/v1.0/users/${contact.identifier}/chats`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ chatType: 'oneOnOne', member: contact.identifier }),
            })
          } catch {
            // Chat may already exist — try sending directly
          }
          await fetch(
            `https://graph.microsoft.com/v1.0/users/${contact.identifier}/chats/${contact.identifier}/messages`,
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

        return { success: true }
      }

      // Webhook mode — send to channel only
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
```

- [ ] **Commit**

```bash
git add src/lib/notification/providers/teams.ts
git commit -m "feat: add Teams notification provider (webhook + Graph API)"
```

---

### Task 5: Telegram Provider

**Files:**
- Create: `src/lib/notification/providers/telegram.ts`

- [ ] **Create telegram.ts**

```typescript
import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'

function buildTelegramText(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    return [
      `📦 *${message.status}* - ${message.nickname || message.trackingNumber}`,
      ``,
      `Status: ${message.status}`,
      `Tracking: ${message.trackingNumber}`,
      `Destination: ${message.destination || 'N/A'}`,
      `ETA: ${message.eta || 'N/A'}`,
      ...(message.events?.length ? [`Latest: ${message.events[0].description}`] : []),
    ].join('\n')
  }

  const lines = [`📊 *Package Summary - ${message.summaryDate}*`, '']
  if (message.packages) {
    for (const p of message.packages) {
      lines.push(`• ${p.status} — ${p.nickname || p.trackingNumber}`)
      if (p.destination) lines.push(`  Dest: ${p.destination}`)
      if (p.eta) lines.push(`  ETA: ${p.eta}`)
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
              parse_mode: 'Markdown',
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
```

- [ ] **Commit**

```bash
git add src/lib/notification/providers/telegram.ts
git commit -m "feat: add Telegram notification provider"
```

---

### Task 6: WeChat (WeCom) Provider

**Files:**
- Create: `src/lib/notification/providers/wechat.ts`

- [ ] **Create wechat.ts**

```typescript
import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'

function buildWechatMarkdown(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let md = `📦 **${message.status}** - ${message.nickname || message.trackingNumber}\n`
    md += `> Status: ${message.status}\n`
    md += `> Tracking: ${message.trackingNumber}\n`
    md += `> Destination: ${message.destination || 'N/A'}\n`
    md += `> ETA: ${message.eta || 'N/A'}\n`
    if (message.events?.length) {
      md += `> Latest: ${message.events[0].description}\n`
    }
    return md
  }

  let md = `📊 **Package Summary - ${message.summaryDate}**\n`
  if (message.packages) {
    for (const p of message.packages) {
      md += `> ${p.status} — ${p.nickname || p.trackingNumber}\n`
      if (p.destination) md += `> Dest: ${p.destination}\n`
      if (p.eta) md += `> ETA: ${p.eta}\n`
    }
  }
  return md
}

export const wechatProvider: NotificationProvider = {
  channelType: 'wechat',

  async send(config, _contacts, message): Promise<NotificationResult> {
    try {
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
```

- [ ] **Commit**

```bash
git add src/lib/notification/providers/wechat.ts
git commit -m "feat: add WeChat Work notification provider"
```

---

### Task 7: WhatsApp Provider

**Files:**
- Create: `src/lib/notification/providers/whatsapp.ts`

- [ ] **Create whatsapp.ts**

```typescript
import type { NotificationProvider, NotificationMessage, NotificationResult } from '../types'

function buildWhatsAppText(message: NotificationMessage): string {
  if (message.type === 'status_change') {
    let text = `📦 ${message.status} - ${message.nickname || message.trackingNumber}\n`
    text += `Status: ${message.status}\n`
    text += `Tracking: ${message.trackingNumber}\n`
    text += `Destination: ${message.destination || 'N/A'}\n`
    text += `ETA: ${message.eta || 'N/A'}`
    if (message.events?.length) {
      text += `\nLatest: ${message.events[0].description}`
    }
    return text
  }

  let text = `📊 Package Summary - ${message.summaryDate}\n`
  if (message.packages) {
    for (const p of message.packages) {
      text += `\n• ${p.status} — ${p.nickname || p.trackingNumber}`
      if (p.destination) text += ` (${p.destination})`
      if (p.eta) text += ` ETA: ${p.eta}`
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
```

- [ ] **Commit**

```bash
git add src/lib/notification/providers/whatsapp.ts
git commit -m "feat: add WhatsApp notification provider"
```

---

### Task 8: NotificationService

**Files:**
- Create: `src/lib/notification/service.ts`

- [ ] **Create service.ts**

```typescript
import { prisma } from '@/lib/prisma'
import { notificationRegistry } from './registry'
import type { NotificationMessage } from './types'

interface PackageSummary {
  trackingNumber: string
  nickname: string | null
  status: string | null
  destination: string | null
  eta: string | null
  lastEvent: string | null
}

export class NotificationService {
  async checkAndNotify(
    packageId: string,
    trackingNumber: string,
    nickname: string | null,
    oldStatus: string | null,
    newStatus: string,
    details: {
      eta: string | null
      origin: string | null
      destination: string | null
      events: { date: string; status: string; location: string; description: string }[]
    }
  ): Promise<void> {
    if (!newStatus || oldStatus === newStatus) return

    const setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
    if (!setting?.enabled) return

    const channels = await prisma.notificationChannel.findMany({
      where: { enabled: true },
      include: { contacts: { where: { enabled: true } } },
    })

    const message: NotificationMessage = {
      type: 'status_change',
      packageId,
      trackingNumber,
      nickname,
      status: newStatus,
      eta: details.eta,
      origin: details.origin,
      destination: details.destination,
      events: details.events,
    }

    for (const channel of channels) {
      const notifyOnStatuses: string[] = JSON.parse(channel.notifyOnStatuses || '[]')
      if (!notifyOnStatuses.includes(newStatus)) continue

      const provider = notificationRegistry.getProvider(channel.type)
      if (!provider) continue

      const config = { ...JSON.parse(channel.config || '{}'), mode: channel.mode }
      const contacts = channel.contacts.map((c) => ({ name: c.name, identifier: c.identifier }))

      const result = await provider.send(config, contacts, message)

      await prisma.notificationLog.create({
        data: {
          packageId,
          channelId: channel.id,
          notificationType: 'status_change',
          status: newStatus,
          success: result.success,
          errorMessage: result.error || null,
        },
      })
    }
  }

  async sendSummary(): Promise<void> {
    const setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
    if (!setting?.enabled) return

    const packages = await prisma.package.findMany()
    const channels = await prisma.notificationChannel.findMany({
      where: { enabled: true, sendSummary: true },
      include: { contacts: { where: { enabled: true } } },
    })

    if (channels.length === 0) return

    const summaryPackages: PackageSummary[] = packages.map((p) => {
      const events = safeParseEvents(p.events)
      return {
        trackingNumber: p.trackingNumber,
        nickname: p.nickname,
        status: p.status,
        destination: p.destination,
        eta: p.eta,
        lastEvent: events.length > 0 ? events[0].description : null,
      }
    })

    const now = new Date()
    const summaryDate = now.toISOString()

    const message: NotificationMessage = {
      type: 'summary',
      summaryDate,
      packages: summaryPackages,
    }

    for (const channel of channels) {
      const provider = notificationRegistry.getProvider(channel.type)
      if (!provider) continue

      const config = { ...JSON.parse(channel.config || '{}'), mode: channel.mode }
      const contacts = channel.contacts.map((c) => ({ name: c.name, identifier: c.identifier }))

      const result = await provider.send(config, contacts, message)

      await prisma.notificationLog.create({
        data: {
          packageId: 'summary',
          channelId: channel.id,
          notificationType: 'summary',
          status: 'SUMMARY',
          success: result.success,
          errorMessage: result.error || null,
        },
      })
    }
  }
}

function safeParseEvents(data: string): { date: string; status: string; location: string; description: string }[] {
  try {
    const parsed = JSON.parse(data)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
```

- [ ] **Commit**

```bash
git add src/lib/notification/service.ts
git commit -m "feat: add NotificationService"
```

---

### Task 9: Summary Scheduler

**Files:**
- Create: `src/lib/notification/scheduler.ts`

- [ ] **Create scheduler.ts**

```typescript
import { prisma } from '@/lib/prisma'
import { NotificationService } from './service'

export class SummaryScheduler {
  private timers: ReturnType<typeof setInterval>[] = []
  private service: NotificationService
  private running = false

  constructor(service: NotificationService) {
    this.service = service
  }

  start(): void {
    if (this.running) return
    this.running = true

    // Daily summary checker — runs every 60s
    this.timers.push(setInterval(async () => {
      try {
        const setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
        if (!setting?.enabled || !setting.dailySummaryEnabled) return

        const now = new Date()
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        if (setting.lastDailySent === today) return

        const [hour, minute] = setting.dailySummaryTime.split(':').map(Number)
        if (now.getHours() === hour && now.getMinutes() === minute) {
          await this.service.sendSummary()
          await prisma.notificationSetting.update({
            where: { id: 'global' },
            data: { lastDailySent: today },
          })
        }
      } catch {
        // Silently retry next interval
      }
    }, 60_000))

    // Periodic summary — runs at configured interval
    this.timers.push(setInterval(async () => {
      try {
        const setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
        if (!setting?.enabled || !setting.periodicInterval || setting.periodicInterval <= 0) return

        await this.service.sendSummary()
        await prisma.notificationSetting.update({
          where: { id: 'global' },
          data: { lastPeriodicSent: new Date() },
        })
      } catch {
        // Silently retry next interval
      }
    }, 60_000))

    // Initial check for periodic interval reset on start
    this.timers.push(setInterval(async () => {
      try {
        const setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
        if (!setting?.periodicInterval || setting.periodicInterval <= 0) return

        // Clear and re-create periodic timer with new interval
        const periodTimer = this.timers[1]
        clearInterval(periodTimer)

        this.timers[1] = setInterval(async () => {
          try {
            const s = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
            if (s?.enabled && s.periodicInterval > 0) {
              await this.service.sendSummary()
            }
          } catch {
            // ignore
          }
        }, setting.periodicInterval * 3_600_000)
      } catch {
        // ignore
      }
    }, 30_000))
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer)
    }
    this.timers = []
    this.running = false
  }
}
```

- [ ] **Commit**

```bash
git add src/lib/notification/scheduler.ts
git commit -m "feat: add summary scheduler"
```

---

### Task 10: Register Providers and Init Service in Layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Register providers and start scheduler in layout.tsx**

At the top of layout.tsx, import and init:

```typescript
import { notificationRegistry } from '@/lib/notification'
import { teamsProvider } from '@/lib/notification'
import { telegramProvider } from '@/lib/notification'
import { wechatProvider } from '@/lib/notification'
import { whatsappProvider } from '@/lib/notification'
import { NotificationService } from '@/lib/notification'
import { SummaryScheduler } from '@/lib/notification'

// Register notification providers (server-side)
notificationRegistry.registerProvider(teamsProvider)
notificationRegistry.registerProvider(telegramProvider)
notificationRegistry.registerProvider(wechatProvider)
notificationRegistry.registerProvider(whatsappProvider)

// Start summary scheduler
const notificationService = new NotificationService()
const scheduler = new SummaryScheduler(notificationService)
if (typeof globalThis !== 'undefined') {
  scheduler.start()
}
```

- [ ] **Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: register notification providers and start scheduler"
```

---

### Task 11: Settings API Routes — Global Settings

**Files:**
- Create: `src/app/api/settings/route.ts`

- [ ] **Create GET / PUT global settings**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    let setting = await prisma.notificationSetting.findUnique({ where: { id: 'global' } })
    if (!setting) {
      setting = await prisma.notificationSetting.create({ data: { id: 'global' } })
    }
    return NextResponse.json(setting)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const setting = await prisma.notificationSetting.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...body },
      update: body,
    })
    return NextResponse.json(setting)
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
```

- [ ] **Commit**

```bash
git add src/app/api/settings/route.ts
git commit -m "feat: add global notification settings API"
```

---

### Task 12: Settings API Routes — Channels CRUD

**Files:**
- Create: `src/app/api/settings/channels/route.ts`
- Create: `src/app/api/settings/channels/[id]/route.ts`

- [ ] **Create channels/route.ts (GET list + POST create)**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const channels = await prisma.notificationChannel.findMany({
      include: { contacts: { where: { enabled: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json(channels.map(parseChannel))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const channel = await prisma.notificationChannel.create({
      data: {
        type: body.type,
        label: body.label || '',
        config: body.config ? JSON.stringify(body.config) : '{}',
        notifyOnStatuses: body.notifyOnStatuses ? JSON.stringify(body.notifyOnStatuses) : '[]',
        mode: body.mode || null,
        sendSummary: body.sendSummary || false,
      },
      include: { contacts: true },
    })
    return NextResponse.json(parseChannel(channel), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
  }
}

function parseChannel(channel: Record<string, unknown>) {
  return {
    ...channel,
    config: safeParse(channel.config),
    notifyOnStatuses: safeParse(channel.notifyOnStatuses),
  }
}

function safeParse(data: unknown): unknown {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return data
  }
}
```

- [ ] **Create channels/[id]/route.ts (GET + PUT + DELETE)**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const channel = await prisma.notificationChannel.findUnique({
    where: { id },
    include: { contacts: { where: { enabled: true } } },
  })
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }
  return NextResponse.json({
    ...channel,
    config: safeParse(channel.config),
    notifyOnStatuses: safeParse(channel.notifyOnStatuses),
  })
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const channel = await prisma.notificationChannel.update({
    where: { id },
    data: {
      label: body.label,
      enabled: body.enabled,
      mode: body.mode ?? null,
      config: body.config ? JSON.stringify(body.config) : undefined,
      notifyOnStatuses: body.notifyOnStatuses ? JSON.stringify(body.notifyOnStatuses) : undefined,
      sendSummary: body.sendSummary,
    },
    include: { contacts: { where: { enabled: true } } },
  })
  return NextResponse.json({
    ...channel,
    config: safeParse(channel.config),
    notifyOnStatuses: safeParse(channel.notifyOnStatuses),
  })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.notificationChannel.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

function safeParse(data: unknown): unknown {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return data
  }
}
```

- [ ] **Commit**

```bash
git add src/app/api/settings/channels/
git commit -m "feat: add notification channels CRUD API"
```

---

### Task 13: Settings API Routes — Contacts CRUD

**Files:**
- Create: `src/app/api/settings/channels/[id]/contacts/route.ts`
- Create: `src/app/api/settings/contacts/[id]/route.ts`

- [ ] **Create contacts route under channel**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: channelId } = await params
  const body = await request.json()
  const contact = await prisma.notificationContact.create({
    data: {
      channelId,
      name: body.name,
      identifier: body.identifier,
      enabled: body.enabled ?? true,
    },
  })
  return NextResponse.json(contact, { status: 201 })
}
```

- [ ] **Create contacts/[id]/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const contact = await prisma.notificationContact.update({
    where: { id },
    data: {
      name: body.name,
      identifier: body.identifier,
      enabled: body.enabled,
    },
  })
  return NextResponse.json(contact)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  await prisma.notificationContact.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
```

- [ ] **Commit**

```bash
git add src/app/api/settings/channels/[id]/contacts/route.ts src/app/api/settings/contacts/
git commit -m "feat: add notification contacts CRUD API"
```

---

### Task 14: Integrate Notification into Refresh Flow

**Files:**
- Modify: `src/app/api/packages/[id]/refresh/route.ts`

- [ ] **Add notification trigger in refresh route**

At the top, import:
```typescript
import { notificationRegistry } from '@/lib/notification'
import { teamsProvider } from '@/lib/notification'
import { telegramProvider } from '@/lib/notification'
import { wechatProvider } from '@/lib/notification'
import { whatsappProvider } from '@/lib/notification'
import { NotificationService } from '@/lib/notification'

// Register providers (idempotent)
notificationRegistry.registerProvider(teamsProvider)
notificationRegistry.registerProvider(telegramProvider)
notificationRegistry.registerProvider(wechatProvider)
notificationRegistry.registerProvider(whatsappProvider)
```

After the status update logic (where status might change), add:

```typescript
// Send notification if status changed
const oldStatus = pkg.status
// ... existing refresh logic ...
if (result.status && oldStatus !== result.status) {
  const notificationService = new NotificationService()
  await notificationService.checkAndNotify(
    pkg.id,
    pkg.trackingNumber,
    pkg.nickname,
    oldStatus,
    result.status,
    {
      eta: result.eta,
      origin: result.origin,
      destination: result.destination,
      events: result.events,
    }
  )
}
```

- [ ] **Commit**

```bash
git add src/app/api/packages/[id]/refresh/route.ts
git commit -m "feat: trigger notification on package status change"
```

---

### Task 15: i18n Setup with next-intl

**Files:**
- Create: `src/i18n/request.ts`
- Create: `src/i18n/navigation.ts`
- Modify: `src/middleware.ts` (create if not exists)
- Create: `messages/en.json`
- Create: `messages/zh-TW.json`
- Create: `messages/zh-CN.json`
- Create: `messages/es-MX.json`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`

- [ ] **Install next-intl**

Run: `npm install next-intl`

- [ ] **Create src/i18n/request.ts**

```typescript
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const locales = ['en', 'zh-TW', 'zh-CN', 'es-MX'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const locale = (cookieStore.get('locale')?.value || defaultLocale) as Locale
  if (!locales.includes(locale)) {
    return { locale: defaultLocale, messages: (await import(`../../messages/${defaultLocale}.json`)).default }
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

- [ ] **Create src/i18n/navigation.ts**

```typescript
import { createSharedPathnamesNavigation } from 'next-intl/navigation'
import { locales } from './request'

export const { useRouter, usePathname, redirect } = createSharedPathnamesNavigation({ locales })
```

- [ ] **Create or modify src/middleware.ts**

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['en', 'zh-TW', 'zh-CN', 'es-MX']
const defaultLocale = 'en'

export function middleware(request: NextRequest) {
  const locale = request.cookies.get('locale')?.value || defaultLocale
  const validLocale = locales.includes(locale) ? locale : defaultLocale

  const response = NextResponse.next()
  response.cookies.set('locale', validLocale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  })
  return response
}

export const config = {
  matcher: '/((?!api|_next|.*\\..*).*)',
}
```

- [ ] **Create message files**

**messages/en.json:**
```json
{
  "settings": {
    "title": "Settings",
    "notifications": "Notifications",
    "globalToggle": "Notifications",
    "globalToggleDesc": "Master switch — disables all channels when off",
    "dailySummary": "Daily Summary",
    "dailySummaryDesc": "Send a daily package status summary at a scheduled time",
    "periodicSummary": "Periodic Summary",
    "periodicSummaryDesc": "Send a status summary every N hours",
    "periodicDisabled": "Disabled",
    "channels": "Notification Channels",
    "addChannel": "Add Channel",
    "save": "Save Settings",
    "cancel": "Cancel",
    "editChannel": "Edit Channel",
    "deleteChannel": "Delete Channel",
    "channelName": "Channel Name",
    "webhookUrl": "Webhook URL",
    "botToken": "Bot Token",
    "notifyOn": "Notify On",
    "statusChange": "Status Change Notifications",
    "summaryNotif": "Summary Notifications",
    "contacts": "Contacts",
    "addContact": "Add Contact",
    "editContact": "Edit Contact",
    "deleteContact": "Delete Contact",
    "contactName": "Name",
    "contactIdentifier": "Identifier",
    "modeWebhook": "Webhook",
    "modeGraph": "Graph API",
    "teamsMode": "Mode",
    "noChannels": "No notification channels configured",
    "everyHour": "Every {n} hour | Every {n} hours",
    "atTime": "At {time}"
  },
  "channels": {
    "teams": "Microsoft Teams",
    "telegram": "Telegram",
    "wechat": "WeChat Work",
    "whatsapp": "WhatsApp",
    "notConfigured": "Not configured"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "add": "Add",
    "edit": "Edit",
    "delete": "Delete",
    "close": "Close",
    "confirm": "Confirm",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "language": {
    "en": "English",
    "zh-TW": "繁體中文",
    "zh-CN": "简体中文",
    "es-MX": "Español (MX)",
    "switchLanguage": "Language"
  },
  "dashboard": {
    "title": "FedEx Tracking Dashboard",
    "searchPlaceholder": "Search tracking number, nickname, part number...",
    "refreshAll": "Refresh All",
    "noPackages": "No packages tracked yet",
    "noMatch": "No matching packages",
    "addPackage": "Add your first FedEx tracking number above to get started.",
    "tryDifferent": "Try a different search term.",
    "packageCount": "{count} package | {count} packages",
    "packageFiltered": "{filtered} of {total} packages"
  }
}
```

**messages/zh-TW.json:**
```json
{
  "settings": {
    "title": "設定",
    "notifications": "通知",
    "globalToggle": "通知功能",
    "globalToggleDesc": "全域開關，關閉後所有頻道都不會發送",
    "dailySummary": "每日日報",
    "dailySummaryDesc": "每天定時發送所有包裹狀態總覽",
    "periodicSummary": "定期彙整",
    "periodicSummaryDesc": "每 N 小時發送狀態更新彙整",
    "periodicDisabled": "停用",
    "channels": "通知頻道",
    "addChannel": "新增頻道",
    "save": "儲存設定",
    "cancel": "取消",
    "editChannel": "編輯頻道",
    "deleteChannel": "刪除頻道",
    "channelName": "頻道名稱",
    "webhookUrl": "Webhook URL",
    "botToken": "Bot Token",
    "notifyOn": "通知時機",
    "statusChange": "狀態變更通知",
    "summaryNotif": "彙整通知",
    "contacts": "人員",
    "addContact": "新增人員",
    "editContact": "編輯人員",
    "deleteContact": "刪除人員",
    "contactName": "姓名",
    "contactIdentifier": "識別碼",
    "modeWebhook": "Webhook",
    "modeGraph": "Graph API",
    "teamsMode": "模式",
    "noChannels": "尚未設定通知頻道",
    "everyHour": "每 {n} 小時",
    "atTime": "{time} 發送"
  },
  "channels": {
    "teams": "Microsoft Teams",
    "telegram": "Telegram",
    "wechat": "企業微信",
    "whatsapp": "WhatsApp",
    "notConfigured": "未設定"
  },
  "common": {
    "save": "儲存",
    "cancel": "取消",
    "add": "新增",
    "edit": "編輯",
    "delete": "刪除",
    "close": "關閉",
    "confirm": "確認",
    "loading": "載入中...",
    "error": "錯誤",
    "success": "成功"
  },
  "language": {
    "en": "English",
    "zh-TW": "繁體中文",
    "zh-CN": "简体中文",
    "es-MX": "Español (MX)",
    "switchLanguage": "語言"
  },
  "dashboard": {
    "title": "FedEx 包裹追蹤",
    "searchPlaceholder": "搜尋追蹤號碼、暱稱、料號...",
    "refreshAll": "重新整理",
    "noPackages": "尚未追蹤任何包裹",
    "noMatch": "無符合的包裹",
    "addPackage": "請在上方輸入 FedEx 追蹤號碼開始使用。",
    "tryDifferent": "請嘗試不同的搜尋關鍵字。",
    "packageCount": "{count} 個包裹",
    "packageFiltered": "{filtered} / {total} 個包裹"
  }
}
```

**messages/zh-CN.json: (same keys as zh-TW with simplified text)**
```json
{
  "settings": {
    "title": "设置",
    "notifications": "通知",
    "globalToggle": "通知功能",
    "globalToggleDesc": "全局开关，关闭后所有频道都不会发送",
    "dailySummary": "每日日报",
    "dailySummaryDesc": "每天定时发送所有包裹状态总览",
    "periodicSummary": "定期汇总",
    "periodicSummaryDesc": "每 N 小时发送状态更新汇总",
    "periodicDisabled": "停用",
    "channels": "通知频道",
    "addChannel": "新增频道",
    "save": "保存设置",
    "cancel": "取消",
    "editChannel": "编辑频道",
    "deleteChannel": "删除频道",
    "channelName": "频道名称",
    "webhookUrl": "Webhook URL",
    "botToken": "Bot Token",
    "notifyOn": "通知时机",
    "statusChange": "状态变更通知",
    "summaryNotif": "汇总通知",
    "contacts": "人员",
    "addContact": "新增人员",
    "editContact": "编辑人员",
    "deleteContact": "删除人员",
    "contactName": "姓名",
    "contactIdentifier": "识别码",
    "modeWebhook": "Webhook",
    "modeGraph": "Graph API",
    "teamsMode": "模式",
    "noChannels": "尚未设置通知频道",
    "everyHour": "每 {n} 小时",
    "atTime": "{time} 发送"
  },
  "channels": {
    "teams": "Microsoft Teams",
    "telegram": "Telegram",
    "wechat": "企业微信",
    "whatsapp": "WhatsApp",
    "notConfigured": "未设置"
  },
  "common": {
    "save": "保存",
    "cancel": "取消",
    "add": "新增",
    "edit": "编辑",
    "delete": "删除",
    "close": "关闭",
    "confirm": "确认",
    "loading": "加载中...",
    "error": "错误",
    "success": "成功"
  },
  "language": {
    "en": "English",
    "zh-TW": "繁體中文",
    "zh-CN": "简体中文",
    "es-MX": "Español (MX)",
    "switchLanguage": "语言"
  },
  "dashboard": {
    "title": "FedEx 包裹追踪",
    "searchPlaceholder": "搜索追踪号码、昵称、料号...",
    "refreshAll": "刷新",
    "noPackages": "尚未追踪任何包裹",
    "noMatch": "无匹配的包裹",
    "addPackage": "请在上方输入 FedEx 追踪号码开始使用。",
    "tryDifferent": "请尝试不同的搜索关键词。",
    "packageCount": "{count} 个包裹",
    "packageFiltered": "{filtered} / {total} 个包裹"
  }
}
```

**messages/es-MX.json:**
```json
{
  "settings": {
    "title": "Configuración",
    "notifications": "Notificaciones",
    "globalToggle": "Notificaciones",
    "globalToggleDesc": "Interruptor general — deshabilita todos los canales cuando está apagado",
    "dailySummary": "Resumen Diario",
    "dailySummaryDesc": "Enviar un resumen diario del estado de los paquetes a una hora programada",
    "periodicSummary": "Resumen Periódico",
    "periodicSummaryDesc": "Enviar un resumen de estado cada N horas",
    "periodicDisabled": "Desactivado",
    "channels": "Canales de Notificación",
    "addChannel": "Agregar Canal",
    "save": "Guardar Configuración",
    "cancel": "Cancelar",
    "editChannel": "Editar Canal",
    "deleteChannel": "Eliminar Canal",
    "channelName": "Nombre del Canal",
    "webhookUrl": "URL de Webhook",
    "botToken": "Token del Bot",
    "notifyOn": "Notificar Cuando",
    "statusChange": "Notificaciones de Cambio de Estado",
    "summaryNotif": "Notificaciones de Resumen",
    "contacts": "Contactos",
    "addContact": "Agregar Contacto",
    "editContact": "Editar Contacto",
    "deleteContact": "Eliminar Contacto",
    "contactName": "Nombre",
    "contactIdentifier": "Identificador",
    "modeWebhook": "Webhook",
    "modeGraph": "Graph API",
    "teamsMode": "Modo",
    "noChannels": "No hay canales de notificación configurados",
    "everyHour": "Cada {n} hora | Cada {n} horas",
    "atTime": "A las {time}"
  },
  "channels": {
    "teams": "Microsoft Teams",
    "telegram": "Telegram",
    "wechat": "WeChat Work",
    "whatsapp": "WhatsApp",
    "notConfigured": "No configurado"
  },
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "add": "Agregar",
    "edit": "Editar",
    "delete": "Eliminar",
    "close": "Cerrar",
    "confirm": "Confirmar",
    "loading": "Cargando...",
    "error": "Error",
    "success": "Éxito"
  },
  "language": {
    "en": "English",
    "zh-TW": "繁體中文",
    "zh-CN": "简体中文",
    "es-MX": "Español (MX)",
    "switchLanguage": "Idioma"
  },
  "dashboard": {
    "title": "Panel de Seguimiento FedEx",
    "searchPlaceholder": "Buscar número de rastreo, apodo, número de pieza...",
    "refreshAll": "Actualizar Todo",
    "noPackages": "Aún no hay paquetes rastreados",
    "noMatch": "No se encontraron paquetes",
    "addPackage": "Agregue su primer número de rastreo FedEx arriba para comenzar.",
    "tryDifferent": "Intente con un término de búsqueda diferente.",
    "packageCount": "{count} paquete | {count} paquetes",
    "packageFiltered": "{filtered} de {total} paquetes"
  }
}
```

- [ ] **Wrap layout.tsx with NextIntlClientProvider and add LanguageSwitcher**

In layout.tsx:
```typescript
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getLocale } from 'next-intl/server'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

Add LanguageSwitcher component to the settings page / dashboard header.

- [ ] **Commit**

```bash
git add src/i18n/ messages/ src/app/layout.tsx src/middleware.ts
git commit -m "feat: add i18n with next-intl (en/zh-TW/zh-CN/es-MX)"
```

---

### Task 16: Settings Page UI

**Files:**
- Create: `src/app/settings/page.tsx`
- Create: `src/components/settings/settings-page.tsx`
- Create: `src/components/settings/channel-card.tsx`
- Create: `src/components/settings/channel-dialog.tsx`
- Create: `src/components/settings/add-channel-form.tsx`
- Create: `src/components/language-switcher.tsx`

- [ ] **Create language-switcher.tsx**

```typescript
'use client'

import { useTranslations } from 'next-intl'
import { setCookie } from 'cookies-next'

const locales = [
  { code: 'en', labelKey: 'language.en' },
  { code: 'zh-TW', labelKey: 'language.zh-TW' },
  { code: 'zh-CN', labelKey: 'language.zh-CN' },
  { code: 'es-MX', labelKey: 'language.es-MX' },
]

export function LanguageSwitcher() {
  const t = useTranslations()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setCookie('locale', e.target.value, { path: '/', maxAge: 60 * 60 * 24 * 365 })
    window.location.reload()
  }

  return (
    <select
      onChange={handleChange}
      defaultValue=""
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-fedex-purple focus:outline-none"
      aria-label={t('language.switchLanguage')}
    >
      <option value="" disabled>{t('language.switchLanguage')}</option>
      {locales.map((l) => (
        <option key={l.code} value={l.code}>{t(l.labelKey)}</option>
      ))}
    </select>
  )
}
```

- [ ] **Create settings-page.tsx (main settings component)**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ChannelCard } from './channel-card'
import { ChannelDialog } from './channel-dialog'
import { AddChannelForm } from './add-channel-form'
import { LanguageSwitcher } from '../language-switcher'

interface NotificationSetting {
  enabled: boolean
  dailySummaryEnabled: boolean
  dailySummaryTime: string
  periodicInterval: number
}

interface Channel {
  id: string
  type: string
  label: string
  enabled: boolean
  mode: string | null
  config: Record<string, unknown>
  notifyOnStatuses: string[]
  sendSummary: boolean
  contacts: { id: string; name: string; identifier: string }[]
}

export function SettingsPage() {
  const t = useTranslations()
  const [setting, setSetting] = useState<NotificationSetting | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/api/settings/channels').then((r) => r.json()),
    ]).then(([s, c]) => {
      setSetting(s)
      setChannels(c)
      setLoading(false)
    })
  }, [])

  async function updateSetting(update: Partial<NotificationSetting>) {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) setSetting(await res.json())
  }

  async function saveChannel(update: Partial<Channel>) {
    if (!editingChannel) return
    const res = await fetch(`/api/settings/channels/${editingChannel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) {
      const updated = await res.json()
      setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setEditingChannel(null)
    }
  }

  async function deleteChannel(id: string) {
    const res = await fetch(`/api/settings/channels/${id}`, { method: 'DELETE' })
    if (res.ok) setChannels((prev) => prev.filter((c) => c.id !== id))
  }

  async function addContact(channelId: string, name: string, identifier: string) {
    const res = await fetch(`/api/settings/channels/${channelId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, identifier }),
    })
    if (res.ok) {
      const contact = await res.json()
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, contacts: [...c.contacts, contact] } : c
        )
      )
    }
  }

  async function addNewChannel(data: { type: string; label: string; config: Record<string, unknown>; mode?: string }) {
    const res = await fetch('/api/settings/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setChannels((prev) => [...prev, await res.json()])
      setShowAddForm(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="text-gray-400">{t('common.loading')}</div></div>
  }

  const periodicOptions = [0, 1, 2, 4, 6, 12, 24]

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
        <LanguageSwitcher />
      </div>

      {/* Global Toggle */}
      <div className="mb-6 rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{t('settings.globalToggle')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{t('settings.globalToggleDesc')}</p>
          </div>
          <button
            onClick={() => updateSetting({ enabled: !setting?.enabled })}
            className={`relative h-6 w-11 rounded-full transition-colors ${setting?.enabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${setting?.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Summary Settings */}
      <div className="mb-6 rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{t('settings.dailySummary')}</h2>

        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">{t('dailySummaryDesc')}</p>
          </div>
          <button
            onClick={() => updateSetting({ dailySummaryEnabled: !setting?.dailySummaryEnabled })}
            className={`relative h-6 w-11 rounded-full transition-colors ${setting?.dailySummaryEnabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${setting?.dailySummaryEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {setting?.dailySummaryEnabled && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
            <input
              type="time"
              value={setting?.dailySummaryTime || '09:00'}
              onChange={(e) => updateSetting({ dailySummaryTime: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">{t('periodicSummary')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{t('periodicSummaryDesc')}</p>
          </div>
          <select
            value={setting?.periodicInterval || 0}
            onChange={(e) => updateSetting({ periodicInterval: Number(e.target.value) })}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value={0}>{t('periodicDisabled')}</option>
            {periodicOptions.filter((v) => v > 0).map((h) => (
              <option key={h} value={h}>{t('everyHour', { n: h })}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Channels */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('channels')}</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-lg bg-fedex-purple px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-800"
          >
            {t('addChannel')}
          </button>
        </div>

        {channels.length === 0 && !showAddForm && (
          <div className="rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            {t('noChannels')}
          </div>
        )}

        {showAddForm && (
          <AddChannelForm
            onAdd={addNewChannel}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        <div className="space-y-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              channelLabel={t('channels.' + channel.type)}
              onToggle={(enabled) => saveChannel({ enabled })}
              onEdit={() => setEditingChannel(channel)}
              onDelete={() => deleteChannel(channel.id)}
              onAddContact={(name, identifier) => addContact(channel.id, name, identifier)}
            />
          ))}
        </div>
      </div>

      {/* Edit Channel Dialog */}
      {editingChannel && (
        <ChannelDialog
          channel={editingChannel}
          channelLabel={t('channels.' + editingChannel.type)}
          onSave={saveChannel}
          onClose={() => setEditingChannel(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Create channel-card.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface ChannelCardProps {
  channel: {
    id: string
    type: string
    label: string
    enabled: boolean
    notifyOnStatuses: string[]
    sendSummary: boolean
    contacts: { id: string; name: string; identifier: string }[]
  }
  channelLabel: string
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onAddContact: (name: string, identifier: string) => void
}

export function ChannelCard({ channel, channelLabel, onToggle, onEdit, onDelete, onAddContact }: ChannelCardProps) {
  const t = useTranslations()
  const [showNewContact, setShowNewContact] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIdentifier, setNewIdentifier] = useState('')

  function handleAddContact() {
    if (!newName.trim() || !newIdentifier.trim()) return
    onAddContact(newName.trim(), newIdentifier.trim())
    setNewName('')
    setNewIdentifier('')
    setShowNewContact(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600">
            {channel.type === 'teams' ? '🅣' : channel.type === 'telegram' ? '✈' : channel.type === 'wechat' ? '💬' : '🆆'}
          </div>
          <div>
            <div className="font-medium text-gray-900">
              {channelLabel}
              {channel.label && <span className="ml-1.5 text-sm text-gray-500">— {channel.label}</span>}
            </div>
            {!channel.enabled && <span className="text-xs text-gray-400">Disabled</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
            {t('settings.editChannel')}
          </button>
          <button
            onClick={() => onToggle(!channel.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${channel.enabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${channel.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {(channel.notifyOnStatuses.length > 0 || channel.sendSummary) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-400">{t('settings.notifyOn')}:</span>
          {channel.notifyOnStatuses.map((s) => (
            <span key={s} className="rounded-full bg-purple-50 px-2.5 py-0.5 text-purple-700">{s}</span>
          ))}
          {channel.sendSummary && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700">{t('settings.summaryNotif')}</span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
        <span>{channel.contacts.length} {t('settings.contacts')}</span>
        <button onClick={() => setShowNewContact(!showNewContact)} className="text-fedex-purple hover:underline text-xs">
          + {t('settings.addContact')}
        </button>
      </div>

      {showNewContact && (
        <div className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('settings.contactName')}
            className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <input
            value={newIdentifier}
            onChange={(e) => setNewIdentifier(e.target.value)}
            placeholder={t('settings.contactIdentifier')}
            className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <button onClick={handleAddContact} className="rounded-lg bg-fedex-purple px-3 py-1.5 text-sm text-white">
            {t('common.add')}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Create channel-dialog.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const ALL_STATUSES = ['DELIVERED', 'IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE', 'EXCEPTION', 'DELAYED', 'RETURN_TO_SENDER', 'UNKNOWN']

export function ChannelDialog({
  channel,
  channelLabel,
  onSave,
  onClose,
}: {
  channel: {
    id: string
    type: string
    label: string
    mode: string | null
    config: Record<string, unknown>
    notifyOnStatuses: string[]
    sendSummary: boolean
  }
  channelLabel: string
  onSave: (data: Partial<Record<string, unknown>>) => void
  onClose: () => void
}) {
  const t = useTranslations()
  const [label, setLabel] = useState(channel.label)
  const [mode, setMode] = useState(channel.mode || 'webhook')
  const [webhookUrl, setWebhookUrl] = useState(String(channel.config?.webhookUrl || ''))
  const [botToken, setBotToken] = useState(String(channel.config?.botToken || ''))
  const [tenantId, setTenantId] = useState(String(channel.config?.tenantId || ''))
  const [clientId, setClientId] = useState(String(channel.config?.clientId || ''))
  const [clientSecret, setClientSecret] = useState(String(channel.config?.clientSecret || ''))
  const [teamId, setTeamId] = useState(String(channel.config?.teamId || ''))
  const [channelId, setChannelId] = useState(String(channel.config?.channelId || ''))
  const [apiKey, setApiKey] = useState(String(channel.config?.apiKey || ''))
  const [phoneNumberId, setPhoneNumberId] = useState(String(channel.config?.phoneNumberId || ''))
  const [notifyOnStatuses, setNotifyOnStatuses] = useState(channel.notifyOnStatuses)
  const [sendSummary, setSendSummary] = useState(channel.sendSummary)

  function toggleStatus(status: string) {
    setNotifyOnStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  function buildConfig(): Record<string, unknown> {
    if (channel.type === 'teams' && mode === 'webhook') return { webhookUrl }
    if (channel.type === 'teams' && mode === 'graph') return { tenantId, clientId, clientSecret, teamId, channelId }
    if (channel.type === 'telegram') return { botToken }
    if (channel.type === 'wechat') return { webhookUrl }
    if (channel.type === 'whatsapp') return { apiKey, phoneNumberId }
    return {}
  }

  function handleSave() {
    onSave({
      label,
      mode: channel.type === 'teams' ? mode : undefined,
      config: buildConfig(),
      notifyOnStatuses,
      sendSummary,
    })
  }

  const showWebhook = (channel.type === 'teams' && mode === 'webhook') || channel.type === 'wechat'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="max-w-lg w-full mx-4 rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.editChannel')}</h2>
            <p className="text-sm text-gray-500">{channelLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.channelName')}</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          {channel.type === 'teams' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.teamsMode')}</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="webhook">{t('settings.modeWebhook')}</option>
                <option value="graph">{t('settings.modeGraph')}</option>
              </select>
            </div>
          )}

          {showWebhook && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.webhookUrl')}</label>
              <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" placeholder="https://..." />
            </div>
          )}

          {channel.type === 'teams' && mode === 'graph' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tenant ID</label>
                <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client ID</label>
                <input value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Secret</label>
                <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team ID</label>
                <input value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel ID</label>
                <input value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
            </>
          )}

          {channel.type === 'telegram' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.botToken')}</label>
              <input value={botToken} onChange={(e) => setBotToken(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
            </div>
          )}

          {channel.type === 'whatsapp' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number ID</label>
                <input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono" />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('settings.notifyOn')}</label>
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    notifyOnStatuses.includes(s)
                      ? 'bg-purple-50 text-purple-700 border-purple-300'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSendSummary(!sendSummary)}
              className={`relative h-6 w-11 rounded-full transition-colors ${sendSummary ? 'bg-fedex-purple' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${sendSummary ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-700">{t('settings.summaryNotif')}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            {t('common.cancel')}
          </button>
          <button onClick={handleSave} className="rounded-lg bg-fedex-purple px-4 py-2 text-sm text-white hover:bg-purple-800">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Create add-channel-form.tsx**

```typescript
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const CHANNEL_TYPES = ['teams', 'telegram', 'wechat', 'whatsapp'] as const

export function AddChannelForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { type: string; label: string; config: Record<string, unknown>; mode?: string }) => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const ct = useTranslations('channels')
  const [type, setType] = useState<string>('teams')
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState('webhook')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [botToken, setBotToken] = useState('')

  function buildConfig(): Record<string, unknown> {
    if (type === 'teams' && mode === 'graph') return {}
    if (type === 'telegram') return { botToken }
    return { webhookUrl }
  }

  function handleAdd() {
    onAdd({ type, label, config: buildConfig(), mode: type === 'teams' ? mode : undefined })
  }

  return (
    <div className="mb-3 rounded-xl border border-gray-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {CHANNEL_TYPES.map((ct) => (
              <option key={ct} value={ct}>{t('channels.' + ct)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.channelName')}</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Warehouse" />
        </div>
        {type === 'teams' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('settings.teamsMode')}</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="webhook">{t('settings.modeWebhook')}</option>
              <option value="graph">{t('settings.modeGraph')}</option>
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {type === 'telegram' ? t('settings.botToken') : t('settings.webhookUrl')}
          </label>
          <input
            value={type === 'telegram' ? botToken : webhookUrl}
            onChange={(e) => type === 'telegram' ? setBotToken(e.target.value) : setWebhookUrl(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder={type === 'telegram' ? '123456:ABC-DEF...' : 'https://...'}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600">
          {t('common.cancel')}
        </button>
        <button onClick={handleAdd} className="rounded-lg bg-fedex-purple px-3 py-1.5 text-sm text-white">
          {t('common.add')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Create settings/page.tsx**

```typescript
import { SettingsPage } from '@/components/settings/settings-page'

export default function SettingsRoute() {
  return <SettingsPage />
}
```

- [ ] **Commit**

```bash
git add src/app/settings/ src/components/settings/ src/components/language-switcher.tsx
git commit -m "feat: add settings page UI with channel management"
```

---

### Task 17: Translate Existing Dashboard UI

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/add-package-form.tsx`
- Modify: `src/components/package-card.tsx`
- Modify: `src/components/refresh-button.tsx`
- Modify: `src/components/auto-refresh-toggle.tsx`

- [ ] **Update page.tsx to useTranslations**

Replace hardcoded strings with `useTranslations` calls:

```typescript
import { useTranslations } from 'next-intl'

// Inside component:
const dt = useTranslations('dashboard')
const ct = useTranslations('common')

// Replace:
// <h1 className="text-2xl font-bold text-gray-900">FedEx Tracking Dashboard</h1>
// → {dt('title')}
// "Loading..." → {ct('loading')}
// "Refresh All" → {dt('refreshAll')}
// "Search tracking number..." → placeholder={dt('searchPlaceholder')}
// "No packages tracked yet" → {dt('noPackages')}
// and all other strings per messages JSON
```

Also add LanguageSwitcher to the dashboard header.

- [ ] **Translate add-package-form.tsx** — "FedEx Tracking Number", "Nickname", "Part Numbers", "Track", "Adding..." labels

- [ ] **Translate package-card.tsx** — status labels, timeline, sub-packages heading

- [ ] **Translate refresh-button.tsx and auto-refresh-toggle.tsx** — button labels

- [ ] **Commit**

```bash
git add src/app/page.tsx src/components/
git commit -m "feat: translate existing dashboard UI with next-intl"
```

---

### Task 18: Tests

**Files:**
- Create: `src/lib/notification/__tests__/types.test.ts`
- Create: `src/lib/notification/__tests__/registry.test.ts`
- Create: `src/lib/notification/__tests__/teams-provider.test.ts`
- Create: `src/lib/notification/__tests__/telegram-provider.test.ts`
- Create: `src/lib/notification/__tests__/service.test.ts`

- [ ] **Copy test setup from existing tracking tests**

Study `src/lib/tracking/__tests__/` for patterns.

- [ ] **Write registry test**

```typescript
import { describe, it, expect } from 'vitest'
import { notificationRegistry } from '../registry'

describe('NotificationProviderRegistry', () => {
  it('registers and retrieves a provider', () => {
    const mockProvider = { channelType: 'test', async send() { return { success: true } } }
    notificationRegistry.registerProvider(mockProvider)
    expect(notificationRegistry.getProvider('test')).toBe(mockProvider)
    expect(notificationRegistry.getAllProviders()).toContain(mockProvider)
  })
})
```

- [ ] **Write service test (with mock provider)**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { NotificationService } from '../service'
import { notificationRegistry } from '../registry'

describe('NotificationService', () => {
  it('does not notify when status is unchanged', async () => {
    const send = vi.fn()
    notificationRegistry.registerProvider({ channelType: 'test', send })
    const service = new NotificationService()
    await service.checkAndNotify('pkg1', 'TN123', null, 'IN_TRANSIT', 'IN_TRANSIT', { eta: null, origin: null, destination: null, events: [] })
    expect(send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Run tests**

Run: `npm test`
Expected: All 8+ tests pass (5 existing + 3+ new).

- [ ] **Commit**

```bash
git add src/lib/notification/__tests__/
git commit -m "feat: add notification module tests"
```

---

### Task 19: Build Verification

**Files:** (none — run commands)

- [ ] **Run full build**

Run: `npm run build`
Expected: TypeScript check passes, production build succeeds.

- [ ] **Run lint**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Run tests**

Run: `npm test`
Expected: All tests pass.

- [ ] **Run db push (ensure schema is synced)**

Run: `npx prisma db push`
Expected: Database synchronized.
