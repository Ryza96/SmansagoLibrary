# BACKFILL_DISCOVERY_REPORT

**Mode:** DISCOVERY ONLY / READ ONLY — tidak ada perubahan data, tidak ada backfill dijalankan.
**Tanggal:** 2026-08-04
**Sumber data:** DB dev `prisma/aplibrary.db` (PrismaClient, query read-only) + `git log`.

---

## Konteks

Temuan sebelumnya (BORROW_ENROLLMENT_DISCOVERY.md): member `Finza Khoirul Huda` (S-000140) tidak memiliki `MemberEnrollment`, sehingga diblokir meminjam. Pertanyaan: apakah ini **kasus tunggal** atau **masalah migrasi sistemik**?

**Jawaban singkat: ini adalah masalah migrasi data sistemik — BUKAN kasus tunggal.**

---

## 1. Total Member (memberType = student)

```
395
```

Tambahan (konteks penuh):

| Metrik | Nilai |
|--------|-------|
| Total seluruh member | **395** |
| memberType = student | **395** |
| memberType lain (teacher/general) | 0 |
| Member dengan `classId` NOT NULL (legacy) | **395** |
| Total baris `MemberEnrollment` di SELURUH DB | **0** |

Semua member di DB adalah siswa dan semuanya memegang `Member.classId` (legacy).

---

## 2. Student yang memiliki MemberEnrollment (minimal 1)

```
0
```

Tidak ada satu pun baris `MemberEnrollment` di seluruh database (total = 0). Jadi 0 siswa memiliki enrollment.

---

## 3. Student yang TIDAK memiliki MemberEnrollment

```
395  (100% dari seluruh member)
```

Rincian:
- Student tanpa enrollment: **395/395**
- Student tanpa enrollment TETAPI punya `Member.classId`: **395/395**

**Kesimpulan: 100% populasi data terdampak. Ini adalah gap migrasi penuh, bukan satu kasus.**

---

## 4. 20 contoh pertama member dengan `Member.classId` terisi tetapi `MemberEnrollment = 0`

(urut `createdAt` asc — contoh yang sama berlaku untuk 395/395 member)

| # | memberNumber | fullName | status | Legacy `Member.classId` (kelas) |
|---|--------------|----------|--------|---------------------------------|
| 1 | S-000076 | CYNTA EKA MAULITHA | INACTIVE | X Merdeka 3 / 2026/2027 |
| 2 | S-000140 | Finza Khoirul Huda | INACTIVE | XI Merdeka 4 / 2026/2027 |
| 3 | S-000321 | SALMA JAUZA | INACTIVE | X Merdeka 2 / 2026/2027 |
| 4 | S-000274 | Putra Irlangga | INACTIVE | X Merdeka 2 / 2026/2027 |
| 5 | S-000041 | ARENDRA NOVAL ALAMSYAH | INACTIVE | X Merdeka 1 / 2026/2027 |
| 6 | S-000215 | MEGITA AURORA ELVICA ZAENAL | INACTIVE | XII Merdeka 1 / 2026/2027 |
| 7 | S-000011 | AHMAD SHOLIHUL HADI | INACTIVE | XII Merdeka 4 / 2026/2027 |
| 8 | S-000394 | ZILZIAN ANDHES RAIGA | INACTIVE | XI Merdeka 2 / 2026/2027 |
| 9 | S-000256 | NIMAS TRI FEBRIYANTI | INACTIVE | XI Merdeka 4 / 2026/2027 |
| 10 | S-000239 | MUHAMMAD AGUS RAHMATULLOH | INACTIVE | XI Merdeka 5 / 2026/2027 |
| 11 | S-000070 | CHIKO EGI MARFA ADITYA | INACTIVE | X Merdeka 3 / 2026/2027 |
| 12 | S-000259 | NOVITA DWI ANJELITA | INACTIVE | X Merdeka 1 / 2026/2027 |
| 13 | S-000072 | Cinta Aira | INACTIVE | XI Merdeka 1 / 2026/2027 |
| 14 | S-000111 | Diva Octavia Dwi Nur Hafna | INACTIVE | XI Merdeka 2 / 2026/2027 |
| 15 | S-000176 | Julio Dwi Alvino | INACTIVE | X Merdeka 4 / 2026/2027 |
| 16 | S-000248 | MUSTOFA DEVA ALFIOWANA | INACTIVE | X Merdeka 2 / 2026/2027 |
| 17 | S-000277 | Putri Molly Adistya Ghasia | INACTIVE | X Merdeka 3 / 2026/2027 |
| 18 | S-000280 | PUTRI ULAN SARI | INACTIVE | XII Merdeka 3 / 2026/2027 |
| 19 | S-000314 | RIZQIYANA JULIA NOVITASARI | INACTIVE | X Merdeka 2 / 2026/2027 |
| 20 | S-000002 | ABY SURYADITAMA | INACTIVE | X Merdeka 3 / 2026/2027 |

> Catatan: seluruh kelas legacy menunjuk Tahun Ajaran **2026/2027** (`isActive: true`), Kurikulum Merdeka.

---

## 5. Status `scripts/backfill-member-enrollment.ts`

**Kesimpulan: script DIBUAT & DI-COMMIT (deliverable Work Order), TAPI BELUM PERNAH DIJALANKAN terhadap DB ini.**

Bukti dari git:

| Commit | Keterangan |
|--------|-----------|
| `1397e47` | `feat: add member enrollment and promotion schema with migration (WO-2 F2a)` |
| `a379ffe` | `release: final release WO-2 F2a schema and migration (approved)` — **WO-2 (schema) dirilis eksplisit** |
| `a195cd5` | `feat: add idempotent Member.classId backfill to enrollment (WO-3 F2b)` — script dibuat |
| `b521824` | `release: Milestone A (Master Data Akademik) final release (WO-13 PR-A)` — rilis milestone yang berada SETELAH commit script |

