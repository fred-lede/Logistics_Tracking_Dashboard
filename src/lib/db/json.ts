export function parseJsonArray<T>(json: string | null | undefined, fallback: T[] = []): T[] {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function parseJsonObject<T extends Record<string, unknown> = Record<string, unknown>>(
  json: string | null | undefined,
  fallback: T = {} as T,
): T {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

export function stringifyJson(value: unknown, fallback = '[]'): string {
  if (value === undefined || value === null) return fallback
  return JSON.stringify(value)
}
