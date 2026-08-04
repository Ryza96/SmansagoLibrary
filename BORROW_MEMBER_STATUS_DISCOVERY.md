# BORROW_MEMBER_STATUS_DISCOVERY — Bug Report: "Member tidak aktif" saat Peminjaman

## 1. Validasi Dilakukan di Mana?

**File:** `src/main/services/borrow.service.ts:133`

```typescript
async create(input: CreateBorrowingInput): Promise<BorrowingDTO> {
  const member = await this.memberRepository.findById(input.memberId)
  if (!member) {
    throw new AppError(404, 'Not Found', `Member ${input.memberId} tidak ditemukan`)
  }

  if (member.status !== 'ACTIVE') {          // ← BARIS 133
    throw new AppError(400, 'Validation Error',
      `Member ${member.fullName} tidak aktif`)
  }
  // ...lanjut ke validasi dueDate, bookCopyIds, dll
```

Satu-satunya tempat `Member.status` dibaca untuk eligibilitas peminjaman. Error message `tidak aktif` berasal dari baris ini.

---

## 2. Apakah Ini Business Rule Lama (Legacy)?

**Ya.** Guard `member.status !== 'ACTIVE'` di `BorrowService.create` diwarisi dari legacy (`electron/main/services/borrowing.service.ts`). Saat migrasi ke stack baru (WO-006B), validasi ini **dipertahankan persis** — bukan baru.

Namun, **konteks seputarnya sudah berubah secara fundamental:**

| Aspek | Legacy (pre-Master Data) | Sekarang (post-E-3) |
|-------|--------------------------|----------------------|
| Member.status ditulis saat | `MemberService.create()` (hardcode `ACTIVE`) | `MemberService.create()` → **`INACTIVE`** |
| Kapan jadi ACTIVE | Langsung dari create | Hanya lewat `close(PROMOTED/REPEATED/REDISTRIBUTED)` atau `PromotionExecute` |
| Siapa yang enroll | Tidak ada enrollment | `EnrollmentService.enroll()` |

Guard lama mengasumsikan **member baru langsung `ACTIVE`** (legacy tidak punya enrollment). Asumsi itu kini **salah**.

---

## 3. Apakah Member.status Dijadikan ACTIVE Setelah Borrow/Berhasil?

**TIDAK.** `BorrowService.create` tidak mengubah `Member.status`. Borrow hanya membaca status (gate), bukan menulisnya.

### Kapan `Member.status` berubah menjadi `ACTIVE`?

Hanya ada **2 jalur** yang mengatur `Member.status = 'ACTIVE'`:

| # | Jalur | File | Mekanisme |
|---|-------|------|-----------|
| 1 | `EnrollmentService.close(status)` | `src/main/services/enrollment.service.ts:96-113` | `memberStatusForTerminalAcademic(status)` → `PROMOTED/REPEATED/REDISTRIBUTED → 'ACTIVE'` |
| 2 | `PromotionExecuteService.executeAutomatic()` | `src/main/services/promotion-execute.service.ts:145-148` | `memberStatusForTerminalAcademic(outcome)` → `updateStatusWithTx(ACTIVE)` |

### Kapan `Member.status` = `INACTIVE`?

| # | Jalur | File | Mekanisme |
|---|-------|------|-----------|
| 1 | `MemberService.create()` | `src/main/services/member.service.ts:109` | Hardcode `status: 'INACTIVE'` |
| 2 | `MemberImportService.writePhase()` | `src/main/services/member-import.service.ts:385` | Hardcode `status: 'INACTIVE'` |
| 3 | `EnrollmentService.close(GRADUATED/TRANSFERRED/DROPPED)` | `enrollment.service.ts:109-113` | `memberStatusForTerminalAcademic → 'INACTIVE'` |
| 4 | `PromotionExecuteService` (GRADUATED) | `promotion-execute.service.ts:159` | `updateStatusWithTx(INACTIVE)` |

### Gap: `EnrollmentService.enroll()` **TIDAK** mengubah `Member.status`

```typescript
// enrollment.service.ts:65-71
async enroll(input: CreateEnrollmentDTO): Promise<EnrollmentDTO> {
  // ...validasi...
  const record = await this.repository.create({
    memberId: input.memberId,
    classId: input.classId,
    academicYearId: input.academicYearId,
    status: ACADEMIC_STATUS.active,  // ← MemberEnrollment.status = ACTIVE
    note: input.note
  })
  // ❌ TIDAK ada: await this.memberRepository.update(member.id, { status: 'ACTIVE' })
  return toDTO(record)
}
```

**Alur lifecycle anggota baru:**
```
Create → INACTIVE
  ↓
Enroll → INACTIVE (enroll tidak sync Member.status)
  ↓
Attempt Borrow → ❌ "Member tidak aktif" (borrow.service.ts:133)
```

**Alur yang baru mulai bekerja:**
```
Create → INACTIVE
  ↓
Enroll → INACTIVE
  ↓
Promote (close PROMOTED) → ACTIVE ← satunya-satunya jalur ke ACTIVE
  ↓
Attempt Borrow → ✅
```

---

## 4. Apakah Ada Bagian Lain yang Bergantung pada `Member.status == ACTIVE` untuk Borrow?

**Tidak ada selain satu guard di atas.** Pencarian lintas seluruh codebase:

