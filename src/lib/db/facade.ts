import { randomUUID } from 'node:crypto'
import { databaseUrlToPath } from './path'
import { getSqlJsStore, type SqlJsStore } from './sqljs'
import type {
  IncludeContactsOption,
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
type WhereUnique = { id?: string }
type SqlParam = string | number | Uint8Array | null

const tableColumns = {
  Package: new Set([
    'id',
    'trackingNumber',
    'carrier',
    'nickname',
    'partNumbers',
    'status',
    'eta',
    'origin',
    'destination',
    'events',
    'subPackages',
    'lastCheckedAt',
    'autoRefresh',
    'aiSummary',
    'aiRootCause',
    'aiAnalyzedAt',
    'aiDelayRisk',
    'createdAt',
    'updatedAt',
  ]),
  NotificationSetting: new Set([
    'id',
    'enabled',
    'dailySummaryEnabled',
    'dailySummaryTime',
    'periodicInterval',
    'lastDailySent',
    'lastPeriodicSent',
    'createdAt',
    'updatedAt',
  ]),
  NotificationChannel: new Set([
    'id',
    'type',
    'label',
    'enabled',
    'mode',
    'config',
    'notifyOnStatuses',
    'sendSummary',
    'locale',
    'createdAt',
    'updatedAt',
  ]),
  NotificationContact: new Set(['id', 'channelId', 'name', 'identifier', 'enabled', 'locale', 'createdAt']),
  NotificationLog: new Set([
    'id',
    'packageId',
    'channelId',
    'notificationType',
    'status',
    'success',
    'errorMessage',
    'sentAt',
  ]),
  LLMSetting: new Set([
    'id',
    'provider',
    'providerLabel',
    'compatMode',
    'locale',
    'apiKey',
    'baseUrl',
    'model',
    'enabled',
    'createdAt',
    'updatedAt',
  ]),
} satisfies Record<string, Set<string>>

const orderableColumns = {
  Package: tableColumns.Package,
  NotificationChannel: tableColumns.NotificationChannel,
} satisfies Record<string, Set<string>>

function cuid() {
  return `c${randomUUID().replaceAll('-', '')}`
}

function nowIso() {
  return new Date().toISOString()
}

function toDbValue(value: Primitive | undefined): SqlParam | undefined {
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

function stringOrNull(value: unknown): string | null {
  return value == null ? null : String(value)
}

function orderClause(table: keyof typeof orderableColumns, orderBy?: OrderByOption): string {
  if (!orderBy) return ''

  const [field, direction] = Object.entries(orderBy)[0] ?? []
  if (!field || !direction) return ''
  if (!orderableColumns[table].has(field)) {
    throw new Error(`Unsupported orderBy field "${field}" for ${table}`)
  }
  if (direction !== 'asc' && direction !== 'desc') {
    throw new Error(`Unsupported orderBy direction "${String(direction)}"`)
  }
  return ` ORDER BY "${field}" ${direction.toUpperCase()}`
}

function filteredEntries(table: keyof typeof tableColumns, data: Data): [string, Primitive][] {
  return Object.entries(data).flatMap(([key, value]) => {
    if (value === undefined) return []
    if (!tableColumns[table].has(key)) {
      throw new Error(`Unsupported column "${key}" for ${table}`)
    }
    return [[key, value]]
  })
}

function insertSql(table: keyof typeof tableColumns, data: Data) {
  const entries = filteredEntries(table, data)
  if (entries.length === 0) throw new Error(`No data provided for ${table} insert`)

  const columns = entries.map(([key]) => `"${key}"`).join(', ')
  const placeholders = entries.map(() => '?').join(', ')
  return {
    sql: `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`,
    params: entries.map(([, value]) => toDbValue(value)) as SqlParam[],
  }
}

function updateSql(table: keyof typeof tableColumns, data: Data, whereField: string, whereValue: string) {
  const entries = filteredEntries(table, data)
  if (entries.length === 0) throw new Error(`No data provided for ${table} update`)

  const sets = entries.map(([key]) => `"${key}" = ?`).join(', ')
  return {
    sql: `UPDATE "${table}" SET ${sets} WHERE "${whereField}" = ?`,
    params: [...entries.map(([, value]) => toDbValue(value)), whereValue] as SqlParam[],
  }
}

function packageRow(row: Record<string, unknown>): PackageRow {
  return {
    id: String(row.id),
    trackingNumber: String(row.trackingNumber),
    carrier: String(row.carrier),
    nickname: stringOrNull(row.nickname),
    partNumbers: String(row.partNumbers),
    status: stringOrNull(row.status),
    eta: stringOrNull(row.eta),
    origin: stringOrNull(row.origin),
    destination: stringOrNull(row.destination),
    events: String(row.events),
    subPackages: String(row.subPackages),
    lastCheckedAt: dateOrNull(row.lastCheckedAt),
    autoRefresh: bool(row.autoRefresh),
    aiSummary: stringOrNull(row.aiSummary),
    aiRootCause: stringOrNull(row.aiRootCause),
    aiAnalyzedAt: dateOrNull(row.aiAnalyzedAt),
    aiDelayRisk: stringOrNull(row.aiDelayRisk),
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
    lastDailySent: stringOrNull(row.lastDailySent),
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
    mode: stringOrNull(row.mode),
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
    locale: stringOrNull(row.locale),
    createdAt: new Date(String(row.createdAt)),
  }
}

function logRow(row: Record<string, unknown>): NotificationLogRow {
  return {
    id: String(row.id),
    packageId: String(row.packageId),
    channelId: String(row.channelId),
    notificationType: String(row.notificationType),
    status: String(row.status),
    success: bool(row.success),
    errorMessage: stringOrNull(row.errorMessage),
    sentAt: new Date(String(row.sentAt)),
  }
}

function llmRow(row: Record<string, unknown>): LLMSettingRow {
  return {
    id: String(row.id),
    provider: String(row.provider),
    providerLabel: stringOrNull(row.providerLabel),
    compatMode: String(row.compatMode),
    locale: String(row.locale),
    apiKey: stringOrNull(row.apiKey),
    baseUrl: stringOrNull(row.baseUrl),
    model: String(row.model),
    enabled: bool(row.enabled),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  }
}

async function store() {
  return getSqlJsStore(databaseUrlToPath())
}

async function persist(sqlStore: SqlJsStore) {
  await sqlStore.persist()
}

function requireRow<T>(row: T | null, model: string): T {
  if (!row) throw new Error(`${model} not found`)
  return row
}

function findContactsForChannel(sqlStore: SqlJsStore, channelId: string, include: IncludeContactsOption) {
  const onlyEnabled = typeof include === 'object' && include.where?.enabled === true
  const sql = onlyEnabled
    ? 'SELECT * FROM "NotificationContact" WHERE "channelId" = ? AND "enabled" = 1'
    : 'SELECT * FROM "NotificationContact" WHERE "channelId" = ?'
  return sqlStore.all<Record<string, unknown>>(sql, [channelId]).map(contactRow)
}

function withContacts(
  sqlStore: SqlJsStore,
  channel: NotificationChannelRow,
  include?: IncludeOption,
): NotificationChannelRow | NotificationChannelWithContacts {
  if (!include?.contacts) return channel
  return { ...channel, contacts: findContactsForChannel(sqlStore, channel.id, include.contacts) }
}

async function findPackageUnique(args: { where: { id?: string; trackingNumber?: string } }) {
  const sqlStore = await store()
  const field = args.where.id ? 'id' : 'trackingNumber'
  const value = args.where.id ?? args.where.trackingNumber
  if (!value) return null

  const row = sqlStore.get<Record<string, unknown>>(`SELECT * FROM "Package" WHERE "${field}" = ?`, [value])
  return row ? packageRow(row) : null
}

async function findNotificationChannelUnique(args: { where: { id: string }; include?: IncludeOption }) {
  const sqlStore = await store()
  const row = sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationChannel" WHERE "id" = ?', [
    args.where.id,
  ])
  return row ? withContacts(sqlStore, channelRow(row), args.include) : null
}

