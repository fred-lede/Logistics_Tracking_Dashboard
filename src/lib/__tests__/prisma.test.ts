import { afterAll, describe, expect, it } from 'vitest'
import { db } from '../db'
import { prisma } from '../prisma'

describe('Legacy prisma compatibility export', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('points legacy prisma imports at the native-free db facade', () => {
    expect(prisma).toBe(db)
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
