import { prisma } from '../database'
import { Prisma } from '@prisma/client'

export class MemberRepository {
  findById(id: string) {
    return prisma.member.findUnique({ where: { id } })
  }

  update(id: string, data: Prisma.MemberUpdateInput) {
    return prisma.member.update({ where: { id }, data })
  }

  search(query: string) {
    return prisma.member.findMany({
      where: {
        OR: [
          { fullName: { contains: query } },
          { number: { contains: query } }
        ]
      },
      orderBy: { fullName: 'asc' },
      take: 20
    })
  }
}
