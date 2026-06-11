'use client'

import { useEffect, useRef } from 'react'

interface TvCardProps {
  trackingNumber: string
  nickname: string | null
  carrier: string
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

export function TvCard({ trackingNumber, nickname, carrier, status, origin, destination, eta, aiSummary, aiRootCause, aiDelayRisk, pulse, pulseColor }: TvCardProps) {
  const borderColor = STATUS_BORDER_COLOR[status ?? ''] ?? '#6b7280'
  const badgeStyle = STATUS_BG[status ?? '']
  const isException = status === 'EXCEPTION' || status === 'DELAYED' || status === 'RETURN_TO_SENDER'
  const marqueeRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const posRef = useRef(0)
  const lastTimeRef = useRef(0)

  const hasBottomContent = !!(aiSummary || aiDelayRisk)

  const summaryText = aiSummary ? (isException && aiRootCause ? `⚠ ${aiRootCause}` : `✨ ${aiSummary}`) : ''
  const delayText = aiDelayRisk
    ? `${aiDelayRisk.level.toUpperCase()}: ${aiDelayRisk.reason}${aiDelayRisk.suggestion ? `  💡 ${aiDelayRisk.suggestion}` : ''}`
    : ''
  const fullText = [summaryText, delayText].filter(Boolean).join('  •  ')

  useEffect(() => {
    function tick(now: number) {
      const inner = innerRef.current
      if (inner) {
        const totalWidth = inner.scrollWidth / 2
        if (totalWidth > 0) {
          const dt = lastTimeRef.current ? now - lastTimeRef.current : 0
          lastTimeRef.current = now
          posRef.current -= 60 * dt / 1000
          if (posRef.current <= -totalWidth) posRef.current = 0
          inner.style.transform = `translateX(${posRef.current}px)`
        } else {
          lastTimeRef.current = 0
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      className={`rounded-xl border-2 border-slate-500/60 shadow-xl flex flex-col h-full overflow-hidden${pulse ? ' tv-card--pulse' : ''}`}
      style={{ backgroundColor: '#1e293b', borderLeftWidth: '5px', borderLeftStyle: 'solid', borderLeftColor: borderColor, ...(pulseColor ? { '--pulse-color': pulseColor } as React.CSSProperties : {}) }}
    >
      <div className="p-2 flex flex-col gap-0.5 flex-1 min-h-0">
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

        {/* Tracking number / nickname + carrier badge */}
        <div className="flex items-center gap-2 shrink-0 min-w-0">
          <div style={{ fontSize: '1.5rem', color: '#f1f5f9' }} className="font-bold truncate leading-tight">
            {nickname || trackingNumber}
          </div>
          <span
            className="rounded px-2 py-0.5 font-semibold uppercase tracking-wider shrink-0"
            style={{ fontSize: '0.75rem', backgroundColor: 'rgba(100,116,139,0.4)', color: '#94a3b8' }}
          >
            {carrier === 'fedex' ? 'FedEx' : carrier === 'dhl' ? 'DHL' : carrier}
          </span>
        </div>
        {nickname && (
          <div style={{ fontSize: '1rem', color: '#94a3b8' }} className="truncate shrink-0">{trackingNumber}</div>
        )}

        {/* Route */}
        <div style={{ fontSize: '1.125rem', color: '#cbd5e1' }} className="shrink-0">
          {origin || '?'} → {destination || '?'}
        </div>

        {/* Marquee bottom section */}
        {hasBottomContent && (
          <div
            ref={marqueeRef}
            className="mt-auto pt-1 border-t overflow-hidden flex items-center"
            style={{
              borderColor: 'rgba(71, 85, 105, 0.6)',
            }}
          >
            <div
              ref={innerRef}
              style={{
                display: 'inline-flex',
                gap: '4rem',
                whiteSpace: 'nowrap',
                fontSize: '1.125rem',
                lineHeight: '1.5',
                color: isException ? '#fca5a5' : '#c4b5fd',
                willChange: 'transform',
              }}
            >
              <span>{fullText}</span>
              <span>{fullText}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
