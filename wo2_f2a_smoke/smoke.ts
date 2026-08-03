import { PrismaClient } from '@prisma/client'

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

async function expectError(name: string, fn: () => Promise<unknown>, code?: string): Promise<void> {
  try {
    await fn()
    check(name, false, 'no error thrown')
  } catch (e) {
    const c = (e as { code?: string }).code
    if (code) {
      check(name, c === code, `error code=${c} expected=${code}`)
    } else {
      check(name, true, `error code=${c}`)
    }
  }
}

async function expectRawNotNull(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
    check(name, false, 'no error thrown')
  } catch (e) {
    const msg = (e as Error).message ?? ''
    check(name, msg.includes('NOT NULL constraint failed'), `message=${msg.slice(0, 160)}`)
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()

  console.log('--- Fixtures ---')
  const ay2024 = await prisma.academicYear.create({
    data: { name: '2024/2025', startDate: new Date('2024-07-01'), endDate: new Date('2025-06-30'), isActive: true }
  })
  const ay2025 = await prisma.academicYear.create({
    data: { name: '2025/2026', startDate: new Date('2025-07-01'), endDate: new Date('2026-06-30'), isActive: false }
  })
  const curriculum = await prisma.curriculum.create({ data: { name: 'Kurikulum Merdeka' } })
  const classX1 = await prisma.class.create({
    data: { academicYearId: ay2024.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: '1' }
  })
  const classX2 = await prisma.class.create({
    data: { academicYearId: ay2024.id, curriculumId: curriculum.id, educationLevel: 'X', parallel: '2' }
  })
  const member = await prisma.member.create({
    data: { memberNumber: 'S000001', fullName: 'Ani Budi', memberType: 'student', status: 'ACTIVE' }
  })
  check('fixtures created', !!(ay2024.id && ay2025.id && curriculum.id && classX1.id && classX2.id && member.id))

  console.log('--- MemberEnrollment: create + read + relations ---')
  const enroll1 = await prisma.memberEnrollment.create({
    data: { memberId: member.id, classId: classX1.id, academicYearId: ay2024.id, status: 'ACTIVE' }
  })
  const read1 = await prisma.memberEnrollment.findUnique({
    where: { id: enroll1.id },
    include: { member: true, class: true, academicYear: true }
  })
  expectEqual('status=ACTIVE', read1?.status, 'ACTIVE')
  check('leftAt=null', read1?.leftAt === null)
  check('enrolledAt set', !!read1?.enrolledAt)
  check('createdAt set', !!read1?.createdAt)
  expectEqual('include.member.fullName', read1?.member.fullName, 'Ani Budi')
  expectEqual('include.class.parallel', read1?.class.parallel, '1')
  expectEqual('include.academicYear.name', read1?.academicYear.name, '2024/2025')

  console.log('--- MemberEnrollment: @@index([memberId, status]) ---')
  const byMemberStatus = await prisma.memberEnrollment.findMany({
    where: { memberId: member.id, status: 'ACTIVE' }
  })
  expectEqual('findMany(memberId,status) count', byMemberStatus.length, 1)

  console.log('--- MemberEnrollment: @@index([classId]) ---')
  const byClass = await prisma.memberEnrollment.findMany({ where: { classId: classX1.id } })
  expectEqual('findMany(classId) count', byClass.length, 1)

  console.log('--- MemberEnrollment: 2 baris setahun (REDISTRIBUTED tengah tahun) ---')
  const enroll2 = await prisma.memberEnrollment.create({
    data: { memberId: member.id, classId: classX2.id, academicYearId: ay2024.id, status: 'REDISTRIBUTED' }
  })
  const allForMember = await prisma.memberEnrollment.findMany({
    where: { memberId: member.id, academicYearId: ay2024.id }
  })
  expectEqual('2 baris setahun (tanpa unique violation)', allForMember.length, 2)
  check('dua id berbeda', enroll1.id !== enroll2.id)

  console.log('--- MemberEnrollment: @@index([memberId, academicYearId]) ---')
  expectEqual('findMany(memberId,academicYearId) count', allForMember.length, 2)
  const byYear = await prisma.memberEnrollment.findMany({ where: { academicYearId: ay2024.id } })
  expectEqual('findMany(academicYearId) count', byYear.length, 2)

  console.log('--- MemberEnrollment: FK RESTRICT (delete Class ber-enrollment) ---')
  await expectError('delete Class with enrollment -> P2003', () => prisma.class.delete({ where: { id: classX1.id } }), 'P2003')

  console.log('--- MemberEnrollment: FK invalid classId -> P2003 ---')
  await expectError(
    'create with fake classId -> P2003',
    () =>
      prisma.memberEnrollment.create({
        data: { memberId: member.id, classId: 'FAKE', academicYearId: ay2024.id, status: 'ACTIVE' }
      }),
    'P2003'
  )

  console.log('--- MemberEnrollment: NO DEFAULT status (business rule di Service) ---')
  await expectError(
    'client rejects create without status (no default)',
    () =>
      prisma.memberEnrollment.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { memberId: member.id, classId: classX2.id, academicYearId: ay2024.id } as any
      })
  )
  await expectRawNotNull(
    'RAW insert omit status -> NOT NULL (no DB default)',
    () =>
      prisma.$executeRaw`INSERT INTO "MemberEnrollment" ("id", "memberId", "classId", "academicYearId", "updatedAt") VALUES (${`RAW-NOSTATUS-${Date.now()}`}, ${member.id}, ${classX2.id}, ${ay2024.id}, ${new Date().toISOString()})`
  )

  console.log('--- PromotionRun + PromotionRunItem: create + read + relasi ---')
  const run = await prisma.promotionRun.create({
    data: {
      fromYearId: ay2024.id,
      toYearId: ay2025.id,
      mode: 'AUTOMATIC',
      runBy: 'smoke',
      status: 'SUCCESS',
      summary: JSON.stringify({ promoted: 1, graduated: 1, noTarget: 1 })
    }
  })
  const item1 = await prisma.promotionRunItem.create({
    data: {
      promotionRunId: run.id,
      memberId: member.id,
      sourceClassId: classX1.id,
      targetClassId: classX2.id,
      outcome: 'PROMOTED'
    }
  })
  const item2 = await prisma.promotionRunItem.create({
    data: {
      promotionRunId: run.id,
      memberId: member.id,
      sourceClassId: classX1.id,
      targetClassId: null,
      outcome: 'GRADUATED'
    }
  })
  await prisma.promotionRunItem.create({
    data: {
      promotionRunId: run.id,
      memberId: member.id,
      sourceClassId: classX1.id,
      targetClassId: null,
      outcome: 'NO_TARGET'
    }
  })
  const runWithItems = await prisma.promotionRun.findUnique({
    where: { id: run.id },
    include: { items: true, fromYear: true, toYear: true }
  })
  expectEqual('run.mode', runWithItems?.mode, 'AUTOMATIC')
  expectEqual('run.status', runWithItems?.status, 'SUCCESS')
  expectEqual('run.items count', runWithItems?.items.length, 3)
  expectEqual('run.fromYear.name', runWithItems?.fromYear.name, '2024/2025')
  expectEqual('run.toYear.name', runWithItems?.toYear.name, '2025/2026')
  expectEqual('item1.outcome', item1.outcome, 'PROMOTED')
  expectEqual('item2.outcome', item2.outcome, 'GRADUATED')

  console.log('--- PromotionRunItem: @@index([promotionRunId], [memberId], [outcome]) ---')
  const byRun = await prisma.promotionRunItem.findMany({ where: { promotionRunId: run.id } })
  expectEqual('findMany(promotionRunId) count', byRun.length, 3)
  const byMember = await prisma.promotionRunItem.findMany({ where: { memberId: member.id } })
  expectEqual('findMany(memberId) count', byMember.length, 3)
  const byOutcome = await prisma.promotionRunItem.findMany({ where: { outcome: 'GRADUATED' } })
  expectEqual('findMany(outcome=GRADUATED) count', byOutcome.length, 1)

  console.log('--- PromotionRun: NO DEFAULT mode/status (business rule di Service) ---')
  await expectError(
    'client rejects create run without mode (no default)',
    () =>
      prisma.promotionRun.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { fromYearId: ay2024.id, toYearId: ay2025.id, status: 'SUCCESS' } as any
      })
  )
  await expectError(
    'client rejects create run without status (no default)',
    () =>
      prisma.promotionRun.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { fromYearId: ay2024.id, toYearId: ay2025.id, mode: 'MAPPING' } as any
      })
  )
  await expectError(
    'client rejects create item without outcome (no default)',
    () =>
      prisma.promotionRunItem.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { promotionRunId: run.id, memberId: member.id, sourceClassId: classX1.id } as any
      })
  )
  await expectRawNotNull(
    'RAW insert run omit mode -> NOT NULL (no DB default)',
    () =>
      prisma.$executeRaw`INSERT INTO "PromotionRun" ("id", "fromYearId", "toYearId", "status") VALUES (${`RAW-NOMODE-${Date.now()}`}, ${ay2024.id}, ${ay2025.id}, 'SUCCESS')`
  )
  await expectRawNotNull(
    'RAW insert run omit status -> NOT NULL (no DB default)',
    () =>
      prisma.$executeRaw`INSERT INTO "PromotionRun" ("id", "fromYearId", "toYearId", "mode") VALUES (${`RAW-NOSTATUS-${Date.now()}`}, ${ay2024.id}, ${ay2025.id}, 'AUTOMATIC')`
  )
  await expectRawNotNull(
    'RAW insert item omit outcome -> NOT NULL (no DB default)',
    () =>
      prisma.$executeRaw`INSERT INTO "PromotionRunItem" ("id", "promotionRunId", "memberId", "sourceClassId") VALUES (${`RAW-NOOUTCOME-${Date.now()}`}, ${run.id}, ${member.id}, ${classX1.id})`
  )

  console.log('--- PromotionRunItem: FK invalid promotionRunId -> P2003 ---')
  await expectError(
    'create item with fake promotionRunId -> P2003',
    () =>
      prisma.promotionRunItem.create({
        data: { promotionRunId: 'FAKE', memberId: member.id, sourceClassId: classX1.id, outcome: 'ERROR' }
      }),
    'P2003'
  )

  await prisma.$disconnect()
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
