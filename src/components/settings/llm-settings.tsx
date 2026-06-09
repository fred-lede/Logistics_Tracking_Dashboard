'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'

interface ModelInfo {
  id: string
  name?: string
  size?: string
}

interface LLMSettingData {
  provider: string
  providerLabel: string | null
  compatMode: string
  locale: string
  apiKey: string | null
  baseUrl: string | null
  model: string
  enabled: boolean
}

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.5-flash',
  ollama: 'gemma3:1b',
  custom: 'gpt-4o-mini',
}

const MASKED_KEY = '••••••••'

export function LLMSettings() {
  const t = useTranslations('llm')
  const [setting, setSetting] = useState<LLMSettingData | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const [notifTestStatus, setNotifTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')
  const [notifTestError, setNotifTestError] = useState<string | null>(null)
  const [notifTestSummary, setNotifTestSummary] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingRef = useRef<LLMSettingData | null>(null)

  useEffect(() => {
    settingRef.current = setting
  }, [setting])

  const fetchModels = useCallback(() => {
    const s = settingRef.current
    if (!s) return
    const needsKey = ['openai', 'anthropic', 'google'].includes(s.provider)
    if (needsKey && !s.apiKey) {
      setModels([])
      setModelsError('API key required')
      return
    }
    if (s.provider === 'custom' && !s.baseUrl) {
      setModels([])
      setModelsError('Base URL required')
      return
    }
    setModelsLoading(true)
    setModelsError(null)
    const params = new URLSearchParams({ provider: s.provider })
    if (s.apiKey && s.apiKey !== MASKED_KEY) params.set('apiKey', s.apiKey)
    if (s.baseUrl) params.set('baseUrl', s.baseUrl)
    fetch(`/api/llm/models?${params}`)
      .then((r) => r.json())
      .then((data: { models: ModelInfo[]; error?: string }) => {
        setModels(data.models || [])
        setModelsError(data.error || null)
        const currentInList = (data.models || []).some((m) => m.id === s.model)
        setUseCustomModel(!currentInList && !!s.model)
      })
      .catch(() => {
        setModels([])
        setModelsError(t('fetchModelsFailed'))
        setUseCustomModel(true)
      })
      .finally(() => setModelsLoading(false))
  }, [t])

  const debouncedFetchModels = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchModels, 500)
  }, [fetchModels])

  useEffect(() => {
    fetch('/api/llm/settings').then((r) => r.json()).then(setSetting)
  }, [])

  useEffect(() => {
    if (setting) fetchModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setting?.provider, setting?.baseUrl, setting?.apiKey])

  async function updateSetting(update: Partial<LLMSettingData>) {
    const res = await fetch('/api/llm/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    })
    if (res.ok) setSetting(await res.json())
  }

  function handleProviderChange(provider: string) {
    const model = PROVIDER_DEFAULTS[provider] ?? setting?.model ?? 'gpt-4o-mini'
    updateSetting({ provider, model })
    setTestStatus('idle')
    setModels([])
    setUseCustomModel(false)
  }

  async function handleTestConnection() {
    if (!setting) return
    setTestStatus('testing')
    setTestError(null)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 35_000)
    try {
      const res = await fetch('/api/llm/test', {
        signal: ac.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: setting.provider,
          providerLabel: setting.providerLabel,
          apiKey: setting.apiKey === MASKED_KEY ? undefined : setting.apiKey,
          baseUrl: setting.baseUrl,
          model: setting.model,
          compatMode: setting.compatMode,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTestStatus('success')
      } else {
        setTestStatus('failed')
        setTestError(data.error ?? 'Unknown error')
      }
    } catch (err) {
      setTestStatus('failed')
      setTestError(err instanceof DOMException && err.name === 'AbortError' ? 'Request timed out' : 'Network error')
    } finally {
      clearTimeout(timer)
    }
  }

  async function handleTestNotification() {
    if (!setting) return
    setNotifTestStatus('testing')
    setNotifTestError(null)
    setNotifTestSummary(null)
    const cookieMatch = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/)
    const uiLocale = cookieMatch?.[1] ?? 'en'
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 90_000)
    try {
      const res = await fetch('/api/llm/test-notification', {
        signal: ac.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: setting.provider,
          providerLabel: setting.providerLabel,
          apiKey: setting.apiKey === MASKED_KEY ? undefined : setting.apiKey,
          baseUrl: setting.baseUrl,
          model: setting.model,
          compatMode: setting.compatMode,
          locale: setting.locale || uiLocale,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setNotifTestStatus('success')
        setNotifTestSummary(data.aiSummary ?? null)
      } else {
        setNotifTestStatus('failed')
        setNotifTestError(data.error ?? 'Unknown error')
        setNotifTestSummary(data.aiSummary ?? null)
      }
    } catch (err) {
      setNotifTestStatus('failed')
      setNotifTestError(err instanceof DOMException && err.name === 'AbortError' ? 'Request timed out' : 'Network error')
    } finally {
      clearTimeout(timer)
    }
  }

  function handleModelSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__custom__') {
      setUseCustomModel(true)
      return
    }
    setUseCustomModel(false)
    updateSetting({ model: val })
  }

  if (!setting) return null

  const isOllama = setting.provider === 'ollama'
  const isCustom = setting.provider === 'custom'
  const needsApiKey = ['openai', 'anthropic', 'google'].includes(setting.provider)

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="mb-6 rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">{t('title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{t('enabledHint')}</p>
        </div>
        <button
          onClick={() => updateSetting({ enabled: !setting.enabled })}
          role="switch"
          aria-checked={setting.enabled}
          className={`relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1 ${setting.enabled ? 'bg-fedex-purple' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${setting.enabled ? 'left-full -translate-x-full' : 'left-0.5'}`} />
        </button>
      </div>

      {setting.enabled && (
        <div className="space-y-4">
          <div>
            <label htmlFor="llm-provider" className={labelCls}>{t('provider')}</label>
            <select
              id="llm-provider"
              value={setting.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className={inputCls}
            >
              <option value="openai">{t('providerOpenai')}</option>
              <option value="anthropic">{t('providerAnthropic')}</option>
              <option value="google">{t('providerGoogle')}</option>
              <option value="ollama">{t('providerOllama')}</option>
              <option value="custom">{t('providerCustom')}</option>
            </select>
          </div>

          {isCustom && (
            <div>
              <label htmlFor="llm-custom-name" className={labelCls}>{t('customProviderName')}</label>
              <input
                id="llm-custom-name"
                type="text"
                value={setting.providerLabel ?? ''}
                onChange={(e) => updateSetting({ providerLabel: e.target.value || null })}
                placeholder={t('customProviderNamePlaceholder')}
                spellCheck={false}
                className={inputCls}
              />
            </div>
          )}

          {isCustom && (
            <div>
              <label htmlFor="llm-compat-mode" className={labelCls}>{t('compatMode')}</label>
              <select
                id="llm-compat-mode"
                value={setting.compatMode}
                onChange={(e) => updateSetting({ compatMode: e.target.value })}
                className={inputCls}
              >
                <option value="chat">{t('compatModeChat')}</option>
                <option value="responses">{t('compatModeResponses')}</option>
              </select>
            </div>
          )}

          {needsApiKey && (
            <div>
              <label htmlFor="llm-api-key" className={labelCls}>{t('apiKey')}</label>
              <input
                id="llm-api-key"
                type="password"
                value={setting.apiKey ?? ''}
                onChange={(e) => {
                  updateSetting({ apiKey: e.target.value })
                  debouncedFetchModels()
                }}
                placeholder={t('apiKeyPlaceholder')}
                className={inputCls}
              />
            </div>
          )}

          {(isOllama || isCustom) && (
            <div>
              <label htmlFor="llm-base-url" className={labelCls}>{t('baseUrl')}</label>
              <input
                id="llm-base-url"
                type="url"
                value={setting.baseUrl ?? (isOllama ? 'http://localhost:11434' : '')}
                onChange={(e) => {
                  updateSetting({ baseUrl: e.target.value })
                  debouncedFetchModels()
                }}
                placeholder={t('baseUrlPlaceholder')}
                className={inputCls}
              />
            </div>
          )}

          {isCustom && (
            <div>
              <label htmlFor="llm-api-key-optional" className={labelCls}>{t('apiKeyOptional')}</label>
              <input
                id="llm-api-key-optional"
                type="password"
                value={setting.apiKey ?? ''}
                onChange={(e) => {
                  updateSetting({ apiKey: e.target.value || null })
                  debouncedFetchModels()
                }}
                placeholder={t('apiKeyPlaceholder')}
                className={inputCls}
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="llm-model" className={labelCls}>{t('model')}</label>
              <button
                type="button"
                onClick={fetchModels}
                disabled={modelsLoading}
                className="text-xs text-fedex-purple hover:underline disabled:opacity-50"
                aria-label={t('fetchModels')}
              >
                {modelsLoading ? t('fetchingModels') : t('fetchModels')}
              </button>
            </div>
            {models.length > 0 ? (
              <select
                id="llm-model"
                value={useCustomModel ? '__custom__' : setting.model}
                onChange={handleModelSelect}
                className={inputCls}
              >
{models.map((m, i) => (
            <option key={`${m.id}-${i}`} value={m.id}>
                    {m.size ? `${m.id} (${m.size})` : m.name || m.id}
                  </option>
                ))}
                <option value="__custom__">{t('customModel')}</option>
              </select>
            ) : null}
            {(useCustomModel || models.length === 0) && (
              <input
                type="text"
                value={setting.model}
                onChange={(e) => updateSetting({ model: e.target.value })}
                placeholder={t('modelPlaceholder')}
                spellCheck={false}
                className={`${inputCls} ${models.length > 0 ? 'mt-2' : ''}`}
              />
            )}
            {modelsError && (
              <p className="mt-1 text-xs text-amber-600">{modelsError}</p>
            )}
            {models.length === 0 && !modelsError && !modelsLoading && (
              <p className="mt-1 text-xs text-gray-400">{t('noModelsFound')}</p>
            )}
          </div>

          <div>
            <label htmlFor="llm-locale" className={labelCls}>{t('outputLocale')}</label>
            <select
              id="llm-locale"
              value={setting.locale}
              onChange={(e) => updateSetting({ locale: e.target.value })}
              className={inputCls}
            >
              <option value="en">English</option>
              <option value="zh-TW">繁體中文</option>
              <option value="zh-CN">简体中文</option>
              <option value="es-MX">Español (MX)</option>
            </select>
          </div>

          <div>
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            >
              {testStatus === 'testing' ? t('testing') : t('testConnection')}
            </button>
            {testStatus === 'success' && (
              <span className="ml-3 text-sm text-green-600">{t('testSuccess')}</span>
            )}
            {testStatus === 'failed' && (
              <span className="ml-3 text-sm text-red-600">{t('testFailed')}{testError ? `: ${testError}` : ''}</span>
            )}
          </div>

          <div>
            <button
              onClick={handleTestNotification}
              disabled={notifTestStatus === 'testing'}
              className="rounded-lg border border-fedex-purple px-4 py-1.5 text-sm font-medium text-fedex-purple hover:bg-fedex-purple/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            >
              {notifTestStatus === 'testing' ? t('testing') : t('testNotification')}
            </button>
            {notifTestStatus === 'success' && (
              <span className="ml-3 text-sm text-green-600">{t('testNotifSuccess')}</span>
            )}
            {notifTestStatus === 'failed' && (
              <span className="ml-3 text-sm text-red-600">{t('testFailed')}{notifTestError ? `: ${notifTestError}` : ''}</span>
            )}
            {notifTestSummary && (
              <p className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">{notifTestSummary}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
