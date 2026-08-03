import { PrismaClient } from '@prisma/client'
import { runBackfillEnrollment } from '../scripts/backfill-member-enrollment'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function expectEqual<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`)
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()

  console.log('--- Seed (DB gaya skema lama: Member ber-classId) ---')
  const ay = await prisma.academicYear.create({
    data: { name: '2024/2025', startDate: new Date('2024-07-01'), endDate: new Date('2025-06-30'), isActive: true }
  })
  const curriculum = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classA = await prisma.class.create({
    data: { academicYearId: ay.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: '1' }
  })
  const classB = await prisma.class.create({
    data: { academicYearId: ay.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: '2' }
  })

  const m1 = await prisma.member.create({
    data: { memberNumber: 'S000001', fullName: 'Ani', classId: classA.id, status: 'INACTIVE' }
  })
  const m2 = await prisma.member.create({
    data: { memberNumber: 'S000002', fullName: 'Budi', classId: classB.id, status: 'INACTIVE' }
  })
  const m3 = await prisma.member.create({
    data: { memberNumber: 'S000003', fullName: 'Cici', status: 'INACTIVE' }
  })

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF')
  await prisma.$executeRaw`INSERT INTO "Member" ("id", "number", "fullName", "classId", "status", "createdAt", "updatedAt") VALUES ('m-orphan', 'S000004', 'Dedi Orphan', 'CLASS-GHOST', 'INACTIVE', ${new Date().toISOString()}, ${new Date().toISOString()})`
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON')

  const orphan = await prisma.member.findUnique({ where: { id: 'm-orphan' }, include: { class: true } })
  check('orphan seeded with dangling classId (class=null)', orphan !== null && orphan.class === null)
  expectEqual('orphan.classId', orphan?.classId, 'CLASS-GHOST')

  console.log('--- RUN 1: backfill ---')
  const r1 = await runBackfillEnrollment(prisma)
  expectEqual('r1.membersWithClassId', r1.membersWithClassId, 3)
  expectEqual('r1.enrollmentsCreated', r1.enrollmentsCreated, 2)
  expectEqual('r1.skippedAlreadyActive', r1.skippedAlreadyActive, 0)
  expectEqual('r1.orphanMembers', r1.orphanMembers.length, 1)
  check('orphan reported with memberId', r1.orphanMembers[0]?.memberId === 'm-orphan')
  check('orphan reported with classId', r1.orphanMembers[0]?.classId === 'CLASS-GHOST')

  console.log('--- Verify enrollment rows (RUN 1) ---')
  const e1 = await prisma.memberEnrollment.findFirst({ where: { memberId: m1.id } })
  expectEqual('m1.status ACTIVE', e1?.status, 'ACTIVE')
  check('m1.leftAt null', e1?.leftAt === null)
  check('m1.enrolledAt set', !!e1?.enrolledAt)
  check('m1.createdAt set', !!e1?.createdAt)
  expectEqual('m1.academicYearId == class.academicYearId', e1?.academicYearId, ay.id)
  expectEqual('m1.classId', e1?.classId, classA.id)

  const e2 = await prisma.memberEnrollment.findFirst({ where: { memberId: m2.id } })
  expectEqual('m2.status ACTIVE', e2?.status, 'ACTIVE')
  expectEqual('m2.academicYearId', e2?.academicYearId, ay.id)

  const m3Count = await prisma.memberEnrollment.count({ where: { memberId: m3.id } })
  expectEqual('m3 (no classId) has 0 enrollment', m3Count, 0)

  const orphanCount = await prisma.memberEnrollment.count({ where: { memberId: 'm-orphan' } })
  expectEqual('orphan has 0 enrollment', orphanCount, 0)

  const activePerMember = await prisma.memberEnrollment.groupBy({
    by: ['memberId'],
    where: { status: 'ACTIVE', leftAt: null },
    _count: true
  })
  check('M1 has exactly 1 ACTIVE', activePerMember.find((x) => x.memberId === m1.id)?._count === 1)
  check('M2 has exactly 1 ACTIVE', activePerMember.find((x) => x.memberId === m2.id)?._count === 1)

  const total1 = await prisma.memberEnrollment.count()
  expectEqual('total enrollments after RUN1', total1, 2)

  console.log('--- RUN 2: idempotency (run ulang tidak menambah) ---')
  const r2 = await runBackfillEnrollment(prisma)
  expectEqual('r2.membersWithClassId', r2.membersWithClassId, 3)
  expectEqual('r2.enrollmentsCreated', r2.enrollmentsCreated, 0)
  expectEqual('r2.skippedAlreadyActive', r2.skippedAlreadyActive, 2)
  expectEqual('r2.orphanMembers', r2.orphanMembers.length, 1)

  const total2 = await prisma.memberEnrollment.count()
  expectEqual('total enrollments after RUN2 (tidak bertambah)', total2, 2)
  const dupM1 = await prisma.memberEnrollment.count({ where: { memberId: m1.id } })
  expectEqual('m1 masih 1 enrollment (bukan 2)', dupM1, 1)
  const dupM2 = await prisma.memberEnrollment.count({ where: { memberId: m2.id } })
  expectEqual('m2 masih 1 enrollment (bukan 2)', dupM2, 1)

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
