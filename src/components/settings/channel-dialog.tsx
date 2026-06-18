'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'

const ALL_STATUSES = ['DELIVERED', 'IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE', 'EXCEPTION', 'DELAYED', 'RETURN_TO_SENDER', 'UNKNOWN']

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

export function ChannelDialog({
  channel,
  channelLabel,
  onSave,
  onClose,
}: {
  channel: {
    id: string
    type: string
    label: string
    mode: string | null
    config: Record<string, unknown>
    notifyOnStatuses: string[]
    sendSummary: boolean
    locale: string
  }
  channelLabel: string
  onSave: (data: Partial<Record<string, unknown>>) => void
  onClose: () => void
}) {
  const st = useTranslations('settings')
  const [label, setLabel] = useState(channel.label)
  const [mode, setMode] = useState(channel.mode || 'webhook')
  const [wechatMode, setWechatMode] = useState(channel.mode || 'webhook')
  const [webhookUrl, setWebhookUrl] = useState(String(channel.config?.webhookUrl || ''))
  const [botToken, setBotToken] = useState(String(channel.config?.botToken || ''))
  const [tenantId, setTenantId] = useState(String(channel.config?.tenantId || ''))
  const [clientId, setClientId] = useState(String(channel.config?.clientId || ''))
  const [clientSecret, setClientSecret] = useState(String(channel.config?.clientSecret || ''))
  const [teamId, setTeamId] = useState(String(channel.config?.teamId || ''))
  const [channelId, setChannelId] = useState(String(channel.config?.channelId || ''))
  const [apiKey, setApiKey] = useState(String(channel.config?.apiKey || ''))
  const [phoneNumberId, setPhoneNumberId] = useState(String(channel.config?.phoneNumberId || ''))
  const [wwPhoneNumber, setWwPhoneNumber] = useState(String(channel.config?.phoneNumber || ''))
  const [wwAuthStatus, setWwAuthStatus] = useState<string | null>(null)
  const [wwQrCode, setWwQrCode] = useState<string | null>(null)
  const [wwLoading, setWwLoading] = useState(false)
  const [corpId, setCorpId] = useState(String(channel.config?.corpId || ''))
  const [corpSecret, setCorpSecret] = useState(String(channel.config?.corpSecret || ''))
  const [agentId, setAgentId] = useState(String(channel.config?.agentId || ''))
  const [notifyOnStatuses, setNotifyOnStatuses] = useState(channel.notifyOnStatuses)
  const [sendSummary, setSendSummary] = useState(channel.sendSummary)
  const [locale, setLocale] = useState(channel.locale || 'en')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const previous = document.activeElement as HTMLElement
    el.focus()
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab' && el) {
        const focusable = el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('keydown', handleKeyDown); previous?.focus() }
  }, [onClose])

  function toggleStatus(status: string) {
    setNotifyOnStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    )
  }

  function buildConfig(): Record<string, unknown> {
    if (channel.type === 'teams' && mode === 'webhook') return { webhookUrl }
    if (channel.type === 'teams' && mode === 'graph') return { tenantId, clientId, clientSecret, teamId, channelId }
    if (channel.type === 'telegram') return { botToken }
    if (channel.type === 'wechat' && wechatMode === 'app') return { corpId, corpSecret, agentId }
    if (channel.type === 'wechat') return { webhookUrl }
    if (channel.type === 'whatsapp') return { apiKey, phoneNumberId }
    if (channel.type === 'whatsapp-web') return { phoneNumber: wwPhoneNumber }
    return {}
  }

  async function fetchWwQr() {
    setWwLoading(true)
    setWwAuthStatus(null)
    setWwQrCode(null)
    try {
      const res = await fetch(`/api/notifications/whatsapp-web/${channel.id}/qr`)
      const data = await res.json()
      if (data.status === 'qr' && data.qr) {
        setWwQrCode(data.qr)
        setWwAuthStatus('qr')
      } else if (data.status === 'ready') {
        setWwAuthStatus('ready')
      } else if (data.status === 'error') {
        setWwAuthStatus('error')
      } else {
        setWwAuthStatus('initializing')
      }
    } catch {
      setWwAuthStatus('error')
    } finally {
      setWwLoading(false)
    }
  }

  function handleSave() {
    const effectiveMode = channel.type === 'teams' ? mode : channel.type === 'wechat' ? wechatMode : undefined
    onSave({
      label,
      mode: effectiveMode,
      config: buildConfig(),
      notifyOnStatuses,
      sendSummary,
      locale,
    })
  }

  const showWebhook = (channel.type === 'teams' && mode === 'webhook') || (channel.type === 'wechat' && wechatMode === 'webhook')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 overscroll-behavior-contain" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-dialog-title"
        tabIndex={-1}
        className="max-w-lg w-full mx-4 rounded-xl bg-white shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 id="channel-dialog-title" className="text-lg font-semibold text-gray-900">{st('editChannel')}</h2>
            <p className="text-sm text-gray-500">{channelLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 rounded" aria-label={st('close')}>&times;</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label htmlFor="dialog-label" className="block text-sm font-medium text-gray-700 mb-1">{st('channelLabel')}</label>
            <input id="dialog-label" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
          </div>

          {channel.type === 'teams' && (
            <div>
              <label htmlFor="dialog-teams-mode" className="block text-sm font-medium text-gray-700 mb-1">{st('channelMode')}</label>
              <select id="dialog-teams-mode" value={mode} onChange={(e) => setMode(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
                <option value="webhook">{st('modeWebhook')}</option>
                <option value="graph">{st('modeGraphApi')}</option>
              </select>
            </div>
          )}

          {channel.type === 'wechat' && (
            <div>
              <label htmlFor="dialog-wechat-mode" className="block text-sm font-medium text-gray-700 mb-1">{st('channelMode')}</label>
              <select id="dialog-wechat-mode" value={wechatMode} onChange={(e) => setWechatMode(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
                <option value="webhook">{st('modeWebhook')}</option>
                <option value="app">{st('modeApp')}</option>
              </select>
            </div>
          )}

          {showWebhook && (
            <div>
              <label htmlFor="dialog-webhook" className="block text-sm font-medium text-gray-700 mb-1">{st('webhookUrl')}</label>
              <input id="dialog-webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" placeholder="https://…" />
            </div>
          )}

          {channel.type === 'teams' && mode === 'graph' && (
            <>
              <div>
                <label htmlFor="dialog-tenant" className="block text-sm font-medium text-gray-700 mb-1">{st('tenantId')}</label>
                <input id="dialog-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-client" className="block text-sm font-medium text-gray-700 mb-1">{st('clientId')}</label>
                <input id="dialog-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-secret" className="block text-sm font-medium text-gray-700 mb-1">{st('clientSecret')}</label>
                <input id="dialog-secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-team" className="block text-sm font-medium text-gray-700 mb-1">{st('teamId')}</label>
                <input id="dialog-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-chid" className="block text-sm font-medium text-gray-700 mb-1">{st('channelId')}</label>
                <input id="dialog-chid" value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
            </>
          )}

          {channel.type === 'wechat' && wechatMode === 'app' && (
            <>
              <div>
                <label htmlFor="dialog-corpid" className="block text-sm font-medium text-gray-700 mb-1">{st('corpId')}</label>
                <input id="dialog-corpid" value={corpId} onChange={(e) => setCorpId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-corpsecret" className="block text-sm font-medium text-gray-700 mb-1">{st('corpSecret')}</label>
                <input id="dialog-corpsecret" value={corpSecret} onChange={(e) => setCorpSecret(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-agentid" className="block text-sm font-medium text-gray-700 mb-1">{st('agentId')}</label>
                <input id="dialog-agentid" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
            </>
          )}

          {channel.type === 'telegram' && (
            <div>
              <label htmlFor="dialog-bottoken" className="block text-sm font-medium text-gray-700 mb-1">{st('botToken')}</label>
              <input id="dialog-bottoken" value={botToken} onChange={(e) => setBotToken(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
            </div>
          )}

          {channel.type === 'whatsapp' && (
            <>
              <div>
                <label htmlFor="dialog-wa-key" className="block text-sm font-medium text-gray-700 mb-1">{st('apiKey')}</label>
                <input id="dialog-wa-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
              <div>
                <label htmlFor="dialog-wa-phone" className="block text-sm font-medium text-gray-700 mb-1">{st('phoneNumberId')}</label>
                <input id="dialog-wa-phone" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
              </div>
            </>
          )}

          {channel.type === 'whatsapp-web' && (
            <>
              <div>
                <label htmlFor="dialog-ww-phone" className="block text-sm font-medium text-gray-700 mb-1">{st('wwPhoneNumber')}</label>
                <input id="dialog-ww-phone" value={wwPhoneNumber} onChange={(e) => setWwPhoneNumber(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" placeholder="15551234567" />
                <p className="mt-1 text-xs text-gray-400">{st('wwPhoneNumberHint')}</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">{st('wwAuthStatus')}</span>
                  <button
                    onClick={fetchWwQr}
                    disabled={wwLoading}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
                  >
                    {wwLoading ? st('testing') : st('wwRefreshQr')}
                  </button>
                </div>
                {wwAuthStatus === 'qr' && wwQrCode && (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={wwQrCode} alt="WhatsApp Web QR Code" className="w-48 h-48 border border-gray-200 rounded-lg" />
                    <p className="text-xs text-gray-500">{st('wwQrHint')}</p>
                  </div>
                )}
                {wwAuthStatus === 'ready' && (
                  <p className="text-sm text-green-600">{st('wwAuthReady')}</p>
                )}
                {wwAuthStatus === 'error' && (
                  <p className="text-sm text-red-600">{st('wwAuthError')}</p>
                )}
                {wwAuthStatus === 'initializing' && (
                  <p className="text-sm text-gray-500">{st('wwAuthInitializing')}</p>
                )}
                {!wwAuthStatus && (
                  <p className="text-xs text-gray-400">{st('wwAuthClickToStart')}</p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{st('notifyOnStatuses')}</label>
            <div className="flex flex-wrap gap-2">
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  aria-pressed={notifyOnStatuses.includes(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${
                    notifyOnStatuses.includes(s)
                      ? 'bg-purple-50 text-purple-700 border-purple-300'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {st(statusLabel(s))}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setSendSummary(!sendSummary)}
              role="switch"
              aria-checked={sendSummary}
              className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${sendSummary ? 'bg-fedex-purple' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${sendSummary ? 'left-full -translate-x-full' : 'left-0.5'}`} />
            </button>
<span className="text-sm text-gray-700">{st('sendSummary')}</span>
      </div>

      <div>
        <label htmlFor="dialog-channel-locale" className="block text-sm font-medium text-gray-700 mb-1">{st('channelLocale')}</label>
        <select id="dialog-channel-locale" value={locale} onChange={(e) => setLocale(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
          <option value="en">English</option>
          <option value="zh-TW">繁體中文</option>
          <option value="zh-CN">简体中文</option>
          <option value="es-MX">Español (MX)</option>
        </select>
        <p className="mt-1 text-xs text-gray-400">{st('channelLocaleHint')}</p>
      </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            {st('cancel')}
          </button>
          <button onClick={handleSave} className="rounded-lg bg-fedex-purple px-4 py-2 text-sm text-white hover:bg-purple-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            {st('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
