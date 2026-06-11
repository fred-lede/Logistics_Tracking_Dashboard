# DHL Express Tracking Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DHL Express package tracking via the Shipment Tracking - Unified API.

**Architecture:** New `DHLTrackingProvider` implements `TrackingProvider` interface, registered as `'dhl'` in the provider registry. Uses simple API-key auth. Extends existing carrier config for DHL API key storage. Add-package form gets a carrier selector.

**Tech Stack:** TypeScript, Vitest, DHL Unified Tracking API (v1.5.8)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/tracking/providers/dhl.ts` | **Create** | DHLTrackingProvider — calls Unified API, maps statuses, returns TrackingResult |
| `src/lib/tracking/providers/fedex.ts` | No change | (existing, unchanged) |
| `src/lib/tracking/registry.ts` | **Edit** | Register `'dhl'` → `DHLTrackingProvider` |
| `src/lib/carrier-config.ts` | **Edit** | Add `dhlApiKey` to `CarrierConfig`, add `getDHLApiKey()` getter |
| `src/app/api/settings/carrier/route.ts` | **Edit** | Handle `dhlApiKey` in GET/PUT |
| `src/components/settings/carrier-settings.tsx` | **Edit** | Add DHL API key input |
| `src/app/api/packages/route.ts` | **Edit** | Accept `carrier` from body, use `getProvider(carrier)` |
| `src/components/add-package-form.tsx` | **Edit** | Add carrier dropdown |
| `messages/en.json` | **Edit** | Add i18n keys |
| `messages/zh-TW.json` | **Edit** | Add i18n keys |
| `messages/zh-CN.json` | **Edit** | Add i18n keys |
| `messages/es-MX.json` | **Edit** | Add i18n keys |
| `src/lib/tracking/__tests__/dhl-provider.test.ts` | **Create** | Unit tests for DHLTrackingProvider |

---

### Task 1: Extend carrier config with DHL API key

**Files:**
- Modify: `src/lib/carrier-config.ts`

- [ ] **Step 1: Add `dhlApiKey` to interface and `getDHLApiKey()` getter**

Edit `src/lib/carrier-config.ts`:

```typescript
export interface CarrierConfig {
  fedexApiKey: string
  fedexApiSecret: string
  fedexProduction?: boolean
  dhlApiKey: string
}

// ... existing functions ...