Analisis:
- `scripts/backfill-member-enrollment.ts` dibuat sebagai deliverable **WO-3 (F2b)** pada commit `a195cd5` (2026-08-03).
- WO-3 (F2b) sendiri per catatan sesi berstatus **"COMPLETE — READY review PO"** (belum APPROVED mandiri), TAPI file-nya ikut terbawa dalam commit rilis milestone `b521824` (Milestone A). Jadi secara **kode**, script ada di pohon yang sudah dirilis.
- **Namun yang terpenting — eksekusi TIDAK pernah terjadi:** DB dev saat ini memiliki **0 baris `MemberEnrollment`**, sementara 395/395 member membawa `Member.classId`. `runBackfillEnrollment()` (scripts/backfill-member-enrollment.ts:17) adalah satu-satunya jalur resmi yang merefleksikan `Member.classId → MemberEnrollment`, dan hasilnya (395 created) sama sekali tidak tampak di DB.
- Satu-satunya tempat script pernah "dijalankan" adalah **smoke `wo3_f2b_smoke`** di DB temp (fresh DB per run) — bukan DB live/dev.

**Kesimpulan: rilis kode ≠ eksekusi migrasi satu-kali. Backfill adalah langkah yang DIBUTUHKAN namun BELUM dieksekusi.**

---

## 6. Apakah Promotion / Import / Enrollment mengasumsikan backfill sudah dilakukan?

**Ya — seluruh modul akademik (dan konsumennya) memperlakukan `MemberEnrollment` sebagai source of truth, tetapi TIDAK ADA satupun yang mem-backfill member lama.** Rincian per modul:

### Promotion (P-1..P-4)
- Membaca **hanya** enrollment ACTIVE via `EnrollmentRepository.findActiveByClasses` / `findActiveByClassesWithTx` (`promotion-preview.service.ts:151`, `promotion-execute.service.ts:95`).
- **Tidak pernah membaca `Member.classId`** — jadi jika enrollment belum ada, preview = 0 item, execute = no-op.
- → **Mengasumsikan enrollment sudah terisi** (oleh backfill/enroll/import), tidak self-healing.

### Import Anggota (MI-1..MI-4)
- Komentar eksplisit di `member-import.service.ts:43`: **"Member.classId TIDAK LAGI ditulis (nilai null di kolom)"**.
- Import **MENULIS** `MemberEnrollment(ACTIVE)` sendiri untuk baris yang diproses (routing `create-member` / `enrollment-only` dalam satu `$transaction`).
- → **TIDAK bergantung pada backfill** untuk baris yang di-import, tetapi hanya menutup member yang muncul di file import. Member lama yang tidak di-import tetap tanpa enrollment.

### Enrollment (E-1..E-4)
- `enroll()` menulis enrollment baru; `close`/`repoint`/`history` beroperasi pada baris enrollment yang SUDAH ADA; tidak membaca `Member.classId`.
- → Untuk tulisnya sendiri tidak membutuhkan backfill, tetapi `close`/`repoint` menuntut enrollment sudah ada terlebih dahulu.

### Konsumen lintas modul (sudah cutover ke enrollment — E-2 / IT-1)
- `MemberService.findById` → `classInfo` diambil dari `enrollmentRepository.findActiveByMember` (`member.service.ts:86`) — tanpa enrollment, `classInfo = null` padahal `classId` legacy terisi.
- `ClassService.delete` → guard anggota memakai `enrollmentRepository.countByClass` (`class.service.ts:137`).
- `BorrowService.create` → siswa wajib punya enrollment ACTIVE (`borrow.service.ts:148`) — inilah error yang teramati pada manual testing.

### Ringkasan

| Modul | Baca `Member.classId`? | Menulis enrollment sendiri? | Butuh backfill? |
|-------|------------------------|----------------------------|-----------------|
| Promotion (P-1..P-4) | Tidak | Tidak | **Ya — tanpa enrollment = kosong** |
| Import (MI-1..MI-4) | Tidak (dikunci null) | Ya (untuk baris import) | Parsial (hanya row yang di-import) |
| Enrollment (E-1..E-4) | Tidak | Ya (enroll) | Tidak (untuk tulis), Ya (close/repoint butuh data ada) |
| Borrow eligibility (IT-1) | Tidak | Tidak | **Ya — siswa tanpa enrollment ditolak** |
| Member classInfo (E-2) | Ya (hanya DTO passthrough) | Tidak | **Ya — classInfo null tanpa enrollment** |

---

## Kesimpulan

1. **Sifat masalah: sistemik, 100% data terdampak** — 395/395 siswa punya `Member.classId` legacy, 0 baris `MemberEnrollment` di seluruh DB.
2. **Akar masalah: langkah migrasi yang hilang.** `scripts/backfill-member-enrollment.ts` (WO-3 F2b) sudah di-commit dan ikut dalam pohon rilis Milestone A, tetapi **tidak pernah dieksekusi** terhadap DB dev/live.
3. **Perilaku sistem sudah benar** berdasarkan business rule (IT-1: eligibility siswa = enrollment ACTIVE) — data yang belum di-backfill yang tidak konsisten.
4. **Fix (jika nanti diizinkan, DI LUAR scope discovery):** jalankan `runBackfillEnrollment()` (atau CLI `scripts/backfill-member-enrollment.ts`) terhadap DB — akan membuat 395 `MemberEnrollment(ACTIVE)` dari `Member.classId`. Ini idempoten (skip bila ACTIVE sudah ada) sehingga aman.

**Scope discovery ditutup. Tidak ada implementasi, tidak ada backfill dijalankan.**