| Consumer | File:Baris | Dependensi |
|----------|-----------|------------|
| `BorrowService.create` | `borrow.service.ts:133` | `member.status !== 'ACTIVE'` → tolak ← **satu-satunya** |
| `BorrowingsPage.tsx` | (renderer) | `selectedMember.status === 'active'` (lowercase!) — **BUG terpisah** (case mismatch, badge selalu "Nonaktif") |
| Borrow snapshot (className) | `borrow.service.ts:172-173` | `enrollmentService.findActiveByMember` (tidak bergantung `Member.status`) |

Tidak ada consumer lain di backend yang memakai `Member.status` sebagai gate untuk peminjaman.

---

## 5. Root Cause Analysis

### Mengapa bug ini muncul sekarang?

E-3 (WO-15) **secara eksplisit** membatasi scope ke `EnrollmentService.close()` saja:

> **E3_RELEASE_REPORT.md:29:** "Tidak ada perubahan pada `enroll`/`repoint` — guard dan transaksionalitas E-1 dipertahankan."

> **E3_FINAL_REVIEW.md:14:** "Sinkronisasi `Member.status` RFC §4.3 dipicu **close**"

> **RFC §4.3 (MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md:148):** "Aturan sinkronisasi: `GRADUATED`/`TRANSFERRED`/`DROPPED` → `INACTIVE`; `PROMOTED`/`REPEATED`/`REDISTRIBUTED` → `ACTIVE`"

RFC §4.3 hanya mendeskripsikan sync saat **terminal status** (close), bukan saat enroll. Tapi borrow guard tetap mengecek `Member.status === 'ACTIVE'` — yang hanya bisa dicapai lewat promosi, bukan enroll pertama.

**Implikasi:** Setiap anggota baru yang di-create manual atau di-import akan **selalu gagal dipinjam** kecuali sudah melewati siklus promosi (X → XI → close PROMOTED → ACTIVE). Anggota yang baru di-enroll pertama kali tidak akan pernah bisa meminjam.

### Apakah ini desain yang disengaja?

**Kemungkinan besar TIDAK.** RFC §4.3 berfokus pada "terminal status", tetapi borrow guard (`Member.status == ACTIVE`) adalah business rule yang berdiri sendiri — tidak didefinisikan di RFC. Guard ini diwarisi dari legacy dan tidak dievaluasi ulang saat E-3 diimplementasikan.

---

## 6. Opsi Perbaikan (DISCOVERY ONLY — TIDAK IMPLEMENTASI)

### Opsi A: Sync `Member.status = ACTIVE` di `enroll()`
Tambahkan sinkronisasi di `EnrollmentService.enroll()`:
```typescript
// Setelah repository.create(enrollment)
if (member.status !== 'ACTIVE') {
  await this.memberRepository.update(member.id, { status: 'ACTIVE' })
}
```
- Pro: Fix langsung; sesuai ekspektasi user
- Kontra: `enroll` jadi menulis 2 tabel (enrollment + member); perlu transaksi

### Opsi B: Ganti guard borrow dari `Member.status` ke enrollment
```typescript
// borrow.service.ts:133
const activeEnrollment = await this.enrollmentService.findActiveByMember(input.memberId)
if (!activeEnrollment) {
  throw new AppError(400, 'Validation Error', `Member tidak memiliki enrollment aktif`)
}
```
- Pro: Guard mengukur hal yang benar (enrollment aktif = bisa pinjam)
- Kontra: Guru/Umum tidak punya enrollment → selalu gagal; perlu hak pinjam terpisah (memberType.borrowRights.hasAcademicRecord)

### Opsi C: Sinkronisasi `Member.status` di `MemberImportService.writePhase()`
Setelah `createManyWithTx` + `createManyWithTx(enrollment)`, update semua member baru ke ACTIVE:
```typescript
await tx.member.updateMany({
  where: { id: { in: memberIds } },
  data: { status: 'ACTIVE' }
})
```
- Pro: Fix untuk jalur import
- Kontra: Hanya menyelesaikan import, bukan manual create; tidak konsisten

### Opsi D: Kombinasi Opsi A (enroll sync) + Opsi B (evaluasi guard)
Implementasi Opsi A sebagai fix immediate, evaluasi Opsi B sebagai arsitektur jangka panjang.

---

## 7. Scope Dampak

| Jalur | Terdampak? | Penjelasan |
|-------|-----------|------------|
| Manual create member → enroll → borrow | **YA** | Member tetap INACTIVE setelah enroll |
| Import anggota → borrow | **YA** | Member.status tetap INACTIVE (dikomentari: "status keanggotaan tidak diubah di sini") |
| Promote member → borrow | **TIDAK** | Promote close(PROMOTED) → ACTIVE |
| Guru/Umum → borrow | **TIDAK** | Tidak melewati jalur `hasAcademicRecord`; borrow tidak cek enrollment |

---

## 8. Kesimpulan

Bug ini adalah **gap desain** antara:
1. **Guard legacy** (`BorrowService` mengecek `Member.status == ACTIVE`)
2. **Implementasi E-3** (sinkronisasi `Member.status` hanya terjadi saat `close()` terminal, bukan saat `enroll()`)

Anggota baru yang di-create manual atau di-import akan selalu gagal meminjam karena `Member.status` tidak pernah diatur ke `ACTIVE` — status pertama kali hanya bisa dicapai melalui siklus promosi (close PROMOTED/REPEATED/REDISTRIBUTED).

**Tingkat keparahan: MEDIUM-HIGH** — mempengaruhi seluruh alur peminjaman untuk anggota baru (siswa) yang belum pernah dipromosikan.