export function getDHLApiKey(): string {
  const fromEnv = process.env.DHL_API_KEY || ''
  if (fromEnv) return fromEnv
  const fromFile = loadCarrierConfig()
  if (fromFile?.dhlApiKey) return fromFile.dhlApiKey
  return ''
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit` (or `npm run typecheck` if available)

Expected: No errors.

---

### Task 2: Update settings API to handle DHL API key

**Files:**
- Modify: `src/app/api/settings/carrier/route.ts`

- [ ] **Step 1: Extend GET and PUT to handle `dhlApiKey`**

Edit `src/app/api/settings/carrier/route.ts`:

```typescript
export async function GET(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const config = loadCarrierConfig()
  return NextResponse.json({
    fedexApiKey: config?.fedexApiKey ? MASKED : '',
    fedexApiSecret: config?.fedexApiSecret ? MASKED : '',
    fedexProduction: config?.fedexProduction ?? false,
    dhlApiKey: config?.dhlApiKey ? MASKED : '',
  })
}

export async function PUT(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json()
  const existing = loadCarrierConfig() || { fedexApiKey: '', fedexApiSecret: '', dhlApiKey: '' }

  if (body.fedexApiKey !== undefined) {
    existing.fedexApiKey = body.fedexApiKey === MASKED ? existing.fedexApiKey : body.fedexApiKey
  }
  if (body.fedexApiSecret !== undefined) {
    existing.fedexApiSecret = body.fedexApiSecret === MASKED ? existing.fedexApiSecret : body.fedexApiSecret
  }
  if (body.fedexProduction !== undefined) {
    existing.fedexProduction = body.fedexProduction
  }
  if (body.dhlApiKey !== undefined) {
    existing.dhlApiKey = body.dhlApiKey === MASKED ? existing.dhlApiKey : body.dhlApiKey
  }

  saveCarrierConfig(existing)
  return NextResponse.json({
    fedexApiKey: existing.fedexApiKey ? MASKED : '',
    fedexApiSecret: existing.fedexApiSecret ? MASKED : '',
    fedexProduction: existing.fedexProduction ?? false,
    dhlApiKey: existing.dhlApiKey ? MASKED : '',
  })
}
```

---

### Task 3: Update settings UI with DHL API key field

**Files:**
- Modify: `src/components/settings/carrier-settings.tsx`

- [ ] **Step 1: Add DHL API key input**

Edit `src/components/settings/carrier-settings.tsx`:

Change the interface:
```typescript
interface CarrierSettingsData {
  fedexApiKey: string
  fedexApiSecret: string
  fedexProduction: boolean
  dhlApiKey: string
}
```

Add a DHL API key section after the production/sandbox toggle and before the save button:

```typescript
        <hr className="border-gray-200" />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="dhl-key">
            {t('dhlApiKey')}
          </label>
          <input
            id="dhl-key"
            type="password"
            value={data.dhlApiKey}
            onChange={(e) => setData({ ...data, dhlApiKey: e.target.value })}
            placeholder="DHL_API_KEY"
            className={inputCls}
          />
        </div>
```

---

### Task 4: Create DHLTrackingProvider

**Files:**
- Create: `src/lib/tracking/providers/dhl.ts`
- Modify: `src/lib/tracking/registry.ts`

- [ ] **Step 1: Write `src/lib/tracking/providers/dhl.ts`**

```typescript
import type { TrackingProvider, TrackingResult, TrackingEvent, SubPackage } from '../types'
import { getDHLApiKey } from '@/lib/carrier-config'

const DHL_BASE_URL = 'https://api-eu.dhl.com/track/shipments'

interface DHLAddress {
  addressLocality?: string
  countryCode?: string
}

interface DHLEvent {
  timestamp: string
  location?: { address: DHLAddress }
  statusCode: string
  status?: string
  description?: string
  remark?: string
}

interface DHLShipment {
  id: string
  service: string
  status: DHLEvent
  origin?: { address: DHLAddress }
  destination?: { address: DHLAddress }
  estimatedTimeOfDelivery?: string
  estimatedTimeOfDeliveryRemark?: string
  events: DHLEvent[]
  details?: {
    totalNumberOfPieces?: number
    pieceIds?: string[]
  }
}

interface DHLResponse {
  shipments?: DHLShipment[]
}

function formatLocation(address?: DHLAddress): string | null {
  if (!address?.addressLocality) return null
  const country = address.countryCode ? `, ${address.countryCode}` : ''
  return `${address.addressLocality}${country}`
}

function mapDHLStatus(statusCode: string, eventStatus?: string): string {
  switch (statusCode) {
    case 'delivered':
      return 'DELIVERED'
    case 'transit':
      if (eventStatus?.includes('OUT_FOR_DELIVERY')) return 'ON_FEDEX_VEHICLE'
      return 'IN_TRANSIT'
    case 'pre-transit':
      return 'PICKED_UP'
    case 'failure':
      if (eventStatus?.toLowerCase().includes('return')) return 'RETURN_TO_SENDER'
      if (eventStatus?.toLowerCase().includes('delivery')) return 'EXCEPTION'
      if (eventStatus?.toLowerCase().includes('delay')) return 'DELAYED'
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export class DHLTrackingProvider implements TrackingProvider {
  async track(trackingNumber: string): Promise<TrackingResult> {
    const apiKey = getDHLApiKey()
    if (!apiKey) {
      throw new Error('DHL API key not configured. Set it in Settings > Carrier API Keys or DHL_API_KEY env var.')
    }

    const url = new URL(DHL_BASE_URL)
    url.searchParams.set('trackingNumber', trackingNumber)
    url.searchParams.set('service', 'express')

    const res = await fetch(url.toString(), {
      headers: {
        'DHL-API-Key': apiKey,
        Accept: 'application/json',
      },
    })

    if (res.status === 401) {
      throw new Error('DHL API key is invalid or not authorized.')
    }

    if (res.status === 429) {
      throw new Error('DHL rate limit exceeded. Please try again later.')
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const detail = (body as { detail?: string }).detail ?? res.statusText
      throw new Error(`DHL API error: ${detail}`)
    }

    const data: DHLResponse = await res.json()
    const shipment = data.shipments?.[0]

    if (!shipment) {
      return {
        trackingNumber,
        status: 'UNKNOWN',
        eta: null,
        origin: null,
        destination: null,
        events: [],
      }
    }

    const events: TrackingEvent[] = (shipment.events ?? []).map((e) => ({
      date: e.timestamp,
      status: mapDHLStatus(e.statusCode, e.status),
      location: formatLocation(e.location?.address) ?? '',
      description: e.description ?? e.remark ?? '',
    }))

    const subPackages: SubPackage[] | undefined = shipment.details?.pieceIds && shipment.details.pieceIds.length > 1
      ? shipment.details.pieceIds.map((id) => ({
          trackingNumber: id,
          status: mapDHLStatus(shipment.status.statusCode, shipment.status.status),
          origin: null,
          destination: null,
        }))
      : undefined

    return {
      trackingNumber,
      status: mapDHLStatus(shipment.status.statusCode, shipment.status.status),
      eta: shipment.estimatedTimeOfDelivery ?? null,
      origin: formatLocation(shipment.origin?.address),
      destination: formatLocation(shipment.destination?.address),
      events,
      subPackages,
    }
  }
}
```

- [ ] **Step 2: Register DHL provider in registry**

Edit `src/lib/tracking/registry.ts`:

```typescript
import { FedExTrackingProvider } from './providers/fedex'
import { DHLTrackingProvider } from './providers/dhl'
import type { TrackingProvider } from './types'

const providers = new Map<string, TrackingProvider>()

providers.set('fedex', new FedExTrackingProvider())
providers.set('dhl', new DHLTrackingProvider())

// ...rest unchanged
```

---

### Task 5: Write tests for DHLTrackingProvider

**Files:**
- Create: `src/lib/tracking/__tests__/dhl-provider.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DHLTrackingProvider } from '../providers/dhl'

vi.mock('../../carrier-config', () => ({
  getDHLApiKey: () => 'test-api-key',
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockShipment = (overrides: Record<string, unknown> = {}) => ({
  id: '1234567890',
  service: 'express',
  status: {
    timestamp: '2024-03-01T10:00:00Z',
    location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
    statusCode: 'transit',
    status: 'IN_TRANSIT',
    description: 'Shipment is in transit',
  },
  origin: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
  destination: { address: { addressLocality: 'AMSTERDAM', countryCode: 'NL' } },
  estimatedTimeOfDelivery: '2024-03-03T00:00:00Z',
  events: [
    {
      timestamp: '2024-03-01T08:00:00Z',
      location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
      statusCode: 'pre-transit',
      status: 'PICKED_UP',
      description: 'Shipment picked up',
    },
    {
      timestamp: '2024-03-01T10:00:00Z',
      location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
      statusCode: 'transit',
      status: 'IN_TRANSIT',
      description: 'Shipment is in transit',
    },
  ],
  ...overrides,
})

beforeEach(() => {
  mockFetch.mockReset()
})

describe('DHLTrackingProvider', () => {
  it('throws when API key is not configured', async () => {
    mockGetDHLApiKey.mockReturnValueOnce('')
    const provider = new DHLTrackingProvider()
    await expect(provider.track('123')).rejects.toThrow(
      'DHL API key not configured'
    )
  })

  it('returns tracking result for a valid tracking number', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ shipments: [mockShipment()] }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('1234567890')

    expect(result.trackingNumber).toBe('1234567890')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.eta).toBe('2024-03-03T00:00:00Z')
    expect(result.origin).toBe('FRANKFURT, DE')
    expect(result.destination).toBe('AMSTERDAM, NL')
    expect(result.events).toHaveLength(2)
    expect(result.events[0].status).toBe('PICKED_UP')
    expect(result.events[1].status).toBe('IN_TRANSIT')
  })

  it('handles 404 / not found gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ shipments: [] }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('nonexistent')

    expect(result.status).toBe('UNKNOWN')
    expect(result.events).toEqual([])
  })

  it('handles 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
    })
    const provider = new DHLTrackingProvider()
    await expect(provider.track('123')).rejects.toThrow(
      'DHL API key is invalid'
    )
  })

  it('handles 429 rate limit', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      json: async () => ({}),
    })
    const provider = new DHLTrackingProvider()
    await expect(provider.track('123')).rejects.toThrow(
      'DHL rate limit exceeded'
    )
  })

  it('handles delivered status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          status: {
            timestamp: '2024-03-02T14:00:00Z',
            location: { address: { addressLocality: 'AMSTERDAM', countryCode: 'NL' } },
            statusCode: 'delivered',
            status: 'DELIVERED',
            description: 'Shipment delivered',
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.status).toBe('DELIVERED')
  })

  it('handles out-for-delivery via ON_FEDEX_VEHICLE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          status: {
            timestamp: '2024-03-02T08:00:00Z',
            location: { address: { addressLocality: 'AMSTERDAM', countryCode: 'NL' } },
            statusCode: 'transit',
            status: 'OUT_FOR_DELIVERY',
            description: 'Out for delivery',
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.status).toBe('ON_FEDEX_VEHICLE')
  })

  it('handles failure -> return to sender', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          status: {
            timestamp: '2024-03-02T09:00:00Z',
            location: { address: { addressLocality: 'FRANKFURT', countryCode: 'DE' } },
            statusCode: 'failure',
            status: 'RETURN_TO_SENDER',
            description: 'Return to sender',
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.status).toBe('RETURN_TO_SENDER')
  })

  it('handles multi-piece shipments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          details: {
            totalNumberOfPieces: 3,
            pieceIds: ['PID001', 'PID002', 'PID003'],
          },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')

    expect(result.subPackages).toBeDefined()
    expect(result.subPackages).toHaveLength(3)
    expect(result.subPackages![0].trackingNumber).toBe('PID001')
    expect(result.subPackages![0].status).toBe('IN_TRANSIT')
  })

  it('omits subPackages for single-piece shipments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        shipments: [mockShipment({
          details: { totalNumberOfPieces: 1, pieceIds: ['PID001'] },
        })],
      }),
    })
    const provider = new DHLTrackingProvider()
    const result = await provider.track('123')
    expect(result.subPackages).toBeUndefined()
  })
})
```

Note: The first test uses `getDHLApiKey` from the mock — we need to import it to use `vi.mocked()`. Add at the top:
```typescript
const { getDHLApiKey } = await vi.importActual<typeof import('../../carrier-config')>('../../carrier-config')
```

Actually, this is getting complex. Let me simplify — use `vi.mocked()` on the mock directly:

Change the test to:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DHLTrackingProvider } from '../providers/dhl'

const mockGetDHLApiKey = vi.fn(() => 'test-api-key')
vi.mock('../../carrier-config', () => ({
  getDHLApiKey: (...args: unknown[]) => mockGetDHLApiKey(...args),
}))

// ... rest of tests ...

// In the first test:
it('throws when API key is not configured', async () => {
  mockGetDHLApiKey.mockReturnValueOnce('')
  const provider = new DHLTrackingProvider()
  await expect(provider.track('123')).rejects.toThrow('DHL API key not configured')
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/lib/tracking/__tests__/dhl-provider.test.ts
```

