'use client'

import { useEffect, useRef } from 'react'

interface TvCardProps {
  trackingNumber: string
  nickname: string | null
  status: string | null
  origin: string | null
  destination: string | null
  eta: string | null
  aiSummary: string | null
  aiRootCause: string | null
  aiDelayRisk: { level: string; reason: string; suggestion: string | null; assessedAt: string } | null
  pulse?: boolean
  pulseColor?: string
}

const STATUS_BORDER_COLOR: Record<string, string> = {
  DELIVERED: '#22c55e',
  PICKUP_AVAILABLE: '#14b8a6',
  IN_TRANSIT: '#3b82f6',
  PICKED_UP: '#9ca3af',
  ON_FEDEX_VEHICLE: '#f97316',
  EXCEPTION: '#ef4444',
  DELAYED: '#eab308',
  RETURN_TO_SENDER: '#dc2626',
}

const STATUS_BG: Record<string, { bg: string; text: string }> = {
  DELIVERED: { bg: '#22c55e', text: '#0f172a' },
  PICKUP_AVAILABLE: { bg: '#14b8a6', text: '#0f172a' },
  IN_TRANSIT: { bg: '#3b82f6', text: '#ffffff' },
  PICKED_UP: { bg: '#9ca3af', text: '#0f172a' },
  ON_FEDEX_VEHICLE: { bg: '#f97316', text: '#ffffff' },
  EXCEPTION: { bg: '#ef4444', text: '#ffffff' },
  DELAYED: { bg: '#eab308', text: '#0f172a' },
  RETURN_TO_SENDER: { bg: '#dc2626', text: '#ffffff' },
}

function formatStatus(s: string | null): string {
  return s?.replace(/_/g, ' ') ?? 'UNKNOWN'
}

export function TvCard({ trackingNumber, nickname, status, origin, destination, eta, aiSummary, aiRootCause, aiDelayRisk, pulse, pulseColor }: TvCardProps) {
  const borderColor = STATUS_BORDER_COLOR[status ?? ''] ?? '#6b7280'
  const badgeStyle = STATUS_BG[status ?? '']
  const isException = status === 'EXCEPTION' || status === 'DELAYED' || status === 'RETURN_TO_SENDER'
  const scrollRef = useRef<HTMLDivElement>(null)

  const hasBottomContent = !!(aiSummary || aiDelayRisk)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = el.scrollHeight - el.clientHeight
    if (maxScroll <= 0) return

    let pos = 0
    const id = setInterval(() => {
      if (pos < maxScroll) {
        pos++
        el.scrollTop = pos
      } else {
        pos = 0
        el.scrollTop = 0
      }
    }, 120)

    return () => clearInterval(id)
  }, [aiSummary, aiRootCause, aiDelayRisk])

  return (
    <div
      className={`rounded-xl border-2 border-slate-500/60 shadow-xl flex flex-col h-full overflow-hidden${pulse ? ' tv-card--pulse' : ''}`}
      style={{ backgroundColor: '#1e293b', borderLeftWidth: '5px', borderLeftStyle: 'solid', borderLeftColor: borderColor, ...(pulseColor ? { '--pulse-color': pulseColor } as React.CSSProperties : {}) }}
    >
      <div className="p-5 flex flex-col gap-2 flex-1 min-h-0">
        {/* Status + ETA row */}
        <div className="flex items-center justify-between shrink-0">
          <span
            className="rounded px-3 py-1 font-bold"
            style={{
              fontSize: '1.125rem',
              backgroundColor: badgeStyle?.bg ?? '#6b7280',
              color: badgeStyle?.text ?? '#ffffff',
            }}
          >
            {formatStatus(status)}
          </span>
          {eta && (
            <span style={{ fontSize: '1.125rem', color: '#94a3b8' }}>
              ETA: {eta}
            </span>
          )}
        </div>

        {/* Tracking number / nickname */}
        <div style={{ fontSize: '1.5rem', color: '#f1f5f9' }} className="font-bold truncate leading-tight shrink-0">
          {nickname || trackingNumber}
        </div>
        {nickname && (
          <div style={{ fontSize: '1rem', color: '#94a3b8' }} className="truncate shrink-0">{trackingNumber}</div>
        )}

        {/* Route */}
        <div style={{ fontSize: '1.125rem', color: '#cbd5e1' }} className="shrink-0">
          {origin || '?'} → {destination || '?'}
        </div>

        {/* Scrollable bottom section */}
        {hasBottomContent && (
          <div
            ref={scrollRef}
            className="overflow-hidden mt-auto pt-2 border-t leading-snug"
            style={{
              borderColor: 'rgba(71, 85, 105, 0.6)',
              maxHeight: '45%',
            }}
          >
            {/* AI summary */}
            {aiSummary && (
              <div
                style={{
                  fontSize: '1.125rem',
                  color: isException ? '#fca5a5' : '#c4b5fd',
                }}
              >
                {isException && aiRootCause ? `⚠ ${aiRootCause}` : `✨ ${aiSummary}`}
              </div>
            )}

            {/* Delay risk */}
            {aiDelayRisk && (
              <div
                className={aiSummary ? 'mt-2' : ''}
                style={{
                  fontSize: '1rem',
                  color:
                    aiDelayRisk.level === 'critical' ? '#f87171' :
                    aiDelayRisk.level === 'high' ? '#fb923c' :
                    aiDelayRisk.level === 'medium' ? '#facc15' :
                    '#4ade80',
                }}
              >
                <span className="font-bold">{aiDelayRisk.level.toUpperCase()}</span>: {aiDelayRisk.reason}
                {aiDelayRisk.suggestion && (
                  <div style={{ opacity: 0.8, marginTop: '0.25rem' }}>💡 {aiDelayRisk.suggestion}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
