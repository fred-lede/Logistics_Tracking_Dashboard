import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

export interface CarrierConfig {
  fedexApiKey: string
  fedexApiSecret: string
  fedexProduction?: boolean
  dhlApiKey: string
}

function getConfigDir(): string {
  if (process.env.CARRIER_CONFIG_DIR) return process.env.CARRIER_CONFIG_DIR
  let dir = process.cwd()
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(dir, '.carrier-creds.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function getConfigPath(): string {
  return getConfigDir() + '/.carrier-creds.json'
}

export function loadCarrierConfig(): CarrierConfig | null {
  try {
    const raw = readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveCarrierConfig(config: CarrierConfig): void {
  const dir = getConfigDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
}

export function getFedExCredentials(): { apiKey: string; apiSecret: string } {
  const fromEnv = {
    apiKey: process.env.FEDEX_API_KEY || '',
    apiSecret: process.env.FEDEX_API_SECRET || '',
  }
  if (fromEnv.apiKey && fromEnv.apiSecret) {
    return fromEnv
  }
  const fromFile = loadCarrierConfig()
  if (fromFile?.fedexApiKey && fromFile?.fedexApiSecret) {
    return { apiKey: fromFile.fedexApiKey, apiSecret: fromFile.fedexApiSecret }
  }
  return fromEnv
}

export function getFedExBaseUrl(): string {
  if (process.env.FEDEX_ENV === 'production') {
    return 'https://apis.fedex.com'
  }
  const fromFile = loadCarrierConfig()
  if (fromFile?.fedexProduction) {
    return 'https://apis.fedex.com'
  }
  return 'https://apis-sandbox.fedex.com'
}

export function getDHLApiKey(): string {
  const fromEnv = process.env.DHL_API_KEY || ''
  if (fromEnv) return fromEnv
  const fromFile = loadCarrierConfig()
  if (fromFile?.dhlApiKey) return fromFile.dhlApiKey
  return ''
}
