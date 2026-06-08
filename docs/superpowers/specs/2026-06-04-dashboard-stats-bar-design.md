# Dashboard Dynamic Stats Bar

## Summary

Add a dynamic statistics bar between the dashboard header and the package card grid. Displays aggregate counts (total, delivered, in transit, exception, delayed) as clickable cards that filter the package list below.

## Design

### StatsBar Component (`src/components/stats-bar.tsx`)

A horizontal bar of 5 stat cards. Each card shows a number and a label. Clicking a card toggles its filter on/off.

**Props:**
```ts
interface StatsBarProps {
  packages: PackageData[]
  activeFilter: string | null
  onFilterChange: (key: string | null) => void
}
```

**Stat cards:**

| Key | Label (i18n) | Filter predicate |
|-----|-------------|-----------------|
| `null` (all) | All Tracked | no filter |
| `delivered` | Delivered | `p.status === 'DELIVERED'` |
| `inTransit` | In Transit | `['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE'].includes(p.status)` |
| `exception` | Exception | `['EXCEPTION', 'RETURN_TO_SENDER'].includes(p.status)` |
| `delayed` | Delayed | `p.status === 'DELAYED'` |

The "All" card count = packages.length. Each category card shows how many packages match its predicate, counting only packages whose status is non-null.

The count displayed on each card equals the number of packages matching that category's predicate. A category with 0 matches still shows "0" and is clickable (though it will result in an empty list).

Reuses existing `settings.statusDelivered`, `settings.statusInTransit`, `settings.statusException`, `settings.statusDelayed` i18n keys. "All Tracked" uses a new key `dashboard.allTracked`.

**Visual:**
- Horizontal flex/grid layout (equal-width cards)
- Each card: rounded background, centered text, large count number, small label
- Active card: purple border (`border-fedex-purple border-2`)
- Inactive card: subtle border (`border-gray-200`)
- The count number uses the same color as the corresponding status badge:
  - All: `text-gray-900`
  - Delivered: `text-green-500`
  - In Transit: `text-blue-500`
  - Exception: `text-red-500`
  - Delayed: `text-yellow-500`
- Responsive: on mobile (<768px) collapses to 3 rows (All + 2 per row or horizontal scroll)

### page.tsx Changes

1. **New state:** `const [statsFilter, setStatsFilter] = useState<string | null>(null)`

2. **Filter map:**
```ts
const STATS_FILTERS: Record<string, (p: PackageData) => boolean> = {
  delivered: (p) => p.status === 'DELIVERED',
  inTransit: (p) => ['IN_TRANSIT', 'PICKED_UP', 'ON_FEDEX_VEHICLE'].includes(p.status ?? ''),
  exception: (p) => ['EXCEPTION', 'RETURN_TO_SENDER'].includes(p.status ?? ''),
  delayed: (p) => p.status === 'DELAYED',
}
```

3. **Updated filteredPackages** — combine search + stats filter:
```ts
const filteredPackages = useMemo(() => {
  let list = packages
  if (search.trim()) {
    const q = search.toLowerCase()
    list = list.filter((p) =>
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

4. **Insert StatsBar** between the AddPackageForm and the package grid (or error banner). Positioned after the search/refresh area, before the grid.

5. **Empty state adjustment** — when no packages match the filter, show "No packages match the current filter" message.

### i18n

Add one new key to all 4 locale files:

```json
"dashboard": {
  ...
  "allTracked": "All Tracked"
}
```

### Files changed

- `src/components/stats-bar.tsx` (new)
- `src/app/page.tsx` (add state, filter, insert component)
- `messages/en.json` (+ allTracked)
- `messages/zh-TW.json` (+ allTracked)
- `messages/zh-CN.json` (+ allTracked)
- `messages/es-MX.json` (+ allTracked)

### Testing

- StatsBar renders 5 cards with correct counts
- Clicking a card sets the active filter
- Clicking the active card again clears the filter
- Filter + search stack correctly
- All cards show 0 when no packages match
- Mobile layout adapts

### Not in scope

- Table view — all packages stay as cards
- Sorting by stat — click = filter, not sort
- Charts or graphs — pure number display
- Server-side filtering — all computed client-side from loaded packages
