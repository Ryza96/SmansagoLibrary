import type { Prisma } from '@prisma/client'
import { MemberRepository } from '../repositories/member.repository'

/*
 * Number generator untuk nomor anggota.
 *
 * Strategi (keputusan PO #4 / RFC v2 §7):
 *   - Nomor anggota = identifier permanen, TIDAK pernah digunakan kembali.
 *   - DILARANG `count()+1` (reuse nomor setelah delete / collides saat ada gap).
 *   - Gunakan **max suffix** yang benar-benar tersimpan di database + 1.
 *
 * Optimasi repository (WO-5 P1.1):
 *   - Repository hanya mengembalikan SATU nilai: memberNumber TERBESAR dengan
 *     prefix tertentu (findFirst + orderBy desc, dihitung langsung di database).
 *     Tidak lagi memuat seluruh nomor ber-prefix ke Node.js lalu mencari max
 *     suffix di sisi client — efisien untuk dataset besar.
 *
 * Mapping prefix (keputusan PO / RFC v2 §0 #2):
 *   - student  -> S-
 *   - teacher  -> G-
 *   - general  -> U-
 *   - memberType lain/undefined -> S- (default siswa)
 *
 * Semantik rollback (keputusan PO #12):
 *   - `allocateMemberNumbers` memakai transaction yang DIBERIKAN pemanggil.
 *   - Alokasi hidup dan mati bersama transaksi: bila transaksi ROLLBACK,
 *     nomor yang dialokasikan TIDAK dianggap terpakai (belum ada baris tersimpan).
 *     Nomor baru baru resmi setelah COMMIT berhasil.
 */

const MEMBER_TYPE_PREFIX: Record<string, string> = {
  student: 'S',
  teacher: 'G',
  general: 'U'
}

const DEFAULT_PREFIX = 'S'
const MEMBER_NUMBER_PAD_WIDTH = 6

export function resolveMemberNumberPrefix(memberType?: string): string {
  if (!memberType) return DEFAULT_PREFIX
  return MEMBER_TYPE_PREFIX[memberType] ?? DEFAULT_PREFIX
}

export function parseMemberNumberSuffix(memberNumber: string, prefix: string): number {
  if (!memberNumber.startsWith(`${prefix}-`)) return -1
  const suffix = Number(memberNumber.slice(prefix.length + 1))
  return Number.isFinite(suffix) ? suffix : -1
}

export function formatMemberNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(MEMBER_NUMBER_PAD_WIDTH, '0')}`
}

export function maxSuffixFrom(memberNumbers: readonly string[], prefix: string): number {
  return memberNumbers.reduce((max, memberNumber) => {
    const suffix = parseMemberNumberSuffix(memberNumber, prefix)
    return suffix > max ? suffix : max
  }, 0)
}

export class NumberGeneratorService {
  constructor(private memberRepository: MemberRepository) {}

  async generateMemberNumber(memberType?: string): Promise<string> {
    const prefix = resolveMemberNumberPrefix(memberType)
    const maxSuffix = await this.maxSuffixForPrefix(prefix)
    return formatMemberNumber(prefix, maxSuffix + 1)
  }

  async allocateMemberNumbers(
    tx: Prisma.TransactionClient,
    count: number,
    memberType?: string
  ): Promise<string[]> {
    if (count <= 0) return []

    const prefix = resolveMemberNumberPrefix(memberType)
    const maxSuffix = await this.maxSuffixForPrefix(prefix, tx)

    return Array.from({ length: count }, (_, i) => formatMemberNumber(prefix, maxSuffix + i + 1))
  }

  private async maxSuffixForPrefix(
    prefix: string,
    tx?: Prisma.TransactionClient
  ): Promise<number> {
    const last = await this.memberRepository.findLastMemberNumberByPrefix(prefix, tx)
    return last === null ? 0 : Math.max(parseMemberNumberSuffix(last, prefix), 0)
  }
}
