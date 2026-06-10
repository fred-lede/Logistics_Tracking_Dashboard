import { describe, expect, it } from 'vitest'
import { buildServerUrls } from '@/lib/system-network'

describe('system network helpers', () => {
  it('always includes localhost url', () => {
    expect(buildServerUrls(3310, [])).toContain('http://localhost:3310')
  })

  it('adds LAN urls for non-internal addresses', () => {
    expect(buildServerUrls(3310, ['192.168.1.20', '10.0.0.5'])).toEqual([
      'http://localhost:3310',
      'http://192.168.1.20:3310',
      'http://10.0.0.5:3310',
    ])
  })
})
