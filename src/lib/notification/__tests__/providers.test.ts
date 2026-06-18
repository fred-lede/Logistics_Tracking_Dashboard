import { describe, it, expect } from 'vitest'
import { wechatProvider } from '../providers/wechat'
import { whatsappProvider } from '../providers/whatsapp'
import { whatsappWebProvider } from '../providers/whatsapp-web'
import { getSummaryTitle } from '../types'
import type { StatusChangeMessage, OverdueMessage, SummaryMessage } from '../types'

const sampleMessage: StatusChangeMessage = {
  type: 'status_change',
  packageId: '1',
  trackingNumber: 'TN123',
  status: 'IN_TRANSIT',
  events: [{ date: '2024-01-01T00:00:00Z', description: 'Package scanned', location: 'Memphis, TN', status: 'IN_TRANSIT' }],
}

const overdueMessage: OverdueMessage = {
  type: 'overdue',
  packageId: '2',
  trackingNumber: 'TN456',
  status: 'IN_TRANSIT',
  eta: '2023-05-19',
  overdueDays: 3,
}

describe('WeChatProvider', () => {
  it('returns error when no webhook URL configured', async () => {
    const result = await wechatProvider.send({}, [], sampleMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Webhook URL not configured')
  })
})

describe('WhatsAppProvider', () => {
  it('returns error when no API key configured', async () => {
    const result = await whatsappProvider.send({}, [], sampleMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('API key or Phone Number ID not configured')
  })

  it('returns error when no phone number ID configured', async () => {
    const result = await whatsappProvider.send({ apiKey: 'abc' }, [], sampleMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('API key or Phone Number ID not configured')
  })
})

describe('WeChatProvider with overdue', () => {
  it('returns error when no webhook URL configured for overdue message', async () => {
    const result = await wechatProvider.send({}, [], overdueMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Webhook URL not configured')
  })
})

describe('WhatsAppProvider with overdue', () => {
  it('returns error when no API key configured for overdue message', async () => {
    const result = await whatsappProvider.send({}, [], overdueMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('API key or Phone Number ID not configured')
  })
})

describe('WhatsAppWebProvider', () => {
  it('returns error when no _channelId in config', async () => {
    const result = await whatsappWebProvider.send({}, [], sampleMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Channel ID not found in config')
  })
})

describe('WhatsAppWebProvider with overdue', () => {
  it('returns error when no _channelId in config for overdue message', async () => {
    const result = await whatsappWebProvider.send({}, [], overdueMessage)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Channel ID not found in config')
  })
})

describe('getSummaryTitle', () => {
  it('returns Daily Summary for daily subtype', () => {
    const msg: SummaryMessage = {
      type: 'summary',
      summarySubtype: 'daily',
      summaryDate: '2026-06-05',
      packages: [],
    }
    expect(getSummaryTitle(msg)).toBe('Daily Summary - 2026-06-05')
  })

  it('returns Periodic Summary with interval for periodic subtype', () => {
    const msg: SummaryMessage = {
      type: 'summary',
      summarySubtype: 'periodic',
      summaryDate: '2026-06-05 12:00:00',
      periodicInterval: 2,
      packages: [],
    }
    expect(getSummaryTitle(msg)).toBe('Periodic Summary (2h) - 2026-06-05 12:00:00')
  })

  it('returns Daily Summary when periodic has no interval', () => {
    const msg: SummaryMessage = {
      type: 'summary',
      summarySubtype: 'periodic',
      summaryDate: '2026-06-05 12:00:00',
      packages: [],
    }
    expect(getSummaryTitle(msg)).toBe('Daily Summary - 2026-06-05 12:00:00')
  })
})
