# 多頻道通知功能設計規格

## 概述

在 FedEx 包裹追蹤儀表板中新增多頻道個人通知功能。支援兩種通知類型：
- **狀態變更通知**：包裹狀態改變時即時發送
- **彙整通知**：每日日報 + 定期（每 N 小時）狀態彙整

頻道支援 Microsoft Teams（Webhook + Graph API）、Telegram、企業微信（WeCom）、WhatsApp。

UI 支援 4 語系：English、繁體中文、简体中文、Español (México)。

## 資料模型

### NotificationChannel

儲存每個通知頻道的設定。

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String @id @default(cuid()) | 主鍵 |
| type | String | `teams` / `telegram` / `wechat` / `whatsapp` |
| label | String | 使用者自訂名稱，如「倉庫通知群」 |
| enabled | Boolean @default(true) | 此頻道是否啟用 |
| mode | String? | Teams 專用：`webhook` / `graph`，其他頻道為 null |
| config | String @default("{}") | JSON：Webhook URL、Bot Token、Azure AD 等設定 |
| notifyOnStatuses | String @default("[]") | JSON 陣列，哪些 status 觸發「狀態變更通知」 |
| sendSummary | Boolean @default(false) | 此頻道是否接收「彙整通知」 |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

**config JSON 結構（依 type 而異）：**

- `teams` / `webhook` 模式：`{ "webhookUrl": "..." }`
- `teams` / `graph` 模式：`{ "tenantId": "...", "clientId": "...", "clientSecret": "...", "teamId": "...", "channelId": "..." }`
- `telegram`：`{ "botToken": "..." }`
- `wechat`：`{ "webhookUrl": "..." }`（企業微信 Bot）
- `whatsapp`：`{ "apiKey": "...", "phoneNumberId": "..." }`（Meta Cloud API）

### NotificationContact

每個頻道下的通知聯絡人。

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String @id @default(cuid()) | 主鍵 |
| channelId | String | FK → NotificationChannel.id |
| name | String | 顯示名稱，如「王大明」 |
| identifier | String | 平台識別碼：Teams UPN / Telegram chat_id / 手機號碼 |
| enabled | Boolean @default(true) | |
| createdAt | DateTime @default(now()) | |

### NotificationLog

發送紀錄（用於除錯與重試）。

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String @id @default(cuid()) | 主鍵 |
| packageId | String | 觸發通知的包裹 ID |
| channelId | String | 發送的頻道 ID |
| notificationType | String | `status_change` / `summary` |
| status | String | 觸發時的包裹狀態 |
| success | Boolean | 是否發送成功 |
| errorMessage | String? | 錯誤訊息 |
| sentAt | DateTime @default(now()) | |

### NotificationSetting

全域通知設定（單一紀錄）。

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | String @id @default("global") | 固定值 `"global"` |
| enabled | Boolean @default(true) | 全域通知開關 |
| dailySummaryEnabled | Boolean @default(false) | 每日日報開關 |
| dailySummaryTime | String @default("09:00") | 每日日報發送時間（HH:MM） |
| periodicInterval | Int @default(0) | 定期彙整間隔（小時），0 = 停用 |
| lastDailySent | String? | 上次日報發送日期（YYYY-MM-DD） |
| lastPeriodicSent | DateTime? | 上次定期彙整發送時間 |

## 架構

### NotificationProvider 介面

仿照現有 `TrackingProvider` 模式，新增 `NotificationProvider` 抽象層：

```typescript
interface NotificationMessage {
  type: 'status_change' | 'summary'
  packageId?: string
  trackingNumber?: string
  nickname?: string | null
  status?: string
  eta?: string | null
  origin?: string | null
  destination?: string | null
  events?: TrackingEvent[]
  // summary 模式使用
  summaryDate?: string
  packages?: {
    trackingNumber: string
    nickname: string | null
    status: string
    destination: string | null
    eta: string | null
    lastEvent: string | null
  }[]
}

interface NotificationResult {
  success: boolean
  error?: string
}

interface NotificationProvider {
  channelType: string
  send(
    config: Record<string, unknown>,
    contacts: { name: string; identifier: string }[],
    message: NotificationMessage
  ): Promise<NotificationResult>
}
```

### Provider Registry

比照 `TrackingProviderRegistry`，新增 `NotificationProviderRegistry`：

- `registerProvider(provider: NotificationProvider): void`
- `getProvider(channelType: string): NotificationProvider | undefined`
- `getAllProviders(): NotificationProvider[]`

