# Test Notification Button

Send a test notification to verify channel configuration.

## API Route

**`POST /api/notifications/channels/[id]/test`**

1. Fetch channel by ID; 404 if not found
2. Get `NotificationProvider` from registry by `channel.type`
3. Parse channel's `config` JSON
4. Build a static test message: `{ type: 'status_change', status: 'TEST', trackingNumber: 'TEST-000000' }`
5. Call `provider.send(config, contacts, message)` with the channel's enabled contacts
6. Return `{ success: boolean, error?: string }`
7. No `NotificationLog` entry created (test notifications are not logged)

## UI

Already implemented in `channel-card.tsx` — test button calls the endpoint. All 4 locale translations present.
