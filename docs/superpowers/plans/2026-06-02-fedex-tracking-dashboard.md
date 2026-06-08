# FedEx Tracking Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user FedEx package tracking dashboard with Next.js, Prisma/SQLite, and the FedEx Sandbox API.

**Architecture:** Next.js App Router monolith — API routes proxy FedEx requests server-side (hiding API keys), Prisma persists package data to a local SQLite file. A carrier abstraction layer (`TrackingProvider` interface) keeps the door open for UPS/DHL/USPS later.

**Tech Stack:** Next.js 14+, TypeScript, Tailwind CSS, Prisma + SQLite, Vitest + React Testing Library

**Plan location:** `docs/superpowers/plans/2026-06-02-fedex-tracking-dashboard.md`

---

### Task 1: Scaffold Project + Install Dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.mjs`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Initialize Next.js project with Tailwind**

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --use-npm
```

Accept defaults. This creates all config files above with sensible defaults.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install prisma @prisma/client
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Init Prisma with SQLite**

```bash
npx prisma init --datasource-provider sqlite
```

This creates `prisma/schema.prisma` and adds `DATABASE_URL` to `.env`.

- [ ] **Step 4: Verify scaffold builds**

```bash
npm run build
```

Expected: successful build, no errors.

- [ ] **Step 5: Install Vitest Next.js plugin**

```bash
npm install -D @next/vitest
```

- [ ] **Step 6: Configure Vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Create `src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom/vitest'
```

Update `package.json` to add test script:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 7: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold Next.js project with Prisma + Vitest"
```

---

### Task 2: Prisma Schema + DB Singleton

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Write Prisma schema**

Replace `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Package {
  id             String   @id @default(cuid())
  trackingNumber String   @unique
  carrier        String   @default("fedex")
  nickname       String?
  status         String?
  eta            String?
  origin         String?
  destination    String?
  events         String   @default("[]")
  lastCheckedAt  DateTime?
  autoRefresh    Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

Note: `events` is stored as a JSON string (SQLite lacks native JSON column type).

- [ ] **Step 2: Generate Prisma client and run migration**

```bash
npx prisma migrate dev --name init
```

Expected: migration applied, Prisma client generated.

- [ ] **Step 3: Create Prisma singleton**

Create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Add test: `src/lib/__tests__/prisma.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'

describe('Prisma client', () => {
  it('can instantiate and query', async () => {
    const client = new PrismaClient()
    await expect(client.$queryRaw`SELECT 1`).resolves.toBeDefined()
    await client.$disconnect()
  })
})
```

- [ ] **Step 5: Run test**

Run: `npm test -- src/lib/__tests__/prisma.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add Prisma schema and database singleton"
```

---

### Task 3: Tracking Types & Provider Abstraction

**Files:**
- Create: `src/lib/tracking/types.ts`
- Create: `src/lib/tracking/registry.ts`

- [ ] **Step 1: Write types**

Create `src/lib/tracking/types.ts`:

```typescript
export interface TrackingEvent {
  date: string
  status: string
  location: string
  description: string
}

export interface TrackingResult {
  trackingNumber: string
  status: string
  eta: string | null
  origin: string | null
  destination: string | null
  events: TrackingEvent[]
}

export interface TrackingProvider {
  track(trackingNumber: string): Promise<TrackingResult>
}
```

- [ ] **Step 2: Write registry**

Create `src/lib/tracking/registry.ts`:

```typescript
import type { TrackingProvider } from './types'

const providers = new Map<string, TrackingProvider>()

export function registerProvider(carrier: string, provider: TrackingProvider): void {
  providers.set(carrier, provider)
}

export function getProvider(carrier: string): TrackingProvider {
  const provider = providers.get(carrier)
  if (!provider) {
    throw new Error(`No tracking provider registered for carrier: ${carrier}`)
  }
  return provider
}
```

- [ ] **Step 3: Write tests**

Create `src/lib/tracking/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { TrackingResult, TrackingProvider } from '../types'

