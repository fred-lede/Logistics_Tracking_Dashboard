'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

interface CarrierSettingsData {
  fedexApiKey: string
  fedexApiSecret: string
  fedexProduction: boolean
  dhlApiKey: string
}

export function CarrierSettings() {
  const t = useTranslations('carrier')
  const [data, setData] = useState<CarrierSettingsData | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings/carrier').then((r) => r.json()).then(setData)
  }, [])

  async function handleSave() {
    if (!data) return
    await fetch('/api/settings/carrier', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!data) return null

  const inputCls =
    'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1'

  return (
    <div className="mb-6 rounded-xl border border-gray-200 p-5">
      <h2 className="mb-1 font-semibold text-gray-900">{t('title')}</h2>
      <p className="mb-4 text-sm text-gray-500">{t('hint')}</p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fedex-key">
            {t('apiKey')}
          </label>
          <input
            id="fedex-key"
            type="password"
            value={data.fedexApiKey}
            onChange={(e) => setData({ ...data, fedexApiKey: e.target.value })}
            placeholder="FEDEX_API_KEY"
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fedex-secret">
            {t('apiSecret')}
          </label>
          <input
            id="fedex-secret"
            type="password"
            value={data.fedexApiSecret}
            onChange={(e) => setData({ ...data, fedexApiSecret: e.target.value })}
            placeholder="FEDEX_API_SECRET"
            className={inputCls}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <button
            role="switch"
            aria-checked={data.fedexProduction}
            onClick={() => setData({ ...data, fedexProduction: !data.fedexProduction })}
            className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${data.fedexProduction ? 'bg-amber-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${data.fedexProduction ? 'left-full -translate-x-full' : 'left-0.5'}`} />
          </button>
          <span className="text-sm text-gray-700">{data.fedexProduction ? t('prodMode') : t('sandboxMode')}</span>
        </label>

        <hr className="border-gray-200" />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="dhl-key">
            {t('dhlApiKey')}
          </label>
          <input
            id="dhl-key"
            type="password"
            value={data.dhlApiKey}
            onChange={(e) => setData({ ...data, dhlApiKey: e.target.value })}
            placeholder="DHL_API_KEY"
            className={inputCls}
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded-lg bg-fedex-purple px-4 py-1.5 text-sm font-medium text-white hover:bg-fedex-purple/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
          >
            {t('save')}
          </button>
          {saved && <span className="text-sm text-green-600">{t('saved')}</span>}
        </div>
      </div>
    </div>
  )
}
