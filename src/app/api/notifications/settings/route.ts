import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { restartScheduler } from '@/lib/notification/scheduler'

export async function GET() {
  const settings = await db.notificationSetting.findUnique({
    where: { id: 'global' },
  })
  if (!settings) {
    const created = await db.notificationSetting.create({ data: { id: 'global' } })
    return NextResponse.json(created)
  }
  return NextResponse.json(settings)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const prev = await db.notificationSetting.findUnique({ where: { id: 'global' } })

  const resetDailySent = prev?.dailySummaryTime !== body.dailySummaryTime
  const resetPeriodicSent = prev?.periodicInterval !== body.periodicInterval

  const updated = await db.notificationSetting.update({
    where: { id: 'global' },
    data: {
      enabled: body.enabled,
      dailySummaryEnabled: body.dailySummaryEnabled,
      dailySummaryTime: body.dailySummaryTime,
      periodicInterval: body.periodicInterval,
      ...(resetDailySent ? { lastDailySent: null } : {}),
      ...(resetPeriodicSent ? { lastPeriodicSent: null } : {}),
    },
  })
  restartScheduler()
  return NextResponse.json(updated)
}
