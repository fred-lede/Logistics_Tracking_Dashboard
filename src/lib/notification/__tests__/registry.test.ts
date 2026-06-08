import { describe, it, expect } from 'vitest'
import { notificationRegistry } from '../registry'
import type { NotificationProvider, NotificationResult } from '../types'

describe('NotificationProviderRegistry', () => {
  it('registers and retrieves a provider', () => {
    const mock: NotificationProvider = {
      channelType: 'test-mock-registry',
      async send(): Promise<NotificationResult> {
        return { success: true }
      },
    }
    notificationRegistry.registerProvider(mock)
    expect(notificationRegistry.getProvider('test-mock-registry')).toBe(mock)
  })

  it('returns undefined for unregistered type', () => {
    expect(notificationRegistry.getProvider('no-such-provider-xyz')).toBeUndefined()
  })

  it('getAllProviders returns array of registered providers', () => {
    const all = notificationRegistry.getAllProviders()
    expect(Array.isArray(all)).toBe(true)
    expect(all.length).toBeGreaterThanOrEqual(1)
  })
})
