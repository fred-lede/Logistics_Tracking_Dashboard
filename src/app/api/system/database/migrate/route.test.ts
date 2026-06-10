import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/migration', () => ({
  dryRunSqliteToPostgres: vi.fn().mockResolvedValue({ ok: true, summary: { totalSource: 1, totalTarget: 0 } }),
  migrateSqliteToPostgres: vi.fn().mockResolvedValue({ ok: true, results: { Package: { upserted: 1 } } }),
}))

const { POST } = await import('./route')

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
