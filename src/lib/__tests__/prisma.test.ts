import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../prisma'

describe('Prisma client', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('can query the database', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined()
  })
})
