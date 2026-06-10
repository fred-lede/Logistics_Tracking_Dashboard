import { describe, expect, it } from 'vitest'
import { POST } from './route'

describe('remote package mutations', () => {
  it('blocks package creation from remote dashboard users', async () => {
    const request = new Request('http://192.168.1.20:3310/api/packages', {
      method: 'POST',
      headers: { host: '192.168.1.20:3310', 'content-type': 'application/json' },
      body: JSON.stringify({ trackingNumber: '794798798798' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(403)
  })
})
