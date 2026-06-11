import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

function isServerMode(): boolean {
  try {
    const configDir = process.env.SYSTEM_CONFIG_DIR || process.cwd()
    const configPath = join(configDir, '.system-settings.json')
    if (!existsSync(configPath)) return false
    const cfg = JSON.parse(readFileSync(configPath, 'utf-8'))
    return cfg.accessMode === 'server'
  } catch {
    return false
  }
}

export function forbiddenRemoteResponse() {
  return NextResponse.json({ error: 'Remote access is read-only' }, { status: 403 })
}

export function requireLocalRequest(headers: Headers) {
  if (isServerMode()) return null
  if (isLocalRequest(headers)) return null
  return forbiddenRemoteResponse()
}
