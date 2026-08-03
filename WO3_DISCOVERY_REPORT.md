# WORK ORDER 3 (F2b) — DISCOVERY REPORT — Backfill + Reconciliation

**Peran:** Project Engineer
**Mode:** DISCOVERY ONLY — READ ONLY. Tidak ada perubahan kode, migration, implementasi, atau commit.
**Source of Truth:**
1. `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §1.2, §2.1, §3, §15 F1
2. `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-3 F2b

**Status:** **READY FOR IMPLEMENTATION** (lihat bagian 10)

---

## 0. Ringkasan Eksekutif

WO-3 F2b adalah **backfill idempoten** sesuai RFC §15 F1: setiap `Member` dengan `classId != null` dibuatkan `MemberEnrollment` ber-`status=ACTIVE`, dengan `academicYearId` diambil dari `class.academicYearId`. `Member.classId` **tetap ada** (penghapusan hanya di fase F3 / T-3). Audit menemukan:

- **Live DB kosong** (verifikasi 2026-08-03): Member=0, Class=0, AcademicYear=0, MemberEnrollment=0 → backfill praktis **no-op** di DB produksi, tetapi script wajib tetap **generik** dan **idempoten** (WBS).
- **Tidak ada kode `src/` yang menyentuh `MemberEnrollment`** (grep 0 match) — F2a murni schema. Backfill tidak butuh Repository khusus (kandidat `EnrollmentRepository` dialokasikan WBS ke E-1); script memakai Prisma langsung + repository eksisting yang sudah ada (`MemberRepository`/`ClassRepository`).
- **Tidak ada migration**: F2b hanya data, tidak mengubah schema. `schema.prisma` tidak disentuh.
- **Idempotensi** = skip member yang sudah punya enrollment ACTIVE (`status=ACTIVE AND leftAt=null`) — menerapkan aturan "satu enrollment AKTIF per anggota" (RFC §1.2, §2.1).
- **Orphan classId** (class tidak ada) tidak boleh crash: dilaporkan + dilewati (tidak ada FK target untuk `academicYearId`).
- Layer Service/IPC/Preload/UI = **N/A** (WBS §5 WO-3). Flow: Repository → Testing → PO Review.

---

## 1. Current Architecture

### 1.1 Stack
- **Prisma 5.22 + SQLite** — schema `prisma/schema.prisma`; klien `@prisma/client` (hasil `prisma generate`, F2a).
- **Repositori domain akademik** di `src/main/repositories/`: `MemberRepository` (`findById` include `class`; `findMany`; `countByClass`; tidak ada akses enrollment), `ClassRepository` (`findById`), `AcademicYearRepository` (`findById`/`findActive`). Basis: `BaseRepository` → `getPrisma()` singleton; `runTransaction()` untuk `$transaction`.
- **Pola script one-time eksisting:** `scripts/` berisi `db-migrations-check.ts`, `db-introspect.ts` (TS + `PrismaClient` langsung, dijalankan via compile tsc + node). **Tidak ada tsx/ts-node** di devDependencies.
- **Pola smoke DB:** folder `<wo>_*_smoke/` + `smoke.ts` (mis. `wo2_f2a_smoke/smoke.ts`); dijalankan pada **fresh DB** dengan `DATABASE_URL` absolute `file:C:/...` + `NODE_PATH` ke node_modules (pola WO-8/WO-13/WO-2).

### 1.2 Model terkait (kondisi sekarang)
| Model | Keterangan |
|-------|-----------|
| `Member` | `classId String?` + relasi `class Class?` (tidak ada `@map` untuk classId). `memberNumber`→`@map("number")`, `birthPlace`→`@map("birthplace")` — tidak relevan ke backfill. |
| `Class` | `academicYearId String` (wajib, NOT NULL) + `curriculumId`; relasi ke `AcademicYear`. |
| `AcademicYear` | `id/name(unique)/startDate/endDate/isActive`. |
| `MemberEnrollment` (F2a) | `memberId/classId/academicYearId` (FK RESTRICT), `status` tanpa default, `enrolledAt` default now, `leftAt` nullable. `@@index([memberId, academicYearId])`, `[memberId, status]`, `[classId]`, `[academicYearId]`, `[status]`. |

