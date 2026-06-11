'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { TvClock } from './tv-clock'
import { TvStatsBar } from './tv-stats-bar'
import { TvCard } from './tv-card'
import { TvSummaryOverlay } from './tv-summary-overlay'
import type { SummaryData } from './tv-summary-overlay'
import { playAlertSound, getSoundId } from './tv-sound'

interface PackageData {
  id: string
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
}

const PER_PAGE = 9
const CAROUSEL_KEY = 'tv-carousel-interval'
const DEFAULT_INTERVAL = 15000

const PULSE_COLORS: Record<string, string> = {
  DELIVERED: '#22c55e',
  PICKUP_AVAILABLE: '#14b8a6',
  IN_TRANSIT: '#3b82f6',
  PICKED_UP: '#9ca3af',
  ON_FEDEX_VEHICLE: '#f97316',
  EXCEPTION: '#ef4444',
  DELAYED: '#eab308',
  RETURN_TO_SENDER: '#dc2626',
}

function getCarouselInterval(): number {
  if (typeof window === 'undefined') return DEFAULT_INTERVAL
  const stored = localStorage.getItem(CAROUSEL_KEY)
  const ms = stored ? parseInt(stored, 10) : DEFAULT_INTERVAL
  return Number.isFinite(ms) && ms >= 5000 && ms <= 60000 ? ms : DEFAULT_INTERVAL
}

interface TvViewProps {
  packages: PackageData[]
  lastUpdated: string | null
  onExit: () => void
}

