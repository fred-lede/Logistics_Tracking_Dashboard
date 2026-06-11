# DHL Express Tracking Integration

## Overview

Add DHL Express package tracking to the Logistics Tracking Dashboard using the DHL **Shipment Tracking - Unified API** (v1.5.8). This is the recommended approach because:
- Simple API key auth (`DHL-API-Key` header), no OAuth
- Covers DHL Express + all DHL brands in one API
- Free demo key available at developer.dhl.com
- Same endpoint for sandbox (demo key → mocked) and production (real key → live data)

## Architecture

The existing provider pattern (`TrackingProvider` interface + registry) is carrier-agnostic. DHL fits in with:

```
carrier='dhl' → DHLTrackingProvider → Unified API (api-eu.dhl.com/track/shipments)
```

No changes needed to `types.ts` or the interface — DHL returns the same `TrackingResult` shape as FedEx.

## Provider: DHLTrackingProvider

**File:** `src/lib/tracking/providers/dhl.ts`

### Authentication

- API Key passed via `DHL-API-Key` request header
- Single key, no token expiry to manage
- Same base URL for sandbox and production (`https://api-eu.dhl.com/track/shipments`)
- The difference is the key itself: demo key returns mocked data, real key returns live data
- Credentials stored in existing `.carrier-creds.json` or `DHL_API_KEY` env var

### API Request

```
GET https://api-eu.dhl.com/track/shipments?trackingNumber=1234567890&service=express
Headers:
  DHL-API-Key: <api_key>
  Accept: application/json
```

The `service=express` parameter narrows the search to DHL Express shipments, improving response accuracy.

### Response Parsing

Unified API JSON response structure:

```json
{
  "shipments": [{
    "id": "7777777770",
    "service": "express",
    "status": {
      "timestamp": "2018-03-02T07:53:47Z",
      "location": { "address": { "addressLocality": "AMSTERDAM", "countryCode": "NL" } },
      "statusCode": "transit",
      "status": "IN_TRANSIT",
      "description": "Shipment is in transit"
    },
    "origin": { "address": { "addressLocality": "FRANKFURT", "countryCode": "DE" } },
    "destination": { "address": { "addressLocality": "AMSTERDAM", "countryCode": "NL" } },
    "estimatedTimeOfDelivery": "2018-08-03T00:00:00Z",
    "events": [
      {
        "timestamp": "2018-03-01T10:00:00Z",
        "location": { "address": { "addressLocality": "FRANKFURT", "countryCode": "DE" } },
        "statusCode": "pre-transit",
        "status": "PICKED_UP",
        "description": "Shipment picked up"
      },
      {
        "timestamp": "2018-03-02T07:53:47Z",
        "location": { "address": { "addressLocality": "AMSTERDAM", "countryCode": "NL" } },
        "statusCode": "transit",
        "status": "IN_TRANSIT",
        "description": "Shipment is in transit"
      }
    ],
    "details": {
      "totalNumberOfPieces": 2,
      "pieceIds": ["JD014600006281230704", "JD014600002708681600"]
    }
  }]
}
```

Mapped fields:

| DHL Field | TrackingResult Field | Notes |
|-----------|---------------------|-------|
| `shipments[0].id` | `trackingNumber` | Same as requested |
| `shipments[0].status.statusCode` | `status` | After canonical mapping |
| `shipments[0].estimatedTimeOfDelivery` | `eta` | ISO 8601, pass through as-is |
| `shipments[0].origin.address` | `origin` | Concatenate city + countryCode |
| `shipments[0].destination.address` | `destination` | Concatenate city + countryCode |
| `shipments[0].events[]` | `events[]` | Each event mapped via `mapDHLEvent` |
| `shipments[0].details.pieceIds[]` | `subPackages[].trackingNumber` | Multi-piece shipments |

### Status Mapping

Canonical statuses already defined: `DELIVERED`, `IN_TRANSIT`, `PICKED_UP`, `ON_FEDEX_VEHICLE`, `EXCEPTION`, `DELAYED`, `RETURN_TO_SENDER`, `PICKUP_AVAILABLE`, `UNKNOWN`.

DHL Unified API uses high-level `statusCode` values: `pre-transit`, `transit`, `delivered`, `failure`, `unknown`.

The `status` field within each event provides more granular information for Express shipments.

