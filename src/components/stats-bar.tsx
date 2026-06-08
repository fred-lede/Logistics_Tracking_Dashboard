'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

type DashboardLabelKey = 'allTracked' | 'statusDelivered' | 'statusInTransit' | 'statusException' | 'statusDelayed'

interface PackageData {
  id: string
  status: string | null
}

interface StatsBarProps {
  packages: PackageData[]
  activeFilter: string | null
  onFilterChange: (key: string | null) => void
}

interface StatCard {
  key: string | null
  labelKey: DashboardLabelKey
  count: number
  color: string
  predicate: (p: PackageData) => boolean
}

const IN_TRANSIT_STATUSES: readonly string[] = ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE']
const EXCEPTION_STATUSES: readonly string[] = ['EXCEPTION', 'RETURN_TO_SENDER']
const DELIVERED_STATUSES: readonly string[] = ['DELIVERED', 'PICKUP_AVAILABLE']

function isInTransit(status: string | null): boolean {
  return IN_TRANSIT_STATUSES.includes(status ?? '')
}

function isException(status: string | null): boolean {
  return EXCEPTION_STATUSES.includes(status ?? '')
}

export function StatsBar({ packages, activeFilter, onFilterChange }: StatsBarProps) {
  const dt = useTranslations('dashboard')

  const cards: StatCard[] = useMemo(() => [
    {
      key: null,
      labelKey: 'allTracked',
      count: packages.length,
      color: 'text-gray-900',
      predicate: () => true,
    },
    {
    key: 'delivered',
    labelKey: 'statusDelivered',
    count: packages.filter((p) => DELIVERED_STATUSES.includes(p.status ?? '')).length,
    color: 'text-green-500',
    predicate: (p) => DELIVERED_STATUSES.includes(p.status ?? ''),
    },
    {
      key: 'inTransit',
      labelKey: 'statusInTransit',
      count: packages.filter((p) => isInTransit(p.status)).length,
      color: 'text-blue-500',
      predicate: (p) => isInTransit(p.status),
    },
    {
      key: 'exception',
      labelKey: 'statusException',
      count: packages.filter((p) => isException(p.status)).length,
      color: 'text-red-500',
      predicate: (p) => isException(p.status),
    },
    {
      key: 'delayed',
      labelKey: 'statusDelayed',
      count: packages.filter((p) => p.status === 'DELAYED').length,
      color: 'text-yellow-500',
      predicate: (p) => p.status === 'DELAYED',
    },
  ], [packages])

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cards.map((card) => {
        const isActive = activeFilter === card.key
        return (
        <button
          key={card.key ?? '__all__'}
          onClick={() => onFilterChange(isActive ? null : card.key)}
          aria-pressed={isActive}
          aria-label={dt(card.labelKey)}
          className={`flex flex-1 min-w-0 flex-col items-center rounded-xl px-3 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${
            isActive
              ? 'border-2 border-fedex-purple bg-purple-50'
              : 'border border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <span className={`text-xl font-bold leading-none tabular-nums ${card.color}`}>
            {card.count}
          </span>
            <span className="mt-1 text-xs text-gray-500 leading-tight text-center">
              {dt(card.labelKey)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
