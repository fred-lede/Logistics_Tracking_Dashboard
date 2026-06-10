import { describe, expect, it } from 'vitest'
import { postgresPoolConfig } from '@/lib/db/postgres'
import type { SystemSettings } from '@/lib/system-config'

describe('postgres facade helpers', () => {
  it('maps system settings to pg pool config', () => {
    const settings: SystemSettings = {
      accessMode: 'server',
      serverHost: '0.0.0.0',
      serverPort: 3310,
      databaseMode: 'postgresql',
      sqlitePath: 'file:./dev.db',
      postgresHost: 'db.example.test',
      postgresPort: 5433,
      postgresDatabase: 'logistics',
      postgresUser: 'tracker',
      postgresPassword: 'secret',
      postgresSslMode: 'require',
    }

    expect(postgresPoolConfig(settings)).toEqual({
      host: 'db.example.test',
      port: 5433,
      database: 'logistics',
      user: 'tracker',
      password: 'secret',
      ssl: { rejectUnauthorized: false },
    })
  })
})
