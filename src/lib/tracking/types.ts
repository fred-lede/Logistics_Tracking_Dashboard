export interface TrackingEvent {
  date: string
  status: string
  location: string
  description: string
}

export interface SubPackage {
  trackingNumber: string
  status: string
  origin: string | null
  destination: string | null
}

export interface TrackingResult {
  trackingNumber: string
  status: string
  eta: string | null
  origin: string | null
  destination: string | null
  events: TrackingEvent[]
  subPackages?: SubPackage[]
}

export interface TrackingProvider {
  track(trackingNumber: string): Promise<TrackingResult>
}
