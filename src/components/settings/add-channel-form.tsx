'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const CHANNEL_TYPES = ['teams', 'telegram', 'wechat', 'whatsapp'] as const

export function AddChannelForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { type: string; label: string; config: Record<string, unknown>; mode?: string; locale?: string }) => void
  onCancel: () => void
}) {
  const st = useTranslations('settings')
  const [type, setType] = useState<string>('teams')
  const [label, setLabel] = useState('')
  const [mode, setMode] = useState('webhook')
  const [wechatMode, setWechatMode] = useState('webhook')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [botToken, setBotToken] = useState('')
  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [teamId, setTeamId] = useState('')
  const [channelId, setChannelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [corpId, setCorpId] = useState('')
  const [corpSecret, setCorpSecret] = useState('')
  const [agentId, setAgentId] = useState('')
  const [locale, setLocale] = useState('en')

  const channelTypeLabels: Record<string, string> = {
    teams: st('channelTypeTeams'),
    telegram: st('channelTypeTelegram'),
    wechat: st('channelTypeWechat'),
    whatsapp: st('channelTypeWhatsapp'),
  }

  function buildConfig(): Record<string, unknown> {
    if (type === 'teams' && mode === 'graph') return { tenantId, clientId, clientSecret, teamId, channelId }
    if (type === 'telegram') return { botToken }
    if (type === 'wechat' && wechatMode === 'app') return { corpId, corpSecret, agentId }
    if (type === 'whatsapp') return { apiKey, phoneNumberId }
    return { webhookUrl }
  }

  function handleAdd() {
    const effectiveMode = type === 'teams' ? mode : type === 'wechat' ? wechatMode : undefined
    onAdd({ type, label, config: buildConfig(), mode: effectiveMode, locale })
  }

  const showWebhook = (type === 'teams' && mode === 'webhook') || (type === 'wechat' && wechatMode === 'webhook')

  return (
    <div className="mb-3 rounded-xl border border-gray-200 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="add-channel-type" className="block text-sm font-medium text-gray-700 mb-1">{st('channelType')}</label>
          <select id="add-channel-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            {CHANNEL_TYPES.map((ct) => (
              <option key={ct} value={ct}>{channelTypeLabels[ct]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-channel-label" className="block text-sm font-medium text-gray-700 mb-1">{st('channelLabel')}</label>
          <input id="add-channel-label" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" placeholder="e.g. Warehouse…" />
        </div>
        <div>
          <label htmlFor="add-channel-locale" className="block text-sm font-medium text-gray-700 mb-1">{st('channelLocale')}</label>
          <select id="add-channel-locale" value={locale} onChange={(e) => setLocale(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            <option value="en">English</option>
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">简体中文</option>
            <option value="es-MX">Español (MX)</option>
          </select>
        </div>
      {type === 'teams' && (
        <div>
          <label htmlFor="add-teams-mode" className="block text-sm font-medium text-gray-700 mb-1">{st('channelMode')}</label>
          <select id="add-teams-mode" value={mode} onChange={(e) => setMode(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            <option value="webhook">{st('modeWebhook')}</option>
            <option value="graph">{st('modeGraphApi')}</option>
          </select>
        </div>
      )}
      {type === 'wechat' && (
        <div>
          <label htmlFor="add-wechat-mode" className="block text-sm font-medium text-gray-700 mb-1">{st('channelMode')}</label>
          <select id="add-wechat-mode" value={wechatMode} onChange={(e) => setWechatMode(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
            <option value="webhook">{st('modeWebhook')}</option>
            <option value="app">{st('modeApp')}</option>
          </select>
        </div>
      )}

      {showWebhook && (
        <div>
          <label htmlFor="add-webhook" className="block text-sm font-medium text-gray-700 mb-1">{st('webhookUrl')}</label>
          <input id="add-webhook" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" placeholder="https://…" />
        </div>
      )}

      {type === 'wechat' && wechatMode === 'app' && (
        <>
          <div>
            <label htmlFor="add-corpid" className="block text-sm font-medium text-gray-700 mb-1">{st('corpId')}</label>
            <input id="add-corpid" value={corpId} onChange={(e) => setCorpId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
          </div>
          <div>
            <label htmlFor="add-corpsecret" className="block text-sm font-medium text-gray-700 mb-1">{st('corpSecret')}</label>
            <input id="add-corpsecret" value={corpSecret} onChange={(e) => setCorpSecret(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
          </div>
          <div>
            <label htmlFor="add-agentid" className="block text-sm font-medium text-gray-700 mb-1">{st('agentId')}</label>
            <input id="add-agentid" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
          </div>
        </>
      )}

      {type === 'telegram' && (
        <div>
          <label htmlFor="add-bottoken" className="block text-sm font-medium text-gray-700 mb-1">{st('botToken')}</label>
          <input id="add-bottoken" value={botToken} onChange={(e) => setBotToken(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" placeholder="123456:ABC-DEF…" />
        </div>
      )}

      {type === 'whatsapp' && (
        <>
          <div>
            <label htmlFor="add-wa-key" className="block text-sm font-medium text-gray-700 mb-1">{st('apiKey')}</label>
            <input id="add-wa-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
          </div>
          <div>
            <label htmlFor="add-wa-phone" className="block text-sm font-medium text-gray-700 mb-1">{st('phoneNumberId')}</label>
            <input id="add-wa-phone" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
          </div>
        </>
      )}

      {type === 'teams' && mode === 'graph' && (
        <>
          <div className="col-span-2 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="add-tenant" className="block text-sm font-medium text-gray-700 mb-1">{st('tenantId')}</label>
              <input id="add-tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
            </div>
            <div>
              <label htmlFor="add-client" className="block text-sm font-medium text-gray-700 mb-1">{st('clientId')}</label>
              <input id="add-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
            </div>
            <div>
              <label htmlFor="add-secret" className="block text-sm font-medium text-gray-700 mb-1">{st('clientSecret')}</label>
              <input id="add-secret" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
            </div>
            <div>
              <label htmlFor="add-team" className="block text-sm font-medium text-gray-700 mb-1">{st('teamId')}</label>
              <input id="add-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
            </div>
            <div>
              <label htmlFor="add-chid" className="block text-sm font-medium text-gray-700 mb-1">{st('channelId')}</label>
              <input id="add-chid" value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1" />
            </div>
          </div>
        </>
      )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
          {st('cancel')}
        </button>
        <button onClick={handleAdd} className="rounded-lg bg-fedex-purple px-3 py-1.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1">
          {st('save')}
        </button>
      </div>
    </div>
  )
}
