import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { schemaSql } from './schema'

type SqlValue = string | number | Uint8Array | null
type SqlJsStatic = {
  Database: new (data?: Uint8Array | Buffer) => Database
}

type Database = {
  run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Database
  prepare(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Statement
  export(): Uint8Array
}

type Statement = {
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): void
}

type BundledLLMSettings = {
  provider?: unknown
  providerLabel?: unknown
  apiKey?: unknown
  baseUrl?: unknown
  model?: unknown
  compatMode?: unknown
  locale?: unknown
  enabled?: unknown
}

let sqlPromise: Promise<SqlJsStatic> | null = null
const storePromises = new Map<string, Promise<SqlJsStore>>()

function getSqlJs(): Promise<SqlJsStatic> {
  const require = createRequire(import.meta.url)
  const initSqlJs = require('sql.js/dist/sql-asm.js') as () => Promise<SqlJsStatic>
  sqlPromise ??= initSqlJs()
  return sqlPromise
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function enabledValue(value: unknown): number {
  if (value === false || value === 0 || value === 'false') return 0
  return 1
}

export class SqlJsStore {
  constructor(
    private readonly dbPath: string,
    private readonly db: Database,
  ) {}

  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params)
  }

  get<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | null {
    const rows = this.all<T>(sql, params)
    return rows[0] ?? null
  }

  all<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql, params)
    const rows: T[] = []
    try {
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
    } finally {
      stmt.free()
    }
    return rows
  }

  async persist(): Promise<void> {
    const dbDir = path.dirname(this.dbPath)
    const dbBaseName = path.basename(this.dbPath)
    const tempPath = path.join(
      dbDir,
      `.${dbBaseName}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    )

    fs.mkdirSync(dbDir, { recursive: true })
    try {
      fs.writeFileSync(tempPath, Buffer.from(this.db.export()))
      fs.renameSync(tempPath, this.dbPath)
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      } catch {
        // Best-effort cleanup only; preserve the original persistence error.
      }
      throw error
    }
  }
}

function readBundledLLMSettings(): BundledLLMSettings | null {
  const settingsPath = path.join(process.cwd(), '.llm-settings.json')
  if (!fs.existsSync(settingsPath)) return null

  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as BundledLLMSettings
  } catch {
    return null
  }
}

async function importBundledLLMSettings(store: SqlJsStore): Promise<void> {
  const bundled = readBundledLLMSettings()
  if (!bundled) return

  const row = store.get<{
    provider: string
    providerLabel: string | null
    apiKey: string | null
    baseUrl: string | null
    model: string
    compatMode: string
    locale: string
    enabled: number
  }>(
    'SELECT provider, "providerLabel", apiKey, baseUrl, model, "compatMode", locale, enabled FROM "LLMSetting" WHERE "id" = ?',
    ['global'],
  )
  if (!row) return

  const isDefaultRow =
    row.provider === 'openai'
    && row.providerLabel == null
    && row.apiKey == null
    && row.baseUrl == null
    && row.model === 'gpt-4o-mini'
    && row.compatMode === 'chat'
    && row.locale === 'en'
    && row.enabled === 0
  if (!isDefaultRow) return

  store.run(
    `UPDATE "LLMSetting"
     SET provider = ?,
         "providerLabel" = ?,
         apiKey = ?,
         baseUrl = ?,
         model = ?,
         "compatMode" = ?,
         locale = ?,
         enabled = ?,
         updatedAt = CURRENT_TIMESTAMP
     WHERE "id" = ?`,
    [
      stringValue(bundled.provider, 'openai'),
      nullableStringValue(bundled.providerLabel),
      nullableStringValue(bundled.apiKey),
      nullableStringValue(bundled.baseUrl),
      stringValue(bundled.model, 'gpt-4o-mini'),
      stringValue(bundled.compatMode, 'chat'),
      stringValue(bundled.locale, 'en'),
      enabledValue(bundled.enabled),
      'global',
    ],
  )
}

export async function createSqlJsStore(dbPath: string): Promise<SqlJsStore> {
  const SQL = await getSqlJs()
  const bytes = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined
  const db = bytes && bytes.length > 0 ? new SQL.Database(bytes) : new SQL.Database()
  db.run(schemaSql)
  const store = new SqlJsStore(dbPath, db)
  await importBundledLLMSettings(store)
  await store.persist()
  return store
}

export function getSqlJsStore(dbPath: string): Promise<SqlJsStore> {
  const resolvedDbPath = path.resolve(dbPath)
  let storePromise = storePromises.get(resolvedDbPath)
  if (!storePromise) {
    storePromise = createSqlJsStore(resolvedDbPath)
    storePromises.set(resolvedDbPath, storePromise)
  }
  return storePromise
}

export function resetSqlJsStoreForTests(): void {
  storePromises.clear()
}