```typescript
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
      if (eventStatus?.toLowerCase().includes('delay')) return 'DELAYED'
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}
```

### Multi-Piece Handling

When `details.pieceIds` exists and has more than 1 entry, each piece ID is mapped as a `SubPackage` (status = shipment's current status, no individual checkpoints since the Unified API doesn't provide per-piece status in the Pull API).

### Error Handling

| HTTP Status | Error Type | Handling |
|-------------|-----------|----------|
| 400 | Invalid input | Throw with API message |
| 401 | Unauthorized | Throw "DHL API key not configured" |
| 404 | Not found (tracking number) | Return UNKNOWN status with empty events |
| 429 | Rate limit exceeded | Throw "DHL rate limit exceeded, try later" |

## Registry Registration

**File:** `src/lib/tracking/registry.ts`

Add one line:

```typescript
providers.set('dhl', new DHLTrackingProvider())
```

## Configuration

### Credentials

Extend `CarrierConfig` in `src/lib/carrier-config.ts`:

```typescript
export interface CarrierConfig {
  fedexApiKey: string
  fedexApiSecret: string
  fedexProduction?: boolean
  dhlApiKey: string     // NEW
}
```

Add getter:

```typescript
export function getDHLApiKey(): string {
  return process.env.DHL_API_KEY || loadCarrierConfig()?.dhlApiKey || ''
}
```

### Settings API

Extend `src/app/api/settings/carrier/route.ts` to handle `dhlApiKey` (GET returns masked, PUT saves with MASKED round-trip support).

### Settings UI

Extend `src/components/settings/carrier-settings.tsx` to add a DHL API Key input field alongside the existing FedEx fields. DHL has no sandbox/production toggle since the Unified API uses the same endpoint.

### Environment Variables

Add to `.env`:

```
DHL_API_KEY=
```

## POST /api/packages — Carrier-Aware

**File:** `src/app/api/packages/route.ts`

### Changes

1. Accept `carrier` from request body (string, default `'fedex'` for backward compatibility)
2. Validate carrier is one of `['fedex', 'dhl']`
3. Use `getProvider(carrier)` instead of hardcoded `getProvider('fedex')`
4. Store `carrier` field in DB create call

### Body shape

```json
{
  "trackingNumber": "1234567890",
  "nickname": "My Package",
  "partNumbers": ["PN-001"],
  "carrier": "dhl"
}
```

## Add Package Form — Carrier Selector

**File:** `src/components/add-package-form.tsx`

### Changes

1. Add a carrier dropdown/select between tracking number and nickname fields
2. Options: FedEx (default), DHL
3. Send `carrier` in POST body
4. i18n keys for carrier labels

## i18n

### New keys needed

In all 4 locale files (`en`, `zh-TW`, `zh-CN`, `es-MX`):

Under `carrier` section:
- `dhlApiKey`: "DHL API Key" (or translated equivalent)

Under `addPackageForm` section:
- `carrier`: "Carrier" 
- `carrierFedex`: "FedEx"
- `carrierDhl`: "DHL"

## File Change Summary

| File | Action |
|------|--------|
| `src/lib/tracking/providers/dhl.ts` | **NEW** — DHLTrackingProvider |
| `src/lib/tracking/registry.ts` | EDIT — register 'dhl' provider |
| `src/lib/carrier-config.ts` | EDIT — add DHL config + getter |
| `src/app/api/packages/route.ts` | EDIT — accept carrier from body |
| `src/components/add-package-form.tsx` | EDIT — add carrier selector |
| `src/app/api/settings/carrier/route.ts` | EDIT — handle dhlApiKey |
| `src/components/settings/carrier-settings.tsx` | EDIT — add DHL API key input |
| `messages/{en,zh-TW,zh-CN,es-MX}.json` | EDIT — add new i18n keys |
| `.env` | EDIT — add DHL_API_KEY |

## Testing

- Unit test `DHLTrackingProvider.track()` with mocked fetch responses (success, 404, 401, multi-piece)
- Test `mapDHLStatus()` mapping for all status code combinations
- Test POST /api/packages with `carrier: 'dhl'` creates package with correct carrier
- Verify existing FedEx flow is unchanged (backward compatible)

## Out of Scope (Future)

- MyDHL API integration (Option B) — would require DHL Express business account
- Auto-detection of carrier from tracking number pattern
- Unified Push API (webhook-based status updates)
