import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDbFacade } from '../facade'
import { resetSqlJsStoreForTests } from '../sqljs'

let tempDir: string | null = null
let previousDatabaseUrl: string | undefined

function useTempDatabase() {
  previousDatabaseUrl = process.env.DATABASE_URL
  tempDir = mkdtempSync(path.join(tmpdir(), 'logistics-db-'))
  process.env.DATABASE_URL = `file:${path.join(tempDir, 'test.db')}`
  resetSqlJsStoreForTests()
}

beforeEach(useTempDatabase)

afterEach(() => {
  resetSqlJsStoreForTests()
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl
  }
  previousDatabaseUrl = undefined

  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('database facade', () => {
  it('creates, finds, updates, orders, and deletes package rows', async () => {
    const db = createDbFacade()
    const older = await db.package.create({
      data: {
        trackingNumber: 'TRACK-1',
        carrier: 'fedex',
        events: '[]',
        partNumbers: '[]',
        subPackages: '[]',
        updatedAt: new Date('2020-06-10T10:00:00.000Z'),
      },
    })
    const newer = await db.package.create({
      data: {
        trackingNumber: 'TRACK-2',
        carrier: 'fedex',
        events: '[]',
        partNumbers: '[]',
        subPackages: '[]',
        updatedAt: new Date('2020-06-10T11:00:00.000Z'),
      },
    })

    expect(older.id).toMatch(/^c[0-9a-f]{32}$/)
    expect(older.createdAt).toBeInstanceOf(Date)
    expect(older.autoRefresh).toBe(false)

    const found = await db.package.findUnique({ where: { trackingNumber: 'TRACK-1' } })
    expect(found?.id).toBe(older.id)

    const updated = await db.package.update({
      where: { id: older.id },
      data: {
        status: 'IN_TRANSIT',
        autoRefresh: true,
        lastCheckedAt: new Date('2026-06-10T12:00:00.000Z'),
      },
    })
    expect(updated.status).toBe('IN_TRANSIT')
    expect(updated.autoRefresh).toBe(true)
    expect(updated.lastCheckedAt?.toISOString()).toBe('2026-06-10T12:00:00.000Z')
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(older.updatedAt.getTime())

    const rows = await db.package.findMany({ orderBy: { updatedAt: 'desc' } })
    expect(rows.map((row) => row.id)).toEqual([updated.id, newer.id])

    await expect(db.package.delete({ where: { id: older.id } })).resolves.toMatchObject({ id: older.id })
    await expect(db.package.findUnique({ where: { id: older.id } })).resolves.toBeNull()
    await expect(db.package.update({ where: { id: older.id }, data: { status: 'DELIVERED' } })).rejects.toThrow(
      'Package not found',
    )
    await expect(db.package.delete({ where: { id: older.id } })).rejects.toThrow('Package not found')
  })

  it('handles notification channels with enabled contacts', async () => {
    const db = createDbFacade()
    const channel = await db.notificationChannel.create({
      data: {
        type: 'telegram',
        label: 'Ops',
        config: '{}',
        notifyOnStatuses: '[]',
        locale: 'en',
      },
      include: { contacts: true },
    })

    expect('contacts' in channel ? channel.contacts : []).toEqual([])
    expect(channel.enabled).toBe(true)

    await db.notificationContact.create({
      data: {
        channelId: channel.id,
        name: 'Enabled',
        identifier: '1',
        enabled: true,
      },
    })
    await db.notificationContact.create({
      data: {
        channelId: channel.id,
        name: 'Disabled',
        identifier: '2',
        enabled: false,
      },
    })

    const channels = await db.notificationChannel.findMany({
      where: { enabled: true },
      include: { contacts: { where: { enabled: true } } },
      orderBy: { createdAt: 'asc' },
    })

    expect(channels).toHaveLength(1)
    const contacts = 'contacts' in channels[0] ? channels[0].contacts : []
    expect(contacts.map((contact) => contact.name)).toEqual(['Enabled'])
  })

  it('upserts global LLM settings', async () => {
    const db = createDbFacade()
    const updated = await db.lLMSetting.upsert({
      where: { id: 'global' },
      update: { provider: 'openai', model: 'gpt-4o-mini', enabled: true },
      create: { id: 'global', provider: 'openai', model: 'gpt-4o-mini', enabled: true },
    })

    expect(updated.provider).toBe('openai')
    expect(updated.enabled).toBe(true)

    const found = await db.lLMSetting.findUnique({ where: { id: 'global' } })
    expect(found?.enabled).toBe(true)
  })

  it('updates notification settings and creates notification logs', async () => {
    const db = createDbFacade()
    const channel = await db.notificationChannel.create({
      data: {
        type: 'teams',
        label: 'Ops',
        config: '{}',
        notifyOnStatuses: '[]',
      },
    })

    const settings = await db.notificationSetting.update({
      where: { id: 'global' },
      data: {
        enabled: false,
        dailySummaryEnabled: true,
        dailySummaryTime: '10:30',
        periodicInterval: 120,
        lastPeriodicSent: new Date('2026-06-10T13:00:00.000Z'),
      },
    })
    expect(settings.enabled).toBe(false)
    expect(settings.dailySummaryEnabled).toBe(true)
    expect(settings.lastPeriodicSent?.toISOString()).toBe('2026-06-10T13:00:00.000Z')

    const log = await db.notificationLog.create({
      data: {
        packageId: 'pkg_1',
        channelId: channel.id,
        notificationType: 'status_change',
        status: 'sent',
        success: true,
      },
    })
    expect(log.id).toMatch(/^c[0-9a-f]{32}$/)
    expect(log.success).toBe(true)
    expect(log.sentAt).toBeInstanceOf(Date)
  })
})
