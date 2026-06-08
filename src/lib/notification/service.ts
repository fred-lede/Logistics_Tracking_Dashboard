import { prisma } from '@/lib/prisma'
import { notificationRegistry } from './registry'
import { parseJsonArray } from '@/lib/utils'
import { translateSummary } from '@/lib/llm/service'
import type { DelayRisk } from '@/lib/llm/types'
import type { NotificationMessage, NotificationResult, StatusChangeMessage, OverdueMessage, SummaryMessage } from './types'

type AIFields = { aiSummary?: string | null; aiRootCause?: string | null; aiDelayRisk?: DelayRisk | null }

function getAIFields(message: NotificationMessage): AIFields {
  if (message.type === 'status_change' || message.type === 'overdue') {
    return { aiSummary: message.aiSummary, aiRootCause: message.aiRootCause, aiDelayRisk: message.aiDelayRisk }
  }
  return {}
}

function withAIFields<T extends NotificationMessage>(message: T, ai: AIFields): T {
  if (message.type === 'status_change' || message.type === 'overdue') {
    return { ...message, aiSummary: ai.aiSummary, aiRootCause: ai.aiRootCause, aiDelayRisk: ai.aiDelayRisk } as T
  }
  if (message.type === 'summary') {
    return { ...message } as T
  }
  return message
}

async function translateAIFields(ai: AIFields, locale: string): Promise<AIFields> {
  if (locale === 'en') return ai
  const [aiSummary, aiRootCause] = await Promise.all([
    ai.aiSummary ? translateSummary(ai.aiSummary, locale).catch(() => ai.aiSummary!) : undefined,
    ai.aiRootCause ? translateSummary(ai.aiRootCause, locale).catch(() => ai.aiRootCause!) : undefined,
  ])
  return { aiSummary, aiRootCause }
}

async function translateSummaryPackages(
  packages: SummaryMessage['packages'],
  locale: string
): Promise<SummaryMessage['packages']> {
  if (locale === 'en') return packages
  return Promise.all(packages.map(async (p) => ({
    ...p,
    aiSummary: p.aiSummary
      ? await translateSummary(p.aiSummary, locale).catch(() => p.aiSummary!)
      : p.aiSummary,
  })))
}

export async function sendNotifications(
  message: NotificationMessage
): Promise<{ channelId: string; result: NotificationResult }[]> {
  const settings = await prisma.notificationSetting.findUnique({
    where: { id: 'global' },
  })

  if (!settings?.enabled) return []

  const channels = await prisma.notificationChannel.findMany({
    where: { enabled: true },
    include: { contacts: { where: { enabled: true } } },
  })

  const llmSetting = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
  const defaultLocale = llmSetting?.locale || 'en'

  const results: { channelId: string; result: NotificationResult }[] = []
  const translateCache = new Map<string, AIFields>()
  const summaryCache = new Map<string, SummaryMessage['packages']>()

  for (const channel of channels) {
    if (message.type === 'status_change') {
      const notifyOn = parseJsonArray<string>(channel.notifyOnStatuses)
      if (notifyOn.length > 0 && !notifyOn.includes(message.status)) {
        continue
      }
    }

    if (message.type === 'summary' && !channel.sendSummary) continue

    const provider = notificationRegistry.getProvider(channel.type)
    if (!provider) continue

    const config: Record<string, unknown> = channel.config ? JSON.parse(channel.config) : {}
    const channelLocale = channel.locale || defaultLocale

    const contactGroups = new Map<string, typeof channel.contacts>()
    for (const contact of channel.contacts) {
      const loc = contact.locale || channelLocale
      if (!contactGroups.has(loc)) contactGroups.set(loc, [])
      contactGroups.get(loc)!.push(contact)
    }

    for (const [locale, contacts] of contactGroups) {
      let localizedMessage = message

      if (message.type === 'summary') {
        let pkgs = summaryCache.get(locale)
        if (!pkgs) {
          pkgs = await translateSummaryPackages(message.packages, locale)
          summaryCache.set(locale, pkgs)
        }
        localizedMessage = { ...message, packages: pkgs } as SummaryMessage
      } else {
        let ai = translateCache.get(locale)
        if (!ai) {
          ai = await translateAIFields(getAIFields(message), locale)
          translateCache.set(locale, ai)
        }
        localizedMessage = withAIFields(message, ai)
      }

      const contactInfos = contacts.map((c) => ({ name: c.name, identifier: c.identifier }))
      const result = await provider.send(config, contactInfos, localizedMessage)

      if (contacts === channel.contacts) {
        await prisma.notificationLog.create({
          data: {
            packageId: message.type === 'status_change' ? message.packageId : message.type === 'overdue' ? message.packageId : '',
            channelId: channel.id,
            notificationType: message.type,
            status: result.success ? 'sent' : 'failed',
            success: result.success,
            errorMessage: result.error || null,
          },
        })
      }

      results.push({ channelId: channel.id, result })
    }
  }

  return results
}
