# Cross-Platform Native-Free Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `better-sqlite3` native dependency path so a Mac mini M4 can build macOS, Windows, and Ubuntu distributables from one workspace.

**Architecture:** First verify whether the generated Prisma 7 SQLite client can run in this app without the `better-sqlite3` adapter. If it can, keep Prisma and centralize database URL/runtime setup. If it cannot, stop before broad edits and write a fallback repository-layer plan backed by a pure JS/WASM SQLite runtime.

**Tech Stack:** Next.js 16 App Router, Electron 41, Prisma 7, SQLite, Vitest, electron-builder.

---

## File Structure

- Modify `src/lib/prisma.ts`: remove direct `@prisma/adapter-better-sqlite3` usage if Prisma can run without it.
- Create `src/lib/db/json.ts`: centralized helpers for JSON string fields.
- Create `src/lib/db/json.test.ts`: tests for JSON parse/stringify behavior.
- Create `src/lib/db/native-free.test.ts`: guard test proving app source/package scripts no longer reference `better-sqlite3`.
- Modify `src/lib/notification/service.ts`: replace raw `JSON.parse(channel.config)` with helper.
- Modify `src/app/api/packages/route.ts`: replace local safe JSON parsing with helper.
- Modify `src/app/api/packages/[id]/refresh/route.ts`: replace local safe JSON parsing with helper.
- Modify `src/app/api/notifications/channels/route.ts`: replace local safe JSON parsing with helper.
- Modify `src/app/api/notifications/channels/[id]/route.ts`: replace local safe JSON parsing with helper.
- Modify `src/app/api/notifications/channels/[id]/test/route.ts`: replace local safe JSON parsing with helper.
- Modify `src/lib/llm/service.ts`: replace direct JSON parsing of package subpackages and delay risk cache with helper.
- Modify `electron/setup-db.cjs`: remove `better-sqlite3`; either run a Prisma-compatible initializer or retire the file if Prisma-backed runtime setup covers creation.
- Modify `electron/main.js`: keep `DATABASE_URL` userData behavior, adjust setup call to the selected runtime initializer.
- Modify `package.json`: remove native packages and native rebuild script references.
- Modify `package-lock.json`: update via `npm install` after dependency changes.
- Modify `electron-builder.yml`: remove native rebuild assumptions only after dependencies are gone.
- Delete `scripts/rebuild-standalone-native.cjs`: no longer needed once no package script references it.
- Update `docs/superpowers/specs/2026-06-10-cross-platform-native-free-packaging-design.md` only if implementation discovers a constraint that changes the approved design.

---

### Task 1: Prisma Native-Free Compatibility Spike

**Files:**
- Modify: `src/lib/prisma.ts`
- Test: `src/lib/__tests__/prisma.test.ts`

- [ ] **Step 1: Write a stronger database smoke test**

Replace `src/lib/__tests__/prisma.test.ts` with:

```ts
import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../prisma'

describe('Prisma client', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('can execute a raw SQLite query', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined()
  })

  it('can create and delete a package row', async () => {
    const trackingNumber = `TEST-${Date.now()}`

    const created = await prisma.package.create({
      data: {
        trackingNumber,
        carrier: 'fedex',
        events: '[]',
        partNumbers: '[]',
        subPackages: '[]',
      },
    })

    expect(created.trackingNumber).toBe(trackingNumber)

    await prisma.package.delete({ where: { id: created.id } })

    await expect(
      prisma.package.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test before changing the client**

Run:

```bash
npm test -- src/lib/__tests__/prisma.test.ts
```

Expected: PASS with the current adapter-backed implementation.

- [ ] **Step 3: Try Prisma without the native adapter**

Replace `src/lib/prisma.ts` with:

```ts
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Run the compatibility test**

Run:

```bash
npm test -- src/lib/__tests__/prisma.test.ts
```

Expected if Prisma native-free works: PASS.

Expected if Prisma 7 still requires an adapter: FAIL with an error mentioning a missing adapter or database connection runtime.

- [ ] **Step 5: Decision checkpoint**

If Step 4 passes, continue to Task 2.

If Step 4 fails because the generated Prisma client requires an adapter, stop implementation and create a new fallback plan for a pure JS/WASM SQLite repository layer. Do not remove dependencies yet. Restore `src/lib/prisma.ts` to:

```ts
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL || 'file:./dev.db',
})

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 6: Commit the compatibility result if it passes**

Run:

```bash
git add src/lib/prisma.ts src/lib/__tests__/prisma.test.ts
git commit -m "test: verify native-free prisma sqlite runtime"
```

---

### Task 2: Centralize JSON Field Helpers

**Files:**
- Create: `src/lib/db/json.ts`
- Create: `src/lib/db/json.test.ts`
- Modify: `src/lib/utils.ts`

- [ ] **Step 1: Write helper tests**

Create `src/lib/db/json.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseJsonArray, parseJsonObject, stringifyJson } from './json'

