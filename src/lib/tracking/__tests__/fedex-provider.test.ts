import { describe, it, expect, vi } from 'vitest'
import { FedExTrackingProvider } from '../providers/fedex'

vi.mock('../../carrier-config', () => ({
  getFedExCredentials: () => ({ apiKey: '', apiSecret: '' }),
  getFedExBaseUrl: () => 'https://apis-sandbox.fedex.com',
}))

describe('FedExTrackingProvider', () => {
  it('requires API credentials to be set', async () => {
    const provider = new FedExTrackingProvider()
    await expect(provider.track('794798798798')).rejects.toThrow()
  })
})
