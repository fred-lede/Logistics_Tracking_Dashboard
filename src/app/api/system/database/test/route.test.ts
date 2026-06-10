import { describe, expect, it, vi } from 'vitest'

const poolMocks = vi.hoisted(() => ({
  query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
  end: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return {
    query: poolMocks.query,
    end: poolMocks.end,
    }
  }),
}))

const { POST } = await import('./route')

function req(host = 'localhost:3310') {
  return new Request('http://' + host + '/api/system/database/test', {
    method: 'POST',
    headers: { host },
  })
}

describe('/api/system/database/test', () => {
  it('blocks remote callers', async () => {
    const response = await POST(req('192.168.1.20:3310'))
    expect(response.status).toBe(403)
  })

  it('returns success for valid connection', async () => {
    const response = await POST(req())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })
})
