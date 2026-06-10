import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  DEFAULT_SYSTEM_SETTINGS,
  getPublicSystemSettings,
  loadSystemSettings,
  normalizeSystemSettings,
  updateSystemSettings,
  type SystemSettings,
} from '@/lib/system-config'

describe('system config', () => {
  let systemConfigDir: string | undefined
  let originalSystemConfigDir: string | undefined

  beforeEach(() => {
    originalSystemConfigDir = process.env.SYSTEM_CONFIG_DIR
  })

  afterEach(() => {
    if (originalSystemConfigDir === undefined) {
      delete process.env.SYSTEM_CONFIG_DIR
    } else {
      process.env.SYSTEM_CONFIG_DIR = originalSystemConfigDir
    }
    vi.restoreAllMocks()
  })

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

  it('preserves a custom server host when access mode changes and no host is submitted', () => {
    const existing: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      accessMode: 'standalone',
      serverHost: '192.168.1.25',
    }

    const updated = updateSystemSettings(existing, { accessMode: 'server' })

    expect(updated.serverHost).toBe('192.168.1.25')
  })

  it('derives the new host when the existing host was the default for the previous mode', () => {
    const existing: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      accessMode: 'standalone',
      serverHost: '127.0.0.1',
    }

    const updated = updateSystemSettings(existing, { accessMode: 'server' })

    expect(updated.serverHost).toBe('0.0.0.0')
  })

  it('returns defaults when the system settings file is missing', () => {
    systemConfigDir = mkdtempSync(join(tmpdir(), 'system-config-'))
    process.env.SYSTEM_CONFIG_DIR = systemConfigDir

    const settings = loadSystemSettings()

    expect(settings).toEqual(DEFAULT_SYSTEM_SETTINGS)
  })

  it('throws on malformed system settings JSON', () => {
    systemConfigDir = mkdtempSync(join(tmpdir(), 'system-config-'))
    process.env.SYSTEM_CONFIG_DIR = systemConfigDir
    writeFileSync(join(systemConfigDir, '.system-settings.json'), '{not json')

    expect(() => loadSystemSettings()).toThrow(`Invalid system settings file: ${join(systemConfigDir, '.system-settings.json')}`)
  })
})
