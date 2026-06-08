'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { AddPackageForm } from '@/components/add-package-form'
import { PackageCard } from '@/components/package-card'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { StatsBar } from '@/components/stats-bar'
import { TvView } from '@/components/tv/tv-view'

interface PackageEvent {
  date: string
  status: string
  location: string
  description: string
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
  lastCheckedAt: string | null
  aiSummary: string | null
  aiRootCause: string | null
  aiDelayRisk: { level: string; reason: string; suggestion: string | null; assessedAt: string } | null
  autoRefresh: boolean
}

const STATS_FILTERS: Record<string, (p: PackageData) => boolean> = {
  delivered: (p) => ['DELIVERED', 'PICKUP_AVAILABLE'].includes(p.status ?? ''),
  inTransit: (p) => ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE'].includes(p.status ?? ''),
  exception: (p) => ['EXCEPTION', 'RETURN_TO_SENDER'].includes(p.status ?? ''),
  delayed: (p) => p.status === 'DELAYED',
}

export default function DashboardPage() {
  const dt = useTranslations('dashboard')
  const ct = useTranslations('common')
  const [packages, setPackages] = useState<PackageData[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [statsFilter, setStatsFilter] = useState<string | null>(null)
  const [tvMode, setTvMode] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/packages')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setPackages(data) })
      .catch(() => { if (!cancelled) setError(ct('error')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ct])

  const fetchPackages = useCallback(async () => {
    const res = await fetch('/api/packages')
    if (res.ok) {
      setPackages(await res.json())
    }
  }, [])

  const prevStatusRef = useRef<Record<string, string | null>>({})
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      for (const pkg of packages) {
        prevStatusRef.current[pkg.id] = pkg.status
      }
      return
    }

    for (const pkg of packages) {
      const prev = prevStatusRef.current[pkg.id]
      if (prev != null && prev !== pkg.status) {
        ;(window as any).electronAPI?.showNotification?.(
          'Package Status Updated',
          `${pkg.trackingNumber}: ${pkg.status}`
        )
      }
      prevStatusRef.current[pkg.id] = pkg.status
    }
  }, [packages])

  const filteredPackages = useMemo(() => {
    let list = packages
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.trackingNumber.toLowerCase().includes(q) ||
          (p.nickname && p.nickname.toLowerCase().includes(q)) ||
          (p.partNumbers && p.partNumbers.some((pn) => pn.toLowerCase().includes(q)))
      )
    }
    if (statsFilter && STATS_FILTERS[statsFilter]) {
      list = list.filter(STATS_FILTERS[statsFilter])
    }
    return list
  }, [packages, search, statsFilter])

  // Page Visibility API — pause/resume auto-refresh
  useEffect(() => {
    function handleVisibility() {
      setVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Staggered auto-refresh for packages with autoRefresh enabled
  useEffect(() => {
    if (!visible) return

    const autoPackages = packages.filter((p) => p.autoRefresh)
    if (autoPackages.length === 0) return

    const timers = autoPackages.map((pkg, i) =>
      setTimeout(() => {
        fetch(`/api/packages/${pkg.id}/refresh`, { method: 'POST' }).then(() => fetchPackages())
      }, i * 5000)
    )

    return () => timers.forEach(clearTimeout)
  }, [packages, visible, fetchPackages])

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPackages((prev) => prev.filter((p) => p.id !== id))
      }
    } catch {
      // Silently fail
    }
  }

  async function handleToggleAutoRefresh(id: string, enabled: boolean) {
    setPackages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, autoRefresh: enabled } : p))
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">{ct('loading')}</div>
      </div>
    )
  }

  if (tvMode) {
    return (
      <TvView
        packages={packages}
        lastUpdated={packages.find((p) => p.lastCheckedAt)?.lastCheckedAt ?? null}
        onExit={() => setTvMode(false)}
      />
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6" id="main-content">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">{dt('title')}</h1>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTvMode(true)}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 rounded"
                  aria-label={dt('tvMode')}
                >
                  📺 {dt('tvMode')}
                </button>
                <a href="/settings" className="text-sm text-gray-500 hover:text-gray-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 rounded">
                  <span aria-hidden="true">⚙</span> {dt('settings')}
                </a>
                <LocaleSwitcher />
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-1 tabular-nums">
              {statsFilter || search.trim()
                ? `${filteredPackages.length} of ${packages.length} packages`
                : `${packages.length} package${packages.length !== 1 ? 's' : ''} tracked`
              }
            </p>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={dt('searchPlaceholder')}
              name="search"
              aria-label={ct('searchPackages')}
              spellCheck={false}
              autoComplete="off"
              className="w-full max-w-sm mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple focus-visible:ring-fedex-purple"
            />
          </div>
          <button
            onClick={fetchPackages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
          >
            <span aria-hidden="true">⟳</span> {dt('refreshAll')}
          </button>
        </div>
        <AddPackageForm onAdded={fetchPackages} />
        <div className="mt-4">
          <StatsBar
            packages={packages}
            activeFilter={statsFilter}
            onFilterChange={setStatsFilter}
          />
        </div>
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{ct('dismiss')}</button>
        </div>
      )}

      {filteredPackages.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="text-4xl mb-4">📦</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            {search.trim() ? dt('noResults') : dt('noPackages')}
          </h2>
          <p className="text-sm text-gray-500 max-w-md">
            {search.trim()
              ? dt('noResults')
              : dt('noPackagesHint')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPackages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onDelete={handleDelete}
              onRefresh={fetchPackages}
              onToggleAutoRefresh={handleToggleAutoRefresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}
