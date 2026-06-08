import { FedExTrackingProvider } from './providers/fedex'
import type { TrackingProvider } from './types'

const providers = new Map<string, TrackingProvider>()

providers.set('fedex', new FedExTrackingProvider())

export function registerProvider(carrier: string, provider: TrackingProvider): void {
  providers.set(carrier, provider)
}

export function getProvider(carrier: string): TrackingProvider {
  const provider = providers.get(carrier)
  if (!provider) {
    throw new Error(`No tracking provider registered for carrier: ${carrier}`)
  }
  return provider
}
