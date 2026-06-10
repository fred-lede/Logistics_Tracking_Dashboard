# SQL.js Repository Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Prisma + `better-sqlite3` with a native-free SQLite repository layer backed by `sql.js`, preserving existing API behavior and enabling one Mac mini M4 workspace to package macOS, Windows, and Ubuntu builds.

**Architecture:** Introduce `src/lib/db` as the only database access boundary. `sql.js` loads the SQLite file into WASM memory, applies schema initialization, runs prepared SQL helpers, and exports the database back to disk after writes. A Prisma-like facade named `db` exposes only the methods the current app uses, then routes and services migrate from `prisma.*` to `db.*`.

**Tech Stack:** Next.js 16 App Router, Electron 41, TypeScript strict, `sql.js` WASM SQLite, Vitest, electron-builder.

---

## Why This Fallback Exists

The approved native-free Prisma spike failed because Prisma 7 generated clients in this project require construction with a valid adapter. `new PrismaClient()` failed at import time with:

```text
PrismaClientInitializationError: `PrismaClient` needs to be constructed with a non-empty, valid `PrismaClientOptions`
```

That means keeping Prisma for SQLite still keeps us on an adapter path, and the available project adapter is `@prisma/adapter-better-sqlite3`, which is exactly the native module blocking cross-platform packaging.

`sql.js` is a WASM/JavaScript SQLite implementation. Its upstream documentation says it can load a database from a SQLite file represented as a `Uint8Array` and export the database back to a typed array for writing to disk. The tradeoff is that the database lives in memory while open. For this single-user package tracking dashboard, that tradeoff is acceptable.

References:

- `https://github.com/sql-js/sql.js`
- `https://www.npmjs.com/package/sql.js`

---

## File Structure

- Create `src/lib/db/types.ts`: app-owned row types and query option types.
- Create `src/lib/db/json.ts`: JSON string field helpers.
- Create `src/lib/db/path.ts`: resolve `DATABASE_URL` / file paths.
- Create `src/lib/db/schema.ts`: SQL schema initializer matching current Prisma migrations.
- Create `src/lib/db/sqljs.ts`: `sql.js` loader, singleton database, query helpers, persistence.
- Create `src/lib/db/facade.ts`: Prisma-like `db` facade used by app code.
- Create `src/lib/db/index.ts`: exports `db` and helpers.
- Create `src/lib/db/__tests__/json.test.ts`: JSON helper tests.
- Create `src/lib/db/__tests__/facade.test.ts`: CRUD behavior tests against a temp SQLite file.
- Create `src/lib/db/__tests__/native-free.test.ts`: guard against native SQLite dependency references.
- Modify `src/lib/prisma.ts`: either remove or turn into a compatibility re-export during migration.
- Modify API routes and services currently importing `@/lib/prisma`.
- Modify `electron/main.js`: keep packaged `DATABASE_URL` userData behavior and remove native setup dependency.
- Delete `electron/setup-db.cjs`: schema setup moves into `src/lib/db/sqljs.ts`.
- Modify `package.json`: add `sql.js`, remove Prisma/native SQLite runtime packages when app no longer imports Prisma.
- Modify `package-lock.json`: refresh via `npm install`.
- Modify `electron-builder.yml`: include `sql.js` WASM asset if Next standalone tracing does not include it automatically.
- Delete `scripts/rebuild-standalone-native.cjs`: no native rebuild remains.
- Keep `prisma/schema.prisma` and migrations for historical reference unless later cleanup is explicitly requested.

---

### Task 1: Add Database Types And JSON Helpers

**Files:**
- Create: `src/lib/db/types.ts`
- Create: `src/lib/db/json.ts`
- Create: `src/lib/db/__tests__/json.test.ts`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Create row and query types**

Create `src/lib/db/types.ts`:

```ts
export type SortDirection = 'asc' | 'desc'

export type IncludeContactsOption =
  | boolean
  | {
      where?: { enabled?: boolean }
    }

export type IncludeOption = {
  contacts?: IncludeContactsOption
}

export type OrderByOption<T extends string = string> = Partial<Record<T, SortDirection>>

export type PackageRow = {
  id: string
  trackingNumber: string
  carrier: string
  nickname: string | null
  partNumbers: string
  status: string | null
  eta: string | null
  origin: string | null
  destination: string | null
  events: string
  subPackages: string
  lastCheckedAt: Date | null
  autoRefresh: boolean
  aiSummary: string | null
  aiRootCause: string | null
  aiAnalyzedAt: Date | null
  aiDelayRisk: string | null
  createdAt: Date
  updatedAt: Date
}

export type NotificationSettingRow = {
  id: string
  enabled: boolean
  dailySummaryEnabled: boolean
  dailySummaryTime: string
  periodicInterval: number
  lastDailySent: string | null
  lastPeriodicSent: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NotificationChannelRow = {
  id: string
  type: string
  label: string
  enabled: boolean
  mode: string | null
  config: string
  notifyOnStatuses: string
  sendSummary: boolean
  locale: string
  createdAt: Date
  updatedAt: Date
}

export type NotificationContactRow = {
  id: string
  channelId: string
  name: string
  identifier: string
  enabled: boolean
  locale: string | null
  createdAt: Date
}

export type NotificationLogRow = {
  id: string
  packageId: string
  channelId: string
  notificationType: string
  status: string
  success: boolean
  errorMessage: string | null
  sentAt: Date
}

export type LLMSettingRow = {
  id: string
  provider: string
  providerLabel: string | null
  compatMode: string
  locale: string
  apiKey: string | null
  baseUrl: string | null
  model: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export type NotificationChannelWithContacts = NotificationChannelRow & {
  contacts: NotificationContactRow[]
}
```