describe('database JSON helpers', () => {
  it('parses arrays and falls back for malformed array JSON', () => {
    expect(parseJsonArray<string>('["a","b"]')).toEqual(['a', 'b'])
    expect(parseJsonArray<string>('bad json')).toEqual([])
    expect(parseJsonArray<string>('{"a":1}')).toEqual([])
    expect(parseJsonArray<string>(null, ['fallback'])).toEqual(['fallback'])
  })

  it('parses objects and falls back for malformed object JSON', () => {
    expect(parseJsonObject('{"webhookUrl":"https://example.test"}')).toEqual({
      webhookUrl: 'https://example.test',
    })
    expect(parseJsonObject('bad json')).toEqual({})
    expect(parseJsonObject('["a"]')).toEqual({})
    expect(parseJsonObject(null, { mode: 'webhook' })).toEqual({ mode: 'webhook' })
  })

  it('stringifies undefined values to the provided fallback JSON', () => {
    expect(stringifyJson(['a'])).toBe('["a"]')
    expect(stringifyJson(undefined, '{}')).toBe('{}')
    expect(stringifyJson(null, '[]')).toBe('[]')
  })
})
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
npm test -- src/lib/db/json.test.ts
```

Expected: FAIL because `src/lib/db/json.ts` does not exist.

- [ ] **Step 3: Add helper implementation**

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

- [ ] **Step 4: Re-export array helper from existing utils**

Replace `src/lib/utils.ts` with:

```ts
export { parseJsonArray } from '@/lib/db/json'
```

- [ ] **Step 5: Run helper and existing utils tests**

Run:

```bash
npm test -- src/lib/db/json.test.ts src/lib/__tests__/utils.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit JSON helpers**

Run:

```bash
git add src/lib/db/json.ts src/lib/db/json.test.ts src/lib/utils.ts src/lib/__tests__/utils.test.ts
git commit -m "feat: centralize database json helpers"
```

---

### Task 3: Replace Scattered JSON Parsing

**Files:**
- Modify: `src/app/api/packages/route.ts`
- Modify: `src/app/api/packages/[id]/refresh/route.ts`
- Modify: `src/app/api/notifications/channels/route.ts`
- Modify: `src/app/api/notifications/channels/[id]/route.ts`
- Modify: `src/app/api/notifications/channels/[id]/test/route.ts`
- Modify: `src/lib/notification/service.ts`
- Modify: `src/lib/llm/service.ts`

- [ ] **Step 1: Update package list/create route JSON parsing**

In `src/app/api/packages/route.ts`, import the helper:

```ts
import { parseJsonArray } from '@/lib/db/json'
```

Replace local `safeParseJSON` usage with:

```ts
events: safeParseEvents(p.events),
subPackages: parseJsonArray(p.subPackages),
partNumbers: parseJsonArray<string>(p.partNumbers),
```

Remove the local `safeParseJSON` function from the file.

- [ ] **Step 2: Update package refresh route JSON parsing**

In `src/app/api/packages/[id]/refresh/route.ts`, import:

```ts
import { parseJsonArray } from '@/lib/db/json'
```

Replace local parsed fields with:

```ts
subPackages: result.subPackages ?? [],
partNumbers: parseJsonArray<string>(updated.partNumbers),
```

Remove the local `safeParseJSON` function if it is no longer used.

- [ ] **Step 3: Update notification channel routes**

In `src/app/api/notifications/channels/route.ts`, import:

```ts
import { parseJsonArray, parseJsonObject, stringifyJson } from '@/lib/db/json'
```

Use these expressions:

```ts
config: stringifyJson(body.config ?? {}, '{}'),
notifyOnStatuses: stringifyJson(body.notifyOnStatuses ?? [], '[]'),
```

Return mapped channel fields with:

```ts
config: parseJsonObject(channel.config),
notifyOnStatuses: parseJsonArray<string>(channel.notifyOnStatuses),
```

Remove the local `safeParse` function.

- [ ] **Step 4: Update single notification channel route**

In `src/app/api/notifications/channels/[id]/route.ts`, import:

```ts
import { parseJsonArray, parseJsonObject, stringifyJson } from '@/lib/db/json'
```

Use:

```ts
config: parseJsonObject(channel.config),
notifyOnStatuses: parseJsonArray<string>(channel.notifyOnStatuses),
```

For updates, use:

```ts
config: body.config ? stringifyJson(body.config, '{}') : undefined,
notifyOnStatuses: body.notifyOnStatuses ? stringifyJson(body.notifyOnStatuses, '[]') : undefined,
```

