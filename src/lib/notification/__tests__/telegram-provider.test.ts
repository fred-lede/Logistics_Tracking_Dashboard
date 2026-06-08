import { describe, it, expect } from 'vitest'
import { telegramProvider } from '../providers/telegram'
import type { StatusChangeMessage } from '../types'

describe('TelegramProvider', () => {
  it('returns error when no bot token configured', async () => {
    const message: StatusChangeMessage = {
      type: 'status_change',
      packageId: '1',
      trackingNumber: 'TN123',
      status: 'IN_TRANSIT',
      events: [],
    }
    const result = await telegramProvider.send(
      {},
      [{ name: 'Test', identifier: '12345' }],
      message
    )
    expect(result.success).toBe(false)
    expect(result.error).toBe('Bot token not configured')
  })
})