describe('Tracking types', () => {
  it('TrackingResult interface works with provider', () => {
    const provider: TrackingProvider = {
      async track(_tn: string) {
        return {
          trackingNumber: _tn,
          status: 'IN_TRANSIT',
          eta: '2026-06-05',
          origin: 'Memphis, TN',
          destination: 'Portland, OR',
          events: [
            {
              date: '2026-06-02',
              status: 'Picked up',
              location: 'Memphis, TN',
              description: 'Package picked up',
            },
          ],
        }
      },
    }
    const result = provider.track('123')
    expect(result).resolves.toHaveProperty('trackingNumber', '123')
    expect(result).resolves.toHaveProperty('status', 'IN_TRANSIT')
  })
})
```

Create `src/lib/tracking/__tests__/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { registerProvider, getProvider } from '../registry'
import type { TrackingProvider, TrackingResult } from '../types'

describe('Provider registry', () => {
  beforeEach(() => {
    // Reset module registry by re-importing won't work due to module caching,
    // so we just test registration logic
  })

  it('registers and retrieves a provider', () => {
    const mockProvider: TrackingProvider = {
      async track(tn: string): Promise<TrackingResult> {
        return {
          trackingNumber: tn,
          status: 'DELIVERED',
          eta: null,
          origin: null,
          destination: null,
          events: [],
        }
      },
    }
    registerProvider('test-carrier', mockProvider)
    const retrieved = getProvider('test-carrier')
    expect(retrieved).toBe(mockProvider)
  })

  it('throws for unregistered carrier', () => {
    expect(() => getProvider('nonexistent')).toThrow(
      'No tracking provider registered for carrier: nonexistent'
    )
  })
})
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/tracking/__tests__/
```

Expected: FAIL (registry tests may fail due to module-level state). Fix: make registry tests self-contained by calling `registerProvider` with a unique carrier name each time.

Re-run and verify PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add tracking provider types and registry"
```

---

### Task 4: FedEx Sandbox Tracking Provider

**Files:**
- Create: `src/lib/tracking/providers/fedex.ts`
- Create: `.env.local.example`

- [ ] **Step 1: Create `.env.local.example`**

```
FEDEX_API_KEY=your_fedex_api_key
FEDEX_API_SECRET=your_fedex_api_secret
```

- [ ] **Step 2: Write FedEx provider**

Create `src/lib/tracking/providers/fedex.ts`:

```typescript
import type { TrackingProvider, TrackingResult, TrackingEvent } from '../types'

interface FedExOAuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface FedExTrackingOutput {
  completeTrackResults?: Array<{
    trackingNumber: string
    trackResults?: Array<{
      trackingNumberInfo?: { trackingNumber: string }
      latestStatusDetail?: {
        statusByLocale: string
        code: string
        description: string
        derivedCode?: string
      }
      dateAndTimes?: Array<{
        type: string
        dateTime: string
      }>
      scanEvents?: Array<{
        date: string
        derivedStatus: string
        scanLocation: { city: string; stateOrProvinceCode: string; countryCode: string }
        eventDescription: string
      }>
      destinationLocation?: {
        locationContactAndAddress?: {
          address?: { city: string; stateOrProvinceCode: string; countryCode: string }
        }
      }
      originLocation?: {
        locationContactAndAddress?: {
          address?: { city: string; stateOrProvinceCode: string; countryCode: string }
        }
      }
      deliveryDetails?: {
        estimatedDeliveryDate?: string
        actualDeliveryDate?: string
      }
    }>
  }>
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken
  }

  const res = await fetch(
    'https://apis-sandbox.fedex.com/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.FEDEX_API_KEY!,
        client_secret: process.env.FEDEX_API_SECRET!,
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`FedEx OAuth failed: ${res.status} ${res.statusText}`)
  }

  const data: FedExOAuthResponse = await res.json()
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.accessToken
}

function mapFedExStatus(derivedCode?: string): string {
  // FedEx derived codes → our normalized status
  const statusMap: Record<string, string> = {
    DELIVERED: 'DELIVERED',
    IN_TRANSIT: 'IN_TRANSIT',
    AT_PICKUP: 'PICKED_UP',
    ON_FEDEX_VEHICLE: 'ON_FEDEX_VEHICLE',
    EXCEPTION: 'EXCEPTION',
    DELAYED: 'DELAYED',
    RETURN_TO_SENDER: 'RETURN_TO_SENDER',
    PICKUP_AVAILABLE: 'PICKED_UP',
  }
  return statusMap[derivedCode ?? ''] ?? 'UNKNOWN'
}

export class FedExTrackingProvider implements TrackingProvider {
  async track(trackingNumber: string): Promise<TrackingResult> {
    const token = await getAccessToken()

    const res = await fetch('https://apis-sandbox.fedex.com/track/v1/trackingnumbers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        trackingNumberInfo: { trackingNumber },
        includeDetailedScans: true,
      }),
    })

    if (!res.ok) {
      throw new Error(`FedEx Track API error: ${res.status} ${res.statusText}`)
    }

    const data: { output: FedExTrackingOutput } = await res.json()
    const trackResult =
      data.output?.completeTrackResults?.[0]?.trackResults?.[0]

    if (!trackResult) {
      throw new Error(`No tracking data found for: ${trackingNumber}`)
    }

    const events: TrackingEvent[] =
      trackResult.scanEvents?.map((s) => ({
        date: s.date,
        status: s.derivedStatus,
        location: `${s.scanLocation.city}, ${s.scanLocation.stateOrProvinceCode}`,
        description: s.eventDescription,
      })) ?? []

    const origin = trackResult.originLocation?.locationContactAndAddress?.address
    const destination = trackResult.destinationLocation?.locationContactAndAddress?.address
    const latestStatus = trackResult.latestStatusDetail
    const delivery = trackResult.deliveryDetails

    return {
      trackingNumber,
      status: mapFedExStatus(latestStatus?.derivedCode),
      eta: delivery?.estimatedDeliveryDate ?? null,
      origin: origin ? `${origin.city}, ${origin.stateOrProvinceCode}` : null,
      destination: destination
        ? `${destination.city}, ${destination.stateOrProvinceCode}`
        : null,
      events,
    }
  }
}
```

