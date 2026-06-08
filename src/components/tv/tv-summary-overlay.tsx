'use client'

import { useTranslations } from 'next-intl'

interface SummaryPackage {
  trackingNumber: string
  nickname: string | null
  status: string
  destination: string | null
  eta: string | null
  lastEvent: string | null
  aiSummary: string | null
}

interface SummaryData {
  date: string
  packages: SummaryPackage[]
  interval?: number
}

interface TvSummaryOverlayProps {
  summary: SummaryData
  summaryType: 'daily' | 'periodic'
  onDismiss: () => void
}

const STATUS_COLORS: Record<string, string> = {
  DELIVERED: '#22c55e',
  PICKUP_AVAILABLE: '#14b8a6',
  IN_TRANSIT: '#3b82f6',
  PICKED_UP: '#9ca3af',
  ON_FEDEX_VEHICLE: '#f97316',
  EXCEPTION: '#ef4444',
  DELAYED: '#eab308',
  RETURN_TO_SENDER: '#dc2626',
}

const STATUS_TEXT: Record<string, string> = {
  DELIVERED: '#0f172a',
  PICKUP_AVAILABLE: '#0f172a',
  IN_TRANSIT: '#ffffff',
  PICKED_UP: '#0f172a',
  ON_FEDEX_VEHICLE: '#ffffff',
  EXCEPTION: '#ffffff',
  DELAYED: '#0f172a',
  RETURN_TO_SENDER: '#ffffff',
}

function formatStatus(s: string): string {
  return s.replace(/_/g, ' ')
}

export function TvSummaryOverlay({ summary, summaryType, onDismiss }: TvSummaryOverlayProps) {
  const dt = useTranslations('dashboard')

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ zIndex: 200, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onDismiss}
    >
      <div
        className="rounded-2xl border-2 border-slate-500/60 shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: '60rem', backgroundColor: '#1e293b', marginInline: '3rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(71, 85, 105, 0.6)' }}>
          <h2 className="font-bold" style={{ fontSize: '1.75rem', color: '#f1f5f9' }}>
            {summaryType === 'daily' ? `📦 ${dt('dailySummary')}` : `📊 ${dt('periodicSummary')}`}
            {summary.interval ? ` — ${dt('everyNHours', { n: summary.interval })}` : ''}
          </h2>
          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>{summary.date}</span>
        </div>

        <div className="px-6 py-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
          {summary.packages.length === 0 ? (
            <p style={{ fontSize: '1.125rem', color: '#94a3b8' }}>{dt('noSummaryYet')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {summary.packages.map((pkg) => {
                const bgColor = STATUS_COLORS[pkg.status] ?? '#6b7280'
                const textColor = STATUS_TEXT[pkg.status] ?? '#ffffff'
                return (
                  <div
                    key={pkg.trackingNumber}
                    className="flex items-start gap-4 rounded-lg p-3"
                    style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}
                  >
                    <span
                      className="rounded px-2 py-0.5 font-bold shrink-0"
                      style={{ fontSize: '0.875rem', backgroundColor: bgColor, color: textColor }}
                    >
                      {formatStatus(pkg.status)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate" style={{ fontSize: '1.125rem', color: '#e2e8f0' }}>
                        {pkg.nickname || pkg.trackingNumber}
                      </div>
                      {pkg.aiSummary && (
                        <div className="mt-1 leading-snug" style={{ fontSize: '0.9375rem', color: '#c4b5fd' }}>
                          ✨ {pkg.aiSummary}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t text-center" style={{ borderColor: 'rgba(71, 85, 105, 0.6)', fontSize: '0.875rem', color: '#64748b' }}>
          {dt('summaryDismiss')}
        </div>
      </div>
    </div>
  )
}

export type { SummaryData, SummaryPackage }
