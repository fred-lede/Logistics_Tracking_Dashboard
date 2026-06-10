import { describe, expect, it, vi } from 'vitest'

describe('db facade selection', () => {
  it('uses sqlite by default', async () => {
    vi.resetModules()
    vi.doMock('@/lib/system-config', () => ({
      loadSystemSettings: () => ({ databaseMode: 'sqlite' }),
    }))

    const mod = await import('@/lib/db')

    expect(mod.db).toBeDefined()
    expect(mod.createActiveDbFacade()).toBeDefined()
  })
})
