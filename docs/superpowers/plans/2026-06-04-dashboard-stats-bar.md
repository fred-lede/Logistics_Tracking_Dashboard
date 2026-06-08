# Dashboard Stats Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic statistics bar between the dashboard header and package grid that shows aggregate counts and enables click-to-filter.

**Architecture:** Client-side StatsBar component receives `packages` array, computes counts (total/delivered/inTransit/exception/delayed), and emits filter changes. Page component combines stats filter with existing search filter via useMemo.

**Tech Stack:** React 19, TypeScript, Tailwind v4, next-intl, Vitest + React Testing Library

---

### File Map

```
src/components/stats-bar.tsx         (new — StatsBar component)
src/components/__tests__/stats-bar.test.tsx  (new — tests)
messages/en.json                     (modify — add allTracked)
messages/zh-TW.json                  (modify — add allTracked)
messages/zh-CN.json                  (modify — add allTracked)
messages/es-MX.json                  (modify — add allTracked)
src/app/page.tsx                     (modify — add state + filter + insert component)
```

---

### Task 1: Write StatsBar component + tests

**Files:**
- Create: `src/components/stats-bar.tsx`
- Create: `src/components/__tests__/stats-bar.test.tsx`

- [ ] **Step 1: Create StatsBar component**

```tsx
// src/components/stats-bar.tsx
'use client'

import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

interface PackageData {
  id: string
  status: string | null
}

interface StatsBarProps {
  packages: PackageData[]
  activeFilter: string | null
  onFilterChange: (key: string | null) => void
}

interface StatCard {
  key: string | null
  labelKey: string
  count: number
  color: string
  predicate: (p: PackageData) => boolean
}

export function StatsBar({ packages, activeFilter, onFilterChange }: StatsBarProps) {
  const dt = useTranslations('dashboard')

  const cards: StatCard[] = useMemo(() => [
    {
      key: null,
      labelKey: 'allTracked',
      count: packages.length,
      color: 'text-gray-900',
      predicate: () => true,
    },
    {
      key: 'delivered',
      labelKey: 'statusDelivered',
      count: packages.filter((p) => p.status === 'DELIVERED').length,
      color: 'text-green-500',
      predicate: (p) => p.status === 'DELIVERED',
    },
    {
      key: 'inTransit',
      labelKey: 'statusInTransit',
      count: packages.filter((p) => ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE'].includes(p.status ?? '')).length,
      color: 'text-blue-500',
      predicate: (p) => ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE'].includes(p.status ?? ''),
    },
    {
      key: 'exception',
      labelKey: 'statusException',
      count: packages.filter((p) => ['EXCEPTION', 'RETURN_TO_SENDER'].includes(p.status ?? '')).length,
      color: 'text-red-500',
      predicate: (p) => ['EXCEPTION', 'RETURN_TO_SENDER'].includes(p.status ?? ''),
    },
    {
      key: 'delayed',
      labelKey: 'statusDelayed',
      count: packages.filter((p) => p.status === 'DELAYED').length,
      color: 'text-yellow-500',
      predicate: (p) => p.status === 'DELAYED',
    },
  ], [packages])

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cards.map((card) => {
        const isActive = activeFilter === card.key
        return (
          <button
            key={card.key ?? '__all__'}
            onClick={() => onFilterChange(isActive ? null : card.key)}
            className={`flex flex-1 min-w-0 flex-col items-center rounded-xl px-3 py-2.5 transition-colors ${
              isActive
                ? 'border-2 border-fedex-purple bg-purple-50'
                : 'border border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <span className={`text-xl font-bold leading-none ${card.color}`}>
              {card.count}
            </span>
            <span className="mt-1 text-xs text-gray-500 leading-tight text-center">
              {dt(card.labelKey as any)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write tests**

```tsx
// src/components/__tests__/stats-bar.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatsBar } from '../stats-bar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      allTracked: 'All Tracked',
      statusDelivered: 'Delivered',
      statusInTransit: 'In Transit',
      statusException: 'Exception',
      statusDelayed: 'Delayed',
    }
    return map[key] ?? key
  },
}))

const makePackages = (statuses: (string | null)[]) =>
  statuses.map((s, i) => ({ id: String(i), status: s }))

describe('StatsBar', () => {
  it('renders 5 stat cards', () => {
    render(<StatsBar packages={[]} activeFilter={null} onFilterChange={() => {}} />)
    expect(screen.getByText('All Tracked')).toBeTruthy()
    expect(screen.getByText('Delivered')).toBeTruthy()
    expect(screen.getByText('In Transit')).toBeTruthy()
    expect(screen.getByText('Exception')).toBeTruthy()
    expect(screen.getByText('Delayed')).toBeTruthy()
  })

  it('shows correct counts', () => {
    const packages = makePackages(['DELIVERED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', null])
    render(<StatsBar packages={packages} activeFilter={null} onFilterChange={() => {}} />)
    const counts = screen.getAllByText(/^\d+$/)
    expect(counts).toHaveLength(5)
    // All = 5, Delivered = 2, In Transit = 1, Exception = 1, Delayed = 0
    expect(counts[0].textContent).toBe('5')
    expect(counts[1].textContent).toBe('2')
    expect(counts[2].textContent).toBe('1')
    expect(counts[3].textContent).toBe('1')
    expect(counts[4].textContent).toBe('0')
  })

  it('highlights active filter card', () => {
    render(<StatsBar packages={[]} activeFilter="delivered" onFilterChange={() => {}} />)
    // The active card should have border-fedex-purple class
    const buttons = screen.getAllByRole('button')
    const deliveredBtn = buttons[1] // index 1 = delivered
    expect(deliveredBtn.className).toContain('border-fedex-purple')
  })

  it('calls onFilterChange when clicking a card', () => {
    const onFilterChange = vi.fn()
    render(<StatsBar packages={[]} activeFilter={null} onFilterChange={onFilterChange} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1]) // click Delivered
    expect(onFilterChange).toHaveBeenCalledWith('delivered')
  })

  it('clears filter when clicking active card', () => {
    const onFilterChange = vi.fn()
    render(<StatsBar packages={[]} activeFilter="delivered" onFilterChange={onFilterChange} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1]) // click Delivered (already active)
    expect(onFilterChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/components/__tests__/stats-bar.test.tsx 2>&1`
Expected: FAIL — "Cannot find module '../stats-bar'" or similar

- [ ] **Step 4: Run tests to verify they pass** (after writing the component in Step 1)

Run: `npx vitest run src/components/__tests__/stats-bar.test.tsx 2>&1`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/stats-bar.tsx src/components/__tests__/stats-bar.test.tsx
git commit -m "feat: add StatsBar component with click-to-filter"
```

---

### Task 2: Add i18n keys for "All Tracked"

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/zh-TW.json`
- Modify: `messages/zh-CN.json`
- Modify: `messages/es-MX.json`

- [ ] **Step 1: Add `allTracked` to each locale**

In each `messages/*.json`, add `"allTracked": "<translation>"` inside the `dashboard` block, after the `"noResults"` line.

```json
// messages/en.json — dashboard section
"noResults": "No packages match your search",
"allTracked": "All Tracked",
"refreshAll": "Refresh All",

// messages/zh-TW.json
"allTracked": "全部",

// messages/zh-CN.json
"allTracked": "全部",

// messages/es-MX.json
"allTracked": "Todos",
```

- [ ] **Step 2: Commit**

```bash
git add messages/en.json messages/zh-TW.json messages/zh-CN.json messages/es-MX.json
git commit -m "feat: add allTracked i18n key"
```

---

### Task 3: Integrate StatsBar into dashboard page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add statsFilter state and filter map**

After line 37 (`const [visible, setVisible] = useState(true)`), add:

```tsx
const [statsFilter, setStatsFilter] = useState<string | null>(null)
```

After line 40 (after the fetchPackages useCallback), add the filter map:

```tsx
const STATS_FILTERS: Record<string, (p: PackageData) => boolean> = {
  delivered: (p) => p.status === 'DELIVERED',
  inTransit: (p) => ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE'].includes(p.status ?? ''),
  exception: (p) => ['EXCEPTION', 'RETURN_TO_SENDER'].includes(p.status ?? ''),
  delayed: (p) => p.status === 'DELAYED',
}
```

- [ ] **Step 2: Update filteredPackages to combine both filters**

Replace the existing `filteredPackages` useMemo block (lines ~57-66) with:

```tsx
const filteredPackages = useMemo(() => {
  let list = packages
  if (search.trim()) {
    const q = search.toLowerCase()
    list = list.filter(
      (p) =>
        p.trackingNumber.toLowerCase().includes(q) ||
        (p.nickname && p.nickname.toLowerCase().includes(q)) ||
        (p.partNumbers && p.partNumbers.some((pn) => pn.toLowerCase().includes(q)))
    )
  }
  if (statsFilter && STATS_FILTERS[statsFilter]) {
    list = list.filter(STATS_FILTERS[statsFilter])
  }
  return list
}, [packages, search, statsFilter])
```

- [ ] **Step 3: Update the package count text to reflect active filter**

In the JSX, replace the package count line (around line 133-137) with:

```tsx
<p className="text-sm text-gray-500 mt-1">
  {statsFilter
    ? `${filteredPackages.length} of ${packages.length} packages`
    : search.trim()
      ? `${filteredPackages.length} of ${packages.length} packages`
      : `${packages.length} package${packages.length !== 1 ? 's' : ''} tracked`
  }
</p>
```

- [ ] **Step 4: Import and insert StatsBar**

Add import at top (after the existing imports):

```tsx
import { StatsBar } from '@/components/stats-bar'
```

Insert `<StatsBar>` between the AddPackageForm and the error banner (after line 154, before the `{error && ...}` block):

```tsx
<StatsBar
  packages={packages}
  activeFilter={statsFilter}
  onFilterChange={setStatsFilter}
/>
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: integrate StatsBar into dashboard with combined search+stats filtering"
```

---

### Task 4: Verify

- [ ] **Step 1: Run all tests**

Run: `npx vitest run 2>&1`
Expected: All tests pass (including the 5 new StatsBar tests)

- [ ] **Step 2: Run lint**

Run: `npm run lint 2>&1`
Expected: No errors (pre-existing locale-switcher error may still show — unrelated)

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1`
Expected: Compiles successfully, no TypeScript errors

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix: address review feedback"
```

---

### Task 5: Spec review — post-implementation spec update (optional)

If the implementation deviated from the spec in any way, update the spec document to match what was actually built.

```bash
git add docs/superpowers/specs/2026-06-04-dashboard-stats-bar-design.md
git commit -m "docs: sync spec with implementation"
```
