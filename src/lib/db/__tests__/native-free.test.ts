import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('native-free packaging guard', () => {
  it('does not declare native sqlite or prisma runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }

    for (const name of [
      'better-sqlite3',
      '@prisma/adapter-better-sqlite3',
      '@prisma/client',
      '@types/better-sqlite3',
      'prisma',
    ]) {
      expect(pkg.dependencies?.[name]).toBeUndefined()
      expect(pkg.devDependencies?.[name]).toBeUndefined()
    }

    for (const script of Object.values(pkg.scripts ?? {})) {
      expect(script).not.toContain('rebuild-standalone-native')
      expect(script).not.toContain('prisma generate')
      expect(script).not.toContain('better-sqlite3')
    }
  })
})
