import { describe, expect, it } from 'vitest'
import { forbiddenRemoteResponse, isLocalRequest, isMutationMethod } from '@/lib/request-access'

function headers(host: string) {
  return new Headers({ host })
}

describe('request access guard', () => {
  it.each(['localhost:3310', '127.0.0.1:3310', '[::1]:3310'])('allows local host %s', (host) => {
    expect(isLocalRequest(headers(host))).toBe(true)
  })

  it.each(['192.168.1.20:3310', 'dashboard.local:3310'])('blocks remote host %s', (host) => {
    expect(isLocalRequest(headers(host))).toBe(false)
  })

  it('detects mutating methods', () => {
    expect(isMutationMethod('POST')).toBe(true)
    expect(isMutationMethod('PUT')).toBe(true)
    expect(isMutationMethod('DELETE')).toBe(true)
    expect(isMutationMethod('GET')).toBe(false)
  })

  it('returns 403 json for remote forbidden responses', async () => {
    const response = forbiddenRemoteResponse()
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Remote access is read-only' })
  })
})
