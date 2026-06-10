import { randomUUID } from 'node:crypto'
import { Pool, type PoolConfig } from 'pg'
import { loadSystemSettings, type SystemSettings } from '@/lib/system-config'
import { postgresSchemaSql } from './postgres-schema'
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
import type { DbFacade } from './facade'

type Primitive = string | number | boolean | Date | null
type Data = Record<string, Primitive | undefined>
type WhereUnique = { id?: string }

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

function now() {
  return new Date()
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return value
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

function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => `$${index + 1}`).join(', ')
}

function insertReturningSql(table: keyof typeof tableColumns, data: Data) {
  const entries = filteredEntries(table, data)
  if (entries.length === 0) throw new Error(`No data provided for ${table} insert`)

  const columns = entries.map(([key]) => `"${key}"`).join(', ')
  return {
    sql: `INSERT INTO "${table}" (${columns}) VALUES (${placeholders(entries.length)}) RETURNING *`,
    params: entries.map(([, value]) => value),
  }
}

function updateReturningSql(table: keyof typeof tableColumns, data: Data, whereField: string, whereValue: string) {
  const entries = filteredEntries(table, data)
  if (entries.length === 0) throw new Error(`No data provided for ${table} update`)

  const sets = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(', ')
  return {
    sql: `UPDATE "${table}" SET ${sets} WHERE "${whereField}" = $${entries.length + 1} RETURNING *`,
    params: [...entries.map(([, value]) => value), whereValue],
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

function requireRow<T>(row: T | null | undefined, model: string): T {
  if (!row) throw new Error(`${model} not found`)
  return row
}

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

export function createPostgresDbFacade(pool = new Pool(postgresPoolConfig())): DbFacade {
  let schemaReady: Promise<void> | null = null

  function ready() {
    schemaReady ??= ensurePostgresSchema(pool)
    return schemaReady
  }

  async function queryOne<T>(sql: string, params: unknown[], mapper: (row: Record<string, unknown>) => T) {
    await ready()
    const result = await pool.query(sql, params)
    return result.rows[0] ? mapper(result.rows[0]) : null
  }

  async function findContactsForChannel(channelId: string, include: IncludeContactsOption) {
    await ready()
    const onlyEnabled = typeof include === 'object' && include.where?.enabled === true
    const sql = onlyEnabled
      ? 'SELECT * FROM "NotificationContact" WHERE "channelId" = $1 AND "enabled" = true'
      : 'SELECT * FROM "NotificationContact" WHERE "channelId" = $1'
    const result = await pool.query(sql, [channelId])
    return result.rows.map(contactRow)
  }

  async function withContacts(
    channel: NotificationChannelRow,
    include?: IncludeOption,
  ): Promise<NotificationChannelWithContacts> {
    return {
      ...channel,
      contacts: include?.contacts ? await findContactsForChannel(channel.id, include.contacts) : [],
    }
  }

  async function findNotificationChannelUnique(args: { where: { id: string }; include?: IncludeOption }) {
    const channel = await queryOne(
      'SELECT * FROM "NotificationChannel" WHERE "id" = $1',
      [args.where.id],
      channelRow,
    )
    return channel ? withContacts(channel, args.include) : null
  }

  async function findLLMSettingUnique(args: { where: { id: string } }) {
    return queryOne('SELECT * FROM "LLMSetting" WHERE "id" = $1', [args.where.id], llmRow)
  }

  async function createLLMSetting(args: { data: Data }) {
    await ready()
    const id = String(args.data.id ?? 'global')
    const timestamp = now()
    const { sql, params } = insertReturningSql('LLMSetting', {
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
    const result = await pool.query(sql, params)
    return llmRow(requireRow(result.rows[0], 'LLMSetting'))
  }

  async function updateLLMSetting(args: { where: { id: string }; data: Data }) {
    await ready()
    requireRow(await findLLMSettingUnique({ where: args.where }), 'LLMSetting')

    const { sql, params } = updateReturningSql('LLMSetting', { ...args.data, updatedAt: now() }, 'id', args.where.id)
    const result = await pool.query(sql, params)
    return llmRow(requireRow(result.rows[0], 'LLMSetting'))
  }

  return {
    package: {
      async findMany(args: { orderBy?: OrderByOption<keyof PackageRow & string> } = {}) {
        await ready()
        const result = await pool.query(`SELECT * FROM "Package"${orderClause('Package', args.orderBy)}`)
        return result.rows.map(packageRow)
      },
      async findUnique(args: { where: { id?: string; trackingNumber?: string } }) {
        const field = args.where.id ? 'id' : 'trackingNumber'
        const value = args.where.id ?? args.where.trackingNumber
        if (!value) return null
        return queryOne(`SELECT * FROM "Package" WHERE "${field}" = $1`, [value], packageRow)
      },
      async create(args: { data: Data }) {
        await ready()
        const id = String(args.data.id ?? cuid())
        const timestamp = now()
        const { sql, params } = insertReturningSql('Package', {
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

        const result = await pool.query(sql, params)
        return packageRow(requireRow(result.rows[0], 'Package'))
      },
      async update(args: { where: { id: string }; data: Data }) {
        await ready()
        requireRow(await queryOne('SELECT * FROM "Package" WHERE "id" = $1', [args.where.id], packageRow), 'Package')

        const { sql, params } = updateReturningSql('Package', { ...args.data, updatedAt: now() }, 'id', args.where.id)
        const result = await pool.query(sql, params)
        return packageRow(requireRow(result.rows[0], 'Package'))
      },
      async delete(args: { where: { id: string } }) {
        await ready()
        const row = requireRow(
          await queryOne('SELECT * FROM "Package" WHERE "id" = $1', [args.where.id], packageRow),
          'Package',
        )
        await pool.query('DELETE FROM "Package" WHERE "id" = $1', [args.where.id])
        return row
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
        await ready()
        const where = args.where?.enabled === undefined ? '' : ' WHERE "enabled" = $1'
        const params = args.where?.enabled === undefined ? [] : [args.where.enabled]
        const result = await pool.query(
          `SELECT * FROM "NotificationChannel"${where}${orderClause('NotificationChannel', args.orderBy)}`,
          params,
        )
        return Promise.all(result.rows.map(channelRow).map((channel) => withContacts(channel, args.include)))
      },
      findUnique: findNotificationChannelUnique,
      async create(args: { data: Data; include?: IncludeOption }) {
        await ready()
        const id = String(args.data.id ?? cuid())
        const timestamp = now()
        const { sql, params } = insertReturningSql('NotificationChannel', {
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

        await pool.query(sql, params)
        return requireRow(await findNotificationChannelUnique({ where: { id }, include: args.include }), 'NotificationChannel')
      },
      async update(args: { where: { id: string }; data: Data; include?: IncludeOption }) {
        await ready()
        requireRow(await findNotificationChannelUnique({ where: args.where }), 'NotificationChannel')

        const { sql, params } = updateReturningSql(
          'NotificationChannel',
          { ...args.data, updatedAt: now() },
          'id',
          args.where.id,
        )
        await pool.query(sql, params)
        return requireRow(await findNotificationChannelUnique({ where: args.where, include: args.include }), 'NotificationChannel')
      },
      async delete(args: { where: { id: string } }) {
        await ready()
        const row = requireRow(await findNotificationChannelUnique({ where: args.where }), 'NotificationChannel')
        await pool.query('DELETE FROM "NotificationChannel" WHERE "id" = $1', [args.where.id])
        return channelRow(row)
      },
    },
    notificationContact: {
      async create(args: { data: Data }) {
        await ready()
        const id = String(args.data.id ?? cuid())
        const { sql, params } = insertReturningSql('NotificationContact', {
          id,
          enabled: true,
          createdAt: now(),
          ...args.data,
        })

        const result = await pool.query(sql, params)
        return contactRow(requireRow(result.rows[0], 'NotificationContact'))
      },
      async update(args: { where: WhereUnique; data: Data }) {
        const id = requireRow(args.where.id ?? null, 'NotificationContact')
        await ready()
        requireRow(await queryOne('SELECT * FROM "NotificationContact" WHERE "id" = $1', [id], contactRow), 'NotificationContact')

        const { sql, params } = updateReturningSql('NotificationContact', args.data, 'id', id)
        const result = await pool.query(sql, params)
        return contactRow(requireRow(result.rows[0], 'NotificationContact'))
      },
      async delete(args: { where: WhereUnique }) {
        const id = requireRow(args.where.id ?? null, 'NotificationContact')
        await ready()
        const row = requireRow(
          await queryOne('SELECT * FROM "NotificationContact" WHERE "id" = $1', [id], contactRow),
          'NotificationContact',
        )
        await pool.query('DELETE FROM "NotificationContact" WHERE "id" = $1', [id])
        return row
      },
    },
    notificationSetting: {
      async findUnique(args: { where: { id: string } }) {
        return queryOne('SELECT * FROM "NotificationSetting" WHERE "id" = $1', [args.where.id], settingRow)
      },
      async create(args: { data: Data }) {
        await ready()
        const id = String(args.data.id ?? 'global')
        const timestamp = now()
        const { sql, params } = insertReturningSql('NotificationSetting', {
          id,
          enabled: true,
          dailySummaryEnabled: false,
          dailySummaryTime: '09:00',
          periodicInterval: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...args.data,
        })

        const result = await pool.query(sql, params)
        return settingRow(requireRow(result.rows[0], 'NotificationSetting'))
      },
      async update(args: { where: { id: string }; data: Data }) {
        await ready()
        requireRow(await queryOne('SELECT * FROM "NotificationSetting" WHERE "id" = $1', [args.where.id], settingRow), 'NotificationSetting')

        const { sql, params } = updateReturningSql(
          'NotificationSetting',
          { ...args.data, updatedAt: now() },
          'id',
          args.where.id,
        )
        const result = await pool.query(sql, params)
        return settingRow(requireRow(result.rows[0], 'NotificationSetting'))
      },
    },
    notificationLog: {
      async create(args: { data: Data }) {
        await ready()
        const id = String(args.data.id ?? cuid())
        const { sql, params } = insertReturningSql('NotificationLog', {
          id,
          sentAt: now(),
          ...args.data,
        })

        const result = await pool.query(sql, params)
        return logRow(requireRow(result.rows[0], 'NotificationLog'))
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
      await pool.end()
    },
  }
}
