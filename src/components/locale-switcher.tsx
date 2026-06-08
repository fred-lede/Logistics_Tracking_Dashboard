'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

const LOCALES = [
  { value: 'en', labelKey: 'locale.en' },
  { value: 'zh-TW', labelKey: 'locale.zh-TW' },
  { value: 'zh-CN', labelKey: 'locale.zh-CN' },
  { value: 'es-MX', labelKey: 'locale.es-MX' },
]

function getLocaleCookie(): string {
  if (typeof document === 'undefined') return 'en'
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]*)/)
  return match?.[1] || 'en'
}

export function LocaleSwitcher() {
  const t = useTranslations()
  const [current, setCurrent] = useState('')

  useEffect(() => {
    setCurrent(getLocaleCookie())
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const locale = e.target.value
    document.cookie = `locale=${locale};path=/;max-age=31536000`
    window.location.reload()
  }

  return (
    <select
      onChange={handleChange}
      value={current || undefined}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-fedex-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
      aria-label={t('common.switchLanguage')}
    >
      {LOCALES.map((l) => (
        <option key={l.value} value={l.value}>
          {t(l.labelKey)}
        </option>
      ))}
    </select>
  )
}
