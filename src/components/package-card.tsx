'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { RefreshButton } from './refresh-button'
import { AutoRefreshToggle } from './auto-refresh-toggle'
import { useToast } from './toast'

interface PackageEvent {
  date: string
  status: string
  location: string
  description: string
}

interface SubPackage {
  trackingNumber: string
  status: string
  origin: string | null
  destination: string | null
}

interface PackageData {
  id: string
  trackingNumber: string
  carrier: string
  nickname: string | null
  partNumbers: string[]
  status: string | null
  eta: string | null
  origin: string | null
  destination: string | null
  events: PackageEvent[]
  subPackages?: SubPackage[]
  aiSummary: string | null
  aiRootCause: string | null
  aiDelayRisk: { level: string; reason: string; suggestion: string | null; assessedAt: string } | null
  lastCheckedAt: string | null
  autoRefresh: boolean
}

function statusBadgeClass(status: string | null): string {
  const map: Record<string, string> = {
    DELIVERED: 'bg-green-500 text-white',
  PICKUP_AVAILABLE: 'bg-teal-500 text-white',
    IN_TRANSIT: 'bg-blue-500 text-white',
    PICKED_UP: 'bg-gray-400 text-white',
    ON_FEDEX_VEHICLE: 'bg-orange-500 text-white',
    EXCEPTION: 'bg-red-500 text-white animate-pulse',
    DELAYED: 'bg-yellow-500 text-black',
    RETURN_TO_SENDER: 'bg-red-600 text-white',
  }
  return map[status ?? ''] ?? 'bg-gray-200 text-gray-700'
}

function statusLabelKey(status: string | null): string {
  const map: Record<string, string> = {
    DELIVERED: 'statusDelivered',
  PICKUP_AVAILABLE: 'statusPickupAvailable',
    IN_TRANSIT: 'statusInTransit',
    PICKED_UP: 'statusPickedUp',
    ON_FEDEX_VEHICLE: 'statusOnVehicle',
    EXCEPTION: 'statusException',
    DELAYED: 'statusDelayed',
    RETURN_TO_SENDER: 'statusReturnToSender',
    UNKNOWN: 'statusUnknown',
  }
  return map[status ?? ''] ?? 'statusUnknown'
}

function statusBadgeDot(status: string | null): string {
  const map: Record<string, string> = {
    DELIVERED: 'bg-green-500',
  PICKUP_AVAILABLE: 'bg-teal-500',
    IN_TRANSIT: 'bg-blue-500',
    PICKED_UP: 'bg-gray-400',
    ON_FEDEX_VEHICLE: 'bg-orange-500',
    EXCEPTION: 'bg-red-500',
    DELAYED: 'bg-yellow-500',
    RETURN_TO_SENDER: 'bg-red-600',
  }
  return map[status ?? ''] ?? 'bg-gray-300'
}

interface PackageCardProps {
  pkg: PackageData
  onDelete: (id: string) => void
  onRefresh: () => void
  onToggleAutoRefresh: (id: string, enabled: boolean) => void
}

