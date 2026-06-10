import { describe, expect, it } from 'vitest'
import { postgresSchemaSql } from '@/lib/db/postgres-schema'

describe('postgres schema sql', () => {
  it('contains all app tables', () => {
    for (const table of [
      'Package',
      'NotificationSetting',
      'NotificationChannel',
      'NotificationContact',
      'NotificationLog',
      'LLMSetting',
    ]) {
      expect(postgresSchemaSql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`)
    }
  })

  it('keeps package tracking numbers unique', () => {
    expect(postgresSchemaSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Package_trackingNumber_key"')
  })
})
