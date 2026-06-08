'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

type DashboardLabelKey = 'allTracked' | 'statusDelivered' | 'statusInTransit' | 'statusException' | 'statusDelayed'

interface PackageData {
  id: string
  status: string | null
}

const DELIVERED_STATUSES = ['DELIVERED', 'PICKUP_AVAILABLE']
const IN_TRANSIT_STATUSES = ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE']
const EXCEPTION_STATUSES = ['EXCEPTION', 'RETURN_TO_SENDER']

const STAT_COLORS: Record<string, string> = {
  __all__: '#ffffff',
  delivered: '#4ade80',
  inTransit: '#60a5fa',
  exception: '#f87171',
  delayed: '#facc15',
}

export function TvStatsBar({ packages }: { packages: PackageData[] }) {
  const dt = useTranslations('dashboard')

  const cards = useMemo(() => [
    { key: '__all__', labelKey: 'allTracked' as DashboardLabelKey, count: packages.length },
    { key: 'delivered', labelKey: 'statusDelivered' as DashboardLabelKey, count: packages.filter((p) => DELIVERED_STATUSES.includes(p.status ?? '')).length },
    { key: 'inTransit', labelKey: 'statusInTransit' as DashboardLabelKey, count: packages.filter((p) => IN_TRANSIT_STATUSES.includes(p.status ?? '')).length },
    { key: 'exception', labelKey: 'statusException' as DashboardLabelKey, count: packages.filter((p) => EXCEPTION_STATUSES.includes(p.status ?? '')).length },
    { key: 'delayed', labelKey: 'statusDelayed' as DashboardLabelKey, count: packages.filter((p) => p.status === 'DELAYED').length },
  ], [packages])

  return (
    <div className="flex gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className="flex flex-1 flex-col items-center rounded-xl border-2 border-slate-500/60 shadow-xl px-4 py-4"
          style={{ backgroundColor: '#1e293b' }}
        >
          <span
            className="font-extrabold leading-none tabular-nums"
            style={{ fontSize: '2.5rem', color: STAT_COLORS[card.key] ?? '#fff' }}
          >
            {card.count}
          </span>
          <span className="mt-2 text-[0.75rem] text-gray-400 uppercase tracking-wider font-medium">
            {dt(card.labelKey)}
          </span>
        </div>
      ))}
    </div>
  )
}
