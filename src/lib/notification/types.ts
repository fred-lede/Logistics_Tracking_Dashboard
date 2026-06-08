import type { TrackingEvent } from '@/lib/tracking/types'
import type { DelayRisk } from '@/lib/llm/types'

export interface StatusChangeMessage {
  type: 'status_change'
  packageId: string
  trackingNumber: string
  nickname?: string | null
  status: string
  eta?: string | null
  origin?: string | null
  destination?: string | null
  events: TrackingEvent[]
  aiSummary?: string | null
  aiRootCause?: string | null
  aiDelayRisk?: DelayRisk | null
}

export type SummarySubtype = 'daily' | 'periodic'

export function getSummaryTitle(message: SummaryMessage): string {
  if (message.summarySubtype === 'periodic' && message.periodicInterval) {
    return `Periodic Summary (${message.periodicInterval}h) - ${message.summaryDate}`
  }
  return `Daily Summary - ${message.summaryDate}`
}

export interface SummaryMessage {
  type: 'summary'
  summarySubtype: 'daily' | 'periodic'
  summaryDate: string
  periodicInterval?: number
  packages: {
    trackingNumber: string
    nickname?: string | null
    status: string
    destination?: string | null
    eta?: string | null
    lastEvent?: string | null
    aiSummary?: string | null
  }[]
}

export interface OverdueMessage {
  type: 'overdue'
  packageId: string
  trackingNumber: string
  nickname?: string | null
  status: string
  eta: string | null
  overdueDays: number
  aiSummary?: string | null
  aiRootCause?: string | null
  aiDelayRisk?: DelayRisk | null
}

export type NotificationMessage = StatusChangeMessage | SummaryMessage | OverdueMessage

export interface ContactInfo {
  name: string
  identifier: string
}

export interface NotificationResult {
  success: boolean
  error?: string
}

export interface NotificationProvider {
  channelType: string
  send(
    config: Record<string, unknown>,
    contacts: ContactInfo[],
    message: NotificationMessage
  ): Promise<NotificationResult>
}