Remove the local `safeParse` function.

- [ ] **Step 5: Update notification channel test route**

In `src/app/api/notifications/channels/[id]/test/route.ts`, import:

```ts
import { parseJsonObject } from '@/lib/db/json'
```

Replace:

```ts
const config: Record<string, unknown> = safeParse(channel.config)
```

with:

```ts
const config = parseJsonObject(channel.config)
```

Remove the local `safeParse` function.

- [ ] **Step 6: Update notification service**

In `src/lib/notification/service.ts`, import:

```ts
import { parseJsonArray, parseJsonObject } from '@/lib/db/json'
```

Replace:

```ts
const config: Record<string, unknown> = channel.config ? JSON.parse(channel.config) : {}
```

with:

```ts
const config = parseJsonObject(channel.config)
```

Keep existing `notifyOn` behavior, but import it from `@/lib/db/json` instead of `@/lib/utils`.

- [ ] **Step 7: Update LLM service parsing**

In `src/lib/llm/service.ts`, import:

```ts
import { parseJsonArray, parseJsonObject, stringifyJson } from '@/lib/db/json'
```

Replace `JSON.parse(pkg.subPackages)` with:

```ts
parseJsonArray(pkg.subPackages)
```

Replace cached delay risk parsing:

```ts
let cachedDelayRisk: unknown = null
if (pkg.aiDelayRisk) cachedDelayRisk = parseJsonObject(pkg.aiDelayRisk)
```

Keep the LLM response parse inside its existing `try/catch`, because that parses model output rather than database JSON.

Replace delay risk persistence with:

```ts
aiDelayRisk: delayRisk ? stringifyJson(delayRisk, '{}') : null,
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 9: Commit JSON parsing cleanup**

Run:

```bash
git add src/app/api/packages/route.ts src/app/api/packages/[id]/refresh/route.ts src/app/api/notifications/channels/route.ts src/app/api/notifications/channels/[id]/route.ts src/app/api/notifications/channels/[id]/test/route.ts src/lib/notification/service.ts src/lib/llm/service.ts
git commit -m "refactor: use shared database json helpers"
```

---

### Task 4: Remove Native Dependency References

**Files:**
- Create: `src/lib/db/native-free.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `scripts/rebuild-standalone-native.cjs`

- [ ] **Step 1: Add native dependency guard test**

Create `src/lib/db/native-free.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

describe('native-free packaging guard', () => {
  it('does not declare better-sqlite3 runtime dependencies or package scripts', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }

    expect(pkg.dependencies?.['better-sqlite3']).toBeUndefined()
    expect(pkg.dependencies?.['@prisma/adapter-better-sqlite3']).toBeUndefined()
    expect(pkg.devDependencies?.['@types/better-sqlite3']).toBeUndefined()

    for (const script of Object.values(pkg.scripts ?? {})) {
      expect(script).not.toContain('rebuild-standalone-native')
      expect(script).not.toContain('better-sqlite3')
    }
  })
})
```

- [ ] **Step 2: Run guard test and verify failure**

Run:

```bash
npm test -- src/lib/db/native-free.test.ts
```

Expected: FAIL because `package.json` still declares `better-sqlite3` and package scripts still call `rebuild-standalone-native`.

- [ ] **Step 3: Update package scripts and dependencies**

Edit `package.json`:

```json
{
  "scripts": {
    "package:mac": "npm run build && electron-builder --mac --publish=never",
    "package:win": "npm run build && electron-builder --win --publish=never",
    "package:linux": "npm run build && electron-builder --linux --publish=never",
    "package:all": "npm run build && electron-builder --mac --win --linux --publish=never"
  }
}
```

Remove these dependency entries:

```json
"@prisma/adapter-better-sqlite3": "^7.8.0",
"better-sqlite3": "^12.10.0",
"@types/better-sqlite3": "^7.6.13"
```

- [ ] **Step 4: Refresh lockfile**

Run:

```bash
npm install
```

Expected: `package-lock.json` no longer contains `node_modules/better-sqlite3` or `node_modules/@prisma/adapter-better-sqlite3`.

- [ ] **Step 5: Delete unused rebuild script**

Delete:

```bash
scripts/rebuild-standalone-native.cjs
```

- [ ] **Step 6: Run guard test**

Run:

