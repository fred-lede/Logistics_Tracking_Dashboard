'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { useToast } from './toast'

interface AddPackageFormProps {
  onAdded: () => void
}

export function AddPackageForm({ onAdded }: AddPackageFormProps) {
  const t = useTranslations('addPackageForm')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [partNumbers, setPartNumbers] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trackingNumber.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim(),
          nickname: nickname.trim() || undefined,
          partNumbers: partNumbers.trim() || undefined,
        }),
      })

      if (res.status === 409) {
        addToast(t('duplicate'), 'error')
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        addToast(data.details || t('error'), 'error')
        return
      }

      addToast(t('add'), 'success')
      setTrackingNumber('')
      setNickname('')
      setPartNumbers('')
      inputRef.current?.focus()
      onAdded()
    } catch {
      addToast(t('error'), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="tracking" className="block text-sm font-medium text-gray-700 mb-1">
          {t('trackingNumber')}
        </label>
        <input
          ref={inputRef}
          id="tracking"
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder={t('placeholder')}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple focus-visible:ring-fedex-purple"
          required
        />
      </div>
      <div className="flex-1">
        <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
          {t('nickname')}
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={t('nicknamePlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple"
        />
      </div>
      <div className="flex-1">
      <label htmlFor="partNumbers" className="block text-sm font-medium text-gray-700 mb-1">
        {t('partNumbers')}
      </label>
      <input
        id="partNumbers"
        type="text"
        value={partNumbers}
        onChange={(e) => setPartNumbers(e.target.value)}
        placeholder={t('partNumbersPlaceholder')}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-fedex-purple px-5 py-2 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
      >
        {loading ? t('adding') : t('add')}
      </button>
    </form>
  )
}
