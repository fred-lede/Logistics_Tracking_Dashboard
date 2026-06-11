import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DHLTrackingProvider } from '../providers/dhl'

const mockGetDHLApiKey = vi.fn(() => 'test-api-key')
vi.mock('../../carrier-config', () => ({
  getDHLApiKey: (...args: unknown[]) => mockGetDHLApiKey(...args),
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: '1234567890',
    service: 'express',
    status: {
      timestamp: '2024-03-01T10:00:00Z',
      location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
      statusCode: 'transit',
      status: 'IN_TRANSIT',
      description: 'Shipment is in transit',
    },
    origin: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
    destination: { address: { addressLocality: 'AMSTERDAM', countryCode: 'NL' } },
    estimatedTimeOfDelivery: '2024-03-03T00:00:00Z',
    events: [
      {
        timestamp: '2024-03-01T08:00:00Z',
        location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
        statusCode: 'pre-transit',
        status: 'PICKED_UP',
        description: 'Shipment picked up',
      },
      {
        timestamp: '2024-03-01T10:00:00Z',
        location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
        statusCode: 'transit',
        status: 'IN_TRANSIT',
        description: 'Shipment is in transit',
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('DHLTrackingProvider', () => {
  it('throws when API key is not configured', async () => {
    mockGetDHLApiKey.mockReturnValueOnce('')
    const provider = new DHLTrackingProvider()
    await expect(provider.track('123')).rejects.toThrow('DHL API key not configured')
  })

  it('returns tracking result for a valid tracking number', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ shipments: [mockShipment()] }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('1234567890')

    expect(result.trackingNumber).toBe('1234567890')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.eta).toBe('2024-03-03T00:00:00Z')
    expect(result.origin).toBe('FRANKFURT, DE')
    expect(result.destination).toBe('AMSTERDAM, NL')
    expect(result.events).toHaveLength(2)
    expect(result.events[0].status).toBe('PICKED_UP')
    expect(result.events[1].status).toBe('IN_TRANSIT')
  })

  it('handles 404 / not found gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ shipments: [] }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('nonexistent')

    expect(result.status).toBe('UNKNOWN')
    expect(result.events).toEqual([])
  })

  it('handles 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    })
    const provider = new DHLTrackingProvider()
    await expect(provider.track('123')).rejects.toThrow('DHL API key is invalid')
  })

  it('handles 429 rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({}),
    })
    const provider = new DHLTrackingProvider()
    await expect(provider.track('123')).rejects.toThrow('DHL rate limit exceeded')
  })

  it('handles delivered status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          status: {
            timestamp: '2024-03-02T14:00:00Z',
            location: { address: { addressLocality: 'AMSTERDAM', countryCode: 'NL' } },
            statusCode: 'delivered',
            status: 'DELIVERED',
            description: 'Shipment delivered',
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.status).toBe('DELIVERED')
  })

  it('handles out-for-delivery via ON_FEDEX_VEHICLE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          status: {
            timestamp: '2024-03-02T08:00:00Z',
            location: { address: { addressLocality: 'AMSTERDAM', countryCode: 'NL' } },
            statusCode: 'transit',
            status: 'OUT_FOR_DELIVERY',
            description: 'Out for delivery',
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.status).toBe('ON_FEDEX_VEHICLE')
  })

  it('handles failure -> return to sender', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          status: {
            timestamp: '2024-03-02T09:00:00Z',
            location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
            statusCode: 'failure',
            status: 'RETURN_TO_SENDER',
            description: 'Return to sender',
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.status).toBe('RETURN_TO_SENDER')
  })

  it('handles multi-piece shipments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          details: {
            totalNumberOfPieces: 3,
            pieceIds: ['PID001', 'PID002', 'PID003'],
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')

    expect(result.subPackages).toBeDefined()
    expect(result.subPackages).toHaveLength(3)
    expect(result.subPackages![0].trackingNumber).toBe('PID001')
    expect(result.subPackages![0].status).toBe('IN_TRANSIT')
  })

  it('omits subPackages for single-piece shipments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          details: { totalNumberOfPieces: 1, pieceIds: ['PID001'] },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.subPackages).toBeUndefined()
  })
})