export function PackageCard({ pkg, onDelete, onRefresh, onToggleAutoRefresh }: PackageCardProps) {
  const t = useTranslations('packageCard')
  const st = useTranslations('settings')
  const lt = useTranslations('llm')
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const [autoRefreshState, setAutoRefreshState] = useState(pkg.autoRefresh)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { addToast } = useToast()

  function handleRefreshed(data: { status: string; eta: string | null; events: unknown[]; previousStatus?: string }) {
    if (data.previousStatus && data.previousStatus !== data.status) {
      addToast(`${pkg.trackingNumber}: ${data.previousStatus} → ${data.status}`, 'info')
    }
    onRefresh()
  }

  function handleToggle(enabled: boolean) {
    setAutoRefreshState(enabled)
    onToggleAutoRefresh(pkg.id, enabled)
  }

  useEffect(() => {
    if (autoRefreshState) {
      intervalRef.current = setInterval(() => {
        fetch(`/api/packages/${pkg.id}/refresh`, { method: 'POST' })
          .then((res) => res.ok && onRefresh())
          .catch(() => {})
      }, 60000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefreshState, pkg.id, onRefresh])

  const isException = pkg.status === 'EXCEPTION' || pkg.status === 'RETURN_TO_SENDER'

  const now = new Date()
  const etaDate = pkg.eta ? new Date(pkg.eta) : null
  const isOverdue = !!etaDate && etaDate < now && pkg.status !== 'DELIVERED' && pkg.status !== 'PICKUP_AVAILABLE'
  const overdueDays = isOverdue ? Math.max(1, Math.ceil((now.getTime() - etaDate.getTime()) / 86400000)) : 0

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
        isException ? 'border-red-300' : isOverdue ? 'border-amber-300' : 'border-gray-200'
      }`}
    >
      {isException && (
        <div className="bg-red-500 px-4 py-1.5 text-xs font-medium text-white">
          ⚠ {st(statusLabelKey(pkg.status))}
        </div>
      )}
      {isOverdue && (
        <div className="bg-amber-500 px-4 py-1.5 text-xs font-medium text-white">
          ⏰ {t('overdueWarning', { days: overdueDays })}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-sm font-semibold truncate tabular-nums">
          {pkg.trackingNumber}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(pkg.status)}`}>
          {st(statusLabelKey(pkg.status))}
        </span>
      </div>
      {pkg.nickname && (
        <div className="text-xs text-gray-500 truncate">
          <span aria-hidden="true">📦</span> {pkg.nickname}
        </div>
      )}
      {pkg.partNumbers && pkg.partNumbers.length > 0 && (
        <div className="text-xs text-gray-500 truncate">
          <span aria-hidden="true">🔧</span> {t('partNumbers')}: {pkg.partNumbers.join(', ')}
        </div>
      )}
      </div>
      <button
        onClick={() => { if (confirm(t('confirmDelete'))) onDelete(pkg.id) }}
        className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 rounded"
        aria-label={t('delete')}
      >
        ✕
      </button>
    </div>

      {(pkg.origin || pkg.destination) && (
        <div className="text-xs text-gray-500 mb-1">
          <span aria-hidden="true">📍</span> {pkg.origin}{pkg.origin && pkg.destination ? ' → ' : ' '}{pkg.destination}
        </div>
      )}

      {pkg.aiSummary && (
        <div className="mb-2 rounded-md bg-purple-50 border border-purple-200 px-3 py-2 text-xs text-purple-800">
          <span aria-hidden="true" className="mr-1">🤖</span>{lt('summary')}: {pkg.aiSummary}
        </div>
      )}
      {pkg.aiRootCause && (
        <div className="mb-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
          <span aria-hidden="true" className="mr-1">🤖</span>{lt('rootCause')}: {pkg.aiRootCause}
        </div>
      )}

      {pkg.aiDelayRisk && (() => {
        const riskColors: Record<string, { bg: string; border: string; text: string }> = {
          low: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
          medium: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
          high: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800' },
          critical: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
        }
        const c = riskColors[pkg.aiDelayRisk.level.toLowerCase()] ?? riskColors.low
        return (
          <div className={`mb-2 rounded-md border px-3 py-2 text-xs ${c.bg} ${c.border} ${c.text}`}>
            <span className="font-semibold">
              {pkg.aiDelayRisk.level === 'critical' ? '🔴' : pkg.aiDelayRisk.level === 'high' ? '🟠' : pkg.aiDelayRisk.level === 'medium' ? '🟡' : '🟢'}
              {' '}{pkg.aiDelayRisk.level.toUpperCase()}
            </span>
            : {pkg.aiDelayRisk.reason}
            {pkg.aiDelayRisk.suggestion && (
              <div className="mt-1 opacity-80">💡 {pkg.aiDelayRisk.suggestion}</div>
            )}
          </div>
        )
      })()}

    {pkg.eta && (
      <div className="text-sm font-medium text-gray-700 mb-2 tabular-nums">
        {pkg.status === 'DELIVERED' || pkg.status === 'PICKUP_AVAILABLE' ? `${t('status')}: ` : `${t('eta')}: `}
        {new Date(pkg.eta).toLocaleDateString(locale)}
      </div>
    )}

    {pkg.events.length > 0 && pkg.events[0].location && (
      <div className="text-xs text-gray-500 mb-2">
        <span aria-hidden="true">📍</span> {t('latestLocation')}: {pkg.events[0].location}
      </div>
    )}

        {pkg.subPackages && pkg.subPackages.length > 0 && (
          <div className="mb-2 pt-2 border-t border-gray-100">
            <div className="text-xs font-medium text-gray-500 mb-1">
              {t('subPackages')} ({pkg.subPackages.length})
            </div>
            <div className="space-y-1">
              {pkg.subPackages.map((sp, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusBadgeDot(sp.status)}`} />
                  <span className="font-mono text-gray-600">{sp.trackingNumber}</span>
                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${statusBadgeClass(sp.status)}`}>
                    {st(statusLabelKey(sp.status))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <RefreshButton packageId={pkg.id} onRefreshed={handleRefreshed} />
            <AutoRefreshToggle enabled={autoRefreshState} onToggle={handleToggle} />
          </div>
          <div className="flex items-center gap-2">
              {pkg.lastCheckedAt && (
                <span className="text-xs text-gray-400 tabular-nums">
                  {getRelativeTime(new Date(pkg.lastCheckedAt), t)}
                </span>
              )}
            {pkg.events.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-fedex-purple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 rounded"
              aria-expanded={expanded}
              aria-label={expanded ? t('hideTimeline') : t('showTimeline')}
            >
              {expanded ? `▲ ${t('hideTimeline')}` : `▼ ${t('showTimeline')}`}
            </button>
            )}
          </div>
        </div>

        {expanded && pkg.events.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="relative pl-4 space-y-3">
              {pkg.events.map((event, i) => (
                <div key={i} className="relative">
                  <div className="absolute left-[-10px] top-1.5 h-2 w-2 rounded-full bg-fedex-purple" />
                  <div className="text-xs">
                    <div className="font-medium text-gray-700">{st(statusLabelKey(event.status))}</div>
                  <div className="text-gray-500">
                    {new Date(event.date).toLocaleString(locale)} — {event.location}
                  </div>
                    <div className="text-gray-400">{event.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getRelativeTime(date: Date, t: (key: string, params?: Record<string, string | number>) => string): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('justNow')
  if (mins < 60) return t('minutesAgo', { minutes: mins })
  const hours = Math.floor(mins / 60)
  return t('hoursAgo', { hours })
}
