import path from 'node:path'

export function databaseUrlToPath(url = process.env.DATABASE_URL || 'file:./dev.db'): string {
  if (!url.startsWith('file:')) return url
  const rawPath = url.slice('file:'.length)
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath)
}
