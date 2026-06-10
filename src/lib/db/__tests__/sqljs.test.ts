import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { databaseUrlToPath } from '../path'
import { createSqlJsStore } from '../sqljs'

let tempDir: string | null = null

function tempDbPath() {
  tempDir = mkdtempSync(path.join(tmpdir(), 'logistics-sqljs-'))
  return path.join(tempDir, 'test.db')
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('sql.js store', () => {
  it('converts file database URLs to absolute paths', () => {
    expect(databaseUrlToPath('file:./dev.db')).toBe(path.resolve('dev.db'))
    expect(databaseUrlToPath('file:/tmp/logistics.db')).toBe('/tmp/logistics.db')
    expect(databaseUrlToPath('/tmp/plain.db')).toBe('/tmp/plain.db')
  })

  it('initializes schema and persists data to disk', async () => {
    const dbPath = tempDbPath()
    const store = await createSqlJsStore(dbPath)

    expect(store.get<{ id: string }>('SELECT "id" FROM "NotificationSetting" WHERE "id" = ?', ['global'])).toEqual({
      id: 'global',
    })
    expect(store.get<{ id: string; enabled: number }>('SELECT "id", "enabled" FROM "LLMSetting" WHERE "id" = ?', ['global'])).toEqual({
      id: 'global',
      enabled: 1,
    })

    store.run(
      'INSERT INTO "Package" ("id", "trackingNumber", "carrier", "events", "partNumbers", "subPackages") VALUES (?, ?, ?, ?, ?, ?)',
      ['pkg_1', 'TRACK-1', 'fedex', '[]', '[]', '[]'],
    )
    await store.persist()

    const reopened = await createSqlJsStore(dbPath)
    const rows = reopened.all<{ trackingNumber: string }>('SELECT "trackingNumber" FROM "Package"')

    expect(rows).toEqual([{ trackingNumber: 'TRACK-1' }])
  })
})
