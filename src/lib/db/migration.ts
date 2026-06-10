import { Pool } from 'pg'
import { loadSystemSettings } from '@/lib/system-config'
import { databaseUrlToPath } from './path'
import { getSqlJsStore } from './sqljs'
import { ensurePostgresSchema, postgresPoolConfig } from './postgres'

export const migrationTableOrder = [
  'NotificationSetting',
  'LLMSetting',
  'Package',
  'NotificationChannel',
  'NotificationContact',
  'NotificationLog',
] as const

export type MigrationTable = typeof migrationTableOrder[number]
export type TableCount = { source: number; target: number }
export type MigrationCounts = Partial<Record<MigrationTable, TableCount>>

const booleanColumns: Partial<Record<MigrationTable, Set<string>>> = {
  Package: new Set(['autoRefresh']),
  NotificationSetting: new Set(['enabled', 'dailySummaryEnabled']),
  NotificationChannel: new Set(['enabled', 'sendSummary']),
  NotificationContact: new Set(['enabled']),
  NotificationLog: new Set(['success']),
  LLMSetting: new Set(['enabled']),
}

export function summarizeMigrationCounts(counts: MigrationCounts) {
  return Object.values(counts).reduce(
    (total, item) => ({
      totalSource: total.totalSource + item.source,
      totalTarget: total.totalTarget + item.target,
    }),
    { totalSource: 0, totalTarget: 0 },
  )
}

export function migrationSqlitePath(settings: Pick<ReturnType<typeof loadSystemSettings>, 'sqlitePath'> = loadSystemSettings()) {
  return databaseUrlToPath(settings.sqlitePath)
}

function normalizeValue(table: MigrationTable, column: string, value: unknown) {
  if (booleanColumns[table]?.has(column)) {
    return value === true || value === 1
  }
  return value
}

function upsertSql(table: MigrationTable, row: Record<string, unknown>) {
  const columns = Object.keys(row)
  const values = columns.map((column) => normalizeValue(table, column, row[column]))
  const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
  const assignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `"${column}" = EXCLUDED."${column}"`)
    .join(', ')

  return {
    sql: `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT ("id") DO UPDATE SET ${assignments}`,
    values,
  }
}

export async function dryRunSqliteToPostgres() {
  const sqlite = await getSqlJsStore(migrationSqlitePath())
  const pool = new Pool(postgresPoolConfig())

  try {
    await ensurePostgresSchema(pool)
    const counts: MigrationCounts = {}

    for (const table of migrationTableOrder) {
      const source = sqlite.get<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table}"`)?.count ?? 0
      const targetResult = await pool.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)
      counts[table] = { source, target: Number(targetResult.rows[0]?.count ?? 0) }
    }

    return { ok: true, counts, summary: summarizeMigrationCounts(counts) }
  } finally {
    await pool.end()
  }
}

export async function migrateSqliteToPostgres() {
  const sqlite = await getSqlJsStore(migrationSqlitePath())
  const pool = new Pool(postgresPoolConfig())
  const results: Record<string, { upserted: number }> = {}
  let transactionStarted = false

  try {
    await ensurePostgresSchema(pool)
    await pool.query('BEGIN')
    transactionStarted = true

    for (const table of migrationTableOrder) {
      const rows = sqlite.all<Record<string, unknown>>(`SELECT * FROM "${table}"`)
      for (const row of rows) {
        const { sql, values } = upsertSql(table, row)
        await pool.query(sql, values)
      }
      results[table] = { upserted: rows.length }
    }

    await pool.query('COMMIT')
    return { ok: true, results }
  } catch (error) {
    if (transactionStarted) await pool.query('ROLLBACK')
    throw error
  } finally {
    await pool.end()
  }
}
