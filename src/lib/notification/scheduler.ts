import { prisma } from '@/lib/prisma'
import { safeParseEvents } from '@/lib/tracking/providers/fedex'
import { sendNotifications } from './service'
import { translateSummary } from '@/lib/llm/service'
import type { SummaryMessage } from './types'

let dailyCheckIntervalId: ReturnType<typeof setInterval> | null = null

const SCHEDULE_GLOBAL_KEY = '__fedex_scheduler_active'

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function getMinutesSinceMidnight(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

async function sendDailySummary() {
  const setting = await prisma.notificationSetting.findUnique({
    where: { id: 'global' },
  })
  if (!setting?.dailySummaryEnabled) return
  if (setting.lastDailySent === getTodayKey()) return

  const allPackages = await prisma.package.findMany()
  const llmSetting = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
  const locale = llmSetting?.locale || 'en'

  const packages = await Promise.all(allPackages.map(async (p) => {
    const aiSummary = p.aiSummary && locale !== 'en'
      ? await translateSummary(p.aiSummary, locale).catch(() => p.aiSummary)
      : p.aiSummary
    return {
      trackingNumber: p.trackingNumber,
      nickname: p.nickname,
      status: p.status || 'UNKNOWN',
      destination: p.destination,
      eta: p.eta,
      lastEvent: (safeParseEvents(p.events)?.[0]?.description) || null,
      aiSummary,
    }
  }))

  const message: SummaryMessage = {
    type: 'summary',
    summarySubtype: 'daily',
    summaryDate: getTodayKey(),
    packages,
  }

  const results = await sendNotifications(message)

  if (results.length > 0) {
    await prisma.notificationSetting.update({
      where: { id: 'global' },
      data: { lastDailySent: getTodayKey() },
    })
  }
}

async function sendPeriodicSummary() {
  const setting = await prisma.notificationSetting.findUnique({
    where: { id: 'global' },
  })
  if (!setting?.periodicInterval || setting.periodicInterval <= 0) return

  const allPackages = await prisma.package.findMany()
  const llmSetting = await prisma.lLMSetting.findUnique({ where: { id: 'global' } })
  const locale = llmSetting?.locale || 'en'

  const packages = await Promise.all(allPackages.map(async (p) => {
    const aiSummary = p.aiSummary && locale !== 'en'
      ? await translateSummary(p.aiSummary, locale).catch(() => p.aiSummary)
      : p.aiSummary
    return {
      trackingNumber: p.trackingNumber,
      nickname: p.nickname,
      status: p.status || 'UNKNOWN',
      destination: p.destination,
      eta: p.eta,
      lastEvent: (safeParseEvents(p.events)?.[0]?.description) || null,
      aiSummary,
    }
  }))

  const message: SummaryMessage = {
    type: 'summary',
    summarySubtype: 'periodic',
    summaryDate: `${getTodayKey()} ${new Date().toLocaleTimeString()}`,
    periodicInterval: setting.periodicInterval,
    packages,
  }

  await sendNotifications(message)

  await prisma.notificationSetting.update({
    where: { id: 'global' },
    data: { lastPeriodicSent: new Date() },
  })
}

async function checkForDailyAndSyncPeriodic() {
  const setting = await prisma.notificationSetting.findUnique({
    where: { id: 'global' },
  })
  if (!setting) return

  if (setting.dailySummaryEnabled) {
    const [hour, minute] = (setting.dailySummaryTime || '09:00').split(':').map(Number)
    const target = hour * 60 + minute
    const now = getMinutesSinceMidnight()

    if (now >= target && setting.lastDailySent !== getTodayKey()) {
      await sendDailySummary()
    }
  }

  if (setting.periodicInterval && setting.periodicInterval > 0) {
    const lastSent = setting.lastPeriodicSent ? new Date(setting.lastPeriodicSent).getTime() : 0
    const elapsed = Date.now() - lastSent
    const intervalMs = setting.periodicInterval * 60 * 60 * 1000
    if (elapsed >= intervalMs) {
      await sendPeriodicSummary()
    }
  }
}

export function startScheduler() {
  const g = globalThis as Record<string, unknown>
  if (g[SCHEDULE_GLOBAL_KEY]) return
  g[SCHEDULE_GLOBAL_KEY] = true
  stopScheduler()
  checkForDailyAndSyncPeriodic()
  dailyCheckIntervalId = setInterval(checkForDailyAndSyncPeriodic, 60_000)
}

export function stopScheduler() {
  const g = globalThis as Record<string, unknown>
  delete g[SCHEDULE_GLOBAL_KEY]
  if (dailyCheckIntervalId) {
    clearInterval(dailyCheckIntervalId)
    dailyCheckIntervalId = null
  }
}

export function restartScheduler() {
  const g = globalThis as Record<string, unknown>
  delete g[SCHEDULE_GLOBAL_KEY]
  startScheduler()
}
