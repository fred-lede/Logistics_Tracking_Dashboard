import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { schemaSql } from './schema'

type SqlValue = string | number | Uint8Array | null

let sqlPromise: Promise<SqlJsStatic> | null = null
const storePromises = new Map<string, Promise<SqlJsStore>>()

function locateSqlJsFile(file: string): string {
  const require = createRequire(import.meta.url)
  return path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), file)
}

function getSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: locateSqlJsFile })
  return sqlPromise
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

export async function createSqlJsStore(dbPath: string): Promise<SqlJsStore> {
  const SQL = await getSqlJs()
  const bytes = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined
  const db = bytes && bytes.length > 0 ? new SQL.Database(bytes) : new SQL.Database()
  db.run(schemaSql)
  const store = new SqlJsStore(dbPath, db)
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
