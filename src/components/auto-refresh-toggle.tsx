'use client'

import { useTranslations } from 'next-intl'

interface AutoRefreshToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

export function AutoRefreshToggle({ enabled, onToggle }: AutoRefreshToggleProps) {
  const t = useTranslations('packageCard')

  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
      <input
        id={`auto-refresh-${Math.random().toString(36).slice(2, 9)}`}
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300 text-fedex-purple focus:ring-fedex-purple focus-visible:ring-2 focus-visible:ring-fedex-purple"
      />
      {t('autoRefresh')}
    </label>
  )
}