export function TvView({ packages, lastUpdated, onExit }: TvViewProps) {
  const dt = useTranslations('dashboard')
  const locale = useLocale()
  const [page, setPage] = useState(0)
  const [paused] = useState(false)
  const [translatedAI, setTranslatedAI] = useState<Record<string, { summary: string | null; rootCause: string | null }>>({})
  const [pulseCards, setPulseCards] = useState<Record<string, string>>({})
  const [showSummary, setShowSummary] = useState<{ type: 'daily' | 'periodic'; date: string } | null>(null)
  const [summaryData, setSummaryData] = useState<{ daily: SummaryData | null; periodic: SummaryData | null }>({ daily: null, periodic: null })
  const prevStatuses = useRef<Record<string, string>>({})
  const lastDailyShown = useRef<string>('')
  const lastPeriodicShown = useRef<string>('')
  const summaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalPages = Math.max(1, Math.ceil(packages.length / PER_PAGE))
  const interval = getCarouselInterval()

  useEffect(() => {
    document.body.style.backgroundColor = '#0f172a'
    return () => { document.body.style.backgroundColor = '' }
  }, [])

  useEffect(() => {
    if (locale === 'en') return
    const items = packages
      .filter((p) => p.aiSummary || p.aiRootCause)
      .map((p) => ({ id: p.id, summary: p.aiSummary, rootCause: p.aiRootCause }))
    if (items.length === 0) return

    fetch('/api/llm/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, locale }),
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        const map: Record<string, { summary: string | null; rootCause: string | null }> = {}
        for (const item of data.items as { id: string; summary: string | null; rootCause: string | null }[]) {
          map[item.id] = { summary: item.summary, rootCause: item.rootCause }
        }
        setTranslatedAI(map)
      })
      .catch(() => {})
  }, [locale, packages])

  useEffect(() => {
    const nextStatuses: Record<string, string> = {}
    for (const pkg of packages) {
      nextStatuses[pkg.id] = pkg.status ?? ''
    }
    const changed: Record<string, string> = {}
    for (const [id, status] of Object.entries(nextStatuses)) {
      if (prevStatuses.current[id] !== undefined && prevStatuses.current[id] !== status) {
        const glowEnabled = typeof window !== 'undefined' && localStorage.getItem('tv-alert-glow') !== 'false'
        if (glowEnabled) {
          changed[id] = PULSE_COLORS[status] ?? '#9ca3af'
        }
        if (typeof window !== 'undefined' && getSoundId() !== 'off') {
          playAlertSound()
        }
      }
    }
    if (Object.keys(changed).length > 0) {
      setPulseCards((prev) => ({ ...prev, ...changed }))
      const timer = setTimeout(() => setPulseCards({}), 2000)
      return () => clearTimeout(timer)
    }
    prevStatuses.current = nextStatuses
  }, [packages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    async function checkSummary() {
      try {
        const res = await fetch('/api/notifications/summary')
        if (!res.ok || cancelled) return
        const data = await res.json()
        setSummaryData(data)
        if (data.daily && data.daily.date !== lastDailyShown.current) {
          setShowSummary({ type: 'daily', date: data.daily.date })
          lastDailyShown.current = data.daily.date
        } else if (data.periodic && data.periodic.date !== lastPeriodicShown.current) {
          setShowSummary({ type: 'periodic', date: data.periodic.date })
          lastPeriodicShown.current = data.periodic.date
        }
      } catch {}
    }

    checkSummary()
    const id = setInterval(checkSummary, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  useEffect(() => {
    if (!showSummary) return
    if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current)
    summaryTimerRef.current = setTimeout(() => setShowSummary(null), 20_000)
    return () => { if (summaryTimerRef.current) clearTimeout(summaryTimerRef.current) }
  }, [showSummary])

  const nextPage = useCallback(() => {
    setPage((p) => (p + 1) % totalPages)
  }, [totalPages])

  useEffect(() => {
    if (totalPages <= 1 || paused) return
    const id = setInterval(nextPage, interval)
    return () => clearInterval(id)
  }, [totalPages, interval, paused, nextPage])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showSummary) {
          setShowSummary(null)
        } else {
          onExit()
        }
      } else if (showSummary) {
        setShowSummary(null)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onExit, showSummary])

  const safePage = page >= totalPages ? 0 : page
  const pagePackages = packages.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE)

  const gridSlots = Array.from({ length: PER_PAGE }, (_, i) => pagePackages[i] ?? null)

  const lastUpdatedStr = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '--:--'

  function getAISummary(pkg: PackageData): string | null {
    if (locale !== 'en' && translatedAI[pkg.id]?.summary) return translatedAI[pkg.id].summary!
    return pkg.aiSummary
  }

  function getAIRootCause(pkg: PackageData): string | null {
    if (locale !== 'en' && translatedAI[pkg.id]?.rootCause) return translatedAI[pkg.id].rootCause!
    return pkg.aiRootCause
  }

  const activeSummaryData = showSummary
    ? (showSummary.type === 'daily' ? summaryData.daily : summaryData.periodic)
    : null

  return (
    <div className="absolute inset-0 z-50 bg-[#0f172a] flex flex-col overflow-hidden"
      style={{ colorScheme: 'dark' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between py-5 shrink-0" style={{ paddingInline: '3rem' }}>
        <h1 className="font-bold text-white tracking-wide" style={{ fontSize: '2.5rem' }}>
          Logistics Tracking
        </h1>
        <div className="flex items-center">
          <TvClock />
          <button
            onClick={onExit}
            className="shrink-0 text-gray-500 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded p-1"
            style={{ fontSize: '1.5rem', lineHeight: 1, marginLeft: '5rem' }}
            aria-label={dt('exitTvMode')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="mb-5 shrink-0" style={{ paddingInline: '3rem' }}>
        <TvStatsBar packages={packages} />
      </div>

      {/* Card Grid — always 3×3 */}
      <div
        className="flex-1 min-h-0 grid gap-4 pb-4"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
          paddingInline: '3rem',
        }}
      >
        {gridSlots.map((pkg, i) => (
          pkg ? (
            <TvCard
              key={pkg.id}
              trackingNumber={pkg.trackingNumber}
              nickname={pkg.nickname}
              carrier={pkg.carrier}
              status={pkg.status}
              origin={pkg.origin}
              destination={pkg.destination}
              eta={pkg.eta}
              aiSummary={getAISummary(pkg)}
              aiRootCause={getAIRootCause(pkg)}
              aiDelayRisk={pkg.aiDelayRisk}
              pulse={!!pulseCards[pkg.id]}
              pulseColor={pulseCards[pkg.id]}
            />
          ) : <div key={`empty-${i}`} />
        ))}
      </div>

      {/* Footer */}
      <div className="py-3 flex items-center justify-between text-gray-500 shrink-0 border-t border-slate-700/50" style={{ paddingInline: '3rem', fontSize: '0.9375rem' }}>
        <span>{dt('lastUpdated')}: {lastUpdatedStr}</span>
        {totalPages > 1 && (
          <span className="tabular-nums">
            {dt('pageXofY', { current: page + 1, total: totalPages })}
            {paused && <span style={{ marginLeft: '0.5rem', color: '#94a3b8' }}>⏸</span>}
          </span>
        )}
      </div>

      {/* Summary Overlay */}
      {showSummary && activeSummaryData && (
        <TvSummaryOverlay
          summary={activeSummaryData}
          summaryType={showSummary.type}
          onDismiss={() => setShowSummary(null)}
        />
      )}
    </div>
  )
}