Expected: All tests pass.

---

### Task 6: Accept carrier in POST /api/packages

**Files:**
- Modify: `src/app/api/packages/route.ts`

- [ ] **Step 1: Accept and validate `carrier` from request body**

Edit lines 37-103:

```typescript
export async function POST(request: Request) {
  const forbidden = requireLocalRequest(request.headers)
  if (forbidden) return forbidden

  const body = await request.json()
  const { trackingNumber, nickname, partNumbers, carrier } = body as Record<string, unknown>

  if (!trackingNumber || typeof trackingNumber !== 'string') {
    return NextResponse.json(
      { error: 'trackingNumber is required' },
      { status: 400 }
    )
  }

  const safeCarrier = typeof carrier === 'string' && ['fedex', 'dhl'].includes(carrier)
    ? carrier
    : 'fedex'

  // ... rest of validation unchanged ...

  // Fetch initial tracking data
  let result
  try {
    const provider = getProvider(safeCarrier)
    result = await provider.track(trackingNumber)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tracking data'
    return NextResponse.json(
      { error: 'Tracking data unavailable', details: message },
      { status: 502 }
    )
  }

  const pkg = await db.package.create({
    data: {
      trackingNumber,
      carrier: safeCarrier,
      nickname: safeNickname,
      partNumbers: JSON.stringify(safePartNumbers),
      status: result.status,
      eta: result.eta,
      origin: result.origin,
      destination: result.destination,
      events: JSON.stringify(result.events),
      subPackages: JSON.stringify(result.subPackages ?? []),
      lastCheckedAt: new Date(),
    },
  })

  return NextResponse.json(
    {
      ...pkg,
      events: result.events,
      subPackages: result.subPackages ?? [],
      partNumbers: safePartNumbers,
    },
    { status: 201 }
  )
}
```

