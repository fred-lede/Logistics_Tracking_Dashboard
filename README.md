# FedEx Tracking Dashboard

單使用者 FedEx 包裹追蹤儀表板，基於 Next.js 16 + Prisma 7 + SQLite + FedEx Sandbox API。

## 需求

- Node.js 20+
- npm
- FedEx API 金鑰（Sandbox 或 Production）

## 安裝

```bash
git clone <repo-url>
cd FedEx_Tracking_Dashboard
npm install
```

`npm install` 會自動執行 `prisma generate` 產生 Prisma Client。如果需要手動執行：

```bash
npx prisma generate
```

## 環境變數

複製範例檔並填入你的 FedEx API 憑證：

```bash
cp .env.local.example .env
```

`.env` 內容範例：

```
FEDEX_API_KEY=your_api_key
FEDEX_API_SECRET=your_api_secret
# FEDEX_ENV=production   # 取消註解切換至正式環境，預設為 sandbox
```

FedEx Sandbox API 測試號碼：`794798798798`

## 資料庫

Schema 已定義在 `prisma/schema.prisma`。第一次使用或修改 Schema 後需同步資料庫：

```bash
npx prisma db push
```

若要瀏覽資料庫內容：

```bash
npx prisma studio
```

## 啟動（開發）

```bash
npm run dev
```

伺服器執行於 http://localhost:3100

## 啟動（正式）

```bash
npm run build
npm start
```

正式伺服器預設執行於 http://localhost:3100（可透過 `process.env.PORT` 覆蓋，但 `npm start` 未指定，需手動設定 `PORT=3000 npm start`）。

## 停止

終端機中按下 `Ctrl + C` 即可停止伺服器。若背景執行中，可透過工作管理員終止 `next` 或 `node` 程序。

## 測試

```bash
npm test          # 單次執行
npm run test:watch  # 監聽模式
```

## Lint

```bash
npm run lint
```

## 建置檢查

```bash
npm run build     # TypeScript 檢查 + Production 建置
```

## 專案結構

```
src/
  app/              # Next.js App Router（頁面 + API 路由）
  components/       # React 元件
  lib/              # 共用邏輯（Prisma、追蹤供應商）
prisma/
  schema.prisma     # 資料庫 Schema
  migrations/       # 資料庫遷移
```

## FedEx API 備註

- Sandbox (`apis-sandbox.fedex.com`) 為模擬環境，無論輸入任何追蹤號碼皆回傳相同結果（HL 狀態）。
- 正式環境 (`apis.fedex.com`) 需將 `.env` 中的 `FEDEX_ENV=production` 取消註解。
- API 請求採用 OAuth 2.0 client_credentials 授權。