```bash
npm test -- src/lib/db/native-free.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit dependency cleanup**

Run:

```bash
git add package.json package-lock.json src/lib/db/native-free.test.ts
git add -u scripts/rebuild-standalone-native.cjs
git commit -m "chore: remove native sqlite packaging dependency"
```

---

### Task 5: Replace Electron Database Setup

**Files:**
- Modify: `electron/setup-db.cjs`
- Modify: `electron/main.js`

- [ ] **Step 1: Confirm setup script still references native driver**

Run:

```bash
rg -n "better-sqlite3|setupDatabase|setup-db" electron src package.json
```

Expected before edit: `electron/setup-db.cjs` imports `better-sqlite3`, and `electron/main.js` calls `setupDatabase`.

- [ ] **Step 2: Replace setup script with migration-free Prisma schema initializer only if Task 1 passed**

If Task 1 passed with Prisma native-free runtime, replace `electron/setup-db.cjs` with a script that does not require `better-sqlite3` and delegates schema initialization to the same runtime path. Use this minimal script first:

```js
const fs = require('fs');
const path = require('path');

const dbPath = process.argv[2];
if (!dbPath) {
  console.error('[setup-db] Missing database path argument');
  process.exit(1);
}

const dir = path.dirname(dbPath);
fs.mkdirSync(dir, { recursive: true });

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, '');
}

console.log('[setup-db] Database file ready:', dbPath);
```

- [ ] **Step 3: Run packaged-start smoke check for setup script**

Run:

```bash
node electron/setup-db.cjs /tmp/logistics-dashboard-test.db
```

Expected: PASS and output contains `Database file ready`.

- [ ] **Step 4: Remove setup call if Prisma creates or migrates schema elsewhere**

If API tests reveal empty file creation is insufficient, replace the current `setupDatabase(dbPath)` call in `electron/main.js` with a call to a new Node startup script that runs SQL schema creation without native modules. Do not ship an app that only creates an empty database file.

Use this exact guard in `electron/main.js` while validating:

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

Only remove the block after a replacement initializer is proven by tests.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: both PASS.

- [ ] **Step 6: Commit Electron setup change**

Run:

```bash
git add electron/setup-db.cjs electron/main.js
git commit -m "refactor: remove native sqlite electron setup"
```

---

### Task 6: Build And Package Verification

**Files:**
- Modify: `electron-builder.yml` only if verification shows stale native-module assumptions are misleading.
- Modify: `docs/superpowers/specs/2026-06-10-cross-platform-native-free-packaging-design.md` only if discovered tool prerequisites need documentation.

- [ ] **Step 1: Run full test suite**

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

Expected: PASS, or only existing unrelated baseline issues. If lint fails because of this branch, fix the branch changes before continuing.

- [ ] **Step 3: Build app**

Run:

```bash
npm run build
```

Expected: PASS and `.next/standalone` generated.

- [ ] **Step 4: Verify no native SQLite references remain in source/config**

Run:

```bash
rg -n "better-sqlite3|adapter-better-sqlite3|rebuild-standalone-native|better_sqlite3\\.node" package.json package-lock.json electron scripts src prisma electron-builder.yml
```

Expected: no matches.

- [ ] **Step 5: Package macOS**

Run:

```bash
npm run package:mac
```

Expected: PASS and `release/` contains macOS `.dmg` and `.zip` artifacts.

- [ ] **Step 6: Package Windows**

Run:

```bash
npm run package:win
```

Expected: PASS and `release/` contains Windows NSIS and portable artifacts. If electron-builder asks for Wine or downloads helper binaries, install/document the packaging prerequisite rather than reintroducing native app dependencies.

- [ ] **Step 7: Package Linux**

Run:

```bash
npm run package:linux
```

Expected: PASS and `release/` contains Linux AppImage and `.deb` artifacts. If electron-builder asks for Linux packaging helpers, install/document the packaging prerequisite rather than reintroducing native app dependencies.

- [ ] **Step 8: Package all targets from one command**

Run:

```bash
npm run package:all
```

Expected: PASS and `release/` contains macOS, Windows, and Linux artifacts from one Mac mini M4 workspace run.

- [ ] **Step 9: Commit verification/doc updates**

Run:

```bash
git add electron-builder.yml docs/superpowers/specs/2026-06-10-cross-platform-native-free-packaging-design.md
git commit -m "docs: record cross-platform packaging prerequisites"
```

If neither file changed, skip this commit.

---

## Self-Review

Spec coverage:

- Native dependency removal is covered by Tasks 1, 4, and 6.
- Packaged database path behavior is covered by Tasks 5 and 6.
- JSON helper consolidation is covered by Tasks 2 and 3.
- Existing data model compatibility is preserved by keeping the Prisma schema unchanged.
- Verification commands for tests, build, and package targets are covered by Task 6.

Placeholder scan:

- No `TBD`, `TODO`, or open-ended "add appropriate handling" steps remain.
- The only branch is the explicit Task 1 decision checkpoint required by the approved design risk.

Type consistency:

- JSON helpers are consistently named `parseJsonArray`, `parseJsonObject`, and `stringifyJson`.
- The Prisma export remains named `prisma`, preserving existing imports.