---

### Task 7: Add carrier selector to add-package form

**Files:**
- Modify: `src/components/add-package-form.tsx`

- [ ] **Step 1: Add carrier state and dropdown**

Edit the component:

```typescript
export function AddPackageForm({ onAdded }: AddPackageFormProps) {
  const t = useTranslations('addPackageForm')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [partNumbers, setPartNumbers] = useState('')
  const [carrier, setCarrier] = useState('fedex')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()
```

Update the POST body:
```typescript
body: JSON.stringify({
  trackingNumber: trackingNumber.trim(),
  nickname: nickname.trim() || undefined,
  partNumbers: partNumbers.trim() || undefined,
  carrier,
}),
```

Replace the tracking number input to include a carrier select before it. The form layout should become:

```typescript
return (
  <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <div className="flex-1">
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="tracking" className="block text-sm font-medium text-gray-700 mb-1">
            {t('trackingNumber')}
          </label>
          <div className="flex gap-2">
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-2 text-sm bg-white focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple focus-visible:ring-fedex-purple"
              aria-label={t('carrier')}
            >
              <option value="fedex">{t('carrierFedex')}</option>
              <option value="dhl">{t('carrierDhl')}</option>
            </select>
            <input
              ref={inputRef}
              id="tracking"
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder={t('placeholder')}
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple focus-visible:ring-fedex-purple tabular-nums"
              required
            />
          </div>
        </div>
      </div>
    </div>
    {/* nickname, partNumbers, button unchanged */}
  </form>
)
```

