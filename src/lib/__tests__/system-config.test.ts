import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SYSTEM_SETTINGS,
  getPublicSystemSettings,
  normalizeSystemSettings,
  updateSystemSettings,
  type SystemSettings,
} from '@/lib/system-config'

describe('system config', () => {
  it('normalizes missing values to safe defaults', () => {
    const settings = normalizeSystemSettings({})

    expect(settings.accessMode).toBe('standalone')
    expect(settings.serverHost).toBe('127.0.0.1')
    expect(settings.serverPort).toBe(3310)
    expect(settings.databaseMode).toBe('sqlite')
    expect(settings.postgresSslMode).toBe('disable')
  })

  it('uses network host when server mode is enabled', () => {
    const settings = normalizeSystemSettings({ accessMode: 'server' })

    expect(settings.serverHost).toBe('0.0.0.0')
  })

  it('redacts postgres password from public settings', () => {
    const settings: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      databaseMode: 'postgresql',
      postgresPassword: 'secret',
    }

    const publicSettings = getPublicSystemSettings(settings)

    expect(publicSettings).not.toHaveProperty('postgresPassword')
    expect(publicSettings.postgresPasswordSet).toBe(true)
  })

  it('keeps existing postgres password when masked replacement is submitted', () => {
    const existing: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      postgresPassword: 'secret',
    }

    const updated = updateSystemSettings(existing, { postgresPassword: '••••••••' })

    expect(updated.postgresPassword).toBe('secret')
  })
})
