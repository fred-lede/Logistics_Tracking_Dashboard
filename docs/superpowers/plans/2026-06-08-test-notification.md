# Test Notification Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the API route for the existing test notification button in the channel card.

**Architecture:** One `POST` route at `/api/notifications/channels/[id]/test` that fetches the channel, gets the provider from the registry, and sends a static test message. No log entry created.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Prisma

---

### Task 1: Create test notification API route

**Files:**
- Create: `src/app/api/notifications/channels/[id]/test/route.ts`

- [ ] **Step 1: Create the API route**

```typescript
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { notificationRegistry } from '@/lib/notification/registry'
import type { NotificationMessage } from '@/lib/notification/types'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const channel = await prisma.notificationChannel.findUnique({
    where: { id },
    include: { contacts: { where: { enabled: true } } },
  })
  if (!channel) {
    return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  }

  const provider = notificationRegistry.getProvider(channel.type)
  if (!provider) {
    return NextResponse.json({ error: `Unknown channel type: ${channel.type}` }, { status: 400 })
  }

  const config: Record<string, unknown> = channel.config
    ? (typeof channel.config === 'string' ? JSON.parse(channel.config) : channel.config)
    : {}

  const message: NotificationMessage = {
    type: 'status_change',
    packageId: 'test',
    trackingNumber: 'TEST-000000',
    status: 'TEST',
    origin: 'Test Location',
    destination: 'Test Destination',
    events: [{
      date: new Date().toISOString(),
      description: 'Test notification from FedEx Tracking Dashboard',
      location: 'Test Location',
      statusCode: 'TEST',
    }],
  }

  const contacts = channel.contacts.map((c) => ({
    name: c.name,
    identifier: c.identifier,
  }))

  const result = await provider.send(config, contacts, message)

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Successful build with no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/channels/\[id\]/test/route.ts
git add docs/superpowers/specs/2026-06-08-test-notification-design.md
git add docs/superpowers/plans/2026-06-08-test-notification.md
git commit -m "feat: add test notification API route for channel verification"
```
