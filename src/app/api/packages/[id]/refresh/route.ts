import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getProvider } from '@/lib/tracking/registry'
import { sendNotifications } from '@/lib/notification/service'
import type { StatusChangeMessage, OverdueMessage } from '@/lib/notification/types'
import { analyzePackage, translateSummary } from '@/lib/llm/service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const pkg = await db.package.findUnique({ where: { id } })
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }

  // Rate gate: minimum 15s between refreshes
  if (pkg.lastCheckedAt) {
    const elapsed = Date.now() - pkg.lastCheckedAt.getTime()
    if (elapsed < 15000) {
      return NextResponse.json(
        { error: `Rate limited. Try again in ${Math.ceil((15000 - elapsed) / 1000)}s` },
        { status: 429 }
      )
    }
  }

  try {
    const provider = getProvider(pkg.carrier)
    const result = await provider.track(pkg.trackingNumber)

    const oldStatus = pkg.status

    const updated = await db.package.update({
      where: { id },
      data: {
        status: result.status,
        eta: result.eta,
        origin: result.origin,
        destination: result.destination,
        events: JSON.stringify(result.events),
        subPackages: JSON.stringify(result.subPackages ?? []),
        lastCheckedAt: new Date(),
      },
    })

    const locale = (() => {
      const cookieHeader = request.headers.get('cookie') ?? ''
      const localeMatch = cookieHeader.match(/(?:^|;\s*)locale=([^;]+)/)
      return localeMatch?.[1] ?? 'en'
    })()

    if (result.status && oldStatus !== result.status) {
      let aiResult: { summary?: string; rootCause?: string | null } | null = null
      try {
        aiResult = await analyzePackage(id)
      } catch {}

      let translatedSummary = aiResult?.summary ?? null
      let translatedRootCause = aiResult?.rootCause ?? null
      if (locale !== 'en') {
        const [ts, tr] = await Promise.all([
          translatedSummary ? translateSummary(translatedSummary, locale) : Promise.resolve(null),
          translatedRootCause ? translateSummary(translatedRootCause, locale) : Promise.resolve(null),
        ])
        translatedSummary = ts
        translatedRootCause = tr
      }

      const message: StatusChangeMessage = {
        type: 'status_change',
        packageId: pkg.id,
        trackingNumber: pkg.trackingNumber,
        nickname: pkg.nickname,
        status: result.status,
        eta: result.eta,
        origin: result.origin,
        destination: result.destination,
        events: result.events,
        aiSummary: translatedSummary,
        aiRootCause: translatedRootCause,
      }
      await sendNotifications(message)
    }

    // Overdue detection
    const etaDate = updated.eta ? new Date(updated.eta) : null
    const isOverdue = etaDate
      && etaDate < new Date()
      && updated.status !== 'DELIVERED'
      && updated.status !== 'PICKUP_AVAILABLE'

    if (isOverdue) {
      const overdueDays = Math.max(1, Math.ceil(
        (Date.now() - etaDate.getTime()) / 86400000
      ))
      let overdueAiSummary = updated.aiSummary
      let overdueAiRootCause = updated.aiRootCause
      if (!overdueAiSummary) {
        try {
          const aiResult = await analyzePackage(id)
          overdueAiSummary = aiResult?.summary ?? null
          overdueAiRootCause = aiResult?.rootCause ?? null
        } catch {}
      }
      let translatedOverdueSummary = overdueAiSummary
      let translatedOverdueRootCause = overdueAiRootCause
      if (locale !== 'en') {
        const [ts, tr] = await Promise.all([
          translatedOverdueSummary ? translateSummary(translatedOverdueSummary, locale) : Promise.resolve(null),
          translatedOverdueRootCause ? translateSummary(translatedOverdueRootCause, locale) : Promise.resolve(null),
        ])
        translatedOverdueSummary = ts
        translatedOverdueRootCause = tr
      }
      const overdueMessage: OverdueMessage = {
        type: 'overdue',
        packageId: updated.id,
        trackingNumber: updated.trackingNumber,
        nickname: updated.nickname,
        status: updated.status!,
        eta: updated.eta,
        overdueDays,
        aiSummary: translatedOverdueSummary,
        aiRootCause: translatedOverdueRootCause,
      }
      await sendNotifications(overdueMessage)
    }

    function safeParseJSON(value: string): unknown[] {
      try {
        return JSON.parse(value)
      } catch {
        return []
      }
    }

    // Risk analysis on every refresh (cooldown gated)
    let riskAiResult: Awaited<ReturnType<typeof analyzePackage>> | null = null
    try {
      riskAiResult = await analyzePackage(id)
    } catch {}
    const aiDelayRisk = riskAiResult?.delayRisk ?? null

    const translatedDisplaySummary = locale !== 'en' && updated.aiSummary
      ? await translateSummary(updated.aiSummary, locale)
      : updated.aiSummary
    const translatedDisplayRootCause = locale !== 'en' && updated.aiRootCause
      ? await translateSummary(updated.aiRootCause, locale)
      : updated.aiRootCause

    return NextResponse.json({
      ...updated,
      events: result.events,
      subPackages: result.subPackages ?? [],
      partNumbers: safeParseJSON(updated.partNumbers),
      aiSummary: translatedDisplaySummary,
      aiRootCause: translatedDisplayRootCause,
      aiDelayRisk,
      previousStatus: oldStatus,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to refresh tracking data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    )
  }
}
