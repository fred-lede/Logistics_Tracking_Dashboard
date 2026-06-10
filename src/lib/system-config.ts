import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type AccessMode = 'standalone' | 'server'
export type DatabaseMode = 'sqlite' | 'postgresql'
export type PostgresSslMode = 'disable' | 'prefer' | 'require'

export const MASKED_SECRET = '••••••••'

export interface SystemSettings {
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

export interface PublicSystemSettings extends Omit<SystemSettings, 'postgresPassword'> {
  postgresPasswordSet: boolean
}

const SYSTEM_CONFIG_FILE = '.system-settings.json'

const isValidPort = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535

const isAccessMode = (value: unknown): value is AccessMode =>
  value === 'standalone' || value === 'server'

const isDatabaseMode = (value: unknown): value is DatabaseMode =>
  value === 'sqlite' || value === 'postgresql'

const isPostgresSslMode = (value: unknown): value is PostgresSslMode =>
  value === 'disable' || value === 'prefer' || value === 'require'

function getDefaultServerHost(accessMode: AccessMode): string {
  return accessMode === 'server' ? '0.0.0.0' : '127.0.0.1'
}

function getConfigDir(): string {
  return process.env.SYSTEM_CONFIG_DIR || process.env.CARRIER_CONFIG_DIR || process.cwd()
}

export function getSystemConfigPath(): string {
  return join(getConfigDir(), SYSTEM_CONFIG_FILE)
}

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

export function normalizeSystemSettings(input: Partial<SystemSettings>): SystemSettings {
  const accessMode = isAccessMode(input.accessMode) ? input.accessMode : DEFAULT_SYSTEM_SETTINGS.accessMode
  const databaseMode = isDatabaseMode(input.databaseMode)
    ? input.databaseMode
    : DEFAULT_SYSTEM_SETTINGS.databaseMode
  const postgresSslMode = isPostgresSslMode(input.postgresSslMode)
    ? input.postgresSslMode
    : DEFAULT_SYSTEM_SETTINGS.postgresSslMode

  const serverHost =
    typeof input.serverHost === 'string' && input.serverHost
      ? input.serverHost
      : getDefaultServerHost(accessMode)

  return {
    accessMode,
    serverHost,
    serverPort: isValidPort(input.serverPort) ? input.serverPort : DEFAULT_SYSTEM_SETTINGS.serverPort,
    databaseMode,
    sqlitePath:
      typeof input.sqlitePath === 'string' && input.sqlitePath
        ? input.sqlitePath
        : DEFAULT_SYSTEM_SETTINGS.sqlitePath,
    postgresHost:
      typeof input.postgresHost === 'string' && input.postgresHost
        ? input.postgresHost
        : DEFAULT_SYSTEM_SETTINGS.postgresHost,
    postgresPort: isValidPort(input.postgresPort) ? input.postgresPort : DEFAULT_SYSTEM_SETTINGS.postgresPort,
    postgresDatabase:
      typeof input.postgresDatabase === 'string' && input.postgresDatabase
        ? input.postgresDatabase
        : DEFAULT_SYSTEM_SETTINGS.postgresDatabase,
    postgresUser:
      typeof input.postgresUser === 'string' && input.postgresUser
        ? input.postgresUser
        : DEFAULT_SYSTEM_SETTINGS.postgresUser,
    postgresPassword:
      typeof input.postgresPassword === 'string' ? input.postgresPassword : DEFAULT_SYSTEM_SETTINGS.postgresPassword,
    postgresSslMode,
  }
}

export function loadSystemSettings(): SystemSettings {
  const path = getSystemConfigPath()
  let raw: string

  try {
    raw = readFileSync(path, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return normalizeSystemSettings(DEFAULT_SYSTEM_SETTINGS)
    }
    throw error
  }

  try {
    return normalizeSystemSettings(JSON.parse(raw) as Partial<SystemSettings>)
  } catch (cause) {
    throw new Error(`Invalid system settings file: ${path}`, { cause })
  }
}

export function saveSystemSettings(settings: SystemSettings): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(getSystemConfigPath(), JSON.stringify(normalizeSystemSettings(settings), null, 2))
}

export function updateSystemSettings(
  existing: SystemSettings,
  update: Partial<SystemSettings>,
): SystemSettings {
  const next: Partial<SystemSettings> = {
    ...existing,
    ...update,
  }

  if (update.postgresPassword === MASKED_SECRET) {
    next.postgresPassword = existing.postgresPassword
  }

  const nextAccessMode = isAccessMode(update.accessMode) ? update.accessMode : existing.accessMode
  const accessModeChanged =
    isAccessMode(update.accessMode) && update.accessMode !== existing.accessMode
  const serverHostSubmitted = Object.prototype.hasOwnProperty.call(update, 'serverHost')
  if (accessModeChanged && !serverHostSubmitted) {
    const existingHostWasDefault =
      !existing.serverHost || existing.serverHost === getDefaultServerHost(existing.accessMode)
    if (existingHostWasDefault) {
      next.serverHost = getDefaultServerHost(nextAccessMode)
    }
  }

  return normalizeSystemSettings(next)
}

export function getPublicSystemSettings(
  settings: SystemSettings = loadSystemSettings(),
): PublicSystemSettings {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { postgresPassword, ...rest } = normalizeSystemSettings(settings)

  return {
    ...rest,
    postgresPasswordSet: Boolean(postgresPassword),
  }
}
