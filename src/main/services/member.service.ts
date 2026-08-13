import { MemberRepository } from '../repositories/member.repository'
import { EnrollmentRepository } from '../repositories/enrollment.repository'
import { ClassRepository } from '../repositories/class.repository'
import { NumberGeneratorService } from './number-generator.service'
import { getPrisma } from '../repositories/base/prisma'
import { runTransaction } from '../repositories/base/transaction'
import { getMemberType } from '../../shared/config/member-type'
import type { MemberDTO, CreateMemberDTO, UpdateMemberDTO } from '../../shared/dto/member'
import { AppError } from '../../../electron/main/errorHandler'
import { promises as fsp } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  MEMBER_PHOTO_MIME,
  validateMemberPhotoFile,
} from '../infrastructure/asset/member-photo-config'
import { resizeMemberPhotoImage } from '../infrastructure/asset/member-photo-resize'
import { moveFilePreserving, resolveWithin } from '../infrastructure/restore/fs-utils'

// WO MEMBER PHOTO — foto anggota diperluas pada MemberService existing.
// Mengikuti pola WO SAM (BookService.saveCover) yang sama dengan sampul buku:
//   • ctor menerima assetMemberPhotosDir (direktori penyimpanan foto);
//   • savePhoto / removePhoto — satu-satunya manipulasi file foto;
//   • validasi & resize di main (downscale-only ≤ 512×512, contain);
//   • invariant: file foto lama TIDAK dihapus sebelum DB commit; gagal di
//     tengah → rollback penuh (kondisi seperti sebelum replace);
//   • renderer TIDAK pernah menyentuh file; semua error via AppError(err.message).
// Path yang disimpan di DB = relatif ('assets/member-photos/<file>'), bukan absolut.

const PHOTO_ERROR_MESSAGES: Record<string, string> = {
  UNSUPPORTED_FORMAT: 'Format file tidak didukung. Gunakan PNG, JPG, JPEG, atau WEBP.',
  EMPTY: 'File foto kosong.',
  TOO_LARGE: 'Ukuran file foto melebihi 2 MB.',
}

function classInfoFrom(
  enrollment:
    | {
        classId: string
        class: {
          educationLevel: string
          parallel: string
          curriculum: { id: string; name: string } | null
        }
        academicYear: { id: string; name: string; isActive: boolean } | null
      }
    | null
    | undefined
): MemberDTO['classInfo'] {
  if (!enrollment) return null
  return {
    id: enrollment.classId,
    educationLevel: enrollment.class.educationLevel,
    parallel: enrollment.class.parallel,
    academicYear: enrollment.academicYear
      ? { id: enrollment.academicYear.id, name: enrollment.academicYear.name, isActive: enrollment.academicYear.isActive }
      : null,
    curriculum: enrollment.class.curriculum
      ? { id: enrollment.class.curriculum.id, name: enrollment.class.curriculum.name }
      : null
  }
}

function toDTO(
  member: NonNullable<Awaited<ReturnType<MemberRepository['findById']>>>,
  enrollment: Awaited<ReturnType<EnrollmentRepository['findActiveByMember']>>
): MemberDTO {
  return {
    id: member.id,
    memberNumber: member.memberNumber,
    fullName: member.fullName,
    memberType: member.memberType,
    gender: member.gender,
    nisn: member.nisn,
    nip: member.nip,
    nuptk: member.nuptk,
    nik: member.nik,
    birthPlace: member.birthPlace,
    birthDate: member.birthDate?.toISOString() ?? null,
    address: member.address,
    phone: member.phone,
    email: member.email,
    photoPath: member.photoPath,
    classId: member.classId,
    classInfo: classInfoFrom(enrollment),
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString()
  }
}

export class MemberService {
  constructor(
    private memberRepository: MemberRepository,
    private numberGeneratorService: NumberGeneratorService,
    private enrollmentRepository: EnrollmentRepository,
    private classRepository: ClassRepository,
    private assetMemberPhotosDir: string
  ) {}

