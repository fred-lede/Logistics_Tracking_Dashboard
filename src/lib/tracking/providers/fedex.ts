import type { TrackingProvider, TrackingResult, TrackingEvent } from '../types'

export function safeParseEvents(json: string | null | undefined): TrackingEvent[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const FEDEX_BASE_URL = process.env.FEDEX_ENV === 'production'
  ? 'https://apis.fedex.com'
  : 'https://apis-sandbox.fedex.com'

interface FedExOAuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface FedExTrackingOutput {
  completeTrackResults?: Array<{
    trackingNumber: string
    trackResults?: Array<{
      trackingNumberInfo?: { trackingNumber: string }
      latestStatusDetail?: {
        statusByLocale: string
        code: string
        description: string
        derivedCode?: string
        scanLocation?: { city?: string; stateOrProvinceCode?: string; countryCode?: string }
      }
      dateAndTimes?: Array<{
        type: string
        dateTime: string
      }>
  scanEvents?: Array<{
    date: string
    derivedStatus: string
    derivedCode?: string
    scanLocation?: { city: string; stateOrProvinceCode?: string; countryCode: string }
    eventDescription: string
  }>
      destinationLocation?: {
        locationContactAndAddress?: {
          address?: { city: string; stateOrProvinceCode: string; countryCode: string }
        }
      }
      originLocation?: {
        locationContactAndAddress?: {
          address?: { city: string; stateOrProvinceCode: string; countryCode: string }
        }
      }
      deliveryDetails?: {
        estimatedDeliveryDate?: string
        actualDeliveryDate?: string
      }
    }>
  }>
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} environment variable`)
  }
  return value
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken
  }

  const apiKey = requireEnv('FEDEX_API_KEY')
  const apiSecret = requireEnv('FEDEX_API_SECRET')

  const res = await fetch(
    `${FEDEX_BASE_URL}/oauth/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: apiSecret,
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`FedEx OAuth failed: ${res.status} ${res.statusText}`)
  }

  const data: FedExOAuthResponse = await res.json()
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.accessToken
}

function mapFedExStatus(derivedCode?: string): string {
  const statusMap: Record<string, string> = {
    // Short codes (sandbox)
    OC: 'ON_FEDEX_VEHICLE',
    PU: 'PICKED_UP',
    IT: 'IN_TRANSIT',
    DE: 'DELIVERED',
    EX: 'EXCEPTION',
    DL: 'DELAYED',
    RS: 'RETURN_TO_SENDER',
    HL: 'IN_TRANSIT',
    FD: 'UNKNOWN',
    SE: 'EXCEPTION',
    RR: 'UNKNOWN',
    // Long codes (production)
    DELIVERED: 'DELIVERED',
    IN_TRANSIT: 'IN_TRANSIT',
    AT_PICKUP: 'PICKED_UP',
    ON_FEDEX_VEHICLE: 'ON_FEDEX_VEHICLE',
    EXCEPTION: 'EXCEPTION',
    DELAYED: 'DELAYED',
    RETURN_TO_SENDER: 'RETURN_TO_SENDER',
    PICKUP_AVAILABLE: 'PICKUP_AVAILABLE',
    // Human-readable derivedStatus values (FedEx sandbox scanEvents)
    'In transit': 'IN_TRANSIT',
    'Picked up': 'PICKED_UP',
    'On FedEx vehicle': 'ON_FEDEX_VEHICLE',
    'Delivered': 'DELIVERED',
    'Exception': 'EXCEPTION',
    'Delayed': 'DELAYED',
    'Return to sender': 'RETURN_TO_SENDER',
    'Shipment information sent to FedEx': 'PICKED_UP',
    'Initiated': 'PICKED_UP',
  }
  return statusMap[derivedCode ?? ''] ?? 'UNKNOWN'
}

export class FedExTrackingProvider implements TrackingProvider {
  async track(trackingNumber: string): Promise<TrackingResult> {
    const token = await getAccessToken()

    const res = await fetch(`${FEDEX_BASE_URL}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        trackingInfo: [{ trackingNumberInfo: { trackingNumber } }],
        includeDetailedScans: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`FedEx Track API error: ${res.status} ${res.statusText}`)
    }

    const data: { output: FedExTrackingOutput } = await res.json()
    const allResults =
      data.output?.completeTrackResults?.[0]?.trackResults
    const trackResult = allResults?.[0]

    if (!trackResult) {
      throw new Error(`No tracking data found for: ${trackingNumber}`)
    }

    // Collect sub-packages from additional trackResults
    const subPackages = (allResults ?? []).slice(1).map((tr) => {
      const latestStatus = tr.latestStatusDetail
      const origin = tr.originLocation?.locationContactAndAddress?.address
      const destination = tr.destinationLocation?.locationContactAndAddress?.address
      return {
        trackingNumber:
          tr.trackingNumberInfo?.trackingNumber ?? trackingNumber,
        status: mapFedExStatus(latestStatus?.derivedCode),
        origin: formatLocation(origin),
        destination: formatLocation(destination),
      }
    })

    const events: TrackingEvent[] =
      trackResult.scanEvents?.map((s) => {
        const loc = s.scanLocation
        const location = loc
          ? loc.stateOrProvinceCode
            ? `${loc.city}, ${loc.stateOrProvinceCode}`
            : loc.city
          : ''
        return {
          date: s.date,
          status: mapFedExStatus(s.derivedCode ?? s.derivedStatus),
          location,
          description: s.eventDescription,
        }
      }) ?? []

    const origin = trackResult.originLocation?.locationContactAndAddress?.address
    const destination = trackResult.destinationLocation?.locationContactAndAddress?.address
    const latestStatus = trackResult.latestStatusDetail
    const delivery = trackResult.deliveryDetails

    function formatLocation(
      addr?: { city?: string; stateOrProvinceCode?: string; countryCode?: string }
    ): string | null {
      if (!addr?.city) return null
      return addr.stateOrProvinceCode
        ? `${addr.city}, ${addr.stateOrProvinceCode}`
        : addr.city
    }

    // Fall back to latest scan location when destination is unknown
    const destLocation = formatLocation(destination) ?? formatLocation(latestStatus?.scanLocation)

    // Fall back to ESTIMATED_DELIVERY date or latest scan date
    const deliveryDate = delivery?.estimatedDeliveryDate ?? delivery?.actualDeliveryDate
    const estimatedDelivery = trackResult.dateAndTimes?.find(
      (d: { type: string; dateTime: string }) => d.type === 'ESTIMATED_DELIVERY'
    )?.dateTime ?? deliveryDate ?? events[0]?.date ?? null

    return {
      trackingNumber,
      status: mapFedExStatus(latestStatus?.derivedCode),
      eta: estimatedDelivery,
      origin: formatLocation(origin),
      destination: destLocation,
      events,
      subPackages: subPackages.length > 0 ? subPackages : undefined,
    }
  }
}
