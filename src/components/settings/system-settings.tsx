'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

type DatabaseMode = 'sqlite' | 'postgresql'
type AccessMode = 'standalone' | 'server'
type SslMode = 'disable' | 'prefer' | 'require'

type PublicSystemSettings = {
  accessMode: AccessMode
  serverHost: string
  serverPort: number
  serverUrls: string[]
  databaseMode: DatabaseMode
  sqlitePath: string
  postgresHost: string
  postgresPort: number
  postgresDatabase: string
  postgresUser: string
  postgresSslMode: SslMode
  postgresPasswordSet: boolean
  restartRequired?: boolean
}

type MigrationResult = {
  ok?: boolean
  error?: string
  summary?: { totalSource: number; totalTarget: number }
  results?: Record<string, { upserted: number }>
}

const emptySettings: PublicSystemSettings = {
  accessMode: 'standalone',
  serverHost: '127.0.0.1',
  serverPort: 3310,
  serverUrls: [],
  databaseMode: 'sqlite',
  sqlitePath: 'file:./dev.db',
  postgresHost: 'localhost',
  postgresPort: 5432,
  postgresDatabase: 'logistics_tracking',
  postgresUser: 'postgres',
  postgresSslMode: 'disable',
  postgresPasswordSet: false,
}

export function SystemSettings() {
  const t = useTranslations('system')
  const [settings, setSettings] = useState<PublicSystemSettings>(emptySettings)
  const [postgresPassword, setPostgresPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [migration, setMigration] = useState<MigrationResult | null>(null)

  useEffect(() => {
    fetch('/api/system/settings')
      .then((res) => res.json())
      .then((data) => setSettings({ ...emptySettings, ...data }))
      .finally(() => setLoading(false))
  }, [])

  function update<K extends keyof PublicSystemSettings>(key: K, value: PublicSystemSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    const payload: Record<string, unknown> = { ...settings }
    delete payload.serverUrls
    delete payload.postgresPasswordSet
    delete payload.restartRequired
    if (postgresPassword) payload.postgresPassword = postgresPassword

    const res = await fetch('/api/system/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const data = await res.json()
      setSettings({ ...emptySettings, ...data })
      setPostgresPassword('')
      setMessage(t('saved'))
    } else {
      setMessage(t('saveFailed'))
    }
    setSaving(false)
  }

  async function testConnection() {
    setMessage(null)
    const res = await fetch('/api/system/database/test', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok && data.ok ? t('connectionOk') : `${t('connectionFailed')}: ${data.error ?? ''}`.trim())
  }

  async function runMigration(mode: 'dry-run' | 'execute') {
    setMessage(null)
    const res = await fetch('/api/system/database/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    const data = await res.json().catch(() => ({ ok: false }))
    setMigration(data)
    setMessage(res.ok && data.ok ? (mode === 'execute' ? t('migrationOk') : t('dryRunOk')) : t('migrationFailed'))
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 p-5">
        <div className="text-sm text-gray-400">{t('loading')}</div>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-900">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{t('remoteReadOnly')}</p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-fedex-purple px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">{t('accessMode')}</legend>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="accessMode"
                checked={settings.accessMode === 'standalone'}
                onChange={() => update('accessMode', 'standalone')}
              />
              {t('standalone')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="accessMode"
                checked={settings.accessMode === 'server'}
                onChange={() => update('accessMode', 'server')}
              />
              {t('server')}
            </label>
          </div>
        </fieldset>

        <label className="block text-sm font-medium text-gray-700">
          {t('serverPort')}
          <input
            type="number"
            min={1}
            max={65535}
            value={settings.serverPort}
            onChange={(e) => update('serverPort', Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
          />
        </label>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">{t('serverUrls')}</p>
        <div className="mt-2 space-y-1">
          {settings.serverUrls.map((url) => (
            <code key={url} className="block rounded bg-gray-50 px-2 py-1 text-xs text-gray-700">
              {url}
            </code>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-gray-700">{t('databaseMode')}</legend>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="databaseMode"
                checked={settings.databaseMode === 'sqlite'}
                onChange={() => update('databaseMode', 'sqlite')}
              />
              {t('sqlite')}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="databaseMode"
                checked={settings.databaseMode === 'postgresql'}
                onChange={() => update('databaseMode', 'postgresql')}
              />
              {t('postgresql')}
            </label>
          </div>
        </fieldset>

        {settings.databaseMode === 'sqlite' ? (
          <label className="mt-3 block text-sm font-medium text-gray-700">
            {t('sqlitePath')}
            <input
              value={settings.sqlitePath}
              onChange={(e) => update('sqlitePath', e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fedex-purple focus-visible:ring-offset-1"
            />
          </label>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              {t('postgresHost')}
              <input value={settings.postgresHost} onChange={(e) => update('postgresHost', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t('postgresPort')}
              <input type="number" value={settings.postgresPort} onChange={(e) => update('postgresPort', Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t('postgresDatabase')}
              <input value={settings.postgresDatabase} onChange={(e) => update('postgresDatabase', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t('postgresUser')}
              <input value={settings.postgresUser} onChange={(e) => update('postgresUser', e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t('postgresPassword')}
              <input
                type="password"
                value={postgresPassword}
                placeholder={settings.postgresPasswordSet ? '••••••••' : ''}
                onChange={(e) => setPostgresPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t('postgresSslMode')}
              <select value={settings.postgresSslMode} onChange={(e) => update('postgresSslMode', e.target.value as SslMode)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
                <option value="disable">{t('sslDisable')}</option>
                <option value="prefer">{t('sslPrefer')}</option>
                <option value="require">{t('sslRequire')}</option>
              </select>
            </label>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={testConnection} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
            {t('testConnection')}
          </button>
          <button type="button" onClick={() => runMigration('dry-run')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
            {t('dryRunMigration')}
          </button>
          <button type="button" onClick={() => runMigration('execute')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700">
            {t('runMigration')}
          </button>
        </div>
      </div>

      {settings.restartRequired && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('restartRequired')}</p>
      )}
      {message && <p className="mt-4 text-sm text-gray-600">{message}</p>}
      {migration?.summary && (
        <p className="mt-2 text-xs text-gray-500">
          {t('migrationSummary', { source: migration.summary.totalSource, target: migration.summary.totalTarget })}
        </p>
      )}
    </div>
  )
}
