import { loadSystemSettings } from '@/lib/system-config'
import { createPostgresDbFacade } from './postgres'
import { createDbFacade, createSqliteDbFacade, type DbFacade } from './facade'

export function createActiveDbFacade(): DbFacade {
  const settings = loadSystemSettings()
  if (settings.databaseMode === 'postgresql') return createPostgresDbFacade()
  return createSqliteDbFacade()
}

export const db = createActiveDbFacade()

export { createDbFacade, createSqliteDbFacade }
export type { DbFacade } from './facade'
export { parseJsonArray, parseJsonObject, stringifyJson } from './json'
