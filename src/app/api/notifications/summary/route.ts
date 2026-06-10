import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { translateSummary } from '@/lib/llm/service'
import { safeParseEvents } from '@/lib/tracking/providers/fedex'

export async function GET(request: Request) {
  const setting = await db.notificationSetting.findUnique({ where: { id: 'global' } })
  if (!setting) {
    return NextResponse.json({ daily: null, periodic: null })
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/)
  const locale = localeMatch?.[1] ?? 'en'

  const allPackages = await db.package.findMany()

  const packageSummaries = await Promise.all(
    allPackages.map(async (p) => {
      let aiSummary: string | null = p.aiSummary
      if (aiSummary && locale !== 'en') {
        aiSummary = await translateSummary(aiSummary, locale).catch(() => aiSummary)
      }
      return {
        trackingNumber: p.trackingNumber,
        nickname: p.nickname,
        status: p.status || 'UNKNOWN',
        destination: p.destination,
        eta: p.eta,
        lastEvent: safeParseEvents(p.events)?.[0]?.description || null,
        aiSummary,
      }
    }),
  )

  const daily = setting.dailySummaryEnabled && setting.lastDailySent
    ? { date: setting.lastDailySent, packages: packageSummaries }
    : null

  const periodic = setting.periodicInterval > 0 && setting.lastPeriodicSent
    ? {
        date: setting.lastPeriodicSent.toISOString(),
        interval: setting.periodicInterval,
        packages: packageSummaries,
      }
    : null

  return NextResponse.json({ daily, periodic })
}
