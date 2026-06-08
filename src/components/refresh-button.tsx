'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface RefreshButtonProps {
  packageId: string
  onRefreshed: (data: { status: string; eta: string | null; events: unknown[] }) => void
}

export function RefreshButton({ packageId, onRefreshed }: RefreshButtonProps) {
  const t = useTranslations('packageCard')
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    setLoading(true)
    try {
      const res = await fetch(`/api/packages/${packageId}/refresh`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        onRefreshed(data)
      }
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      aria-label={t('refresh')}
      className="text-xs text-gray-500 hover:text-fedex-purple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 rounded disabled:opacity-50 transition-colors"
    >
      {loading ? `⟳ ${t('refreshing')}` : `⟳ ${t('refresh')}`}
    </button>
  )
}
