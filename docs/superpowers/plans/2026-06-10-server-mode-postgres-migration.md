# Server Mode and PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server mode with remote read-only dashboard access, database selection between SQLite and PostgreSQL, and a safe SQLite-to-PostgreSQL migration workflow.

**Architecture:** Store system/runtime settings in a local JSON file outside the active app database, because database mode must be known before choosing a backend. Keep the existing `src/lib/db` facade as the application-facing boundary and add PostgreSQL behind that interface. Enforce remote read-only access through shared server guards in API routes and settings pages, with UI changes as a second layer.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, sql.js SQLite facade, `pg` PostgreSQL driver, Electron main process, Vitest, React Testing Library, next-intl.

---

## File Structure

- Create `src/lib/system-config.ts`: read/write `.system-settings.json`, redact PostgreSQL password, derive defaults.
- Create `src/lib/system-network.ts`: find LAN IPv4 addresses and build reachable URLs.
- Create `src/lib/request-access.ts`: detect local vs remote requests from headers and block local-only APIs.
- Create `src/lib/db/postgres-schema.ts`: PostgreSQL DDL mirroring the current SQLite schema.
- Create `src/lib/db/postgres.ts`: PostgreSQL implementation of the existing db facade shape.
- Create `src/lib/db/migration.ts`: SQLite-to-PostgreSQL dry-run and execute logic.
- Modify `src/lib/db/index.ts`: select SQLite or PostgreSQL facade from system config.
- Modify `src/lib/db/facade.ts`: export a named SQLite facade factory that `index.ts` can select.
- Create `src/app/api/system/settings/route.ts`: local-only GET/PUT for access/database settings.
- Create `src/app/api/system/database/test/route.ts`: local-only PostgreSQL connection test.
- Create `src/app/api/system/database/migrate/route.ts`: local-only migration dry-run/execute endpoint.
- Modify mutating API routes under `src/app/api/**/route.ts`: call `requireLocalRequest()` before writes/tests/settings mutations.
- Modify `src/app/settings/page.tsx`: block remote settings page access.
- Create `src/components/settings/system-settings.tsx`: access mode, server URLs, DB mode, PostgreSQL settings, migration UI.
- Modify `src/components/settings/settings-page.tsx`: include the new system settings section.
- Modify `electron/main.js`: read `.system-settings.json`, bind Next.js to local or network host, pass system config directory env.
- Modify `messages/en.json`, `messages/zh-TW.json`, `messages/zh-CN.json`, `messages/es-MX.json`: add system settings translations.
- Modify `package.json` and `package-lock.json`: add `pg` and `@types/pg`.

## Task 1: Add Local System Config Store

**Files:**
- Create: `src/lib/system-config.ts`
- Test: `src/lib/__tests__/system-config.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/system-config.test.ts`

Expected: FAIL because `src/lib/system-config.ts` does not exist.

- [ ] **Step 3: Create local system config**

Create `src/lib/system-config.ts` with these exports:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type AccessMode = 'standalone' | 'server'
export type DatabaseMode = 'sqlite' | 'postgresql'
export type PostgresSslMode = 'disable' | 'prefer' | 'require'

export type SystemSettings = {
  accessMode: AccessMode
  serverHost: string
  serverPort: number
  databaseMode: DatabaseMode
  sqlitePath: string
  postgresHost: string
  postgresPort: number
  postgresDatabase: string
  postgresUser: string
  postgresPassword: string
  postgresSslMode: PostgresSslMode
}

export type PublicSystemSettings = Omit<SystemSettings, 'postgresPassword'> & {
  postgresPasswordSet: boolean
}

export const MASKED_SECRET = '••••••••'

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  accessMode: 'standalone',
  serverHost: '127.0.0.1',
  serverPort: 3310,
  databaseMode: 'sqlite',
  sqlitePath: process.env.DATABASE_URL || 'file:./dev.db',
  postgresHost: 'localhost',
  postgresPort: 5432,
  postgresDatabase: 'logistics_tracking',
  postgresUser: 'postgres',
  postgresPassword: '',
  postgresSslMode: 'disable',
}

function configDir() {
  return process.env.SYSTEM_CONFIG_DIR || process.env.CARRIER_CONFIG_DIR || process.cwd()
}

export function getSystemConfigPath() {
  return join(configDir(), '.system-settings.json')
}

function accessMode(value: unknown): AccessMode {
  return value === 'server' ? 'server' : 'standalone'
}

function databaseMode(value: unknown): DatabaseMode {
  return value === 'postgresql' ? 'postgresql' : 'sqlite'
}

function sslMode(value: unknown): PostgresSslMode {
  return value === 'prefer' || value === 'require' ? value : 'disable'
}