- [ ] **Step 3: Write provider test**

Create `src/lib/tracking/__tests__/fedex-provider.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { FedExTrackingProvider } from '../providers/fedex'

describe('FedExTrackingProvider', () => {
  it('requires API credentials to be set', async () => {
    const provider = new FedExTrackingProvider()
    await expect(provider.track('794798798798')).rejects.toThrow()
    // Without env vars set, this will fail — which is expected in test env
  })
})
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/lib/tracking/__tests__/fedex-provider.test.ts
```

Expected: PASS (the test verifies the error case, which is correct without env vars).

- [ ] **Step 5: Register provider**

Modify `src/lib/tracking/registry.ts` to add:

```typescript
registerProvider('fedex', new FedExTrackingProvider())
```

Move the `registerProvider` call to after imports. The file becomes:

```typescript
import { FedExTrackingProvider } from './providers/fedex'
import type { TrackingProvider } from './types'

const providers = new Map<string, TrackingProvider>()

providers.set('fedex', new FedExTrackingProvider())

export function registerProvider(carrier: string, provider: TrackingProvider): void {
  providers.set(carrier, provider)
}

export function getProvider(carrier: string): TrackingProvider {
  const provider = providers.get(carrier)
  if (!provider) {
    throw new Error(`No tracking provider registered for carrier: ${carrier}`)
  }
  return provider
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add FedEx Sandbox tracking provider"
```

---

### Task 5: API Routes — Package CRUD + Refresh

**Files:**
- Create: `src/app/api/packages/route.ts`
- Create: `src/app/api/packages/[id]/route.ts`
- Create: `src/app/api/packages/[id]/refresh/route.ts`

- [ ] **Step 1: Write packages list + create endpoint**

Create `src/app/api/packages/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/lib/tracking/registry'

export async function GET() {
  const packages = await prisma.package.findMany({
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json(
    packages.map((p) => ({ ...p, events: JSON.parse(p.events) }))
  )
}

export async function POST(request: Request) {
  const body = await request.json()
  const { trackingNumber, nickname } = body as {
    trackingNumber: string
    nickname?: string
  }

  if (!trackingNumber || typeof trackingNumber !== 'string') {
    return NextResponse.json(
      { error: 'trackingNumber is required' },
      { status: 400 }
    )
  }

  const existing = await prisma.package.findUnique({
    where: { trackingNumber },
  })
  if (existing) {
    return NextResponse.json(
      { error: 'Tracking number already exists' },
      { status: 409 }
    )
  }

  // Fetch initial tracking data
  let result
  try {
    const provider = getProvider('fedex')
    result = await provider.track(trackingNumber)
  } catch {
    // If FedEx API fails, create the package with no status data
    const pkg = await prisma.package.create({
      data: {
        trackingNumber,
        nickname: nickname ?? null,
      },
    })
    return NextResponse.json({ ...pkg, events: [] }, { status: 201 })
  }

  const pkg = await prisma.package.create({
    data: {
      trackingNumber,
      nickname: nickname ?? null,
      status: result.status,
      eta: result.eta,
      origin: result.origin,
      destination: result.destination,
      events: JSON.stringify(result.events),
      lastCheckedAt: new Date(),
    },
  })

  return NextResponse.json({ ...pkg, events: result.events }, { status: 201 })
}
```

