import { afterEach, describe, expect, it, vi } from 'vitest'

const mockNetworkInterfaces = vi.fn()

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')

  return {
    ...actual,
    default: {
      ...actual,
      networkInterfaces: mockNetworkInterfaces,
    },
    networkInterfaces: mockNetworkInterfaces,
  }
})

const { buildServerUrls, getLanIPv4Addresses } = await import('@/lib/system-network')

describe('system network helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('always includes localhost url', () => {
    expect(buildServerUrls(3310, [])).toContain('http://localhost:3310')
  })

  it('adds LAN urls for non-internal addresses', () => {
    expect(buildServerUrls(3310, ['192.168.1.20', '10.0.0.5'])).toEqual([
      'http://localhost:3310',
      'http://192.168.1.20:3310',
      'http://10.0.0.5:3310',
    ])
  })

  it('filters lan IPv4 addresses from network interfaces safely', () => {
    mockNetworkInterfaces.mockReturnValue({
      eth0: [
        { address: '192.168.1.20', family: 'IPv4', internal: false },
        undefined,
        null,
      ],
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      wifi: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
    } as ReturnType<typeof mockNetworkInterfaces>)

    expect(getLanIPv4Addresses()).toEqual(['192.168.1.20'])
  })
})
