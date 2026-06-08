# LLM Model Auto-Detect & Custom Provider

## Goal

1. Model field: change from text input to dropdown (auto-fetched from provider API), with manual input fallback
2. Add 5th "Custom (OpenAI-compatible)" provider — user-named, configurable base URL, optional API key

## Provider Model List APIs

| Provider | Endpoint | Auth | Filter |
|----------|----------|------|--------|
| Ollama | `GET {baseUrl}/tags` | None | Exclude `embedding`-only models |
| OpenAI | `GET https://api.openai.com/v1/models` | Bearer {apiKey} | Include only `gpt-*`, `o*`, `chatgpt-*` (chat models) |
| Anthropic | `GET https://api.anthropic.com/v1/models` | x-api-key + anthropic-version | All (Anthropic returns few models) |
| Google | `GET https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}` | API key in query | Include only models with `generateContent` method |
| Custom | `GET {baseUrl}/models` | Bearer {apiKey} (if provided) | All (best-effort) |

## API Route

**`GET /api/llm/models?provider=...&apiKey=...&baseUrl=...`**

- Server-side fetch to the appropriate provider's list models endpoint
- Returns `{ models: [{ id: string, name?: string, size?: string }] }`
- On error returns `{ models: [], error: string }`
- Ollama: reads `baseUrl` from query or DB; auto-appends `/api` if missing
- Custom: uses the user-provided `baseUrl` + `/models` (OpenAI-compatible endpoint)
- Cloud providers: uses saved API key from DB if query param is masked or missing
- Timeout: 10s per request

## Prisma Schema Changes

Add `providerLabel` and `apiKeyOptional` fields to `LLMSetting`:

```prisma
model LLMSetting {
  id              String  @id @default("global")
  provider        String  @default("openai")
  providerLabel   String?              // Custom name for "custom" provider
  apiKey          String?
  baseUrl         String?
  model           String  @default("gpt-4o-mini")
  enabled         Boolean @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Migration: `add_provider_label`

## Provider Implementation

### Custom Provider (`src/lib/llm/providers/custom.ts`)

- Uses `createOpenAI({ baseURL, apiKey })` from `@ai-sdk/openai` — OpenAI-compatible format
- `apiKey` is optional (some self-hosted endpoints don't require auth)
- Model name passed through directly
- `name` property uses `providerLabel` from settings, fallback to "custom"

### `resolveProvider()` in `service.ts`

Add case `'custom'`: reads `baseUrl` (required), `apiKey` (optional), `model` from settings.

## UI Changes (`llm-settings.tsx`)

### Provider Dropdown

Add 5th option: `custom` → label: "Custom (OpenAI-compatible)"

### Conditional Fields by Provider

| Field | openai | anthropic | google | ollama | custom |
|-------|--------|-----------|--------|--------|--------|
| API Key | required | required | required | hidden | **optional** |
| Base URL | hidden | hidden | hidden | shown | **shown** |
| Custom Name | hidden | hidden | hidden | hidden | **shown** |

### Model Field

Replace `<input>` with:
- A `<select>` dropdown populated from `/api/llm/models`
- A "Custom model name..." option at the bottom that reveals a text `<input>` for manual entry
- Auto-fetch models when provider, baseUrl, or apiKey changes
- Show loading spinner during fetch
- Show error message + fallback to text input if fetch fails
- Ollama models: show size info (e.g. "gemma3:1b (815 MB)")
- Preserve current model selection if it still exists in fetched list

### Fetch Trigger

- On provider change
- On baseUrl change (debounced 500ms)
- On apiKey change (when saved / on blur)
- Manual refresh button next to dropdown

## i18n Keys (added to `llm` namespace)

| Key | en | zh-TW | zh-CN | es-MX |
|-----|-----|-------|-------|-------|
| `providerCustom` | Custom (OpenAI-compatible) | 自訂（OpenAI 相容） | 自定义（OpenAI 兼容） | Personalizado (compatible con OpenAI) |
| `customProviderName` | Provider Name | 供應商名稱 | 供应商名称 | Nombre del proveedor |
| `customProviderNamePlaceholder` | e.g. LM Studio, vLLM | 例：LM Studio、vLLM | 例：LM Studio、vLLM | ej. LM Studio, vLLM |
| `apiKeyOptional` | API Key (optional) | API 金鑰（選填） | API 密钥（选填） | Clave API (opcional) |
| `fetchModels` | Refresh Models | 重新載入模型 | 重新加载模型 | Actualizar modelos |
| `fetchingModels` | Loading models… | 載入模型中… | 加载模型中… | Cargando modelos… |
| `fetchModelsFailed` | Failed to load models | 載入模型失敗 | 加载模型失败 | Error al cargar modelos |
| `customModel` | Custom model name... | 自訂模型名稱… | 自定义模型名称… | Nombre de modelo personalizado... |
| `modelSize` | {model} ({size}) | {model}（{size}） | {model}（{size}） | {model}（{size}） |
| `noModelsFound` | No models found | 找不到模型 | 未找到模型 | No se encontraron modelos |

## Error Handling

- List models API failure → show error message, allow manual model name input
- Ollama not running → empty list + error, user can still type model name manually
- Custom provider unreachable → same pattern
- API key missing for cloud providers → return error "API key required"
- Timeout after 10s → return error "Provider timeout"
