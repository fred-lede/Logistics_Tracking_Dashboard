'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChannelCard } from './channel-card'
import { ChannelDialog } from './channel-dialog'
import { AddChannelForm } from './add-channel-form'
import { LLMSettings } from './llm-settings'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { playAlertSound } from '@/components/tv/tv-sound'

interface NotificationSetting {
  enabled: boolean
  dailySummaryEnabled: boolean
  dailySummaryTime: string
  periodicInterval: number
}

interface Channel {
  id: string
  type: string
  label: string
  enabled: boolean
  mode: string | null
  config: Record<string, unknown>
  notifyOnStatuses: string[]
  sendSummary: boolean
  locale: string
  contacts: { id: string; name: string; identifier: string; locale: string | null }[]
}

export function SettingsPage() {
  const st = useTranslations('settings')
  const ct = useTranslations('common')
  const [setting, setSetting] = useState<NotificationSetting | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)

  const channelTypeLabels: Record<string, string> = {
    teams: st('channelTypeTeams'),
    telegram: st('channelTypeTelegram'),
    wechat: st('channelTypeWechat'),
    whatsapp: st('channelTypeWhatsapp'),
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/notifications/settings').then((r) => r.json()),
      fetch('/api/notifications/channels').then((r) => r.json()),
    ]).then(([s, c]) => {
      setSetting(s)
      setChannels(c)
      setLoading(false)
    })
  }, [])

  async function updateSetting(update: Partial<NotificationSetting>) {
    const res = await fetch('/api/notifications/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) setSetting(await res.json())
  }

  async function saveChannel(update: Partial<Channel>) {
    if (!editingChannel) return
    const res = await fetch(`/api/notifications/channels/${editingChannel.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) {
      const updated = await res.json()
      setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setEditingChannel(null)
    }
  }

  async function deleteChannel(id: string) {
    const res = await fetch(`/api/notifications/channels/${id}`, { method: 'DELETE' })
    if (res.ok) setChannels((prev) => prev.filter((c) => c.id !== id))
  }

  async function addContact(channelId: string, name: string, identifier: string, locale: string | null) {
    const res = await fetch('/api/notifications/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, name, identifier, locale }),
    })
    if (res.ok) {
      const contact = await res.json()
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, contacts: [...c.contacts, contact] } : c
        )
      )
    }
  }

  async function updateContact(contactId: string, name: string, identifier: string, locale: string | null) {
    const res = await fetch(`/api/notifications/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, identifier, locale }),
    })
    if (res.ok) {
      const updated = await res.json()
      setChannels((prev) =>
        prev.map((c) => ({
          ...c,
          contacts: c.contacts.map((ct) => (ct.id === contactId ? updated : ct)),
        }))
      )
    }
  }

  async function deleteContact(contactId: string) {
    const res = await fetch(`/api/notifications/contacts/${contactId}`, { method: 'DELETE' })
    if (res.ok) {
      setChannels((prev) =>
        prev.map((c) => ({
          ...c,
          contacts: c.contacts.filter((ct) => ct.id !== contactId),
        }))
      )
    }
  }

  async function addNewChannel(data: { type: string; label: string; config: Record<string, unknown>; mode?: string }) {
    const res = await fetch('/api/notifications/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const channel = await res.json()
      setChannels((prev) => [...prev, channel])
      setShowAddForm(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">{ct('loading')}</div>
      </div>
    )
  }

  const periodicOptions = [0, 1, 2, 4, 6, 12, 24]

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/" className="text-sm text-fedex-purple hover:underline mb-1 inline-block">
            &larr; {st('backToDashboard')}
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{st('title')}</h1>
        </div>
        <LocaleSwitcher />
      </div>

      {/* LLM Enhancement */}
      <LLMSettings />

      {/* Global Toggle */}
      <div className="mb-6 rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{st('globalSettings')}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{st('notificationsEnabled')}</p>
          </div>
        <button
          onClick={() => updateSetting({ enabled: !setting?.enabled })}
          role="switch"
          aria-checked={setting?.enabled ?? false}
          className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${setting?.enabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${setting?.enabled ? 'left-full -translate-x-full' : 'left-0.5'}`} />
        </button>
        </div>
      </div>

      {/* Summary Settings */}
      <div className="mb-6 rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{st('dailySummary')}</h2>

        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-gray-500">{st('dailySummaryEnabled')}</p>
          </div>
        <button
          onClick={() => updateSetting({ dailySummaryEnabled: !setting?.dailySummaryEnabled })}
          role="switch"
          aria-checked={setting?.dailySummaryEnabled ?? false}
          className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${setting?.dailySummaryEnabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${setting?.dailySummaryEnabled ? 'left-full -translate-x-full' : 'left-0.5'}`} />
        </button>
        </div>

        {setting?.dailySummaryEnabled && (
          <div className="mb-4">
              <label htmlFor="dailySummaryTimeInput" className="block text-sm font-medium text-gray-700 mb-1">{st('dailySummaryTime')}</label>
              <input
                id="dailySummaryTimeInput"
                type="time"
                value={setting?.dailySummaryTime || '09:00'}
                onChange={(e) => updateSetting({ dailySummaryTime: e.target.value })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
              />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-gray-900">{st('periodicSummary')}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{st('periodicSummaryEnabled')}</p>
          </div>
              <select
                id="periodicIntervalSelect"
                value={setting?.periodicInterval || 0}
                onChange={(e) => updateSetting({ periodicInterval: Number(e.target.value) })}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
              >
            <option value={0}>{st('cancel')}</option>
            {periodicOptions.filter((v) => v > 0).map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        </div>
      </div>

      {/* TV Mode Settings */}
      <div className="mb-6 rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-4">{st('tvModeSettings')}</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{st('tvCarouselSpeed')}</p>
            <p className="text-xs text-gray-400">{st('tvCarouselSpeedHint')}</p>
          </div>
          <select
            id="tvCarouselSpeedSelect"
            defaultValue={(() => {
              if (typeof window === 'undefined') return '15000'
              const v = parseInt(localStorage.getItem('tv-carousel-interval') || '15000', 10)
              return Number.isFinite(v) ? String(v) : '15000'
            })()}
            onChange={(e) => {
              localStorage.setItem('tv-carousel-interval', e.target.value)
            }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
          >
            <option value="5000">5s</option>
            <option value="10000">10s</option>
            <option value="15000">15s</option>
            <option value="20000">20s</option>
            <option value="30000">30s</option>
      <option value="60000">60s</option>
        </select>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          <p className="text-sm text-gray-500">{st('tvGlowAlert')}</p>
          <p className="text-xs text-gray-400">{st('tvGlowAlertHint')}</p>
        </div>
        <button
          onClick={() => {
            const current = localStorage.getItem('tv-alert-glow') !== 'false'
            localStorage.setItem('tv-alert-glow', current ? 'false' : 'true')
            window.dispatchEvent(new Event('storage'))
          }}
          role="switch"
          aria-checked={(() => { if (typeof window === 'undefined') return true; return localStorage.getItem('tv-alert-glow') !== 'false' })()}
          className="relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
          ref={(el) => {
            if (!el) return
            const update = () => {
              const on = localStorage.getItem('tv-alert-glow') !== 'false'
              el.setAttribute('aria-checked', String(on))
              el.className = `relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${on ? 'bg-fedex-purple' : 'bg-gray-300'}`
            }
            update()
            window.addEventListener('storage', update)
          }}
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all left-full -translate-x-full" />
        </button>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div>
          <p className="text-sm text-gray-500">{st('tvSoundAlert')}</p>
          <p className="text-xs text-gray-400">{st('tvSoundAlertHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => localStorage.setItem('tv-alert-sound', e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            ref={(el) => {
              if (!el) return
              if (!el.dataset.initialized) {
                const stored = (() => {
                  if (typeof window === 'undefined') return 'builtin-ding'
                  const v = localStorage.getItem('tv-alert-sound')
                  if (v === 'builtin') return 'builtin-ding'
                  if (v === 'webaudio') return 'webaudio-ding'
                  return v || 'builtin-ding'
                })()
                el.value = stored
                el.dataset.initialized = 'true'
              }
            }}
          >
            <option value="off">{st('tvSoundOff')}</option>
            <optgroup label={st('tvSoundBuiltinGroup')}>
              <option value="builtin-ding">{st('tvSoundDing')}</option>
              <option value="builtin-chime">{st('tvSoundChime')}</option>
              <option value="builtin-alert">{st('tvSoundAlertName')}</option>
            </optgroup>
            <optgroup label={st('tvSoundWebAudioGroup')}>
              <option value="webaudio-ding">{st('tvSoundDing')}</option>
              <option value="webaudio-double">{st('tvSoundDouble')}</option>
              <option value="webaudio-chime">{st('tvSoundChime')}</option>
              <option value="webaudio-alert">{st('tvSoundAlertName')}</option>
              <option value="webaudio-success">{st('tvSoundSuccess')}</option>
            </optgroup>
          </select>
          <button
            type="button"
            onClick={() => {
              const sel = document.querySelector<HTMLSelectElement>('#tv-sound-select')
              playAlertSound(sel?.value as any || undefined)
            }}
            className="rounded-lg border border-fedex-purple px-3 py-1.5 text-sm font-medium text-fedex-purple hover:bg-fedex-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
          >
            {st('tvSoundTest')}
          </button>
        </div>
      </div>
    </div>

      {/* Channels */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{st('channels')}</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="rounded-lg bg-fedex-purple px-4 py-1.5 text-sm font-medium text-white hover:bg-purple-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
        >
          {st('addChannel')}
        </button>
        </div>

        {channels.length === 0 && !showAddForm && (
          <div className="rounded-xl border border-gray-200 p-8 text-center text-gray-400">
            {st('noChannels')}
          </div>
        )}

        {showAddForm && (
          <AddChannelForm
            onAdd={addNewChannel}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        <div className="space-y-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              channelLabel={channelTypeLabels[channel.type] || channel.type}
              onToggle={(enabled) => saveChannel({ enabled } as Partial<Channel>)}
              onEdit={() => setEditingChannel(channel)}
              onDelete={() => { if (confirm(st('confirmDeleteChannel'))) deleteChannel(channel.id) }}
        onAddContact={(name, identifier, locale) => addContact(channel.id, name, identifier, locale)}
          onUpdateContact={(contactId, name, identifier, locale) => updateContact(contactId, name, identifier, locale)}
              onDeleteContact={(contactId) => deleteContact(contactId)}
            />
          ))}
        </div>
      </div>

      {/* Edit Channel Dialog */}
      {editingChannel && (
        <ChannelDialog
          channel={editingChannel}
          channelLabel={channelTypeLabels[editingChannel.type] || editingChannel.type}
          onSave={saveChannel}
          onClose={() => setEditingChannel(null)}
        />
      )}
    </div>
  )
}
