import { Prisma, PrismaClient } from '@prisma/client'
import { runTransaction } from '../src/main/repositories/base/transaction'

export interface BackfillOrphanMember {
  memberId: string
  memberNumber: string | null
  classId: string | null
}

export interface BackfillMemberEnrollmentResult {
  membersWithClassId: number
  enrollmentsCreated: number
  skippedAlreadyActive: number
  orphanMembers: BackfillOrphanMember[]
}

export async function runBackfillEnrollment(
  prisma: PrismaClient
): Promise<BackfillMemberEnrollmentResult> {
  const members = await prisma.member.findMany({
    where: { classId: { not: null } },
    include: { class: true }
  })

  const result: BackfillMemberEnrollmentResult = {
    membersWithClassId: members.length,
    enrollmentsCreated: 0,
    skippedAlreadyActive: 0,
    orphanMembers: []
  }

  const toCreate: Prisma.MemberEnrollmentCreateManyInput[] = []

  for (const member of members) {
    const existingActive = await prisma.memberEnrollment.findFirst({
      where: { memberId: member.id, status: 'ACTIVE', leftAt: null }
    })
    if (existingActive) {
      result.skippedAlreadyActive += 1
      continue
    }

    if (!member.class) {
      result.orphanMembers.push({
        memberId: member.id,
        memberNumber: member.memberNumber,
        classId: member.classId
      })
      continue
    }

    toCreate.push({
      memberId: member.id,
      classId: member.classId as string,
      academicYearId: member.class.academicYearId,
      status: 'ACTIVE'
    })
  }

  if (toCreate.length > 0) {
    await runTransaction(prisma, async (tx) => {
      await tx.memberEnrollment.createMany({ data: toCreate })
    })
    result.enrollmentsCreated = toCreate.length
  }

  return result
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const result = await runBackfillEnrollment(prisma)
    console.log('=== BACKFILL RECONCILIATION ===')
    console.log(`membersWithClassId: ${result.membersWithClassId}`)
    console.log(`enrollmentsCreated: ${result.enrollmentsCreated}`)
    console.log(`skippedAlreadyActive: ${result.skippedAlreadyActive}`)
    console.log(`orphanMembers: ${result.orphanMembers.length}`)
    for (const orphan of result.orphanMembers) {
      console.log(
        `  [ORPHAN] memberId=${orphan.memberId} memberNumber=${orphan.memberNumber} classId=${orphan.classId}`
      )
    }
    const total = await prisma.memberEnrollment.count()
    console.log(`totalEnrollments: ${total}`)
    console.log('=== DONE ===')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