### NotificationService

核心協調服務：

```typescript
class NotificationService {
  async checkAndNotify(
    pkg: PackageData,
    oldStatus: string | null,
    newStatus: string
  ): Promise<void>

  async sendSummary(): Promise<void>
}
```

**checkAndNotify 流程（狀態變更）：**
1. 檢查全域通知是否啟用 → 否則跳過
2. 查詢所有 enabled 的 NotificationChannel
3. 過濾出 `notifyOnStatuses` 包含 `newStatus` 的頻道
4. 對每個頻道：
   a. 查詢其 enabled 的 NotificationContact
   b. 取得對應的 NotificationProvider
   c. 呼叫 `provider.send(config, contacts, message)`
   d. 寫入 NotificationLog

**sendSummary 流程（彙整通知）：**
1. 檢查全域通知是否啟用 → 否則跳過
2. 查詢所有 `enabled && sendSummary == true` 的 NotificationChannel
3. 查詢所有包裹當前狀態
4. 對每個頻道（流程同上）

### 觸發點

**狀態變更觸發：** 在 `src/app/api/packages/[id]/refresh/route.ts` 中：

```typescript
const oldStatus = pkg.status
const newStatus = result.status

// 更新包裹資料（既有邏輯）

// 通知檢查
if (newStatus && oldStatus !== newStatus) {
  await notificationService.checkAndNotify(pkg, oldStatus, newStatus)
}
```

**彙整觸發：** 伺服器啟動後建立計時器：

```typescript
// 在 layout.tsx 或獨立模組中初始化
function startSummaryScheduler(service: NotificationService) {
  // 每日日報：每分鐘檢查一次，是否已到 dailySummaryTime 且今日尚未發送
  setInterval(async () => {
    const setting = await getNotificationSetting()
    if (!setting.enabled || !setting.dailySummaryEnabled) return

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    if (setting.lastDailySent === today) return

    const [hour, minute] = setting.dailySummaryTime.split(':').map(Number)
    if (now.getHours() === hour && now.getMinutes() === minute) {
      await service.sendSummary()
      await updateLastDailySent(today)
    }
  }, 60_000)

  // 定期彙整：依設定間隔發送
  if (setting.periodicInterval > 0) {
    setInterval(async () => {
      await service.sendSummary()
    }, setting.periodicInterval * 3_600_000)
  }
}
```

## 頻道實作

### Microsoft Teams

**雙模式支援：**

| 模式 | 設定方式 | 可發送對象 |
|------|---------|-----------|
| Webhook | Incoming Webhook URL | 指定頻道 |
| Graph API | Azure AD 應用註冊（Tenant ID / Client ID / Secret） | 指定頻道 + 個別人員（UPN） |

**Webhook 模式：** 發送 Adaptive Card JSON 至 Webhook URL。

**Graph API 模式：** 使用 Microsoft Graph REST API 發送 `chatMessage` 至 `teams/{teamId}/channels/{channelId}/messages`，以及 `chatMessage` 至個人 `users/{upn}/chats`。採 client_credentials OAuth 流程。

### Telegram

**設定方式：** Bot Token（透過 @BotFather 建立 Bot 取得）。

**發送方式：** POST `https://api.telegram.org/bot{token}/sendMessage`。

**聯絡人識別碼：** Chat ID（使用者與 Bot 對話後可取得）。

### 企業微信 (WeCom)

**設定方式：** 群機器人 Webhook URL。

**發送方式：** POST JSON 至群機器人 Webhook。

**聯絡人：** 目前以群組通知為主；個人通知需企業微信自建應用 API（後續可擴充）。

### WhatsApp

**設定方式：** Meta Cloud API（需 Facebook Business 驗證）。

**發送方式：** POST `https://graph.facebook.com/v22.0/{phone-number-id}/messages`。

**聯絡人識別碼：** 手機號碼（含國碼）。

## 通知訊息範本

### 狀態變更通知

```
📦 [包裹狀態] - [暱稱/追蹤號碼]

狀態: DELIVERED (已送達)
追蹤號碼: 794798798798
目的地: 台北市大安區...
預估送達: 2026-06-05 14:30
最新事件: 包裹已送達 (2026-06-05 14:28 - 台北)
```

### 彙整通知（每日日報 / 定期彙整）

