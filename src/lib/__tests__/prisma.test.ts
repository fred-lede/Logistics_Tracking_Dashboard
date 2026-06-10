import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from '../prisma'

describe('Prisma client', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('can execute a raw SQLite query', async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined()
  })

  it('can create and delete a package row', async () => {
    const trackingNumber = `TEST-${Date.now()}`

    const created = await prisma.package.create({
      data: {
        trackingNumber,
        carrier: 'fedex',
        events: '[]',
        partNumbers: '[]',
        subPackages: '[]',
      },
    })

    expect(created.trackingNumber).toBe(trackingNumber)

    await prisma.package.delete({ where: { id: created.id } })

    await expect(
      prisma.package.findUnique({ where: { id: created.id } }),
    ).resolves.toBeNull()
  })
})
