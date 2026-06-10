export type SortDirection = 'asc' | 'desc'

export type IncludeContactsOption =
  | boolean
  | {
      where?: { enabled?: boolean }
    }

export type IncludeOption = {
  contacts?: IncludeContactsOption
}

export type OrderByOption<T extends string = string> = Partial<Record<T, SortDirection>>

export type PackageRow = {
  id: string
  trackingNumber: string
  carrier: string
  nickname: string | null
  partNumbers: string
  status: string | null
  eta: string | null
  origin: string | null
  destination: string | null
  events: string
  subPackages: string
  lastCheckedAt: Date | null
  autoRefresh: boolean
  aiSummary: string | null
  aiRootCause: string | null
  aiAnalyzedAt: Date | null
  aiDelayRisk: string | null
  createdAt: Date
  updatedAt: Date
}

export type NotificationSettingRow = {
  id: string
  enabled: boolean
  dailySummaryEnabled: boolean
  dailySummaryTime: string
  periodicInterval: number
  lastDailySent: string | null
  lastPeriodicSent: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NotificationChannelRow = {
  id: string
  type: string
  label: string
  enabled: boolean
  mode: string | null
  config: string
  notifyOnStatuses: string
  sendSummary: boolean
  locale: string
  createdAt: Date
  updatedAt: Date
}

export type NotificationContactRow = {
  id: string
  channelId: string
  name: string
  identifier: string
  enabled: boolean
  locale: string | null
  createdAt: Date
}

export type NotificationLogRow = {
  id: string
  packageId: string
  channelId: string
  notificationType: string
  status: string
  success: boolean
  errorMessage: string | null
  sentAt: Date
}

export type LLMSettingRow = {
  id: string
  provider: string
  providerLabel: string | null
  compatMode: string
  locale: string
  apiKey: string | null
  baseUrl: string | null
  model: string
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

export type NotificationChannelWithContacts = NotificationChannelRow & {
  contacts: NotificationContactRow[]
}
