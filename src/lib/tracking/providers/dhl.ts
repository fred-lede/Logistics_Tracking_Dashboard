import type { TrackingProvider, TrackingResult, TrackingEvent, SubPackage } from '../types'
import { getDHLApiKey } from '@/lib/carrier-config'

const DHL_BASE_URL = 'https://api-eu.dhl.com/track/shipments'

interface DHLAddress {
  addressLocality?: string
  countryCode?: string
}

interface DHLEvent {
  timestamp: string
  location?: { address: DHLAddress }
  statusCode: string
  status?: string
  description?: string
  remark?: string
}

interface DHLShipment {
  id: string
  service: string
  status: DHLEvent
  origin?: { address: DHLAddress }
  destination?: { address: DHLAddress }
  estimatedTimeOfDelivery?: string
  estimatedTimeOfDeliveryRemark?: string
  events: DHLEvent[]
  details?: {
    totalNumberOfPieces?: number
    pieceIds?: string[]
  }
}

interface DHLResponse {
  shipments?: DHLShipment[]
}

function formatLocation(address?: DHLAddress): string | null {
  if (!address?.addressLocality) return null
  const country = address.countryCode ? `, ${address.countryCode}` : ''
  return `${address.addressLocality}${country}`
}

function mapDHLStatus(statusCode: string, eventStatus?: string): string {
  switch (statusCode) {
    case 'delivered':
      return 'DELIVERED'
    case 'transit':
      if (eventStatus?.includes('OUT_FOR_DELIVERY')) return 'ON_FEDEX_VEHICLE'
      return 'IN_TRANSIT'
    case 'pre-transit':
      return 'PICKED_UP'
    case 'failure':
      if (eventStatus?.toLowerCase().includes('return')) return 'RETURN_TO_SENDER'
      if (eventStatus?.toLowerCase().includes('delivery')) return 'EXCEPTION'
      if (eventStatus?.toLowerCase().includes('delay')) return 'DELAYED'
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export class DHLTrackingProvider implements TrackingProvider {
  async track(trackingNumber: string): Promise<TrackingResult> {
    const apiKey = getDHLApiKey()
    if (!apiKey) {
      throw new Error('DHL API key not configured. Set it in Settings > Carrier API Keys or DHL_API_KEY env var.')
    }

    const url = new URL(DHL_BASE_URL)
    url.searchParams.set('trackingNumber', trackingNumber)
    url.searchParams.set('service', 'express')

    const res = await fetch(url.toString(), {
      headers: {
        'DHL-API-Key': apiKey,
        Accept: 'application/json',
      },
    })

    if (res.status === 401) {
      throw new Error('DHL API key is invalid or not authorized.')
    }

    if (res.status === 429) {
      throw new Error('DHL rate limit exceeded. Please try again later.')
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = (body as { detail?: string }).detail ?? res.statusText
      throw new Error(`DHL API error: ${detail}`)
    }

    const data: DHLResponse = await res.json()
    const shipment = data.shipments?.[0]

    if (!shipment) {
      return {
        trackingNumber,
        status: 'UNKNOWN',
        eta: null,
        origin: null,
        destination: null,
        events: [],
      }
    }

    const events: TrackingEvent[] = (shipment.events ?? []).map((e) => ({
      date: e.timestamp,
      status: mapDHLStatus(e.statusCode, e.status),
      location: formatLocation(e.location?.address) ?? '',
      description: e.description ?? e.remark ?? '',
    }))

    const subPackages: SubPackage[] | undefined = shipment.details?.pieceIds && shipment.details.pieceIds.length > 1
      ? shipment.details.pieceIds.map((id) => ({
          trackingNumber: id,
          status: mapDHLStatus(shipment.status.statusCode, shipment.status.status),
          origin: null,
          destination: null,
        }))
      : undefined

    return {
      trackingNumber,
      status: mapDHLStatus(shipment.status.statusCode, shipment.status.status),
      eta: shipment.estimatedTimeOfDelivery ?? null,
      origin: formatLocation(shipment.origin?.address),
      destination: formatLocation(shipment.destination?.address),
      events,
      subPackages,
    }
  }
}
