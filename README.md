# Logistics Tracking Dashboard

多渠道包裹追蹤儀表板，支援 **FedEx** 與 **DHL Express** 雙物流商、多通道通知（Teams/Telegram/WeChat/WhatsApp）、AI 延遲分析與摘要翻譯、**TV 儀表板模式**、4 語言 i18n，以及 Electron 桌面封裝。

作者：**Fred Wang**

## 技術棧

- **前端框架：** Next.js 16.2.7（App Router）
- **語言：** TypeScript（strict）
- **資料庫：** SQLite via Prisma 7（`@prisma/client` + `@prisma/adapter-better-sqlite3`）
- **樣式：** Tailwind CSS v4
- **i18n：** next-intl（en / zh-TW / zh-CN / es-MX）
- **桌面封裝：** Electron 41 + electron-builder
- **測試：** Vitest + React Testing Library（87 項測試）
- **套件管理：** npm

## 系統需求

- **Node.js** 20.x（建議 20.20+）
- **npm** 10+
- **C++ 編譯工具鏈**（編譯 `better-sqlite3` 原生模組用）
  - **macOS：** Xcode Command Line Tools（`xcode-select --install`）
  - **Windows：** Visual Studio Build Tools 或 `npm install -g windows-build-tools`
  - **Linux：** `build-essential`（`sudo apt install build-essential`）

## 開發環境安裝

```bash
git clone https://github.com/fred-lede/Logistics_Tracking_Dashboard.git
cd Logistics_Tracking_Dashboard
npm install
```

`npm install` 會自動執行 `prisma generate` 產生 Prisma Client。

### Carrier API 憑證

啟動後在應用程式內的 **Settings → Carrier Settings** 頁面輸入憑證：

| 物流商 | 憑證 | 測試追蹤號碼 |
|--------|------|-------------|
| FedEx | API Key + API Secret（Sandbox / Production） | `794798798798` |
| DHL Express | DHL-API-Key（Consumer Key） | 需等候 API 審核 |

環境變數（亦可直接在設定頁面輸入）：

```env
FEDEX_API_KEY=your_api_key
FEDEX_API_SECRET=your_api_secret
# FEDEX_ENV=production   # 取消註解切換至正式環境，預設 sandbox
# DHL_API_KEY=your_consumer_key
```

### 資料庫

首次啟動 Electron 桌面版時會自動建立資料庫。若單獨使用 Next.js：

```bash
npx prisma db push
```

瀏覽資料庫內容：

```bash
npx prisma studio
```

### 啟動開發模式

```bash
npm run dev          # Electron + Next.js 開發伺服器（port 3310）
npm run dev:next     # 僅 Next.js 開發伺服器（port 3100，無 Electron）
```

開發模式下修改原始碼會自動熱更新。關閉視窗時應用程式隱藏至系統匣，按 `Ctrl+C` 終止程序才會完全退出。

## 測試與 Lint

```bash
npm test             # 執行測試套件
npm run test:watch   # 監聽模式
npm run lint         # ESLint 檢查
npm run build        # TypeScript 檢查 + Production 建置
```

## 編譯桌面安裝包

### 重要：不可交叉編譯

**每個平台的安裝包只能在該平台的原生環境上編譯。** `better-sqlite3` 是 C++ 原生模組，`node-gyp` 不支援跨平台編譯。在 macOS 上編譯 Windows 版會產出 macOS 二進位檔，Windows 無法載入。

### macOS

在 macOS 上執行：

```bash
npm run package:mac
```

產出檔案位於 `release/`：
- `Logistics Dashboard-<版本>-mac.dmg`
- `Logistics Dashboard-<版本>-mac.zip`

### Windows

在 Windows 上執行：

```bash
npm run package:win
```

產出檔案位於 `release/`：
- `Logistics Dashboard Setup <版本>.exe`（NSIS 安裝程式）
- `Logistics Dashboard <版本> Portable.exe`（免安裝版）

### Linux

在 Linux（Ubuntu/Debian）上執行：

```bash
npm run package:linux
```

產出檔案位於 `release/`：
- `Logistics Dashboard-<版本>.AppImage`
- `logistics-tracking-dashboard_<版本>_amd64.deb`

### 使用 GitHub Actions CI（推薦）

若需跨平台構建但沒有對應作業系統，使用 CI：

```bash
git push origin main   # 推送後自動觸發
```

CI 會在三個原生 runner 上分別編譯：
- `macos-latest` → macOS 安裝包
- `windows-latest` → Windows 安裝包
- `ubuntu-latest` → Linux 安裝包

成品可在 GitHub Actions → Artifacts 下載。

## 注意事項

### 原生模組 ABI

`better-sqlite3` 的 `.node` 二進位檔與 Node.js ABI 版本綁定：

| 環境 | Node.js | ABI |
|------|---------|-----|
| 系統 Node 20 | 20.x | 115 |
| Electron 41 | 24.x | 145 |

- **開發模式**（`npm run dev`）：Electron 使用自身的 ABI 145 二進位檔
- **測試模式**（`npm test`）：系統 Node 需要 ABI 115 二進位檔
- 切換模式若遇到 `NODE_MODULE_VERSION` 錯誤，重建原生模組：