### 1.3 Status data live (verifikasi read-only 2026-08-03)
```
COUNTS={"member":0,"class":0,"academicYear":0,"curriculum":0,"memberEnrollment":0,"promotionRun":0,"promotionRunItem":0,"memberWithClassId":0}
```
→ konfirmasi RFC §15: backfill di DB live = **no-op**; validasi backfill dilakukan di **DB uji** yang dibentuk menyerupai skema lama (Member ber-`classId`).

---

## 2. Files Impact Analysis

### File BARU (deliverable WO-3)
| File | Tujuan |
|------|--------|
| `scripts/backfill-member-enrollment.ts` | Script one-time: ekspor fungsi `runBackfillEnrollment(prisma): Promise<BackfillResult>` + CLI `main()` (guard `require.main`). Berisi logika idempoten + laporan reconciliation. |
| `wo3_f2b_smoke/smoke.ts` | Smoke DB: fresh DB, seed data gaya skema lama (AcademicYear/Curriculum/Class/Member ber-classId), jalankan backfill, verifikasi count + idempotensi + orphan. |
| `WORK_ORDER_3_F2B_IMPLEMENTATION_REPORT.md` | Laporan implementasi + hasil reconciliation (nama memakai suffix `_F2B_` — `WORK_ORDER_3_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint lama, jangan ditimpa). |
| `WO3_FINAL_REVIEW.md`, `WO3_RELEASE_REPORT.md` | Gate Final Review & Release (alur permanen). |

### File DIMODIFIKASI
| File | Perubahan |
|------|-----------|
| `AGENTS.md` | Menambah bagian WO-3 F2b (Gate §4: documentation updated). |

### File TIDAK disentuh (eksplisit N/A)
| Layer | Alasan |
|-------|--------|
| `prisma/schema.prisma` | F2b = data, tanpa migration (schema sudah F2a). |
| `prisma/migrations/` | Tidak ada migration baru. |
| Repository/Service eksisting | Backfill memakai Prisma langsung + read-only repo; tanpa perubahan perilaku. |
| IPC / Preload / `env.d.ts` / DTO | WBS WO-3: Service/IPC/Preload/UI = N/A. |
| UI (routes/pages) | N/A. |
| `Member.classId` | Tetap ada (F1 additive; dihapus di T-3/F3). |

---

## 3. Dependency Analysis

| Dependency | Status | Catatan |
|------------|--------|---------|
| F2a (schema + migration `MemberEnrollment`) | **DONE** (commit `1397e47`) | 3 model sudah deployed; `prisma generate` sudah menghasilkan client. |
| F1 (shared config) | **DONE** | Tidak dipakai langsung oleh backfill (classId sudah ter-resolve); tidak wajib. |
| `prisma generate` | DONE | Client mencakup `memberEnrollment` (dibuktikan smoke F2a 35/35). |
| Repository E-1 (`EnrollmentRepository`) | **TIDAK perlu** | WBS mengalokasikan ke E-1; backfill cukup Prisma langsung. |
| Migration baru | **TIDAK ADA** | F2b tidak menyentuh schema. |
| WO berikutnya (AY-1a dsb.) | **TIDAK disetuh** | Backfill berhenti di data; guard/UI tahun ajaran = WO berikut. |

Dependency graph WO-3: `F1 → F2a → F2b` (WBS §7). Tidak ada cycle.

---

## 4. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| **Idempotensi gagal** (run ulang menambah enrollment ganda) | Rendah | Tinggi | Guard "sudah punya ACTIVE enrollment" (`status=ACTIVE AND leftAt=null`); smoke run-2 = 0 perubahan. |
| **Orphan classId** (member.classId menunjuk Class yang sudah dihapus) | Rendah | Sedang | Deteksi class null → lapor `orphanMembers` di hasil reconciliation, lewati (tanpa insert → tanpa P2003). |
| **Partial backfill** (gagal tengah jalan, sebagian terlanjur masuk) | Rendah | Sedang | Seluruh backfill dalam **satu `$transaction`** (all-or-nothing) via `runTransaction`. |
| **DB live tidak kosong di produksi nyata** (skala sekolah) | Sedang | Rendah | Script generik + idempoten + laporan jumlah; aman dijalankan kapan pun. |
| **Salah interpretasi `academicYearId`** | Rendah | Tinggi | `academicYearId` diambil dari `class.academicYearId` (wajib NOT NULL) — bukan dari enrollment lain / tahun aktif. |
| Bentrok nama file laporan | — | Sedang | Suffix `_F2B_` (pelajaran WO-1/WO-2). |
| `prisma generate` EPERM saat dev server jalan | Sedang | Rendah | Tidak ada generate di WO-3 (tanpa schema change); jika perlu ulang, hentikan dev server dulu. |

---

## 5. Architecture Compliance

| Aturan (RFC/WBS) | Pemenuhan |
|------------------|-----------|
| RFC §15 F1: backfill idempoten `Member.classId → MemberEnrollment(ACTIVE)` memakai `class.academicYearId` | ✔ backfill membaca `class.academicYearId`; skip bila ACTIVE sudah ada |
| RFC §1.2/§2.1: `status=ACTIVE`, `leftAt=null`, satu ACTIVE per anggota | ✔ guard idempotensi = aturan satu-ACTIVE |
| RFC §15 F1: `Member.classId` **tetap ada** (additive) | ✔ tidak dihapus, tidak ditulis ulang |
| WBS WO-3 scope: script one-time + verifikasi + laporan; live 0 member → no-op namun generik | ✔ script ekspor fungsi + CLI; smoke membuktikan generik pada data ber-`classId` |
| WBS WO-3 flow: Repository → Testing → PO Review (Service/IPC/Preload/UI = N/A) | ✔ script memakai Prisma/repo read-only; tidak ada layer lain |
| WBS WO-3 deliverable: Script + laporan reconciliation | ✔ script + `WORK_ORDER_3_F2B_IMPLEMENTATION_REPORT.md` memuat hasil reconciliation |
| Tidak membuat Source of Truth baru | ✔ hanya laporan WO; RFC/WBS tidak dimodifikasi |
| Tidak menyentuh WO berikutnya | ✔ tidak ada guard AY, tidak ada UI, tidak ada repository service baru |

**Tidak ada pelanggaran ditemukan.**

---

## 6. Implementation Plan

### 6.1 `scripts/backfill-member-enrollment.ts` (one-time, idempoten)
1. **Ekspor tipe** `BackfillResult`:
   ```
   { membersWithClassId, enrollmentsCreated, skippedAlreadyActive, orphanMembers, ranInTransaction }
   ```
2. **Fungsi** `runBackfillEnrollment(prisma: PrismaClient): Promise<BackfillResult>`:
   - `findMany` semua `Member` dengan `classId != null`, `include: { class: true }`.
   - Untuk tiap member:
     - sudah punya `MemberEnrollment` ACTIVE (`status=ACTIVE AND leftAt=null`) → `skippedAlreadyActive++`.
     - `class == null` → `orphanMembers.push({memberId, memberNumber, classId})`; lanjut.
     - selainnya → siapkan `MemberEnrollmentCreateManyInput`: `memberId`, `classId`, `academicYearId = class.academicYearId`, `status: 'ACTIVE'`.
   - `createMany` dalam **satu `$transaction`** (`runTransaction`), all-or-nothing.
3. **CLI** `main()`: pakai `new PrismaClient()` dari `DATABASE_URL` env; cetak reconciliation (baris-per-tindakan + ringkasan); exit code 0 bila sukses, 1 bila gagal. Guard `if (require.main === module)` (modul CommonJS hasil tsc) agar bisa di-import smoke.
4. **Tidak ada perubahan schema/service/behavior eksisting.**

### 6.2 `wo3_f2b_smoke/smoke.ts` (fresh DB)
- Seed gaya skema lama: `AcademicYear` ×1, `Curriculum` ×1, `Class` ×2 (tahun sama), `Member`:
  - M1 → classId A (akan jadi enrollment ACTIVE).
  - M2 → classId B.
  - M3 → classId null (tidak dibuatkan).
  - M4 → classId menunjuk id **tidak ada** (orphan) — dibuat via `$executeRaw` atau dengan classId yang kemudian dihapus.
- Jalankan `runBackfillEnrollment` (import hasil compile `scripts/...`).
- Assert: created = 2; member M1/M2 masing-masing tepat 1 enrollment ACTIVE dengan `academicYearId == class.academicYearId`; M3 = 0; M4 masuk `orphanMembers`.
- **Idempotensi:** jalankan ulang → created = 0, skipped = 2, total enrollment tetap 2.
- Buat **hanya** di fresh DB (`prisma migrate deploy` dulu), jalankan sekali, DB uji dibersihkan.

### 6.3 Urutan eksekusi
1. Tulis script backfill → 2. tulis smoke → 3. fresh DB deploy + compile tsc + run smoke → 4. `npm run lint` + `npm run build` → 5. tulis laporan + update `AGENTS.md` → 6. **ONE FINAL COMMIT** + push → berhenti.

---

## 7. Validation Plan

| Check | Metode | Kriteria |
|-------|--------|----------|
| Fresh DB deploy | `prisma migrate deploy` (DATABASE_URL absolute temp) | 4 migrations applied, urutan benar |
| Smoke backfill | `wo3_f2b_smoke/smoke.ts` pada fresh DB | created==2; tiap member ber-classId → tepat 1 ACTIVE; `academicYearId` cocok |
| Idempotensi | run ke-2 pada DB sama | 0 enrollment baru; total tidak berubah |
| Orphan handling | member M4 classId tak ada | masuk `orphanMembers`; tanpa error/exit 1 |
| No-op live DB | jalankan CLI terhadap `prisma/aplibrary.db` | `membersWithClassId=0`, tidak ada row berubah |
| lint | `npm run lint` | PASS (tsc node+web) |
| build | `npm run build` | PASS (tidak ada perubahan kode src → bundle tidak berubah) |
| Documentation | AGENTS.md + 3 laporan | konsisten |

---

## 8. Exit Criteria

1. Setiap `Member` dengan `classId != null` → **tepat 1** `MemberEnrollment` `status=ACTIVE`, `leftAt=null`, `academicYearId = class.academicYearId`.
2. Run ulang **tidak menambah** row enrollment.
3. Orphan `classId` dilaporkan di reconciliation, tidak menghentikan script.
4. DB live (0 member) tidak berubah (no-op).
5. `npm run lint` + `npm run build` PASS.
6. Laporan + `AGENTS.md` final; **ONE FINAL COMMIT** + push; working tree bersih; **BERHENTI** menunggu review PO (tidak lanjut WO-4/AY-1a).

---

## 9. Decision Points (rekomendasi — tidak menyimpang dari RFC)

| # | Keputusan | Rekomendasi | Alasan |
|---|-----------|-------------|--------|
| D1 | Kunci idempotensi | Skip bila `MemberEnrollment` ACTIVE (`status=ACTIVE AND leftAt=null`) sudah ada | = aturan "satu ACTIVE" RFC §1.2/§2.1; tidak bergantung tahun |
| D2 | Orphan classId | Lapor + skip (tanpa insert) | FK `classId` wajib; tanpa class tidak bisa dapat `academicYearId` |
| D3 | Transaksi | Satu `$transaction` (all-or-nothing) | Mencegah backfill parsial; skala kecil aman |
| D4 | Lokasi script | `scripts/backfill-member-enrollment.ts` (pola `scripts/` eksisting) | Konsisten; ekspor fungsi agar bisa di-import smoke |
| D5 | `enrolledAt`/`note` | `enrolledAt` default now; `note` tidak diisi | RFC tidak mensyaratkan; hindari mengarang data |
| D6 | `Member.classId` | **Tidak dihapus, tidak diubah** | F1 additive; penghapusan di T-3/F3 |

Semua keputusan tetap dalam batas RFC — tidak ada kebijakan baru.

---

## 10. Verdict

**READY FOR IMPLEMENTATION**

Alasan:
- F2a (dependency) selesai & ter-release (`1397e47`); client Prisma mencakup `MemberEnrollment`.
- Live DB kosong → risiko eksekusi sangat rendah; script dirancang generik & idempoten untuk kondisi berisi.
- Tidak ada migration/schema change; tidak ada pelanggaran RFC §15 F1 / WBS WO-3; layer di luar Repository+Testing eksplisit N/A.
- Rencana validasi menjawab seluruh WBS: DB uji skema lama, count cocok, idempoten, lint+build.

Tidak ada revisi yang dibutuhkan. Menunggu persetujuan Product Owner untuk implementasi.