- [ ] **Step 2: Write delete endpoint**

Create `src/app/api/packages/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pkg = await prisma.package.findUnique({ where: { id } })

  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }

  await prisma.package.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
```

- [ ] **Step 3: Write refresh endpoint**

Create `src/app/api/packages/[id]/refresh/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getProvider } from '@/lib/tracking/registry'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const pkg = await prisma.package.findUnique({ where: { id } })
  if (!pkg) {
    return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  }

  // Rate gate: minimum 15s between refreshes
  if (pkg.lastCheckedAt) {
    const elapsed = Date.now() - pkg.lastCheckedAt.getTime()
    if (elapsed < 15000) {
      return NextResponse.json(
        { error: `Rate limited. Try again in ${Math.ceil((15000 - elapsed) / 1000)}s` },
        { status: 429 }
      )
    }
  }

  try {
    const provider = getProvider(pkg.carrier)
    const result = await provider.track(pkg.trackingNumber)

    const updated = await prisma.package.update({
      where: { id },
      data: {
        status: result.status,
        eta: result.eta,
        origin: result.origin,
        destination: result.destination,
        events: JSON.stringify(result.events),
        lastCheckedAt: new Date(),
      },
    })

    return NextResponse.json({
      ...updated,
      events: result.events,
      previousStatus: pkg.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to refresh tracking data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 502 }
    )
  }
}
```

- [ ] **Step 4: Write API route tests**

Create `src/app/api/__tests__/packages.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

describe('Packages API', () => {
  beforeAll(async () => {
    // Ensure clean state
    await prisma.package.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('lists packages (empty)', async () => {
    const res = await fetch('http://localhost:3000/api/packages')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
```

Note: API route integration tests require the dev server running. These are best run manually or in a CI with server pre-started.

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add package CRUD + refresh API routes"
```

---

### Task 6: Root Layout, Add Package Form, and Global Styles

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/components/add-package-form.tsx`
- Create: `src/components/toast.tsx`

- [ ] **Step 1: Update global styles**

Replace `src/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-fedex-purple: #660099;
  --color-fedex-orange: #FF6600;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}
```

- [ ] **Step 2: Write Toast component**

Create `src/components/toast.tsx`:

```typescript
'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastContextValue {
  addToast: (message: string, type?: Toast['type']) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`
              cursor-pointer rounded-lg px-4 py-3 text-white shadow-lg transition-all
              ${toast.type === 'success' ? 'bg-green-600' : ''}
              ${toast.type === 'error' ? 'bg-red-600' : ''}
              ${toast.type === 'info' ? 'bg-fedex-purple' : ''}
            `}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
```

- [ ] **Step 3: Write Add Package Form**

Create `src/components/add-package-form.tsx`:

```typescript
'use client'

import { useState, useRef } from 'react'
import { useToast } from './toast'

interface AddPackageFormProps {
  onAdded: () => void
}

export function AddPackageForm({ onAdded }: AddPackageFormProps) {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!trackingNumber.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim(),
          nickname: nickname.trim() || undefined,
        }),
      })

      if (res.status === 409) {
        addToast('Tracking number already exists', 'error')
        return
      }

      if (!res.ok) {
        addToast('Failed to add tracking number', 'error')
        return
      }

      addToast('Package added', 'success')
      setTrackingNumber('')
      setNickname('')
      inputRef.current?.focus()
      onAdded()
    } catch {
      addToast('Network error', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="tracking" className="block text-sm font-medium text-gray-700 mb-1">
          FedEx Tracking Number
        </label>
        <input
          ref={inputRef}
          id="tracking"
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="e.g. 794798798798"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple"
          required
        />
      </div>
      <div className="flex-1">
        <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
          Nickname (optional)
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. Birthday Gift, PO-12345"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-fedex-purple px-5 py-2 text-sm font-medium text-white hover:bg-purple-800 disabled:opacity-50 shrink-0"
      >
        {loading ? 'Adding...' : 'Track'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Update root layout**

Replace `src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/toast'