```bash
# 重建給系統 Node
npm rebuild better-sqlite3

# 重建給 Electron
npx @electron/rebuild -f -w better-sqlite3
```

### 編譯流程說明

`npm run package:*` 依序執行三個步驟：

1. **`npm run build`** — Next.js 產出 `.next/standalone/`（含 Node 20 ABI 115 的 `better-sqlite3`）
2. **`node scripts/rebuild-standalone-native.cjs <platform>`** — 用 `@electron/rebuild` 將 standalone 內的 `better-sqlite3` 重建為 Electron ABI 145。若偵測到交叉編譯會立即報錯退出。
3. **`electron-builder`** — 打包安裝程式。`npmRebuild: false` 避免 electron-builder 重複重建而覆蓋正確的二進位檔。

### 不可使用 ASAR

`electron-builder.yml` 中 `asar: false`。原因是 Next.js 伺服器和 `setup-db.cjs` 以 `ELECTRON_RUN_AS_NODE=1` 子程序方式執行，純 Node.js 無法讀取 ASAR 封存內的檔案。

### 資料庫與設定檔路徑

打包後的應用程式，資料與設定存放於使用者目錄：

| 平台 | 路徑 |
|------|------|
| macOS | `~/Library/Application Support/logistics-tracking-dashboard/` |
| Windows | `%APPDATA%\logistics-tracking-dashboard\` |
| Linux | `~/.config/logistics-tracking-dashboard/` |

內含：
- `dev.db` — SQLite 資料庫
- `.carrier-creds.json` — FedEx + DHL API 憑證
- `.system-settings.json` — 伺服器模式設定
- `electron.log` — 執行日誌

### Prisma Schema 變更

修改 `prisma/schema.prisma` 後需建立遷移：

```bash
npx prisma migrate dev --name <描述>
```

### macOS Gatekeeper

本專案未使用 Apple Developer 簽章（`identity: null`）。首次開啟 DMG 時：
1. 右鍵點擊 App → 選擇「打開」
2. 或在「系統設定 → 隱私與安全性」中允許開啟

### Windows Defender

Windows 可能將未簽章的 `.exe` 標記為 SmartScreen 風險。點擊「更多資訊 → 仍要執行」即可。

## 應用程式功能

| 功能 | 說明 |
|------|------|
| **多物流商** | FedEx + DHL Express 包裹追蹤，動態切換物流商 |
| **多通道通知** | Teams / Telegram / WeChat / WhatsApp + Electron 原生通知 |
| **每日 / 定期摘要** | 定時發送包裹狀態總覽 |
| **AI 延遲分析** | AI 自動判斷延遲風險等級與原因，支援多語言翻譯 |
| **TV 儀表板** | 全螢幕 TV 模式，自動輪播、跑馬燈摘要、音效警示 |
| **i18n** | 繁體中文 / 簡體中文 / English / Español (México) |
| **系統匣** | 關閉視窗隱藏至系統匣，背景持續執行 |
| **跨平台** | macOS (.dmg/.zip) / Windows (.exe/.portable) / Linux (.AppImage/.deb) |
| **About 對話框** | 工具列 ℹ 按鈕 + Electron 原生選單，顯示作者與版本資訊 |

## 專案結構

```
├── src/                        # Next.js 應用程式
│   ├── app/                    # App Router（頁面 + API 路由）
│   │   ├── page.tsx            # 主儀表板頁面
│   │   ├── settings/           # 通知設定頁面
│   │   └── api/                # REST API 路由
│   ├── components/             # React 元件
│   │   └── tv/                 # TV 儀表板模式（TvCard、TvView、TvClock…）
│   ├── lib/                    # 共用邏輯
│   │   ├── tracking/           # 物流商抽象層（TrackingProvider + registry）
│   │   │   └── providers/      # FedEx、DHL 實作
│   │   └── notification/       # 通知抽象層（provider + registry + service）
│   └── i18n/                   # next-intl 設定
├── electron/                   # Electron 主程序
│   ├── main.js                 # 主程序（自訂 About 對話框）
│   ├── preload.js              # contextBridge IPC
│   ├── tray.js                 # 系統匣
│   ├── notification.js         # 原生桌面通知
│   ├── setup-db.cjs            # 首次啟動資料庫初始化
│   └── electron-builder.yml    # 封裝設定
├── prisma/                     # Prisma Schema + 遷移
├── messages/                   # i18n 翻譯檔（en/zh-TW/zh-CN/es-MX）
├── scripts/                    # 建置腳本
│   ├── post-build.cjs          # Next.js 建置後處理
│   ├── rebuild-standalone-native.cjs  # 重建 standalone 原生模組給 Electron
│   └── generate-icons.mjs      # 產生應用程式圖示（支援自訂 icon.png）
├── assets/                     # 應用程式圖示（放 icon.png 即可自動產生各平台格式）
└── .github/workflows/          # CI 跨平台構建
```

## 應用程式圖示

在 `assets/icon.png` 放入自訂圖示（至少 512×512），執行建置時會自動產生所有平台格式：

```
icon.png → icon-512.png, icon-256.png, icon-32.png, icon.icns (macOS),
           icon.ico (Windows), favicon.ico, tray-icon.png
```

若無自訂圖示則使用內建預設圖示。

## 授權

Private — All rights reserved.