async function findLLMSettingUnique(args: { where: { id: string } }) {
  const sqlStore = await store()
  const row = sqlStore.get<Record<string, unknown>>('SELECT * FROM "LLMSetting" WHERE "id" = ?', [args.where.id])
  return row ? llmRow(row) : null
}

async function createLLMSetting(args: { data: Data }) {
  const sqlStore = await store()
  const id = String(args.data.id ?? 'global')
  const timestamp = nowIso()
  const { sql, params } = insertSql('LLMSetting', {
    id,
    provider: 'openai',
    compatMode: 'chat',
    locale: 'en',
    model: 'gpt-4o-mini',
    enabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...args.data,
  })

  sqlStore.run(sql, params)
  await persist(sqlStore)

  return llmRow(requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "LLMSetting" WHERE "id" = ?', [id]), 'LLMSetting'))
}

async function updateLLMSetting(args: { where: { id: string }; data: Data }) {
  const sqlStore = await store()
  requireRow(sqlStore.get<Record<string, unknown>>('SELECT "id" FROM "LLMSetting" WHERE "id" = ?', [args.where.id]), 'LLMSetting')

  const { sql, params } = updateSql('LLMSetting', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
  sqlStore.run(sql, params)
  await persist(sqlStore)

  return llmRow(requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "LLMSetting" WHERE "id" = ?', [args.where.id]), 'LLMSetting'))
}

export function createDbFacade() {
  return {
    package: {
      async findMany(args: { orderBy?: OrderByOption<keyof PackageRow & string> } = {}) {
        const sqlStore = await store()
        return sqlStore
          .all<Record<string, unknown>>(`SELECT * FROM "Package"${orderClause('Package', args.orderBy)}`)
          .map(packageRow)
      },
      findUnique: findPackageUnique,
      async create(args: { data: Data }) {
        const sqlStore = await store()
        const id = String(args.data.id ?? cuid())
        const timestamp = nowIso()
        const { sql, params } = insertSql('Package', {
          id,
          carrier: 'fedex',
          events: '[]',
          partNumbers: '[]',
          subPackages: '[]',
          autoRefresh: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...args.data,
        })

        sqlStore.run(sql, params)
        await persist(sqlStore)

        return packageRow(requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "Package" WHERE "id" = ?', [id]), 'Package'))
      },
      async update(args: { where: { id: string }; data: Data }) {
        const sqlStore = await store()
        requireRow(sqlStore.get<Record<string, unknown>>('SELECT "id" FROM "Package" WHERE "id" = ?', [args.where.id]), 'Package')

        const { sql, params } = updateSql('Package', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        sqlStore.run(sql, params)
        await persist(sqlStore)

        return packageRow(requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "Package" WHERE "id" = ?', [args.where.id]), 'Package'))
      },
      async delete(args: { where: { id: string } }) {
        const sqlStore = await store()
        const row = requireRow(
          sqlStore.get<Record<string, unknown>>('SELECT * FROM "Package" WHERE "id" = ?', [args.where.id]),
          'Package',
        )

        sqlStore.run('DELETE FROM "Package" WHERE "id" = ?', [args.where.id])
        await persist(sqlStore)

        return packageRow(row)
      },
    },
    notificationChannel: {
      async findMany(
        args: {
          where?: { enabled?: boolean }
          include?: IncludeOption
          orderBy?: OrderByOption<keyof NotificationChannelRow & string>
        } = {},
      ) {
        const sqlStore = await store()
        const where = args.where?.enabled === undefined ? '' : ' WHERE "enabled" = ?'
        const params = args.where?.enabled === undefined ? [] : [args.where.enabled ? 1 : 0]
        return sqlStore
          .all<Record<string, unknown>>(
            `SELECT * FROM "NotificationChannel"${where}${orderClause('NotificationChannel', args.orderBy)}`,
            params,
          )
          .map(channelRow)
          .map((channel) => withContacts(sqlStore, channel, args.include))
      },
      findUnique: findNotificationChannelUnique,
      async create(args: { data: Data; include?: IncludeOption }) {
        const sqlStore = await store()
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

        sqlStore.run(sql, params)
        await persist(sqlStore)

        return requireRow(await findNotificationChannelUnique({ where: { id }, include: args.include }), 'NotificationChannel')
      },
      async update(args: { where: { id: string }; data: Data; include?: IncludeOption }) {
        const sqlStore = await store()
        requireRow(
          sqlStore.get<Record<string, unknown>>('SELECT "id" FROM "NotificationChannel" WHERE "id" = ?', [
            args.where.id,
          ]),
          'NotificationChannel',
        )

        const { sql, params } = updateSql('NotificationChannel', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        sqlStore.run(sql, params)
        await persist(sqlStore)

        return requireRow(await findNotificationChannelUnique({ where: args.where, include: args.include }), 'NotificationChannel')
      },
      async delete(args: { where: { id: string } }) {
        const sqlStore = await store()
        const row = requireRow(
          sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationChannel" WHERE "id" = ?', [
            args.where.id,
          ]),
          'NotificationChannel',
        )

        sqlStore.run('DELETE FROM "NotificationChannel" WHERE "id" = ?', [args.where.id])
        await persist(sqlStore)

        return channelRow(row)
      },
    },
    notificationContact: {
      async create(args: { data: Data }) {
        const sqlStore = await store()
        const id = String(args.data.id ?? cuid())
        const { sql, params } = insertSql('NotificationContact', {
          id,
          enabled: true,
          createdAt: nowIso(),
          ...args.data,
        })

        sqlStore.run(sql, params)
        await persist(sqlStore)

        return contactRow(
          requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationContact" WHERE "id" = ?', [id]), 'NotificationContact'),
        )
      },
      async update(args: { where: WhereUnique; data: Data }) {
        const id = requireRow(args.where.id ?? null, 'NotificationContact')
        const sqlStore = await store()
        requireRow(sqlStore.get<Record<string, unknown>>('SELECT "id" FROM "NotificationContact" WHERE "id" = ?', [id]), 'NotificationContact')

        const { sql, params } = updateSql('NotificationContact', args.data, 'id', id)
        sqlStore.run(sql, params)
        await persist(sqlStore)

        return contactRow(requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationContact" WHERE "id" = ?', [id]), 'NotificationContact'))
      },
      async delete(args: { where: WhereUnique }) {
        const id = requireRow(args.where.id ?? null, 'NotificationContact')
        const sqlStore = await store()
        const row = requireRow(
          sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationContact" WHERE "id" = ?', [id]),
          'NotificationContact',
        )

        sqlStore.run('DELETE FROM "NotificationContact" WHERE "id" = ?', [id])
        await persist(sqlStore)

        return contactRow(row)
      },
    },
    notificationSetting: {
      async findUnique(args: { where: { id: string } }) {
        const sqlStore = await store()
        const row = sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationSetting" WHERE "id" = ?', [
          args.where.id,
        ])
        return row ? settingRow(row) : null
      },
      async create(args: { data: Data }) {
        const sqlStore = await store()
        const id = String(args.data.id ?? 'global')
        const timestamp = nowIso()
        const { sql, params } = insertSql('NotificationSetting', {
          id,
          enabled: true,
          dailySummaryEnabled: false,
          dailySummaryTime: '09:00',
          periodicInterval: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...args.data,
        })

        sqlStore.run(sql, params)
        await persist(sqlStore)

        return settingRow(
          requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationSetting" WHERE "id" = ?', [id]), 'NotificationSetting'),
        )
      },
      async update(args: { where: { id: string }; data: Data }) {
        const sqlStore = await store()
        requireRow(
          sqlStore.get<Record<string, unknown>>('SELECT "id" FROM "NotificationSetting" WHERE "id" = ?', [
            args.where.id,
          ]),
          'NotificationSetting',
        )

        const { sql, params } = updateSql('NotificationSetting', { ...args.data, updatedAt: nowIso() }, 'id', args.where.id)
        sqlStore.run(sql, params)
        await persist(sqlStore)

        return settingRow(
          requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationSetting" WHERE "id" = ?', [args.where.id]), 'NotificationSetting'),
        )
      },
    },
    notificationLog: {
      async create(args: { data: Data }) {
        const sqlStore = await store()
        const id = String(args.data.id ?? cuid())
        const { sql, params } = insertSql('NotificationLog', {
          id,
          sentAt: nowIso(),
          ...args.data,
        })

        sqlStore.run(sql, params)
        await persist(sqlStore)

        return logRow(requireRow(sqlStore.get<Record<string, unknown>>('SELECT * FROM "NotificationLog" WHERE "id" = ?', [id]), 'NotificationLog'))
      },
    },
    lLMSetting: {
      findUnique: findLLMSettingUnique,
      create: createLLMSetting,
      update: updateLLMSetting,
      async upsert(args: { where: { id: string }; update: Data; create: Data }) {
        const existing = await findLLMSettingUnique({ where: args.where })
        if (existing) return updateLLMSetting({ where: args.where, data: args.update })
        return createLLMSetting({ data: { ...args.create, id: args.where.id } })
      },
    },
    async $disconnect() {
      return undefined
    },
  }
}

export type DbFacade = ReturnType<typeof createDbFacade>

export const db = createDbFacade()