- [ ] **Step 2: Write JSON helper tests**

Create `src/lib/db/__tests__/json.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseJsonArray, parseJsonObject, stringifyJson } from '../json'

describe('database JSON helpers', () => {
  it('parses arrays and falls back for invalid values', () => {
    expect(parseJsonArray<string>('["a","b"]')).toEqual(['a', 'b'])
    expect(parseJsonArray<string>('not json')).toEqual([])
    expect(parseJsonArray<string>('{"a":1}')).toEqual([])
    expect(parseJsonArray<string>(null, ['x'])).toEqual(['x'])
  })

  it('parses objects and falls back for invalid values', () => {
    expect(parseJsonObject('{"mode":"webhook"}')).toEqual({ mode: 'webhook' })
    expect(parseJsonObject('not json')).toEqual({})
    expect(parseJsonObject('["x"]')).toEqual({})
    expect(parseJsonObject(null, { enabled: true })).toEqual({ enabled: true })
  })

  it('stringifies database JSON values with explicit fallback text', () => {
    expect(stringifyJson(['a'])).toBe('["a"]')
    expect(stringifyJson(undefined, '{}')).toBe('{}')
    expect(stringifyJson(null, '[]')).toBe('[]')
  })
})
```

- [ ] **Step 3: Run helper tests and verify failure**

Run:

```bash
npm test -- src/lib/db/__tests__/json.test.ts
```

Expected: FAIL because helper module does not exist.

- [ ] **Step 4: Implement JSON helpers**

Create `src/lib/db/json.ts`:

```ts
export function parseJsonArray<T>(json: string | null | undefined, fallback: T[] = []): T[] {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function parseJsonObject<T extends Record<string, unknown> = Record<string, unknown>>(
  json: string | null | undefined,
  fallback: T = {} as T,
): T {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

export function stringifyJson(value: unknown, fallback = '[]'): string {
  if (value === undefined || value === null) return fallback
  return JSON.stringify(value)
}
```

- [ ] **Step 5: Preserve existing utility import compatibility**

Replace `src/lib/utils.ts` with:

```ts
export { parseJsonArray } from '@/lib/db/json'
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- src/lib/db/__tests__/json.test.ts src/lib/__tests__/utils.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/lib/db/types.ts src/lib/db/json.ts src/lib/db/__tests__/json.test.ts src/lib/utils.ts
git commit -m "feat: add native-free database helper types"
```

---

### Task 2: Add SQL.js Runtime And Schema Initializer

**Files:**
- Create: `src/lib/db/path.ts`
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/sqljs.ts`
- Create: `src/lib/db/__tests__/sqljs.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install sql.js**

Run:

```bash
npm install sql.js
```

Expected: `package.json` gains `sql.js` and `package-lock.json` updates.

- [ ] **Step 2: Add database path resolver**

Create `src/lib/db/path.ts`:

```ts
import path from 'node:path'

export function databaseUrlToPath(url = process.env.DATABASE_URL || 'file:./dev.db'): string {
  if (!url.startsWith('file:')) return url
  const rawPath = url.slice('file:'.length)
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath)
}
```

- [ ] **Step 3: Add schema initializer SQL**

Create `src/lib/db/schema.ts`:

```ts
export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Package" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "trackingNumber" TEXT NOT NULL,
  "carrier" TEXT NOT NULL DEFAULT 'fedex',
  "nickname" TEXT,
  "partNumbers" TEXT NOT NULL DEFAULT '[]',
  "status" TEXT,
  "eta" TEXT,
  "origin" TEXT,
  "destination" TEXT,
  "events" TEXT NOT NULL DEFAULT '[]',
  "subPackages" TEXT NOT NULL DEFAULT '[]',
  "lastCheckedAt" TEXT,
  "autoRefresh" INTEGER NOT NULL DEFAULT 0,
  "aiSummary" TEXT,
  "aiRootCause" TEXT,
  "aiAnalyzedAt" TEXT,
  "aiDelayRisk" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Package_trackingNumber_key" ON "Package"("trackingNumber");

CREATE TABLE IF NOT EXISTS "NotificationSetting" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "dailySummaryEnabled" INTEGER NOT NULL DEFAULT 0,
  "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00',
  "periodicInterval" INTEGER NOT NULL DEFAULT 0,
  "lastDailySent" TEXT,
  "lastPeriodicSent" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "NotificationChannel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "mode" TEXT,
  "config" TEXT NOT NULL DEFAULT '{}',
  "notifyOnStatuses" TEXT NOT NULL DEFAULT '[]',
  "sendSummary" INTEGER NOT NULL DEFAULT 0,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "NotificationContact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "locale" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "packageId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "notificationType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "success" INTEGER NOT NULL,
  "errorMessage" TEXT,
  "sentAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("channelId") REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LLMSetting" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "provider" TEXT NOT NULL DEFAULT 'openai',
  "providerLabel" TEXT,
  "compatMode" TEXT NOT NULL DEFAULT 'chat',
  "locale" TEXT NOT NULL DEFAULT 'en',
  "apiKey" TEXT,
  "baseUrl" TEXT,
  "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "enabled" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "NotificationSetting" ("id") VALUES ('global');
INSERT OR IGNORE INTO "LLMSetting" ("id", "enabled") VALUES ('global', 1);
`
```

- [ ] **Step 4: Write SQL.js runtime tests**

Create `src/lib/db/__tests__/sqljs.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('initializes schema and persists data to disk', async () => {
    const dbPath = tempDbPath()
    const store = await createSqlJsStore(dbPath)

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
```

- [ ] **Step 5: Run SQL.js tests and verify failure**

Run:

```bash
npm test -- src/lib/db/__tests__/sqljs.test.ts
```

Expected: FAIL because `src/lib/db/sqljs.ts` does not exist.

- [ ] **Step 6: Implement SQL.js store**

Create `src/lib/db/sqljs.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { schemaSql } from './schema'

type SqlValue = string | number | Uint8Array | null

let sqlPromise: Promise<SqlJsStatic> | null = null
let singletonPromise: Promise<SqlJsStore> | null = null

function getSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs()
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
```

- [ ] **Step 7: Add temporary type declaration if needed**

If TypeScript reports missing `sql.js` declarations, create `src/types/sql-js.d.ts`:

```ts
declare module 'sql.js' {
  export type SqlValue = string | number | Uint8Array | null

  export class Database {
    constructor(data?: Uint8Array | Buffer)
    run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Database
    prepare(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Statement
    export(): Uint8Array
  }

  export class Statement {
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export type SqlJsStatic = {
    Database: typeof Database
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>
}
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm test -- src/lib/db/__tests__/sqljs.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add package.json package-lock.json src/lib/db/path.ts src/lib/db/schema.ts src/lib/db/sqljs.ts src/lib/db/__tests__/sqljs.test.ts src/types/sql-js.d.ts
git commit -m "feat: add sqljs database runtime"
```

If `src/types/sql-js.d.ts` was not needed, omit it from `git add`.

---

### Task 3: Implement Prisma-Like DB Facade

**Files:**
- Create: `src/lib/db/facade.ts`
- Create: `src/lib/db/index.ts`
- Create: `src/lib/db/__tests__/facade.test.ts`

- [ ] **Step 1: Write facade tests**

Create `src/lib/db/__tests__/facade.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDbFacade } from '../facade'
import { resetSqlJsStoreForTests } from '../sqljs'

let tempDir: string | null = null

function useTempDatabase() {
  tempDir = mkdtempSync(path.join(tmpdir(), 'logistics-db-'))
  process.env.DATABASE_URL = `file:${path.join(tempDir, 'test.db')}`
  resetSqlJsStoreForTests()
}

beforeEach(useTempDatabase)

afterEach(() => {
  resetSqlJsStoreForTests()
  delete process.env.DATABASE_URL
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe('database facade', () => {
  it('creates, finds, updates, orders, and deletes package rows', async () => {
    const db = createDbFacade()
    const created = await db.package.create({
      data: {
        trackingNumber: 'TRACK-1',
        carrier: 'fedex',
        events: '[]',
        partNumbers: '[]',
        subPackages: '[]',
      },
    })

    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBeInstanceOf(Date)

    const found = await db.package.findUnique({ where: { trackingNumber: 'TRACK-1' } })
    expect(found?.id).toBe(created.id)

    const updated = await db.package.update({
      where: { id: created.id },
      data: { status: 'IN_TRANSIT', lastCheckedAt: new Date('2026-06-10T12:00:00.000Z') },
    })
    expect(updated.status).toBe('IN_TRANSIT')
    expect(updated.lastCheckedAt?.toISOString()).toBe('2026-06-10T12:00:00.000Z')

    const rows = await db.package.findMany({ orderBy: { updatedAt: 'desc' } })
    expect(rows).toHaveLength(1)

    await db.package.delete({ where: { id: created.id } })
    await expect(db.package.findUnique({ where: { id: created.id } })).resolves.toBeNull()
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
      include: { contacts: { where: { enabled: true } } },
      orderBy: { createdAt: 'asc' },
    })

    expect(channels[0].contacts.map((c) => c.name)).toEqual(['Enabled'])
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
  })
})
```

- [ ] **Step 2: Run facade tests and verify failure**

Run:

```bash
npm test -- src/lib/db/__tests__/facade.test.ts
```

Expected: FAIL because facade does not exist.

- [ ] **Step 3: Implement facade foundation**

Create `src/lib/db/facade.ts` with:

```ts
import { randomUUID } from 'node:crypto'
import { databaseUrlToPath } from './path'
import { getSqlJsStore, SqlJsStore } from './sqljs'
import type {
  IncludeOption,
  LLMSettingRow,
  NotificationChannelRow,
  NotificationChannelWithContacts,
  NotificationContactRow,
  NotificationLogRow,
  NotificationSettingRow,
  OrderByOption,
  PackageRow,
} from './types'

type Primitive = string | number | boolean | Date | null
type Data = Record<string, Primitive | undefined>

function cuid() {
  return `c${randomUUID().replaceAll('-', '')}`
}

function nowIso() {
  return new Date().toISOString()
}

function toDbValue(value: Primitive | undefined): string | number | null | undefined {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

function dateOrNull(value: unknown): Date | null {
  return typeof value === 'string' && value ? new Date(value) : null
}

function bool(value: unknown): boolean {
  return value === true || value === 1
}

function orderClause(orderBy?: OrderByOption): string {
  if (!orderBy) return ''
  const [[field, direction] = []] = Object.entries(orderBy)
  if (!field || !direction) return ''
  return ` ORDER BY "${field}" ${direction.toUpperCase()}`
}

function insertSql(table: string, data: Data) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined)
  const columns = entries.map(([key]) => `"${key}"`).join(', ')
  const placeholders = entries.map(() => '?').join(', ')
  return {
    sql: `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
    params: entries.map(([, value]) => toDbValue(value)),
  }
}

function updateSql(table: string, data: Data, whereField: string, whereValue: string) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined)
  const sets = entries.map(([key]) => `"${key}" = ?`).join(', ')
  return {
    sql: `UPDATE "${table}" SET ${sets} WHERE "${whereField}" = ?`,
    params: [...entries.map(([, value]) => toDbValue(value)), whereValue],
  }
}

function packageRow(row: Record<string, unknown>): PackageRow {
  return {
    id: String(row.id),
    trackingNumber: String(row.trackingNumber),
    carrier: String(row.carrier),
    nickname: row.nickname == null ? null : String(row.nickname),
    partNumbers: String(row.partNumbers),
    status: row.status == null ? null : String(row.status),
    eta: row.eta == null ? null : String(row.eta),
    origin: row.origin == null ? null : String(row.origin),
    destination: row.destination == null ? null : String(row.destination),
    events: String(row.events),
    subPackages: String(row.subPackages),
    lastCheckedAt: dateOrNull(row.lastCheckedAt),
    autoRefresh: bool(row.autoRefresh),
    aiSummary: row.aiSummary == null ? null : String(row.aiSummary),
    aiRootCause: row.aiRootCause == null ? null : String(row.aiRootCause),
    aiAnalyzedAt: dateOrNull(row.aiAnalyzedAt),
    aiDelayRisk: row.aiDelayRisk == null ? null : String(row.aiDelayRisk),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  }
}

function settingRow(row: Record<string, unknown>): NotificationSettingRow {
  return {
    id: String(row.id),
    enabled: bool(row.enabled),
    dailySummaryEnabled: bool(row.dailySummaryEnabled),
    dailySummaryTime: String(row.dailySummaryTime),
    periodicInterval: Number(row.periodicInterval),
    lastDailySent: row.lastDailySent == null ? null : String(row.lastDailySent),
    lastPeriodicSent: dateOrNull(row.lastPeriodicSent),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  }
}

function channelRow(row: Record<string, unknown>): NotificationChannelRow {
  return {
    id: String(row.id),
    type: String(row.type),
    label: String(row.label),
    enabled: bool(row.enabled),
    mode: row.mode == null ? null : String(row.mode),
    config: String(row.config),
    notifyOnStatuses: String(row.notifyOnStatuses),
    sendSummary: bool(row.sendSummary),
    locale: String(row.locale),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  }
}

function contactRow(row: Record<string, unknown>): NotificationContactRow {
  return {
    id: String(row.id),
    channelId: String(row.channelId),
    name: String(row.name),
    identifier: String(row.identifier),
    enabled: bool(row.enabled),
    locale: row.locale == null ? null : String(row.locale),
    createdAt: new Date(String(row.createdAt)),
  }
}

function llmRow(row: Record<string, unknown>): LLMSettingRow {
  return {
    id: String(row.id),
    provider: String(row.provider),
    providerLabel: row.providerLabel == null ? null : String(row.providerLabel),
    compatMode: String(row.compatMode),
    locale: String(row.locale),
    apiKey: row.apiKey == null ? null : String(row.apiKey),
    baseUrl: row.baseUrl == null ? null : String(row.baseUrl),
    model: String(row.model),
    enabled: bool(row.enabled),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  }
}

async function store() {
  return getSqlJsStore(databaseUrlToPath())
}

async function persist(store: SqlJsStore) {
  await store.persist()
}

export function createDbFacade() {
  return {
    package: {
      async findMany(args: { orderBy?: OrderByOption<keyof PackageRow & string> } = {}) {
        const s = await store()
        return s.all<Record<string, unknown>>(`SELECT * FROM "Package"${orderClause(args.orderBy)}`).map(packageRow)
      },
      async findUnique(args: { where: { id?: string; trackingNumber?: string } }) {
        const s = await store()
        const field = args.where.id ? 'id' : 'trackingNumber'
        const value = args.where.id ?? args.where.trackingNumber
        if (!value) return null
        const row = s.get<Record<string, unknown>>(`SELECT * FROM "Package" WHERE "${field}" = ?`, [value])
        return row ? packageRow(row) : null
      },
      async create(args: { data: Data }) {
        const s = await store()
        const id = String(args.data.id ?? cuid())
        const timestamp = nowIso()
        const { sql, params } = insertSql('Package', {
          id,
          carrier: 'fedex',
          events: '[]',
          partNumbers: '[]',
          subPackages: '[]',
          createdAt: timestamp,
          updatedAt: timestamp,
          ...args.data,
        })
        s.run(sql, params)
        await persist(s)
        return packageRow(s.get<Record<string, unknown>>('SELECT * FROM "Package" WHERE "id" = ?', [id])!)
      },
      async update(args: { where: { id: string }; data: Data }) {
        const s = await store()
        const { sql, params } = updateSql('Package', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        s.run(sql, params)
        await persist(s)
        return packageRow(s.get<Record<string, unknown>>('SELECT * FROM "Package" WHERE "id" = ?', [args.where.id])!)
      },
      async delete(args: { where: { id: string } }) {
        const s = await store()
        const row = s.get<Record<string, unknown>>('SELECT * FROM "Package" WHERE "id" = ?', [args.where.id])
        s.run('DELETE FROM "Package" WHERE "id" = ?', [args.where.id])
        await persist(s)
        return row ? packageRow(row) : null
      },
    },
    notificationChannel: {
      async findMany(args: { include?: IncludeOption; orderBy?: OrderByOption<keyof NotificationChannelRow & string> } = {}) {
        const s = await store()
        const channels = s.all<Record<string, unknown>>(`SELECT * FROM "NotificationChannel"${orderClause(args.orderBy)}`).map(channelRow)
        if (!args.include?.contacts) return channels
        return channels.map((channel) => ({
          ...channel,
          contacts: findContactsForChannel(s, channel.id, args.include?.contacts),
        }))
      },
      async findUnique(args: { where: { id: string }; include?: IncludeOption }) {
        const s = await store()
        const row = s.get<Record<string, unknown>>('SELECT * FROM "NotificationChannel" WHERE "id" = ?', [args.where.id])
        if (!row) return null
        const channel = channelRow(row)
        if (!args.include?.contacts) return channel
        return { ...channel, contacts: findContactsForChannel(s, channel.id, args.include.contacts) }
      },
      async create(args: { data: Data; include?: IncludeOption }) {
        const s = await store()
        const id = String(args.data.id ?? cuid())
        const timestamp = nowIso()
        const { sql, params } = insertSql('NotificationChannel', {
          id,
          enabled: true,
          config: '{}',
          notifyOnStatuses: '[]',
          sendSummary: false,
          locale: 'en',
          createdAt: timestamp,
          updatedAt: timestamp,
          ...args.data,
        })
        s.run(sql, params)
        await persist(s)
        return this.findUnique({ where: { id }, include: args.include }) as Promise<NotificationChannelRow | NotificationChannelWithContacts>
      },
      async update(args: { where: { id: string }; data: Data; include?: IncludeOption }) {
        const s = await store()
        const { sql, params } = updateSql('NotificationChannel', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        s.run(sql, params)
        await persist(s)
        return this.findUnique({ where: args.where, include: args.include }) as Promise<NotificationChannelRow | NotificationChannelWithContacts>
      },
      async delete(args: { where: { id: string } }) {
        const s = await store()
        const row = s.get<Record<string, unknown>>('SELECT * FROM "NotificationChannel" WHERE "id" = ?', [args.where.id])
        s.run('DELETE FROM "NotificationChannel" WHERE "id" = ?', [args.where.id])
        await persist(s)
        return row ? channelRow(row) : null
      },
    },
    notificationContact: {
      async create(args: { data: Data }) {
        const s = await store()
        const id = String(args.data.id ?? cuid())
        const { sql, params } = insertSql('NotificationContact', {
          id,
          enabled: true,
          createdAt: nowIso(),
          ...args.data,
        })
        s.run(sql, params)
        await persist(s)
        return contactRow(s.get<Record<string, unknown>>('SELECT * FROM "NotificationContact" WHERE "id" = ?', [id])!)
      },
      async update(args: { where: { id: string }; data: Data }) {
        const s = await store()
        const { sql, params } = updateSql('NotificationContact', args.data, 'id', args.where.id)
        s.run(sql, params)
        await persist(s)
        return contactRow(s.get<Record<string, unknown>>('SELECT * FROM "NotificationContact" WHERE "id" = ?', [args.where.id])!)
      },
      async delete(args: { where: { id: string } }) {
        const s = await store()
        const row = s.get<Record<string, unknown>>('SELECT * FROM "NotificationContact" WHERE "id" = ?', [args.where.id])
        s.run('DELETE FROM "NotificationContact" WHERE "id" = ?', [args.where.id])
        await persist(s)
        return row ? contactRow(row) : null
      },
    },
    notificationSetting: {
      async findUnique(args: { where: { id: string } }) {
        const s = await store()
        const row = s.get<Record<string, unknown>>('SELECT * FROM "NotificationSetting" WHERE "id" = ?', [args.where.id])
        return row ? settingRow(row) : null
      },
      async create(args: { data: Data }) {
        const s = await store()
        const { sql, params } = insertSql('NotificationSetting', {
          enabled: true,
          dailySummaryEnabled: false,
          dailySummaryTime: '09:00',
          periodicInterval: 0,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          ...args.data,
        })
        s.run(sql, params)
        await persist(s)
        return settingRow(s.get<Record<string, unknown>>('SELECT * FROM "NotificationSetting" WHERE "id" = ?', [String(args.data.id ?? 'global')])!)
      },
      async update(args: { where: { id: string }; data: Data }) {
        const s = await store()
        const { sql, params } = updateSql('NotificationSetting', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        s.run(sql, params)
        await persist(s)
        return settingRow(s.get<Record<string, unknown>>('SELECT * FROM "NotificationSetting" WHERE "id" = ?', [args.where.id])!)
      },
    },
    notificationLog: {
      async create(args: { data: Data }) {
        const s = await store()
        const id = String(args.data.id ?? cuid())
        const { sql, params } = insertSql('NotificationLog', {
          id,
          sentAt: nowIso(),
          ...args.data,
        })
        s.run(sql, params)
        await persist(s)
        return logRow(s.get<Record<string, unknown>>('SELECT * FROM "NotificationLog" WHERE "id" = ?', [id])!)
      },
    },
    lLMSetting: {
      async findUnique(args: { where: { id: string } }) {
        const s = await store()
        const row = s.get<Record<string, unknown>>('SELECT * FROM "LLMSetting" WHERE "id" = ?', [args.where.id])
        return row ? llmRow(row) : null
      },
      async create(args: { data: Data }) {
        const s = await store()
        const { sql, params } = insertSql('LLMSetting', {
          id: 'global',
          provider: 'openai',
          compatMode: 'chat',
          locale: 'en',
          model: 'gpt-4o-mini',
          enabled: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          ...args.data,
        })
        s.run(sql, params)
        await persist(s)
        return llmRow(s.get<Record<string, unknown>>('SELECT * FROM "LLMSetting" WHERE "id" = ?', [String(args.data.id ?? 'global')])!)
      },
      async update(args: { where: { id: string }; data: Data }) {
        const s = await store()
        const { sql, params } = updateSql('LLMSetting', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        s.run(sql, params)
        await persist(s)
        return llmRow(s.get<Record<string, unknown>>('SELECT * FROM "LLMSetting" WHERE "id" = ?', [args.where.id])!)
      },
      async upsert(args: { where: { id: string }; update: Data; create: Data }) {
        const existing = await this.findUnique(args)
        if (existing) return this.update({ where: args.where, data: args.update })
        return this.create({ data: { ...args.create, id: args.where.id } })
      },
    },
    async $disconnect() {
      return undefined
    },
  }
}

function findContactsForChannel(store: SqlJsStore, channelId: string, include: boolean | { where?: { enabled?: boolean } }) {
  const onlyEnabled = typeof include === 'object' && include.where?.enabled === true
  const sql = onlyEnabled
    ? 'SELECT * FROM "NotificationContact" WHERE "channelId" = ? AND "enabled" = 1'
    : 'SELECT * FROM "NotificationContact" WHERE "channelId" = ?'
  return store.all<Record<string, unknown>>(sql, [channelId]).map(contactRow)
}

function logRow(row: Record<string, unknown>): NotificationLogRow {
  return {
    id: String(row.id),
    packageId: String(row.packageId),
    channelId: String(row.channelId),
    notificationType: String(row.notificationType),
    status: String(row.status),
    success: bool(row.success),
    errorMessage: row.errorMessage == null ? null : String(row.errorMessage),
    sentAt: new Date(String(row.sentAt)),
  }
}

export type DbFacade = ReturnType<typeof createDbFacade>

export const db = createDbFacade()
```

- [ ] **Step 4: Export facade**

Create `src/lib/db/index.ts`:

```ts
export { db, createDbFacade }
export type { DbFacade } from './facade'
export { parseJsonArray, parseJsonObject, stringifyJson } from './json'
```

- [ ] **Step 5: Run facade tests**

Run:

```bash
npm test -- src/lib/db/__tests__/facade.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/db/facade.ts src/lib/db/index.ts src/lib/db/__tests__/facade.test.ts
git commit -m "feat: add native-free database facade"
```

---

### Task 4: Migrate App Code From Prisma To DB Facade

**Files:**
- Modify every file currently importing `@/lib/prisma`.
- Modify: `src/lib/__tests__/prisma.test.ts` or replace with DB facade test.
- Modify: `src/lib/prisma.ts`

- [ ] **Step 1: Replace imports**

Run:

```bash
rg -l "from '@/lib/prisma'|from '../prisma'" src
```

For app and lib runtime files, replace:

```ts
import { prisma } from '@/lib/prisma'
```

with:

```ts
import { db } from '@/lib/db'
```

Then replace `prisma.` with `db.` in those files.

- [ ] **Step 2: Update relative test import**

Replace `src/lib/__tests__/prisma.test.ts` with `src/lib/db/__tests__/facade.test.ts` coverage if the old test is redundant, or rename it to `src/lib/db/__tests__/db.test.ts` with:

```ts
import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../index'

describe('database facade singleton', () => {
  afterAll(async () => {
    await db.$disconnect()
  })

  it('can create and delete a package row through the singleton', async () => {
    const trackingNumber = `TEST-${Date.now()}`
    const created = await db.package.create({
      data: {
        trackingNumber,
        carrier: 'fedex',
        events: '[]',
        partNumbers: '[]',
        subPackages: '[]',
      },
    })

    expect(created.trackingNumber).toBe(trackingNumber)
    await db.package.delete({ where: { id: created.id } })
    await expect(db.package.findUnique({ where: { id: created.id } })).resolves.toBeNull()
  })
})
```

- [ ] **Step 3: Convert `src/lib/prisma.ts` to a temporary compatibility re-export**

Replace `src/lib/prisma.ts` with:

```ts
export { db as prisma } from '@/lib/db'
```

This keeps any missed import compiling temporarily. Remove the file in a later cleanup only after `rg "@/lib/prisma|../prisma" src` has no runtime matches.

- [ ] **Step 4: Run type-aware build check**

Run:

```bash
npm test
npm run build
```

Expected: PASS. If TypeScript errors reveal missing facade methods, add only the method shape actually used by app code.

- [ ] **Step 5: Commit migration**

Run:

```bash
git add src
git commit -m "refactor: migrate app data access to native-free db facade"
```

---

### Task 5: Remove Prisma And Native SQLite Dependencies

**Files:**
- Create: `src/lib/db/__tests__/native-free.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `scripts/rebuild-standalone-native.cjs`
- Delete: `electron/setup-db.cjs`
- Modify: `electron/main.js`

- [ ] **Step 1: Add native-free guard test**

Create `src/lib/db/__tests__/native-free.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('native-free packaging guard', () => {
  it('does not declare native sqlite or prisma runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }

    for (const name of [
      'better-sqlite3',
      '@prisma/adapter-better-sqlite3',
      '@prisma/client',
      '@types/better-sqlite3',
      'prisma',
    ]) {
      expect(pkg.dependencies?.[name]).toBeUndefined()
      expect(pkg.devDependencies?.[name]).toBeUndefined()
    }

    for (const script of Object.values(pkg.scripts ?? {})) {
      expect(script).not.toContain('rebuild-standalone-native')
      expect(script).not.toContain('prisma generate')
      expect(script).not.toContain('better-sqlite3')
    }
  })
})
```

- [ ] **Step 2: Run native-free guard and verify failure**

Run:

```bash
npm test -- src/lib/db/__tests__/native-free.test.ts
```

Expected: FAIL because Prisma and `better-sqlite3` are still installed.

- [ ] **Step 3: Update package scripts and dependencies**

In `package.json`:

- Remove dependencies `@prisma/adapter-better-sqlite3`, `@prisma/client`, and `better-sqlite3`.
- Remove devDependencies `@types/better-sqlite3` and `prisma`.
- Change `postinstall` from `prisma generate` to a no-op script removal. If no postinstall remains, delete the `postinstall` entry.
- Change package scripts to:

```json
"package:mac": "npm run build && electron-builder --mac --publish=never",
"package:win": "npm run build && electron-builder --win --publish=never",
"package:linux": "npm run build && electron-builder --linux --publish=never",
"package:all": "npm run build && electron-builder --mac --win --linux --publish=never"
```

- [ ] **Step 4: Refresh lockfile**

Run:

```bash
npm install
```

Expected: lockfile removes Prisma and `better-sqlite3` package entries.

- [ ] **Step 5: Remove Electron setup script**

Delete `electron/setup-db.cjs`.

In `electron/main.js`, remove the `setupDatabase` function and this startup block:

```js
  try {
    await setupDatabase(dbPath);
    log('Database setup complete');
  } catch (err) {
    log('Database setup failed:', err.message);
    fatalError('Database setup failed: ' + err.message + '\n\nLog file: ' + logPath());
    return;
  }
```

Keep `getDbPath()` and `getNextServerEnv()` so packaged `DATABASE_URL` still points to `app.getPath('userData')`.

- [ ] **Step 6: Delete rebuild script**

Delete `scripts/rebuild-standalone-native.cjs`.

- [ ] **Step 7: Run guard and search checks**

Run:

```bash
npm test -- src/lib/db/__tests__/native-free.test.ts
rg -n "better-sqlite3|adapter-better-sqlite3|@prisma/client|PrismaClient|prisma generate|rebuild-standalone-native|better_sqlite3\\.node" package.json package-lock.json electron scripts src
```

Expected: guard PASS and `rg` returns no runtime matches. Historical matches under `prisma/` are acceptable only if the command is intentionally expanded to include `prisma/`.

- [ ] **Step 8: Run full tests and build**

Run:

```bash
npm test
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit dependency removal**

Run:

```bash
git add package.json package-lock.json electron/main.js src/lib/db/__tests__/native-free.test.ts
git add -u electron/setup-db.cjs scripts/rebuild-standalone-native.cjs
git commit -m "chore: remove prisma native sqlite runtime"
```

---

### Task 6: Package Verification And WASM Asset Handling

**Files:**
- Modify: `electron-builder.yml`
- Modify: `next.config.ts` if WASM tracing requires explicit handling.
- Modify: `docs/superpowers/specs/2026-06-10-cross-platform-native-free-packaging-design.md`

- [ ] **Step 1: Run test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS, or only pre-existing unrelated lint baseline issues.

- [ ] **Step 3: Build app**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Check standalone output for sql.js WASM**

Run:

```bash
find .next/standalone -name 'sql-wasm.wasm' -o -name '*sql*.wasm'
```

Expected: at least one sql.js WASM file is present. If not, update Next/electron-builder asset copying so `sql-wasm.wasm` is bundled and `initSqlJs({ locateFile })` can locate it in production.

- [ ] **Step 5: Package macOS**

Run:

```bash
npm run package:mac
```

Expected: PASS and `release/` contains macOS artifacts.

- [ ] **Step 6: Package Windows**

Run:

```bash
npm run package:win
```

Expected: PASS and `release/` contains Windows artifacts. If Wine/NSIS helper tooling is missing, document the packaging prerequisite instead of reintroducing native app dependencies.

- [ ] **Step 7: Package Linux**

Run:

```bash
npm run package:linux
```

Expected: PASS and `release/` contains AppImage and `.deb` artifacts. If host Linux packaging helpers are missing, document the packaging prerequisite instead of reintroducing native app dependencies.

- [ ] **Step 8: Package all targets**

Run:

```bash
npm run package:all
```

Expected: PASS and `release/` contains macOS, Windows, and Ubuntu/Linux artifacts from one Mac mini M4 workspace command.

- [ ] **Step 9: Update docs if packaging prerequisites were discovered**

If packaging commands required extra host tools, append a short section to `docs/superpowers/specs/2026-06-10-cross-platform-native-free-packaging-design.md`:

```md
## Verified Packaging Prerequisites

- Windows packaging from macOS requires: ...
- Linux packaging from macOS requires: ...
- sql.js WASM asset handling: ...
```

- [ ] **Step 10: Commit verification updates**

Run:

```bash
git add electron-builder.yml next.config.ts docs/superpowers/specs/2026-06-10-cross-platform-native-free-packaging-design.md
git commit -m "docs: record native-free packaging verification"
```

If none of those files changed, skip this commit.

---

## Self-Review

Spec coverage:

- Removes native SQLite runtime by replacing Prisma adapter with `sql.js`.
- Keeps local SQLite single-file behavior by loading/exporting the same file path from `DATABASE_URL`.
- Keeps packaged database in Electron userData through existing `DATABASE_URL` environment setup.
- Preserves current API behavior through a small app-owned facade rather than rewriting UI contracts.
- Includes package verification for macOS, Windows, Linux, and all-target packaging.

Known risk:

- `sql.js` keeps the active database in memory and writes the whole database file after mutations. This is acceptable for the current single-user tracking dashboard, but it should be revisited if the app starts storing large histories or binary data.

Placeholder scan:

- No `TBD`, `TODO`, or vague implementation steps remain.

Type consistency:

- Facade object is consistently named `db`.
- Legacy compatibility export is `prisma` only during migration.
- Row type names match table names and current app model names.
