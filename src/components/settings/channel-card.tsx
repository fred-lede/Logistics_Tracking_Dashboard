'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

interface Contact {
  id: string
  name: string
  identifier: string
  locale: string | null
}

interface ChannelCardProps {
  channel: {
    id: string
    type: string
    label: string
    enabled: boolean
    notifyOnStatuses: string[]
    sendSummary: boolean
    contacts: Contact[]
  }
  channelLabel: string
  onToggle: (enabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
  onAddContact: (name: string, identifier: string, locale: string | null) => void
  onUpdateContact: (contactId: string, name: string, identifier: string, locale: string | null) => void
  onDeleteContact: (contactId: string) => void
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    'DELIVERED': 'statusDelivered',
    'IN_TRANSIT': 'statusInTransit',
    'PICKED_UP': 'statusPickedUp',
    'ON_FEDEX_VEHICLE': 'statusOnVehicle',
    'EXCEPTION': 'statusException',
    'DELAYED': 'statusDelayed',
    'RETURN_TO_SENDER': 'statusReturnToSender',
    'UNKNOWN': 'statusUnknown',
  }
  return map[s] || s
}

export function ChannelCard({ channel, channelLabel, onToggle, onEdit, onDelete, onAddContact, onUpdateContact, onDeleteContact }: ChannelCardProps) {
  const st = useTranslations('settings')
  const [showNewContact, setShowNewContact] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIdentifier, setNewIdentifier] = useState('')
  const [newLocale, setNewLocale] = useState<string>('')
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [editName, setEditName] = useState('')
  const [editIdentifier, setEditIdentifier] = useState('')
  const [editLocale, setEditLocale] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success?: boolean; error?: string } | null>(null)

  function handleAddContact() {
    if (!newName.trim() || !newIdentifier.trim()) return
    onAddContact(newName.trim(), newIdentifier.trim(), newLocale || null)
    setNewName('')
    setNewIdentifier('')
    setNewLocale('')
    setShowNewContact(false)
  }

  function startEditContact(contact: Contact) {
    setEditingContact(contact)
    setEditName(contact.name)
    setEditIdentifier(contact.identifier)
    setEditLocale(contact.locale || '')
  }

  function handleUpdateContact() {
    if (!editingContact || !editName.trim() || !editIdentifier.trim()) return
    onUpdateContact(editingContact.id, editName.trim(), editIdentifier.trim(), editLocale || null)
    setEditingContact(null)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 20_000)
      try {
        const res = await fetch(`/api/notifications/channels/${channel.id}/test`, { method: 'POST', signal: ac.signal })
        const data = await res.json()
        setTestResult(data)
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      setTestResult({ success: false, error: err instanceof DOMException && err.name === 'AbortError' ? 'Request timed out' : 'Network error' })
    } finally {
      setTesting(false)
      setTimeout(() => setTestResult(null), 5000)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-sm font-bold text-gray-600" aria-hidden="true">
          {channel.type === 'teams' ? '🅣' : channel.type === 'telegram' ? '✈' : channel.type === 'wechat' ? '💬' : channel.type === 'whatsapp' ? '🆆' : '🔗'}
        </div>
          <div>
            <div className="font-medium text-gray-900">
              {channelLabel}
              {channel.label && <span className="ml-1.5 text-sm text-gray-500">— {channel.label}</span>}
            </div>
            {!channel.enabled && <span className="text-xs text-gray-400">{st('enabled')}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
      <button onClick={onEdit} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
        {st('editChannel')}
      </button>
      <button onClick={() => { if (confirm(st('confirmDeleteChannel'))) onDelete() }} className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1">
        {st('deleteChannel')}
      </button>
      <button
        onClick={() => onToggle(!channel.enabled)}
        role="switch"
        aria-checked={channel.enabled}
        className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${channel.enabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
      >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${channel.enabled ? 'left-full -translate-x-full' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {(channel.notifyOnStatuses.length > 0 || channel.sendSummary) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-400">{st('notifyOnStatuses')}:</span>
          {channel.notifyOnStatuses.map((s) => (
            <span key={s} className="rounded-full bg-purple-50 px-2.5 py-0.5 text-purple-700">{st(statusLabel(s))}</span>
          ))}
          {channel.sendSummary && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700">{st('sendSummary')}</span>
          )}
        </div>
      )}

      {/* Test button */}
      <div className="mt-3">
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
        >
          {testing ? st('testing') : `🔔 ${st('testNotification')}`}
        </button>
        {testResult && (
          <span className={`ml-2 text-xs ${testResult.success === true ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.success === true ? `✓ ${st('testSent')}` : `✗ ${testResult.error || st('testFailed')}`}
          </span>
        )}
      </div>

      {/* Contacts list */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{channel.contacts.length} {st('contacts')}</span>
          <button onClick={() => { setShowNewContact(!showNewContact); setEditingContact(null) }} className="text-fedex-purple hover:underline text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fedex-purple rounded">
            + {st('addContact')}
          </button>
        </div>

        {channel.contacts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {channel.contacts.map((contact) => (
              <div key={contact.id}>
                {editingContact?.id === contact.id ? (
<div className="flex gap-1.5 items-center">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={editIdentifier}
                onChange={(e) => setEditIdentifier(e.target.value)}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <select
                value={editLocale}
                onChange={(e) => setEditLocale(e.target.value)}
                className="rounded border border-gray-300 px-1 py-1 text-xs"
              >
                <option value="">{st('channelLocaleDefault')}</option>
                <option value="en">EN</option>
                <option value="zh-TW">繁中</option>
                <option value="zh-CN">简中</option>
                <option value="es-MX">ES</option>
              </select>
              <button onClick={handleUpdateContact} className="rounded bg-fedex-purple px-2 py-1 text-xs text-white" aria-label={st('save')}>✓</button>
              <button onClick={() => setEditingContact(null)} className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600" aria-label={st('cancel')}>✗</button>
            </div>
                ) : (
                  <div className="flex items-center justify-between rounded bg-gray-50 px-2.5 py-1.5">
<div className="text-xs text-gray-700">
                    <span className="font-medium">{contact.name}</span>
                    <span className="text-gray-400 ml-1.5">{contact.identifier}</span>
                    {contact.locale && <span className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">{contact.locale}</span>}
                  </div>
                    <div className="flex gap-1">
                <button onClick={() => startEditContact(contact)} className="text-xs text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fedex-purple rounded" aria-label={st('editChannel')}>✎</button>
                <button onClick={() => { if (confirm(st('confirmDeleteContact'))) onDeleteContact(contact.id) }} className="text-xs text-red-400 hover:text-red-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 rounded" aria-label={st('deleteChannel')}>✕</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

{showNewContact && (
        <div className="mt-2 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={st('contactName')}
            className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <input
            value={newIdentifier}
            onChange={(e) => setNewIdentifier(e.target.value)}
            placeholder={st('contactIdentifier')}
            className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
          />
          <select
            value={newLocale}
            onChange={(e) => setNewLocale(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">{st('channelLocaleDefault')}</option>
            <option value="en">EN</option>
            <option value="zh-TW">繁中</option>
            <option value="zh-CN">简中</option>
            <option value="es-MX">ES</option>
          </select>
          <button onClick={handleAddContact} className="rounded-lg bg-fedex-purple px-3 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            {st('save')}
          </button>
        </div>
      )}
      </div>
    </div>
  )
}
