import { NextResponse } from 'next/server'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function hostName(value: string | null) {
  if (!value) return ''
  if (value.startsWith('[')) return value.split(']')[0] + ']'
  return value.split(':')[0] ?? ''
}

export function isLocalRequest(headers: Headers) {
  return LOCAL_HOSTS.has(hostName(headers.get('host')).toLowerCase())
}

export function isMutationMethod(method: string) {
  return MUTATION_METHODS.has(method.toUpperCase())
}

export function forbiddenRemoteResponse() {
  return NextResponse.json({ error: 'Remote access is read-only' }, { status: 403 })
}

export function requireLocalRequest(headers: Headers) {
  if (isLocalRequest(headers)) return null
  return forbiddenRemoteResponse()
}
