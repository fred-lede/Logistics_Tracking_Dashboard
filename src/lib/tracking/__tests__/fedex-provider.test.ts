import { describe, it, expect } from 'vitest'
import { FedExTrackingProvider } from '../providers/fedex'

describe('FedExTrackingProvider', () => {
  it('requires API credentials to be set', async () => {
    const provider = new FedExTrackingProvider()
    await expect(provider.track('794798798798')).rejects.toThrow()
  })
})
