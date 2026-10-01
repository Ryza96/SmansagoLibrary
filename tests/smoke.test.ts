import { describe, it, expect, afterAll } from 'vitest'
import { getPrisma } from '../src/main/repositories/base/prisma'

const prisma = getPrisma()

describe('Smoke Test', () => {
  it('should connect to temp DB and create/read a Curriculum row', async () => {
    const created = await prisma.curriculum.create({
      data: {
        name: 'Test Curriculum',
      },
    })

    expect(created.id).toBeDefined()
    expect(created.name).toBe('Test Curriculum')

    const found = await prisma.curriculum.findUnique({
      where: { id: created.id },
    })

    expect(found).not.toBeNull()
    expect(found?.name).toBe('Test Curriculum')

    // Cleanup
    await prisma.curriculum.delete({ where: { id: created.id } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })
})