  async findMany(search?: string, page?: number, limit?: number, memberType?: string) {
    const result = await this.memberRepository.findMany({ search, pagination: { page, limit }, memberType })
    return {
      ...result,
      data: result.data.map((m) => ({
        id: m.id,
        memberNumber: m.memberNumber,
        fullName: m.fullName,
        memberType: m.memberType,
        gender: m.gender,
        nisn: m.nisn,
        nip: m.nip,
        nuptk: m.nuptk,
        nik: m.nik,
        birthPlace: m.birthPlace,
        birthDate: m.birthDate?.toISOString() ?? null,
        address: m.address,
        phone: m.phone,
        email: m.email,
        photoPath: m.photoPath,
        classId: m.classId,
        classInfo: classInfoFrom(m.memberEnrollments?.[0]),
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString()
      }))
    }
  }

  async findById(id: string): Promise<MemberDTO> {
    const member = await this.memberRepository.findById(id)
    if (!member) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }
    const enrollment = await this.enrollmentRepository.findActiveByMember(id)
    return toDTO(member, enrollment)
  }

  async create(input: CreateMemberDTO): Promise<MemberDTO> {
    await this.validateUniqueness(input)

    const memberNumber = await this.numberGeneratorService.generateMemberNumber(input.memberType)

    // WO Manual Student Entry (Opsi A) — anggota siswa WAJIB membawa penempatan
    // kelas (academicYearId + classId). Saat disimpan, Member + MemberEnrollment
    // (ACTIVE) dibuat dalam SATU transaksi — mirror jalur import. Ini menutup
    // dead-end manual entry lama (member siswa tanpa enrollment aktif sehingga
    // tidak bisa meminjam, guard IT-1).
    if (getMemberType(input.memberType)?.hasAcademicRecord) {
      if (!input.classId || !input.academicYearId) {
        throw new AppError(400, 'Validation Error', 'Anggota siswa wajib memilih Tahun Ajaran dan Kelas')
      }
      const klass = await this.classRepository.findById(input.classId)
      if (!klass) {
        throw new AppError(400, 'Validation Error', `Kelas ${input.classId} tidak ditemukan`)
      }
      if (klass.academicYearId !== input.academicYearId) {
        throw new AppError(400, 'Validation Error', 'Kelas tidak termasuk Tahun Ajaran yang dipilih')
      }

      // Narrow `input.classId`/`input.academicYearId` ke local const agar TS
      // tidak kehilangan narrowing di dalam closure transaksi (properti
      // parameter tidak men-narrow melewati pemanggilan async/closure).
      const studentClassId: string = input.classId
      const studentAcademicYearId: string = input.academicYearId

      const created = await runTransaction(getPrisma(), async (tx) => {
        const member = await this.memberRepository.createWithTx(tx, {
          memberNumber,
          fullName: input.fullName,
          memberType: input.memberType,
          gender: input.gender,
          nisn: input.nisn,
          nip: input.nip,
          nuptk: input.nuptk,
          nik: input.nik,
          birthPlace: input.birthPlace,
          birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
          address: input.address,
          phone: input.phone,
          email: input.email,
          status: 'INACTIVE'
        })
        await this.enrollmentRepository.createActiveWithTx(tx, {
          memberId: member.id,
          classId: studentClassId,
          academicYearId: studentAcademicYearId
        })
        return member
      })

      // WO MEMBER PHOTO — simpan foto (jika dipilih pada form) SETELAH member
      // dibuat (id sudah ada). Transaksi student create tetap SATU (photo save
      // di luar transaksi; kegagalan foto TIDAK menggagalkan pembuatan member).
      if (typeof input.photoUpload === 'string' && input.photoUpload.length > 0) {
        await this.savePhoto(created.id, input.photoUpload)
      }

      return this.findById(created.id)
    }

    const created = await this.memberRepository.create({
      memberNumber,
      fullName: input.fullName,
      memberType: input.memberType,
      gender: input.gender,
      nisn: input.nisn,
      nip: input.nip,
      nuptk: input.nuptk,
      nik: input.nik,
      birthPlace: input.birthPlace,
      birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
      address: input.address,
      phone: input.phone,
      email: input.email,
      status: 'INACTIVE'
    })

    // WO MEMBER PHOTO — simpan foto (jika dipilih pada form) setelah member dibuat.
    if (typeof input.photoUpload === 'string' && input.photoUpload.length > 0) {
      await this.savePhoto(created.id, input.photoUpload)
    }

    return this.findById(created.id)
  }

  async update(id: string, input: UpdateMemberDTO): Promise<MemberDTO> {
    const existing = await this.memberRepository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }

    await this.validateUniqueness(input, id)

    // WO MEMBER PHOTO — photoUpload adalah path temp hasil dialog OS; dipisahkan
    // dari data member (tidak pernah disimpan ke DB). Disimpan sebagai file di
    // assetMemberPhotosDir; DB hanya menyimpan path relatif (photoPath).
    const { photoUpload, ...memberData } = input

    await this.memberRepository.update(id, {
      fullName: memberData.fullName,
      memberType: memberData.memberType,
      gender: memberData.gender,
      nisn: memberData.nisn,
      nip: memberData.nip,
      nuptk: memberData.nuptk,
      nik: memberData.nik,
      birthPlace: memberData.birthPlace,
      birthDate: memberData.birthDate ? new Date(memberData.birthDate) : undefined,
      address: memberData.address,
      phone: memberData.phone,
      email: memberData.email,
      status: memberData.status
    })

    if (typeof photoUpload === 'string' && photoUpload.length > 0) {
      await this.savePhoto(id, photoUpload)
    }

    return this.findById(id)
  }

  async delete(id: string): Promise<void> {
    const existing = await this.memberRepository.findById(id)
    if (!existing) {
      throw new AppError(404, 'Not Found', `Member ${id} tidak ditemukan`)
    }

    const borrowCount = await this.memberRepository.countBorrows(id)
    if (borrowCount > 0) {
      throw new AppError(400, 'Conflict', `Member ${id} tidak dapat dihapus karena memiliki riwayat peminjaman`)
    }

    await this.memberRepository.delete(id)
  }

  // WO MEMBER PHOTO — preview hasil dialog pilih file foto (main-side), pola
  // BookService.pickCoverPreview: validasi → resize → data URI untuk renderer.
  async pickPhotoPreview(filePath: string): Promise<{
    filePath: string
    sizeBytes: number
    previewUri: string
  }> {
    const extension = path.extname(filePath).toLowerCase()
    const sizeBytes = (await fsp.stat(filePath)).size
    this.assertValidPhoto(extension, sizeBytes)
    const buffer = await this.resizeWithError(filePath)
    const mime = MEMBER_PHOTO_MIME[extension]
    const previewUri = `data:${mime};base64,${buffer.toString('base64')}`
    return { filePath, sizeBytes, previewUri }
  }

  // WO MEMBER PHOTO — simpan foto dengan pola atomic save (BookService.saveCover):
  // validasi → resize → tulis temp → sisihkan target lama ke backup →
  // rename temp ke target → update DB → sukses: hapus backup + file lama.
  // Gagal di tengah → rollback penuh (disk & DB kembali ke keadaan sebelum save).
  async savePhoto(memberId: string, sourcePath: string): Promise<void> {
    const extension = path.extname(sourcePath).toLowerCase()
    const sizeBytes = (await fsp.stat(sourcePath)).size
    this.assertValidPhoto(extension, sizeBytes)
    const buffer = await this.resizeWithError(sourcePath)

    const dir = this.assetMemberPhotosDir
    await fsp.mkdir(dir, { recursive: true })
    const targetName = `member-photo-${memberId}${extension}`
    const target = resolveWithin(dir, targetName)
    const temp = resolveWithin(dir, `.${targetName}.tmp-${randomUUID()}`)
    const oldBackup = resolveWithin(dir, `.${targetName}.old-${randomUUID()}`)
    const hadTarget = await this.pathExists(target)
    // Tangkap path foto lama SEBELUM update menimpa photoPath di DB (file lama
    // bisa beda ekstensi — member-photo-<id>.jpg vs .png). Bila dibaca setelah
    // update, nama lama === nama baru sehingga file lama tak pernah bersih.
    const existingBefore = await this.memberRepository.findById(memberId)
    const previousPhotoPath = existingBefore?.photoPath ?? null

    try {
      await fsp.writeFile(temp, buffer)
      if (hadTarget) {
        // replace di tempat (ext sama): sisihkan foto lama agar tidak tertimpa
        // rename — backup inilah yang dipulihkan bila operasi gagal.
        await fsp.rename(target, oldBackup)
      }
      moveFilePreserving(temp, target)
      await this.memberRepository.update(memberId, { photoPath: `assets/member-photos/${targetName}` })
    } catch {
      // ROLLBACK — kembalikan ke keadaan sebelum save:
      //   hadTarget + backup ada → target = file baru → hapus, lalu pulihkan lama;
      //   hadTarget + backup tidak ada (rename sisih gagal) → target masih lama → jangan sentuh;
      //   !hadTarget → target (jika ada) = file baru → hapus.
      if (hadTarget) {
        if (await this.pathExists(oldBackup)) {
          await this.tryUnlink(target)
          try {
            await fsp.rename(oldBackup, target)
          } catch {
            // best-effort — backup dipertahankan (satu-satunya salinan foto lama)
          }
        }
      } else {
        await this.tryUnlink(target)
      }
      await this.tryUnlink(temp)
      throw new AppError(500, 'PhotoSaveError', 'Gagal menyimpan foto anggota.')
    }

    // SUCCESS — DB sudah menunjuk target: hapus backup (ext sama) + file foto
    // lama yang tak terpakai (member-photo-* ext beda, ditangkap sebelum update).
    try {
      await this.tryUnlink(oldBackup)
      if (previousPhotoPath) {
        const previousName = path.basename(previousPhotoPath)
        if (previousName !== targetName) {
          await this.tryUnlink(resolveWithin(dir, previousName))
        }
      }
    } catch {
      // best-effort — foto baru sudah tersimpan & DB sudah commit
    }
  }

  // WO MEMBER PHOTO — hapus foto anggota. DB di-null-kan TERLEBIH DAHULU (commit
  // sumber kebenaran), lalu file dihapus best-effort.
  async removePhoto(memberId: string): Promise<void> {
    const existing = await this.memberRepository.findById(memberId)
    if (!existing) return
    if (!existing.photoPath) return

    await this.memberRepository.update(memberId, { photoPath: null })

    const dir = this.assetMemberPhotosDir
    const fileName = path.basename(existing.photoPath)
    try {
      await fsp.unlink(resolveWithin(dir, fileName))
    } catch {
      // best-effort — DB sudah commit; file mungkin sudah tidak ada
    }
  }

  // WO MEMBER PHOTO — baca foto sebagai data URI untuk renderer (detail anggota).
  async getPhotoDataUri(memberId: string): Promise<string | null> {
    const existing = await this.memberRepository.findById(memberId)
    if (!existing || !existing.photoPath) return null

    const dir = this.assetMemberPhotosDir
    const fileName = path.basename(existing.photoPath)
    const extension = path.extname(fileName).toLowerCase()
    const buffer = await fsp.readFile(resolveWithin(dir, fileName))
    const mime = MEMBER_PHOTO_MIME[extension] ?? 'image/webp'
    return `data:${mime};base64,${buffer.toString('base64')}`
  }

  private assertValidPhoto(extension: string, sizeBytes: number): void {
    const error = validateMemberPhotoFile({ extension, sizeBytes })
    if (error) {
      throw new AppError(400, 'PhotoValidationError', PHOTO_ERROR_MESSAGES[error])
    }
  }

  private async resizeWithError(sourcePath: string): Promise<Buffer> {
    try {
      return await resizeMemberPhotoImage(sourcePath)
    } catch {
      throw new AppError(400, 'PhotoValidationError', 'File tidak dapat diproses sebagai gambar.')
    }
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async tryUnlink(filePath: string): Promise<void> {
    try {
      await fsp.unlink(filePath)
    } catch {
      // best-effort
    }
  }

  private async validateUniqueness(
    input: CreateMemberDTO | UpdateMemberDTO,
    excludeId?: string
  ): Promise<void> {
    if (input.nisn) {
      const existing = await this.memberRepository.findByNISN(input.nisn)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NISN ${input.nisn} sudah digunakan oleh member lain`)
      }
    }

    if (input.nip) {
      const existing = await this.memberRepository.findByNIP(input.nip)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NIP ${input.nip} sudah digunakan oleh member lain`)
      }
    }

    if (input.nuptk) {
      const existing = await this.memberRepository.findByNUPTK(input.nuptk)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NUPTK ${input.nuptk} sudah digunakan oleh member lain`)
      }
    }

    if (input.nik) {
      const existing = await this.memberRepository.findByNIK(input.nik)
      if (existing && existing.id !== excludeId) {
        throw new AppError(400, 'Conflict', `NIK ${input.nik} sudah digunakan oleh member lain`)
      }
    }
  }
}
