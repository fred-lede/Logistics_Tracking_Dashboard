import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { databaseUrlToPath } from '../path'
import { createSqlJsStore, getSqlJsStore, resetSqlJsStoreForTests } from '../sqljs'

const tempDirs: string[] = []
const originalCwd = process.cwd()

function tempDbPath() {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'logistics-sqljs-'))
  tempDirs.push(tempDir)
  return path.join(tempDir, 'test.db')
}

afterEach(() => {
  process.chdir(originalCwd)
  resetSqlJsStoreForTests()
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  }
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
      enabled: 0,
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

  it('imports bundled LLM settings into a new packaged database', async () => {
    const dbPath = tempDbPath()
    const standaloneDir = path.dirname(dbPath)
    process.chdir(standaloneDir)
    writeFileSync(
      path.join(standaloneDir, '.llm-settings.json'),
      JSON.stringify({
        provider: 'custom',
        providerLabel: 'AIIH',
        apiKey: 'test-key',
        baseUrl: 'https://example.test/v1',
        model: 'gemma4:e4b',
        compatMode: 'responses',
        locale: 'en',
        enabled: true,
      }),
    )

    const store = await createSqlJsStore(dbPath)

    expect(
      store.get<{
        provider: string
        providerLabel: string
        apiKey: string
        baseUrl: string
        model: string
        compatMode: string
        enabled: number
      }>(
        'SELECT provider, "providerLabel", apiKey, baseUrl, model, "compatMode", enabled FROM "LLMSetting" WHERE "id" = ?',
        ['global'],
      ),
    ).toEqual({
      provider: 'custom',
      providerLabel: 'AIIH',
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'gemma4:e4b',
      compatMode: 'responses',
      enabled: 1,
    })
  })

  it('does not overwrite existing user LLM settings with bundled settings', async () => {
    const dbPath = tempDbPath()
    const standaloneDir = path.dirname(dbPath)
    process.chdir(standaloneDir)
    writeFileSync(
      path.join(standaloneDir, '.llm-settings.json'),
      JSON.stringify({
        provider: 'custom',
        apiKey: 'bundled-key',
        baseUrl: 'https://bundled.example.test/v1',
        model: 'bundled-model',
        compatMode: 'responses',
        locale: 'en',
        enabled: true,
      }),
    )

    const store = await createSqlJsStore(dbPath)
    store.run(
      `UPDATE "LLMSetting"
       SET provider = ?, apiKey = ?, baseUrl = ?, model = ?, enabled = ?
       WHERE "id" = ?`,
      ['ollama', 'user-key', 'http://localhost:11434', 'llama3.2', 0, 'global'],
    )
    await store.persist()

    const reopened = await createSqlJsStore(dbPath)

    expect(
      reopened.get<{ provider: string; apiKey: string; baseUrl: string; model: string; enabled: number }>(
        'SELECT provider, apiKey, baseUrl, model, enabled FROM "LLMSetting" WHERE "id" = ?',
        ['global'],
      ),
    ).toEqual({
      provider: 'ollama',
      apiKey: 'user-key',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.2',
      enabled: 0,
    })
  })

  it('keeps singleton stores isolated by database path', async () => {
    const firstPath = tempDbPath()
    const secondPath = tempDbPath()
    const firstStore = await getSqlJsStore(firstPath)
    const secondStore = await getSqlJsStore(secondPath)

    firstStore.run(
      'INSERT INTO "Package" ("id", "trackingNumber", "carrier", "events", "partNumbers", "subPackages") VALUES (?, ?, ?, ?, ?, ?)',
      ['pkg_1', 'TRACK-1', 'fedex', '[]', '[]', '[]'],
    )
    await firstStore.persist()

    expect(secondStore.all<{ trackingNumber: string }>('SELECT "trackingNumber" FROM "Package"')).toEqual([])
  })
})