function positivePort(value: unknown, fallback: number) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback
}

export function normalizeSystemSettings(input: Partial<SystemSettings> | Record<string, unknown>): SystemSettings {
  const mode = accessMode(input.accessMode)
  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    ...input,
    accessMode: mode,
    serverHost: typeof input.serverHost === 'string' && input.serverHost
      ? input.serverHost
      : mode === 'server' ? '0.0.0.0' : '127.0.0.1',
    serverPort: positivePort(input.serverPort, DEFAULT_SYSTEM_SETTINGS.serverPort),
    databaseMode: databaseMode(input.databaseMode),
    sqlitePath: typeof input.sqlitePath === 'string' && input.sqlitePath ? input.sqlitePath : DEFAULT_SYSTEM_SETTINGS.sqlitePath,
    postgresHost: typeof input.postgresHost === 'string' && input.postgresHost ? input.postgresHost : DEFAULT_SYSTEM_SETTINGS.postgresHost,
    postgresPort: positivePort(input.postgresPort, DEFAULT_SYSTEM_SETTINGS.postgresPort),
    postgresDatabase: typeof input.postgresDatabase === 'string' && input.postgresDatabase ? input.postgresDatabase : DEFAULT_SYSTEM_SETTINGS.postgresDatabase,
    postgresUser: typeof input.postgresUser === 'string' && input.postgresUser ? input.postgresUser : DEFAULT_SYSTEM_SETTINGS.postgresUser,
    postgresPassword: typeof input.postgresPassword === 'string' ? input.postgresPassword : '',
    postgresSslMode: sslMode(input.postgresSslMode),
  }
}

export function loadSystemSettings(): SystemSettings {
  try {
    return normalizeSystemSettings(JSON.parse(readFileSync(getSystemConfigPath(), 'utf-8')))
  } catch {
    return normalizeSystemSettings({})
  }
}

export function saveSystemSettings(settings: SystemSettings) {
  const path = getSystemConfigPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(normalizeSystemSettings(settings), null, 2))
}

export function updateSystemSettings(existing: SystemSettings, update: Partial<SystemSettings>) {
  const merged = { ...existing, ...update }
  if (update.postgresPassword === MASKED_SECRET) {
    merged.postgresPassword = existing.postgresPassword
  }
  if (update.accessMode && !update.serverHost) {
    merged.serverHost = update.accessMode === 'server' ? '0.0.0.0' : '127.0.0.1'
  }
  return normalizeSystemSettings(merged)
}