```
📊 包裹狀態彙整 - 2026-06-04 14:00

總計: 5 個包裹

🟢 DELIVERED (2)
  • MC-8812 / 794798798798 → 已送達 06-04 10:30
  •  Birthday Gift / 794798798799 → 已送達 06-03 16:00

🟡 IN_TRANSIT (2)
  • PO-12345 / 794798798800 → 預計 06-06
  •  / 794798798801 → 預計 06-07

🔴 EXCEPTION (1)
  •  / 794798798802 → 異常: 地址錯誤
```

### 各頻道格式

| 頻道 | 格式 |
|------|------|
| Teams（Webhook） | Adaptive Card JSON |
| Teams（Graph API） | HTML 格式 |
| Telegram | Markdown / HTML |
| 企業微信 | Markdown |
| WhatsApp | 純文字 |

## 設定頁面

### 路由

`/settings`

左側導航 + 右側內容區。

### 區塊

1. **全域通知開關** — Toggle
2. **彙整通知設定**
   - 每日日報：啟用 Toggle + 時間選擇（HH:MM）
   - 定期彙整：間隔選擇（停用 / 1h / 2h / 4h / 6h / 12h / 24h）
3. **頻道列表** — 每張卡片顯示：
   - 頻道圖示 + 名稱 + 自訂標籤
   - 啟用/停用 Toggle
   - 通知類型切換：「狀態變更通知」和/或「彙整通知」checkbox
   - 狀態 change badge（DELIVERED, EXCEPTION, ...）
   - 人員數量摘要
   - 點選卡片展開編輯對話框
4. **頻道編輯對話框** — 包含：
   - 頻道名稱
   - 模式切換（Teams 限定）
   - Webhook URL / Bot Token 等設定欄位
   - 狀態變更通知時機（status 勾選框）
   - 彙整通知 toggle
   - 人員管理（新增/編輯/刪除）
5. **新增頻道** — 選擇類型後建立

## API 路由

| 方法 | 路由 | 說明 |
|------|------|------|
| GET | /api/settings | 回傳全域設定 + 所有頻道（含聯絡人） |
| PUT | /api/settings | 更新全域設定（開關、彙整排程） |
| POST | /api/settings/channels | 新增通知頻道 |
| GET | /api/settings/channels | 列出所有頻道（含聯絡人） |
| GET | /api/settings/channels/[id] | 取得單一頻道（含聯絡人） |
| PUT | /api/settings/channels/[id] | 更新頻道設定 |
| DELETE | /api/settings/channels/[id] | 刪除頻道 |
| POST | /api/settings/channels/[id]/contacts | 新增聯絡人 |
| PUT | /api/settings/contacts/[id] | 更新聯絡人 |
| DELETE | /api/settings/contacts/[id] | 刪除聯絡人 |

## 國際化 (i18n)

### 套件

`next-intl` — Next.js App Router 原生整合。

### 語系

| 語系代碼 | 名稱 |
|----------|------|
| en | English |
| zh-TW | 繁體中文 |
| zh-CN | 简体中文 |
| es-MX | Español (México) |

### 語系切換

Cookie 儲存語系選擇（無路徑前綴），右上角下拉選單切換。選擇後重新整理頁面。

### 翻譯檔案

```
messages/
  en.json
  zh-TW.json
  zh-CN.json
  es-MX.json
```

按功能區分命名空間：

```json
{
  "settings": {
    "title": "設定",
    "notifications": "通知",
    "globalToggle": "通知功能",
    "dailySummary": "每日日報",
    "periodicSummary": "定期彙整",
    ...
  },
  "channels": {
    "teams": "Microsoft Teams",
    "telegram": "Telegram",
    "wechat": "企業微信",
    "whatsapp": "WhatsApp",
    ...
  },
  "common": {
    "save": "儲存",
    "cancel": "取消",
    "add": "新增",
    ...
  }
}
```

### 覆蓋範圍

所有面向使用者的字串：
- 設定頁面（全部）
- 通知頻道 UI（全部）
- 現有儀表板元件（標題、搜尋提示、空狀態、按鈕等）

## 測試策略

- `NotificationProvider` 單元測試：各 provider send() 方法
- `NotificationService` 單元測試：checkAndNotify / sendSummary 邏輯（mock provider）
- `NotificationScheduler` 單元測試：排程觸發邏輯
- API 路由測試：settings CRUD
- 整合測試：refresh 觸發通知流程
- i18n：翻譯金鑰完整性（所有語系擁有相同 key set）
