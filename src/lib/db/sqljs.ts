import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { schemaSql } from './schema'

type SqlValue = string | number | Uint8Array | null

let sqlPromise: Promise<SqlJsStatic> | null = null
let singletonPromise: Promise<SqlJsStore> | null = null

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
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true })
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()))
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
  singletonPromise ??= createSqlJsStore(dbPath)
  return singletonPromise
}

export function resetSqlJsStoreForTests(): void {
  singletonPromise = null
}
