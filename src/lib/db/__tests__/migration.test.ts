import { describe, expect, it } from 'vitest'
import { migrationSqlitePath, migrationTableOrder, summarizeMigrationCounts } from '@/lib/db/migration'

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

  it('uses configured sqlite path as migration source', () => {
    expect(migrationSqlitePath({ sqlitePath: 'file:/tmp/source.db' })).toBe('/tmp/source.db')
  })
})