---

### Task 8: i18n keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add carrier i18n keys to `messages/en.json`**

Under `"carrier"` section, add after `"prodMode"`:
```json
"dhlApiKey": "DHL API Key"
```

Under `"addPackageForm"` section (find the existing block), add:
```json
"carrier": "Carrier",
"carrierFedex": "FedEx",
"carrierDhl": "DHL"
```

- [ ] **Step 2: Add carrier i18n keys to `messages/zh-TW.json`**

Under `"carrier"` section:
```json
"dhlApiKey": "DHL API 金鑰"
```

Under `"addPackageForm"` section:
```json
"carrier": "物流商",
"carrierFedex": "FedEx",
"carrierDhl": "DHL"
```

- [ ] **Step 3: Add carrier i18n keys to `messages/zh-CN.json`**

Under `"carrier"` section:
```json
"dhlApiKey": "DHL API 密钥"
```

Under `"addPackageForm"` section:
```json
"carrier": "物流商",
"carrierFedex": "FedEx",
"carrierDhl": "DHL"
```

- [ ] **Step 4: Add carrier i18n keys to `messages/es-MX.json`**

Under `"carrier"` section:
```json
"dhlApiKey": "Clave de API de DHL"
```

Under `"addPackageForm"` section:
```json
"carrier": "Transportista",
"carrierFedex": "FedEx",
"carrierDhl": "DHL"
```

---

### Task 9: Verify build and tests

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All tests pass (28 + new DHL tests).

- [ ] **Step 2: Run lint**

```bash
npm run lint
```
Expected: No errors.

- [ ] **Step 3: Build Next.js**

```bash
npm run build:next
```
Expected: Build succeeds.
