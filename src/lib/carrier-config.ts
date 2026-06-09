import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

export interface CarrierConfig {
  fedexApiKey: string
  fedexApiSecret: string
}

function getConfigDir(): string {
  return process.env.CARRIER_CONFIG_DIR || process.cwd()
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
