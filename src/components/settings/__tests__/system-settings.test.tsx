import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../../messages/en.json'
import { SystemSettings } from '../system-settings'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    accessMode: 'server',
    serverHost: '0.0.0.0',
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