export const metadata: Metadata = {
  title: 'FedEx Tracking Dashboard',
  description: 'Track your FedEx packages',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add layout, toast, and add-package form"
```

---

### Task 7: Package Card Component

**Files:**
- Create: `src/components/package-card.tsx`
- Create: `src/components/refresh-button.tsx`
- Create: `src/components/auto-refresh-toggle.tsx`

- [ ] **Step 1: Write Refresh Button**

Create `src/components/refresh-button.tsx`:

```typescript
'use client'

import { useState } from 'react'

interface RefreshButtonProps {
  packageId: string
  onRefreshed: (data: { status: string; eta: string | null; events: unknown[] }) => void
}

export function RefreshButton({ packageId, onRefreshed }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    setLoading(true)
    try {
      const res = await fetch(`/api/packages/${packageId}/refresh`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        onRefreshed(data)
      }
    } catch {
      // Error handled by parent
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="text-xs text-gray-500 hover:text-fedex-purple disabled:opacity-50 transition-colors"
    >
      {loading ? '⟳ Refreshing...' : '⟳ Refresh'}
    </button>
  )
}
```

- [ ] **Step 2: Write Auto-Refresh Toggle**

Create `src/components/auto-refresh-toggle.tsx`:

```typescript
'use client'

interface AutoRefreshToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

export function AutoRefreshToggle({ enabled, onToggle }: AutoRefreshToggleProps) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300 text-fedex-purple focus:ring-fedex-purple"
      />
      Auto-refresh
    </label>
  )
}
```

- [ ] **Step 3: Write Package Card**

Create `src/components/package-card.tsx`:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { RefreshButton } from './refresh-button'
import { AutoRefreshToggle } from './auto-refresh-toggle'
import { useToast } from './toast'

interface PackageEvent {
  date: string
  status: string
  location: string
  description: string
}

interface PackageData {
  id: string
  trackingNumber: string
  carrier: string
  nickname: string | null
  status: string | null
  eta: string | null
  origin: string | null
  destination: string | null
  events: PackageEvent[]
  lastCheckedAt: string | null
  autoRefresh: boolean
}

function statusBadgeClass(status: string | null): string {
  const map: Record<string, string> = {
    DELIVERED: 'bg-green-500 text-white',
    IN_TRANSIT: 'bg-blue-500 text-white',
    PICKED_UP: 'bg-gray-400 text-white',
    ON_FEDEX_VEHICLE: 'bg-orange-500 text-white',
    EXCEPTION: 'bg-red-500 text-white animate-pulse',
    DELAYED: 'bg-yellow-500 text-black',
    RETURN_TO_SENDER: 'bg-red-600 text-white',
  }
  return map[status ?? ''] ?? 'bg-gray-200 text-gray-700'
}

function statusLabel(status: string | null): string {
  const map: Record<string, string> = {
    DELIVERED: 'Delivered',
    IN_TRANSIT: 'In Transit',
    PICKED_UP: 'Picked Up',
    ON_FEDEX_VEHICLE: 'On FedEx Vehicle',
    EXCEPTION: 'Exception',
    DELAYED: 'Delayed',
    RETURN_TO_SENDER: 'Return to Sender',
  }
  return map[status ?? ''] ?? status ?? 'Unknown'
}

interface PackageCardProps {
  pkg: PackageData
  onDelete: (id: string) => void
  onRefresh: () => void
  onToggleAutoRefresh: (id: string, enabled: boolean) => void
}

export function PackageCard({ pkg, onDelete, onRefresh, onToggleAutoRefresh }: PackageCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [autoRefreshState, setAutoRefreshState] = useState(pkg.autoRefresh)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { addToast } = useToast()

  function handleRefreshed(data: { status: string; eta: string | null; events: unknown[]; previousStatus?: string }) {
    if (data.previousStatus && data.previousStatus !== data.status) {
      addToast(`${pkg.trackingNumber}: ${data.previousStatus} → ${data.status}`, 'info')
    }
    onRefresh()
  }

  function handleToggle(enabled: boolean) {
    setAutoRefreshState(enabled)
    onToggleAutoRefresh(pkg.id, enabled)
  }

  useEffect(() => {
    setAutoRefreshState(pkg.autoRefresh)
  }, [pkg.autoRefresh])

  useEffect(() => {
    if (autoRefreshState) {
      intervalRef.current = setInterval(() => {
        fetch(`/api/packages/${pkg.id}/refresh`, { method: 'POST' })
          .then((res) => res.ok && onRefresh())
          .catch(() => {})
      }, 60000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefreshState, pkg.id, onRefresh])

  const isException = pkg.status === 'EXCEPTION' || pkg.status === 'RETURN_TO_SENDER'

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
        isException ? 'border-red-300' : 'border-gray-200'
      }`}
    >
      {isException && (
        <div className="bg-red-500 px-4 py-1.5 text-xs font-medium text-white">
          ⚠ Exception — check package details
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm font-semibold truncate">
                {pkg.trackingNumber}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(pkg.status)}`}>
                {statusLabel(pkg.status)}
              </span>
            </div>
            {pkg.nickname && (
              <div className="text-xs text-gray-500 truncate">
                📦 {pkg.nickname}
              </div>
            )}
          </div>
          <button
            onClick={() => onDelete(pkg.id)}
            className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2"
            title="Remove"
          >
            ✕
          </button>
        </div>

        {pkg.origin && pkg.destination && (
          <div className="text-xs text-gray-500 mb-1">
            📍 {pkg.origin} → {pkg.destination}
          </div>
        )}

        {pkg.eta && (
          <div className="text-sm font-medium text-gray-700 mb-2">
            {pkg.status === 'DELIVERED' ? 'Delivered on' : 'ETA:'}{' '}
            {new Date(pkg.eta).toLocaleDateString()}
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <RefreshButton packageId={pkg.id} onRefreshed={handleRefreshed} />
            <AutoRefreshToggle enabled={autoRefreshState} onToggle={handleToggle} />
          </div>
          <div className="flex items-center gap-2">
            {pkg.lastCheckedAt && (
              <span className="text-xs text-gray-400">
                {getRelativeTime(new Date(pkg.lastCheckedAt))}
              </span>
            )}
            {pkg.events.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-fedex-purple hover:underline"
              >
                {expanded ? '▲ Less' : '▼ Timeline'}
              </button>
            )}
          </div>
        </div>

        {expanded && pkg.events.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="relative pl-4 space-y-3">
              {pkg.events.map((event, i) => (
                <div key={i} className="relative">
                  <div className="absolute left-[-10px] top-1.5 h-2 w-2 rounded-full bg-fedex-purple" />
                  <div className="text-xs">
                    <div className="font-medium text-gray-700">{event.status}</div>
                    <div className="text-gray-500">
                      {new Date(event.date).toLocaleString()} — {event.location}
                    </div>
                    <div className="text-gray-400">{event.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  return `${hours}h ago`
}
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add package card with refresh, timeline, auto-refresh"
```

---

### Task 8: Dashboard Page — Wire Everything Together

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write dashboard page**

Replace `src/app/page.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { AddPackageForm } from '@/components/add-package-form'
import { PackageCard } from '@/components/package-card'

interface PackageEvent {
  date: string
  status: string
  location: string
  description: string
}

interface PackageData {
  id: string
  trackingNumber: string
  carrier: string
  nickname: string | null
  status: string | null
  eta: string | null
  origin: string | null
  destination: string | null
  events: PackageEvent[]
  lastCheckedAt: string | null
  autoRefresh: boolean
}

export default function DashboardPage() {
  const [packages, setPackages] = useState<PackageData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/packages')
      if (res.ok) {
        const data = await res.json()
        setPackages(data)
      }
    } catch {
      setError('Failed to load packages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPackages()
  }, [fetchPackages])

  // Page Visibility API — pause/resume auto-refresh
  useEffect(() => {
    function handleVisibility() {
      setVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // Staggered auto-refresh for packages with autoRefresh enabled
  useEffect(() => {
    if (!visible) return

    const autoPackages = packages.filter((p) => p.autoRefresh)
    if (autoPackages.length === 0) return

    const timers = autoPackages.map((pkg, i) =>
      setTimeout(() => {
        fetch(`/api/packages/${pkg.id}/refresh`, { method: 'POST' }).then(() => fetchPackages())
      }, i * 5000)
    )

    return () => timers.forEach(clearTimeout)
  }, [packages, visible, fetchPackages])

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPackages((prev) => prev.filter((p) => p.id !== id))
      }
    } catch {
      // Silently fail
    }
  }

  async function handleToggleAutoRefresh(id: string, enabled: boolean) {
    // Optimistic update
    setPackages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, autoRefresh: enabled } : p))
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <header className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">FedEx Tracking Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              {packages.length} package{packages.length !== 1 ? 's' : ''} tracked
            </p>
          </div>
          <button
            onClick={fetchPackages}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
          >
            ⟳ Refresh All
          </button>
        </div>
        <AddPackageForm onAdded={fetchPackages} />
      </header>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="text-4xl mb-4">📦</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            No packages tracked yet
          </h2>
          <p className="text-sm text-gray-500 max-w-md">
            Add your first FedEx tracking number above to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onDelete={handleDelete}
              onRefresh={fetchPackages}
              onToggleAutoRefresh={handleToggleAutoRefresh}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add dashboard page with grid, empty state, auto-refresh"
```

---

### Task 9: Env Setup, Gitignore, and Final Polish

**Files:**
- Create: `.env.local.example`
- Create: `.gitignore` (ensure `.superpowers/` and `.env.local` are ignored)

- [ ] **Step 1: Create env example**

Create `.env.local.example`:

```
DATABASE_URL="file:./dev.db"
FEDEX_API_KEY=
FEDEX_API_SECRET=
```

- [ ] **Step 2: Update `.gitignore`**

Append to `.gitignore`:

```
# Environment
.env.local

# Superpowers brainstorm artifacts
.superpowers/

# Prisma
prisma/dev.db
prisma/dev.db-journal
```

- [ ] **Step 3: Final build**

```bash
npm run build
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: add env template, update gitignore for .superpowers"
```

---

### Task 10: Dev Server Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open browser**

Navigate to http://localhost:3000. Expected: dashboard loads with empty state ("No packages tracked yet").

- [ ] **Step 3: Add a tracking number**

Enter a FedEx sandbox test number (e.g., `794798798798`) and click "Track". Expected: card appears in the grid (with "Unknown" status if FedEx credentials aren't configured, or proper status if they are).

- [ ] **Step 4: Verify card interactions**

- Refresh button works
- Timeline toggle shows events
- Auto-refresh checkbox toggles
- Delete removes the card
- "Refresh All" button updates all packages

- [ ] **Step 5: Kill dev server**

```bash
Ctrl+C
```

- [ ] **Step 6: Update AGENTS.md**

Write to `AGENTS.md`:

```markdown
# FedEx Tracking Dashboard — Agent Guide

## Project intent

A FedEx package tracking dashboard. Supports adding tracking numbers, polling FedEx Sandbox API, and displaying status/history/ETA/exceptions with manual and auto-refresh.

## Tech stack

- **Framework:** Next.js (App Router), TypeScript, Tailwind CSS
- **Database:** SQLite via Prisma
- **Testing:** Vitest + React Testing Library
- **Package manager:** npm
- **Dev server:** `npm run dev`

## Key commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check + build |
| `npm test` | Run all tests |
| `npx prisma studio` | Open DB browser |
| `npx prisma migrate dev --name <name>` | Create migration |

## Architecture

```
src/
├── app/              # App Router pages + API routes
│   └── api/packages/ # CRUD + refresh endpoints
├── components/       # React components
└── lib/
    ├── prisma.ts     # DB singleton
    └── tracking/     # Carrier abstraction (TrackingProvider interface)
        ├── types.ts
        ├── registry.ts
        └── providers/fedex.ts
```

## Conventions

- Carrier abstraction via `TrackingProvider` interface — add new carriers in `lib/tracking/providers/`
- FedEx API keys in `.env.local` only — never commit
- Events stored as JSON string in SQLite (parsed on read)
- Auto-refresh uses Page Visibility API — pauses when tab hidden
- Per-package auto-refresh toggle (default off), 60s interval
- API routes enforce 15s minimum between refreshes (rate gate)

## Testing

- Unit tests co-located in `__tests__` directories
- API route tests require dev server running
- FedEx provider tests expected to fail without credentials
```

- [ ] **Step 7: Commit AGENTS.md update**

```bash
git add AGENTS.md && git commit -m "docs: update AGENTS.md with tech stack and conventions"
```
