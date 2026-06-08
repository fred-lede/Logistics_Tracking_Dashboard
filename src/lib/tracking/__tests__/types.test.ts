import { describe, it, expect } from 'vitest'
import type { TrackingProvider } from '../types'

describe('Tracking types', () => {
  it('TrackingResult interface works with provider', async () => {
    const provider: TrackingProvider = {
      async track(_tn: string) {
        return {
          trackingNumber: _tn,
          status: 'IN_TRANSIT',
          eta: '2026-06-05',
          origin: 'Memphis, TN',
          destination: 'Portland, OR',
          events: [
            {
              date: '2026-06-02',
              status: 'Picked up',
              location: 'Memphis, TN',
              description: 'Package picked up',
            },
          ],
        }
      },
    }
    const result = await provider.track('123')
    expect(result).toHaveProperty('trackingNumber', '123')
    expect(result).toHaveProperty('status', 'IN_TRANSIT')
  })
})
