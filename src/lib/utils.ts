export function parseJsonArray<T>(json: string | null | undefined, fallback: T[] = []): T[] {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}
