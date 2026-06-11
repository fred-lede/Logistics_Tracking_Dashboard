import { FedExTrackingProvider } from './providers/fedex'
import { DHLTrackingProvider } from './providers/dhl'
import type { TrackingProvider } from './types'

const providers = new Map<string, TrackingProvider>()

providers.set('fedex', new FedExTrackingProvider())
providers.set('dhl', new DHLTrackingProvider())

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
