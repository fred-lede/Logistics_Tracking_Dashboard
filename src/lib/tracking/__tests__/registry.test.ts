import { describe, it, expect } from 'vitest'
import { registerProvider, getProvider } from '../registry'
import type { TrackingProvider, TrackingResult } from '../types'

describe('Provider registry', () => {
  it('registers and retrieves a provider', () => {
    const mockProvider: TrackingProvider = {
      async track(tn: string): Promise<TrackingResult> {
        return {
          trackingNumber: tn,
          status: 'DELIVERED',
          eta: null,
          origin: null,
          destination: null,
          events: [],
        }
      },
    }
    registerProvider('test-carrier', mockProvider)
    const retrieved = getProvider('test-carrier')
    expect(retrieved).toBe(mockProvider)
  })

  it('throws for unregistered carrier', () => {
    expect(() => getProvider('nonexistent')).toThrow(
      'No tracking provider registered for carrier: nonexistent'
    )
  })
})
