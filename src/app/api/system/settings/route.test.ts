import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemSettings } from '@/lib/system-config'

const state = vi.hoisted(() => ({
  current: null as SystemSettings | null,
}))

vi.mock('@/lib/system-config', async () => {
  const actual = await vi.importActual<typeof import('@/lib/system-config')>('@/lib/system-config')
  state.current = actual.DEFAULT_SYSTEM_SETTINGS
  return {
    ...actual,
    loadSystemSettings: () => state.current,
    saveSystemSettings: (settings: SystemSettings) => {
      state.current = settings
    },
  }
})

vi.mock('@/lib/system-network', () => ({
  buildServerUrls: (port: number) => [`http://localhost:${port}`, `http://192.168.1.20:${port}`],
}))

const { GET, PUT } = await import('./route')

function request(method: string, host: string, body?: unknown) {
  return new Request('http://' + host + '/api/system/settings', {
    method,
    headers: { host, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('/api/system/settings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redacts password in GET response', async () => {
    await PUT(request('PUT', 'localhost:3310', { postgresPassword: 'secret' }))
    const response = await GET(request('GET', 'localhost:3310'))
    const body = await response.json()

    expect(body.postgresPassword).toBeUndefined()
    expect(body.postgresPasswordSet).toBe(true)
  })

  it('includes reachable server urls', async () => {
    const response = await GET(request('GET', 'localhost:3310'))
    const body = await response.json()

    expect(body.serverUrls).toEqual(['http://localhost:3310', 'http://192.168.1.20:3310'])
  })

  it('blocks remote GET because settings are local-only', async () => {
    const response = await GET(request('GET', '192.168.1.20:3310'))
    expect(response.status).toBe(403)
  })
})
