import type { NotificationProvider } from './types'

const GLOBAL_KEY = '__fedex_notif_registry'

class NotificationProviderRegistry {
  private providers = new Map<string, NotificationProvider>()

  registerProvider(provider: NotificationProvider): void {
    this.providers.set(provider.channelType, provider)
  }

  getProvider(channelType: string): NotificationProvider | undefined {
    return this.providers.get(channelType)
  }

  getAllProviders(): NotificationProvider[] {
    return Array.from(this.providers.values())
  }
}

function getRegistry(): NotificationProviderRegistry {
  const g = globalThis as Record<string, unknown>
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new NotificationProviderRegistry()
  }
  return g[GLOBAL_KEY] as NotificationProviderRegistry
}

export const notificationRegistry = getRegistry()
