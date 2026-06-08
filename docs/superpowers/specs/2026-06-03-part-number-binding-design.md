# Part Number Binding — Design Spec

## Goal

Allow users to associate a factory material part number (料號) with each tracked FedEx package, and search/filter packages by any field including part number.

## Data Model

Add `partNumber` (nullable string) to the `Package` Prisma model:

```
model Package {
  ...
  partNumber String?
  ...
}
```

- Nullable — existing packages are unaffected
- Not unique — multiple packages can share the same part number

## API Changes

### POST /api/packages

Accept optional `partNumber` field in request body (in addition to `trackingNumber` and `nickname`).

### GET /api/packages

No change — returns all packages. Client-side filtering.

## UI Changes

### AddPackageForm

第三个 input：Part Number，放在 Nickname 下方。optional，placeholder "e.g. MC-8812, SPR-005".

### PackageCard

當 `partNumber` 有值時，在 nickname 下方顯示一行：
```
🔧 MC-8812
```

### Dashboard Search Bar

- 文字輸入框放在 header 區，Refresh All 按鈕左側
- `onChange` 即時過濾（無需按 Enter）
- 過濾邏輯：case-insensitive match `trackingNumber`、`nickname`、`partNumber`
- 有搜尋文字時，只顯示符合的卡片
- 用 `useMemo` 避免不必要的重算

## Files Changed

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `partNumber String?` |
| `src/app/api/packages/route.ts` | Accept + persist `partNumber` |
| `src/components/add-package-form.tsx` | Add part number input |
| `src/components/package-card.tsx` | Display part number |
| `src/app/page.tsx` | Add search bar + filter logic |

## Open Questions (resolved)

- **Field name**: `partNumber` (not `materialCode`)
- **Input method**: Manual input in form
- **Search behavior**: Real-time filter on keystroke
- **Edit after creation**: Not required for v1 (delete + re-add if needed)
