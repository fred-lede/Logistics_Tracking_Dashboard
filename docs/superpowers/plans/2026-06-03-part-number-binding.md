# Part Number Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to associate a factory material part number with each tracked package and search by any field.

**Architecture:** Add `partNumber` nullable field to Prisma Package model. Accept optional `partNumber` in POST create. Client-side search filters `trackingNumber`/`nickname`/`partNumber` in real-time.

**Tech Stack:** Next.js 16, Prisma 7, SQLite, TypeScript, Tailwind v4

---

### Task 1: Prisma Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: auto-generated migration

- [ ] **Step 1: Add partNumber field to schema**

In `prisma/schema.prisma`, add after `nickname`:

```prisma
  nickname       String?
  partNumber     String?
  status         String?
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-part-number
```

Expected: Migration created and applied.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: Client regenerated with `partNumber` field.

---

### Task 2: API Route — Accept partNumber

**Files:**
- Modify: `src/app/api/packages/route.ts`

- [ ] **Step 1: Add partNumber to POST body parsing**

After the nickname validation block, add:

```typescript
  if (partNumber !== undefined && typeof partNumber !== 'string') {
    return NextResponse.json(
      { error: 'partNumber must be a string' },
      { status: 400 }
    )
  }
```

- [ ] **Step 2: Update destructuring**

Update the destructuring line to include `partNumber`:

```typescript
  const { trackingNumber, nickname, partNumber } = body as Record<string, unknown>
```

- [ ] **Step 3: Pass partNumber to create**

In the `prisma.package.create` call, add `partNumber` to the data:

```typescript
  const safePartNumber = typeof partNumber === 'string' ? partNumber : null
  // ...
  data: {
    trackingNumber,
    nickname: safeNickname,
    partNumber: safePartNumber,
    // ... rest
  },
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: Compiles without errors.

---

### Task 3: AddPackageForm — Part Number Input

**Files:**
- Modify: `src/components/add-package-form.tsx`

- [ ] **Step 1: Add partNumber state**

```typescript
const [partNumber, setPartNumber] = useState('')
```

- [ ] **Step 2: Add partNumber to POST body**

In the fetch body, add `partNumber`:

```typescript
body: JSON.stringify({
  trackingNumber: trackingNumber.trim(),
  nickname: nickname.trim() || undefined,
  partNumber: partNumber.trim() || undefined,
}),
```

- [ ] **Step 3: Clear partNumber on success**

```typescript
setPartNumber('')
```

- [ ] **Step 4: Add input field to JSX**

Add after the nickname input div, before the button:

```tsx
<div className="flex-1">
  <label htmlFor="partNumber" className="block text-sm font-medium text-gray-700 mb-1">
    Part Number (optional)
  </label>
  <input
    id="partNumber"
    type="text"
    value={partNumber}
    onChange={(e) => setPartNumber(e.target.value)}
    placeholder="e.g. MC-8812, SPR-005"
    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple"
  />
</div>
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: Compiles without errors.

---

### Task 4: PackageCard — Display partNumber

**Files:**
- Modify: `src/components/package-card.tsx`

- [ ] **Step 1: Add partNumber to PackageData interface**

```typescript
interface PackageData {
  // ... existing fields
  partNumber: string | null
  // ... rest
}
```

- [ ] **Step 2: Add partNumber display line**

After the nickname display div, add:

```tsx
{pkg.partNumber && (
  <div className="text-xs text-gray-500 truncate">
    🔧 {pkg.partNumber}
  </div>
)}
```

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Compiles without errors.

---

### Task 5: Dashboard — Search Bar + Filter

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add search state**

```typescript
const [search, setSearch] = useState('')
```

- [ ] **Step 2: Add filtered packages with useMemo**

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react'

const filteredPackages = useMemo(() => {
  if (!search.trim()) return packages
  const q = search.toLowerCase()
  return packages.filter(
    (p) =>
      p.trackingNumber.toLowerCase().includes(q) ||
      (p.nickname && p.nickname.toLowerCase().includes(q)) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(q))
  )
}, [packages, search])
```

- [ ] **Step 3: Add search bar to header**

After the Refresh All button and before AddPackageForm, add:

```tsx
<input
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search tracking number, nickname, part number..."
  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-fedex-purple focus:outline-none focus:ring-1 focus:ring-fedex-purple mb-4"
/>
```

Or better, integrate it between the title row and the form. Place it after the header row and before AddPackageForm.

- [ ] **Step 4: Use filteredPackages for rendering**

Change `packages.map` to `filteredPackages.map` and update the count:

```typescript
{filteredPackages.length === 0 ? ( ... ) : (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {filteredPackages.map((pkg) => ( ... ))}
  </div>
)}
```

Update the package count to show search context when filtering:

```typescript
<p className="text-sm text-gray-500 mt-1">
  {search.trim()
    ? `${filteredPackages.length} of ${packages.length} packages`
    : `${packages.length} package${packages.length !== 1 ? 's' : ''} tracked`
  }
</p>
```

- [ ] **Step 5: Build check**

```bash
npm run build
```

Expected: Compiles without errors.

---

### Task 6: Smoke Test + Commit

- [ ] **Step 1: Start dev server**

```bash
lsof -ti:3100 | xargs kill -9 2>/dev/null
sleep 1
npx next dev -p 3100 &>/tmp/nextdev.log &
sleep 4
```

- [ ] **Step 2: Create a package with partNumber**

```bash
curl -s -X POST http://localhost:3100/api/packages \
  -H "Content-Type: application/json" \
  -d '{"trackingNumber":"794798798798","nickname":"Test","partNumber":"MC-8812"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('partNumber:', d.get('partNumber'))"
```

Expected: `partNumber: MC-8812`

- [ ] **Step 3: Verify dashboard renders**

```bash
curl -s http://localhost:3100/ | grep -o "FedEx Tracking"
```

Expected: `FedEx Tracking`

- [ ] **Step 4: Run test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 6: Commit all changes**

```bash
git add -A && git commit -m "feat: add part number binding and search

- Add partNumber field to Package model
- Add part number input to add-package form
- Display part number on package card
- Add real-time search filtering by trackingNumber/nickname/partNumber"
```