export function getPublicSystemSettings(settings = loadSystemSettings()): PublicSystemSettings {
  const { postgresPassword, ...safe } = settings
  return { ...safe, postgresPasswordSet: postgresPassword.length > 0 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/system-config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/system-config.ts src/lib/__tests__/system-config.test.ts
git commit -m "feat: add system config store"
```

## Task 2: Add Network URL Discovery

**Files:**
- Create: `src/lib/system-network.ts`
- Test: `src/lib/__tests__/system-network.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildServerUrls } from '@/lib/system-network'

describe('system network helpers', () => {
  it('always includes localhost url', () => {
    expect(buildServerUrls(3310, [])).toContain('http://localhost:3310')
  })

  it('adds LAN urls for non-internal addresses', () => {
    expect(buildServerUrls(3310, ['192.168.1.20', '10.0.0.5'])).toEqual([
      'http://localhost:3310',
      'http://192.168.1.20:3310',
      'http://10.0.0.5:3310',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/system-network.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Create helper**

```ts
import { networkInterfaces } from 'node:os'

export function getLanIPv4Addresses() {
  return Object.values(networkInterfaces())
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address)
}

export function buildServerUrls(port: number, lanAddresses = getLanIPv4Addresses()) {
  return [
    `http://localhost:${port}`,
    ...lanAddresses.map((address) => `http://${address}:${port}`),
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/system-network.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/system-network.ts src/lib/__tests__/system-network.test.ts
git commit -m "feat: add server url discovery"
```

## Task 3: Add Request Access Guard

**Files:**
- Create: `src/lib/request-access.ts`
- Test: `src/lib/__tests__/request-access.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { forbiddenRemoteResponse, isLocalRequest, isMutationMethod } from '@/lib/request-access'

function headers(host: string) {
  return new Headers({ host })
}

describe('request access guard', () => {
  it.each(['localhost:3310', '127.0.0.1:3310', '[::1]:3310'])('allows local host %s', (host) => {
    expect(isLocalRequest(headers(host))).toBe(true)
  })

  it.each(['192.168.1.20:3310', 'dashboard.local:3310'])('blocks remote host %s', (host) => {
    expect(isLocalRequest(headers(host))).toBe(false)
  })

  it('detects mutating methods', () => {
    expect(isMutationMethod('POST')).toBe(true)
    expect(isMutationMethod('PUT')).toBe(true)
    expect(isMutationMethod('DELETE')).toBe(true)
    expect(isMutationMethod('GET')).toBe(false)
  })

  it('returns 403 json for remote forbidden responses', async () => {
    const response = forbiddenRemoteResponse()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Remote access is read-only' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/request-access.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Create guard**

```ts
import { NextResponse } from 'next/server'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function hostName(value: string | null) {
  if (!value) return ''
  if (value.startsWith('[')) return value.split(']')[0] + ']'
  return value.split(':')[0] ?? ''
}

export function isLocalRequest(headers: Headers) {
  return LOCAL_HOSTS.has(hostName(headers.get('host')).toLowerCase())
}

export function isMutationMethod(method: string) {
  return MUTATION_METHODS.has(method.toUpperCase())
}

export function forbiddenRemoteResponse() {
  return NextResponse.json({ error: 'Remote access is read-only' }, { status: 403 })
}

export function requireLocalRequest(headers: Headers) {
  if (isLocalRequest(headers)) return null
  return forbiddenRemoteResponse()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/request-access.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/request-access.ts src/lib/__tests__/request-access.test.ts
git commit -m "feat: add remote read-only access guard"
```

## Task 4: Add System Settings API

**Files:**
- Create: `src/app/api/system/settings/route.ts`
- Test: `src/app/api/system/settings/route.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET, PUT } from './route'

vi.mock('@/lib/system-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/system-config')>('@/lib/system-config')
  let current = actual.DEFAULT_SYSTEM_SETTINGS
  return {
    ...actual,
    loadSystemSettings: () => current,
    saveSystemSettings: (settings: typeof current) => { current = settings },
  }
})

function request(method: string, host: string, body?: unknown) {
  return new Request('http://' + host + '/api/system/settings', {
    method,
    headers: { host, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('/api/system/settings', () => {
  afterEach(() => vi.restoreAllMocks())

  it('redacts password in GET response', async () => {
    await PUT(request('PUT', 'localhost:3310', { postgresPassword: 'secret' }))
    const response = await GET(request('GET', 'localhost:3310'))
    const body = await response.json()

    expect(body.postgresPassword).toBeUndefined()
    expect(body.postgresPasswordSet).toBe(true)
  })

  it('blocks remote GET because settings are local-only', async () => {
    const response = await GET(request('GET', '192.168.1.20:3310'))
    expect(response.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/system/settings/route.test.ts`

Expected: FAIL because route does not exist.

- [ ] **Step 3: Create route**

```ts
import { NextResponse } from 'next/server'
import { buildServerUrls } from '@/lib/system-network'
import {
  getPublicSystemSettings,
  loadSystemSettings,
  saveSystemSettings,
  updateSystemSettings,
  type SystemSettings,
} from '@/lib/system-config'
import { requireLocalRequest } from '@/lib/request-access'

function withUrls(settings = loadSystemSettings()) {
  return {
    ...getPublicSystemSettings(settings),
    serverUrls: buildServerUrls(settings.serverPort),
  }
}

export async function GET(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden
  return NextResponse.json(withUrls())
}

export async function PUT(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden
  const existing = loadSystemSettings()
  const body = await request.json() as Partial<SystemSettings>
  const updated = updateSystemSettings(existing, body)
  saveSystemSettings(updated)
  return NextResponse.json({ ...withUrls(updated), restartRequired: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/system/settings/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/system/settings/route.ts src/app/api/system/settings/route.test.ts
git commit -m "feat: add system settings api"
```

## Task 5: Add PostgreSQL Dependency and Schema Helper

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/db/postgres-schema.ts`
- Test: `src/lib/db/__tests__/postgres-schema.test.ts`

- [ ] **Step 1: Install dependencies**

Run: `npm install pg @types/pg --save`

Expected: `package.json` includes `pg` in dependencies and `@types/pg` in devDependencies.

- [ ] **Step 2: Write failing schema test**

```ts
import { describe, expect, it } from 'vitest'
import { postgresSchemaSql } from '@/lib/db/postgres-schema'

describe('postgres schema sql', () => {
  it('contains all app tables', () => {
    for (const table of ['Package', 'NotificationSetting', 'NotificationChannel', 'NotificationContact', 'NotificationLog', 'LLMSetting']) {
      expect(postgresSchemaSql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`)
    }
  })

  it('keeps package tracking numbers unique', () => {
    expect(postgresSchemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Package_trackingNumber_key"')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/lib/db/__tests__/postgres-schema.test.ts`

Expected: FAIL because helper does not exist.

- [ ] **Step 4: Create schema helper**

Create `src/lib/db/postgres-schema.ts` by porting the table names and columns from `src/lib/db/schema.ts`, replacing SQLite types with PostgreSQL-compatible types:

```ts
export const postgresSchemaSql = `
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
  "lastCheckedAt" TIMESTAMPTZ,
  "autoRefresh" BOOLEAN NOT NULL DEFAULT false,
  "aiSummary" TEXT,
  "aiRootCause" TEXT,
  "aiAnalyzedAt" TIMESTAMPTZ,
  "aiDelayRisk" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "Package_trackingNumber_key" ON "Package"("trackingNumber");

CREATE TABLE IF NOT EXISTS "NotificationSetting" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00',
  "periodicInterval" INTEGER NOT NULL DEFAULT 0,
  "lastDailySent" TEXT,
  "lastPeriodicSent" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationChannel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "mode" TEXT,
  "config" TEXT NOT NULL DEFAULT '{}',
  "notifyOnStatuses" TEXT NOT NULL DEFAULT '[]',
  "sendSummary" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationContact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "channelId" TEXT NOT NULL REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "locale" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "packageId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL REFERENCES "NotificationChannel" ("id") ON DELETE CASCADE,
  "notificationType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "errorMessage" TEXT,
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT now()
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
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "NotificationSetting" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;
INSERT INTO "LLMSetting" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING;
`
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/db/__tests__/postgres-schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/db/postgres-schema.ts src/lib/db/__tests__/postgres-schema.test.ts
git commit -m "feat: add postgres schema support"
```

## Task 6: Add PostgreSQL Facade Behind Existing DB Interface

**Files:**
- Create: `src/lib/db/postgres.ts`
- Modify: `src/lib/db/facade.ts`
- Modify: `src/lib/db/index.ts`
- Test: `src/lib/db/__tests__/postgres-facade.test.ts`
- Test: `src/lib/db/__tests__/facade-selection.test.ts`

- [ ] **Step 1: Write selection test**

```ts
import { describe, expect, it, vi } from 'vitest'

describe('db facade selection', () => {
  it('uses sqlite by default', async () => {
    vi.doMock('@/lib/system-config', () => ({
      loadSystemSettings: () => ({ databaseMode: 'sqlite' }),
    }))

    const mod = await import('@/lib/db')

    expect(mod.db).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify current export behavior**

Run: `npm test -- src/lib/db/__tests__/facade-selection.test.ts`

Expected: FAIL until `index.ts` is changed to read system config.

- [ ] **Step 3: Rename SQLite facade export**

In `src/lib/db/facade.ts`, keep the current implementation and export:

```ts
export function createSqliteDbFacade() {
  return createDbFacade()
}
```

Keep `export const db = createDbFacade()` temporarily so existing tests keep passing during this task.

- [ ] **Step 4: Create PostgreSQL facade**

Create `src/lib/db/postgres.ts` with the same public shape as `createDbFacade()`. Use `pg.Pool`, the same row mapping semantics as `facade.ts`, and `$1`, `$2` placeholders.

Required exported functions:

```ts
import { Pool, type PoolConfig } from 'pg'
import { loadSystemSettings, type SystemSettings } from '@/lib/system-config'
import { postgresSchemaSql } from './postgres-schema'
import type { DbFacade } from './facade'

export function postgresPoolConfig(settings: SystemSettings = loadSystemSettings()): PoolConfig {
  return {
    host: settings.postgresHost,
    port: settings.postgresPort,
    database: settings.postgresDatabase,
    user: settings.postgresUser,
    password: settings.postgresPassword,
    ssl: settings.postgresSslMode === 'require' ? { rejectUnauthorized: false } : undefined,
  }
}

export async function ensurePostgresSchema(pool: Pool) {
  await pool.query(postgresSchemaSql)
}
```

The facade must expose these methods and SQL behaviors:

- `package.findMany`: `SELECT * FROM "Package"` plus validated `ORDER BY`.
- `package.findUnique`: select by `id` or `trackingNumber`.
- `package.create`: insert defaults for `id`, `carrier`, `events`, `partNumbers`, `subPackages`, `autoRefresh`, `createdAt`, and `updatedAt`, then return the inserted row.
- `package.update`: verify the row exists, update provided columns plus `updatedAt`, then return the updated row.
- `package.delete`: read the row, delete by `id`, then return the deleted row.
- `notificationChannel.findMany`: optional `enabled` filter, optional contacts include, optional validated order.
- `notificationChannel.findUnique`: select by `id`, optionally with contacts.
- `notificationChannel.create/update/delete`: mirror the SQLite facade defaults and return shapes.
- `notificationContact.create/update/delete`: mirror the SQLite facade defaults and return shapes.
- `notificationSetting.findUnique/create/update`: mirror the SQLite facade global settings behavior.
- `notificationLog.create`: insert `sentAt` default and return the inserted log row.
- `lLMSetting.findUnique/create/update/upsert`: mirror the SQLite facade defaults and return shapes.
- `$disconnect`: call `pool.end()`.

Use these SQL helpers inside `postgres.ts`:

```ts
function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(', ')
}

function insertReturningSql(table: keyof typeof tableColumns, data: Data) {
  const entries = filteredEntries(table, data)
  const columns = entries.map(([key]) => `"${key}"`).join(', ')
  return {
    sql: `INSERT INTO "${table}" (${columns}) VALUES (${placeholders(entries.length)}) RETURNING *`,
    params: entries.map(([, value]) => value),
  }
}

function updateReturningSql(table: keyof typeof tableColumns, data: Data, whereField: string, whereValue: string) {
  const entries = filteredEntries(table, data)
  const sets = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ')
  return {
    sql: `UPDATE "${table}" SET ${sets} WHERE "${whereField}" = $${entries.length + 1} RETURNING *`,
    params: [...entries.map(([, value]) => value), whereValue],
  }
}
```

Keep row conversion output identical to the SQLite facade by reusing the same `dateOrNull`, `bool`, `stringOrNull`, `packageRow`, `settingRow`, `channelRow`, `contactRow`, `logRow`, and `llmRow` logic.

- [ ] **Step 5: Select facade in `src/lib/db/index.ts`**

```ts
import { loadSystemSettings } from '@/lib/system-config'
import { createDbFacade, createSqliteDbFacade, type DbFacade } from './facade'
import { createPostgresDbFacade } from './postgres'

export function createActiveDbFacade(): DbFacade {
  const settings = loadSystemSettings()
  if (settings.databaseMode === 'postgresql') return createPostgresDbFacade()
  return createSqliteDbFacade()
}

export const db = createActiveDbFacade()
export { createDbFacade, createSqliteDbFacade }
export type { DbFacade } from './facade'
export { parseJsonArray, parseJsonObject, stringifyJson } from './json'
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/lib/db/__tests__/facade-selection.test.ts src/lib/db/__tests__/facade.test.ts src/lib/__tests__/prisma.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/postgres.ts src/lib/db/facade.ts src/lib/db/index.ts src/lib/db/__tests__/postgres-facade.test.ts src/lib/db/__tests__/facade-selection.test.ts
git commit -m "feat: add postgres database facade"
```

## Task 7: Add PostgreSQL Connection Test API

**Files:**
- Create: `src/app/api/system/database/test/route.ts`
- Test: `src/app/api/system/database/test/route.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}))

function req(host = 'localhost:3310') {
  return new Request('http://' + host + '/api/system/database/test', {
    method: 'POST',
    headers: { host },
  })
}

describe('/api/system/database/test', () => {
  it('blocks remote callers', async () => {
    const response = await POST(req('192.168.1.20:3310'))
    expect(response.status).toBe(403)
  })

  it('returns success for valid connection', async () => {
    const response = await POST(req())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/system/database/test/route.test.ts`

Expected: FAIL because route does not exist.

- [ ] **Step 3: Create route**

```ts
import { NextResponse } from 'next/server'
import { Pool } from 'pg'
import { requireLocalRequest } from '@/lib/request-access'
import { postgresPoolConfig } from '@/lib/db/postgres'

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const pool = new Pool(postgresPoolConfig())
  try {
    await pool.query('SELECT 1 AS ok')
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown PostgreSQL connection error'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  } finally {
    await pool.end()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/system/database/test/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/system/database/test/route.ts src/app/api/system/database/test/route.test.ts
git commit -m "feat: add postgres connection test api"
```

## Task 8: Add SQLite-to-PostgreSQL Migration Service and API

**Files:**
- Create: `src/lib/db/migration.ts`
- Create: `src/app/api/system/database/migrate/route.ts`
- Test: `src/lib/db/__tests__/migration.test.ts`
- Test: `src/app/api/system/database/migrate/route.test.ts`

- [ ] **Step 1: Write failing migration service test**

```ts
import { describe, expect, it } from 'vitest'
import { migrationTableOrder, summarizeMigrationCounts } from '@/lib/db/migration'

describe('sqlite to postgres migration', () => {
  it('copies parent tables before dependent tables', () => {
    expect(migrationTableOrder).toEqual([
      'NotificationSetting',
      'LLMSetting',
      'Package',
      'NotificationChannel',
      'NotificationContact',
      'NotificationLog',
    ])
  })

  it('summarizes counts by table', () => {
    expect(summarizeMigrationCounts({
      Package: { source: 2, target: 1 },
      NotificationLog: { source: 3, target: 0 },
    })).toEqual({
      totalSource: 5,
      totalTarget: 1,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/db/__tests__/migration.test.ts`

Expected: FAIL because migration service does not exist.

- [ ] **Step 3: Create migration service**

```ts
import { Pool } from 'pg'
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

export function summarizeMigrationCounts(counts: MigrationCounts) {
  return Object.values(counts).reduce(
    (total, item) => ({
      totalSource: total.totalSource + item.source,
      totalTarget: total.totalTarget + item.target,
    }),
    { totalSource: 0, totalTarget: 0 },
  )
}

export async function dryRunSqliteToPostgres() {
  const sqlite = await getSqlJsStore(databaseUrlToPath())
  const pool = new Pool(postgresPoolConfig())
  try {
    await ensurePostgresSchema(pool)
    const counts: MigrationCounts = {}
    for (const table of migrationTableOrder) {
      const source = sqlite.get<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table}"`)?.count ?? 0
      const targetResult = await pool.query(`SELECT COUNT(*)::int AS count FROM "${table}"`)
      counts[table] = { source, target: targetResult.rows[0]?.count ?? 0 }
    }
    return { ok: true, counts, summary: summarizeMigrationCounts(counts) }
  } finally {
    await pool.end()
  }
}

export async function migrateSqliteToPostgres() {
  const sqlite = await getSqlJsStore(databaseUrlToPath())
  const pool = new Pool(postgresPoolConfig())
  const results: Record<string, { upserted: number }> = {}
  try {
    await ensurePostgresSchema(pool)
    await pool.query('BEGIN')
    for (const table of migrationTableOrder) {
      const rows = sqlite.all<Record<string, unknown>>(`SELECT * FROM "${table}"`)
      for (const row of rows) {
        const columns = Object.keys(row)
        const values = Object.values(row)
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
        const assignments = columns
          .filter((column) => column !== 'id')
          .map((column) => `"${column}" = EXCLUDED."${column}"`)
          .join(', ')
        const sql = `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders}) ON CONFLICT ("id") DO UPDATE SET ${assignments}`
        await pool.query(sql, values)
      }
      results[table] = { upserted: rows.length }
    }
    await pool.query('COMMIT')
    return { ok: true, results }
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  } finally {
    await pool.end()
  }
}
```

- [ ] **Step 4: Write failing route test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from './route'

vi.mock('@/lib/db/migration', () => ({
  dryRunSqliteToPostgres: vi.fn().mockResolvedValue({ ok: true, summary: { totalSource: 1, totalTarget: 0 } }),
  migrateSqliteToPostgres: vi.fn().mockResolvedValue({ ok: true, results: { Package: { upserted: 1 } } }),
}))

function req(body: unknown, host = 'localhost:3310') {
  return new Request('http://' + host + '/api/system/database/migrate', {
    method: 'POST',
    headers: { host, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/system/database/migrate', () => {
  it('blocks remote callers', async () => {
    const response = await POST(req({ mode: 'dry-run' }, '192.168.1.20:3310'))
    expect(response.status).toBe(403)
  })

  it('runs dry-run mode', async () => {
    const response = await POST(req({ mode: 'dry-run' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 5: Create migration route**

```ts
import { NextResponse } from 'next/server'
import { migrateSqliteToPostgres, dryRunSqliteToPostgres } from '@/lib/db/migration'
import { requireLocalRequest } from '@/lib/request-access'

export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json().catch(() => ({})) as { mode?: string }
  try {
    const result = body.mode === 'execute'
      ? await migrateSqliteToPostgres()
      : await dryRunSqliteToPostgres()
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/lib/db/__tests__/migration.test.ts src/app/api/system/database/migrate/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/migration.ts src/app/api/system/database/migrate/route.ts src/lib/db/__tests__/migration.test.ts src/app/api/system/database/migrate/route.test.ts
git commit -m "feat: add sqlite to postgres migration"
```

## Task 9: Apply Local-Only Guard to Mutating APIs

**Files:**
- Modify: `src/app/api/packages/route.ts`
- Modify: `src/app/api/packages/[id]/route.ts`
- Modify: `src/app/api/packages/[id]/refresh/route.ts`
- Modify: `src/app/api/packages/[id]/analyze/route.ts`
- Modify: `src/app/api/notifications/settings/route.ts`
- Modify: `src/app/api/notifications/channels/route.ts`
- Modify: `src/app/api/notifications/channels/[id]/route.ts`
- Modify: `src/app/api/notifications/channels/[id]/test/route.ts`
- Modify: `src/app/api/notifications/contacts/route.ts`
- Modify: `src/app/api/notifications/contacts/[id]/route.ts`
- Modify: `src/app/api/notifications/summary/route.ts`
- Modify: `src/app/api/settings/carrier/route.ts`
- Modify: `src/app/api/llm/settings/route.ts`
- Modify: `src/app/api/llm/models/route.ts`
- Modify: `src/app/api/llm/test/route.ts`
- Modify: `src/app/api/llm/test-notification/route.ts`
- Modify: `src/app/api/llm/translate/route.ts`
- Test: `src/app/api/packages/route.test.ts`

- [ ] **Step 1: Add failing remote POST test for packages**

```ts
import { describe, expect, it } from 'vitest'
import { POST } from './route'

describe('remote package mutations', () => {
  it('blocks package creation from remote dashboard users', async () => {
    const request = new Request('http://192.168.1.20:3310/api/packages', {
      method: 'POST',
      headers: { host: '192.168.1.20:3310', 'content-type': 'application/json' },
      body: JSON.stringify({ trackingNumber: '794798798798' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/packages/route.test.ts`

Expected: FAIL because POST currently accepts remote hosts.

- [ ] **Step 3: Add guard to each mutating handler**

For each `POST`, `PUT`, `DELETE`, or local-only `GET` handler listed above, add this at the start:

```ts
import { requireLocalRequest } from '@/lib/request-access'

const forbidden = requireLocalRequest(request.headers)
if (forbidden) return forbidden
```

For handlers that do not currently receive `request`, change the signature to receive it. Example:

```ts
export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden
  // existing body follows
}
```

For dynamic routes using Next.js 16 params, preserve the promise params signature:

```ts
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden
  const { id } = await params
  // existing body follows
}
```

- [ ] **Step 4: Run targeted API tests**

Run: `npm test -- src/app/api/packages/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api src/lib/request-access.ts
git commit -m "feat: enforce remote read-only api access"
```

## Task 10: Bind Electron Server According to Access Mode

**Files:**
- Modify: `electron/main.js`

- [ ] **Step 1: Add config reader to Electron**

Add near the existing helpers:

```js
function getSystemConfigPath() {
  if (isDev) return path.resolve('./.system-settings.json');
  return path.join(app.getPath('userData'), '.system-settings.json');
}

function loadSystemSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getSystemConfigPath(), 'utf-8'));
    const accessMode = parsed.accessMode === 'server' ? 'server' : 'standalone';
    const serverPort = Number.isInteger(parsed.serverPort) ? parsed.serverPort : DEV_PORT;
    return {
      accessMode,
      serverPort,
      serverHost: parsed.serverHost || (accessMode === 'server' ? '0.0.0.0' : '127.0.0.1'),
    };
  } catch {
    return { accessMode: 'standalone', serverHost: '127.0.0.1', serverPort: DEV_PORT };
  }
}
```

- [ ] **Step 2: Pass system config env**

Update `getNextServerEnv`:

```js
env.SYSTEM_CONFIG_DIR = isDev ? process.cwd() : app.getPath('userData');
env.CARRIER_CONFIG_DIR = isDev ? process.cwd() : app.getPath('userData');
env.HOSTNAME = settings.serverHost;
env.PORT = String(settings.serverPort);
```

- [ ] **Step 3: Start Next with host and port**

Update `startNextServer()` to read settings and use host:

```js
const settings = loadSystemSettings();
const args = [nextBin, 'dev', '--webpack', '-p', String(settings.serverPort), '-H', settings.serverHost];
```

For production standalone, keep spawning `server.js` and rely on `HOSTNAME` and `PORT` env.

- [ ] **Step 4: Update window and readiness URL**

Use localhost for the Electron window even in server mode:

```js
mainWindow.loadURL('http://localhost:' + loadSystemSettings().serverPort);
await waitForServer('http://localhost:' + settings.serverPort);
```

- [ ] **Step 5: Manual smoke run**

Run: `npm run dev`

Expected: Electron starts, Next logs include the configured host/port, and the app opens at localhost.

- [ ] **Step 6: Commit**

```bash
git add electron/main.js
git commit -m "feat: bind server mode host in electron"
```

## Task 11: Add System Settings UI and Translations

**Files:**
- Create: `src/components/settings/system-settings.tsx`
- Modify: `src/components/settings/settings-page.tsx`
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`
- Test: `src/components/settings/__tests__/system-settings.test.tsx`

- [ ] **Step 1: Write failing UI test**

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { SystemSettings } from '../system-settings'
import en from '../../../../messages/en.json'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    accessMode: 'server',
    serverPort: 3310,
    serverUrls: ['http://localhost:3310', 'http://192.168.1.20:3310'],
    databaseMode: 'sqlite',
    sqlitePath: 'file:./dev.db',
    postgresHost: 'localhost',
    postgresPort: 5432,
    postgresDatabase: 'logistics_tracking',
    postgresUser: 'postgres',
    postgresSslMode: 'disable',
    postgresPasswordSet: false,
  }),
}))

describe('SystemSettings', () => {
  it('shows server urls and database mode', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SystemSettings />
      </NextIntlClientProvider>,
    )

    expect(await screen.findByText('System mode')).toBeInTheDocument()
    expect(await screen.findByText('http://192.168.1.20:3310')).toBeInTheDocument()
    expect(await screen.findByLabelText('SQLite')).toBeInTheDocument()
    expect(await screen.findByLabelText('PostgreSQL')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/settings/__tests__/system-settings.test.tsx`

Expected: FAIL because component does not exist.

- [ ] **Step 3: Create component**

Create `SystemSettings` as a client component that:

- Fetches `/api/system/settings`.
- Renders segmented buttons or radio controls for standalone/server mode.
- Lists `serverUrls`.
- Renders database radio controls for SQLite/PostgreSQL.
- Shows SQLite path when SQLite is selected.
- Shows PostgreSQL fields when PostgreSQL is selected.
- Saves settings with `PUT /api/system/settings`.
- Calls `POST /api/system/database/test`.
- Calls `POST /api/system/database/migrate` with `{ "mode": "dry-run" }` and `{ "mode": "execute" }`.
- Displays `restartRequired` after saving access mode, port, or database mode.

Use existing settings page styling: `rounded-xl border border-gray-200 p-5`, compact labels, and switch/radio controls.

- [ ] **Step 4: Mount component**

In `src/components/settings/settings-page.tsx`, import and render the new section before LLM settings:

```tsx
import { SystemSettings } from './system-settings'

// inside return, before LLMSettings
<SystemSettings />
```

- [ ] **Step 5: Add translations**

Add `system` namespace to all four message files. English keys:

```json
"system": {
  "title": "System mode",
  "accessMode": "Access mode",
  "standalone": "Standalone",
  "server": "Server",
  "serverUrls": "Server addresses",
  "restartRequired": "Restart the app for this change to take effect.",
  "databaseMode": "Database",
  "sqlite": "SQLite",
  "postgresql": "PostgreSQL",
  "sqlitePath": "SQLite file",
  "postgresHost": "Host",
  "postgresPort": "Port",
  "postgresDatabase": "Database",
  "postgresUser": "User",
  "postgresPassword": "Password",
  "postgresSslMode": "SSL mode",
  "sslDisable": "Disable",
  "sslPrefer": "Prefer",
  "sslRequire": "Require",
  "save": "Save",
  "testConnection": "Test connection",
  "dryRunMigration": "Dry run migration",
  "runMigration": "Run migration",
  "connectionOk": "Connection successful",
  "connectionFailed": "Connection failed",
  "migrationOk": "Migration completed",
  "migrationFailed": "Migration failed",
  "remoteReadOnly": "Remote browsers can view the dashboard only. Management stays on this host."
}
```

- [ ] **Step 6: Run UI test**

Run: `npm test -- src/components/settings/__tests__/system-settings.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/system-settings.tsx src/components/settings/settings-page.tsx messages/en.json messages/zh-TW.json messages/zh-CN.json messages/es-MX.json src/components/settings/__tests__/system-settings.test.tsx
git commit -m "feat: add system settings ui"
```

## Task 12: Block Remote Settings Page

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Convert settings page to server access check**

Use `headers()` before rendering the client settings page:

```tsx
import { headers } from 'next/headers'
import Link from 'next/link'
import { SettingsPage } from '@/components/settings/settings-page'
import { isLocalRequest } from '@/lib/request-access'

export default async function SettingsRoute() {
  const requestHeaders = await headers()
  if (!isLocalRequest(requestHeaders)) {
    return (
      <div id="main-content" className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-gray-900">Read-only dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">Settings are available only on the host computer.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-fedex-purple hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }
  return <div id="main-content"><SettingsPage /></div>
}
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: restrict settings page to host"
```

## Task 13: Final Verification

**Files:**
- No planned edits unless verification finds a defect.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Manual server-mode check**

Run: `npm run dev`

Expected:

- App starts on configured port.
- Settings page shows LAN URLs.
- Dashboard works locally.
- After setting server mode and restart, Next binds to `0.0.0.0`.
- Remote browser can view dashboard.
- Remote browser receives `403` for mutating APIs.

- [ ] **Step 5: Final commit if verification fixes were needed**

If verification required fixes, stage the exact files changed by those fixes and commit them:

```bash
git status --short
git add path/to/fixed-file.ts path/to/fixed-test.test.ts
git commit -m "fix: stabilize server mode postgres migration"
```
