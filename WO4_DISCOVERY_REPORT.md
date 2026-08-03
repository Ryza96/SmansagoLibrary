# WORK ORDER 4 (AY-1a) — DISCOVERY REPORT — AcademicYear exclusive-active guard

**Peran:** Project Engineer
**Mode:** DISCOVERY ONLY — READ ONLY. Tidak ada perubahan kode, migration, implementasi, atau commit.
**Source of Truth:**
1. `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) — §2.4, §17
2. `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) — WO-4 AY-1a

**Status:** **READY FOR IMPLEMENTATION** (lihat bagian 10)

---

## 0. Ringkasan Eksekutif

WO-4 AY-1a menerapkan **guard exclusive-active** pada `AcademicYear`: tepat satu `isActive=true` selalu (RFC §2.4, §17). Setiap create/update/aktivasi yang menetapkan `isActive=true` **menonaktifkan tahun ajaran lain dalam SATU transaksi** (all-or-nothing). Audit menemukan:

- **Guard belum ada.** `AcademicYearService.create/update` saat ini meneruskan `isActive` apa adanya ke repository → dua tahun bisa `isActive=true` sekaligus; `findActive()` diam-diam memilih yang terbaru (MASTER_DATA_AKADEMIK_AUDIT.md §2 poin 3).
- **Repo sudah ada** (`academic-year.repository.ts`, dari Sprint 5 P-series) dan **cukup** — tidak perlu file repo baru (WBS Flow: Repo = N/A "repo sudah ada"). Perubahan terkonsentrasi di **service**; repository hanya mendapat **metode transaksional** (pola `createWithItems`/`processReturn` di `borrow.repository.ts`).
- **Tidak ada schema/migration/DB change**: guard murni logika service; `isActive Boolean @default(false)` tetap.
- **Tidak ada IPC/Preload/UI change**: handler `academic-years:create/update` sudah ada dan akan menikmati guard otomatis; UI Tahun Ajaran = WO AY-2.
- **Exit criteria** WBS: `findActive()` ≤ 1 record; test negatif "dua aktif mustahil".

---

## 1. Current Architecture

### 1.1 Stack & layanan terkait
- **Prisma 5.22 + SQLite**; `AcademicYear` = `id/name(unique)/startDate/endDate/isActive(@default(false))/createdAt/updatedAt` + relasi `classes`, `memberEnrollments`, `promotionRunsFrom/To`.
- **`AcademicYearService`** (`src/main/services/academic-year.service.ts`, 94 baris): `findMany/findById/create/update/delete`. Tidak ada guard; `create` dan `update` meneruskan `isActive` ke repo apa adanya.
- **`AcademicYearRepository`** (`src/main/repositories/academic-year.repository.ts`): `create/update/delete/findById/findActive/findMany/existsByName/existsById/count`. Basis `BaseRepository` → `getPrisma()` singleton; pola transaksi eksisting `this.prisma.$transaction` (lihat `borrow.repository.createWithItems`).
- **IPC** (`electron/ipc/academic-year.ipc.ts`): `academic-years:create/update` → `service.create/update`. Tanpa perubahan.
- **DTO** (`src/shared/dto/academic.ts`): `CreateAcademicYearDTO.isActive?: boolean`, `UpdateAcademicYearDTO.isActive?: boolean`. Tidak perlu diubah.

### 1.2 Kondisi sekarang (kelemahan guard)
| Jalur | Perilaku sekarang | Pelanggaran RFC §2.4/§17 |
|-------|-------------------|--------------------------|
| `create({isActive:true})` saat A aktif | A tetap aktif + B aktif → **2 aktif** | Guard 1-aktif gagal |
| `update(id, {isActive:true})` saat A aktif | A tetap aktif + B aktif → **2 aktif** | Guard 1-aktif gagal |
| `findActive()` | `findFirst({isActive:true}, orderBy startDate desc)` → mengembalikan 1 tahun secara **silent** padahal bisa >1 | Exit criteria `≤ 1 record` tidak dijamin |

### 1.3 Referensi pola transaksi eksisting
`BorrowRepository.createWithItems`/`processReturn` membungkus operasi multi-write dalam `this.prisma.$transaction(async (tx) => {...})`. AY-1a memakai pola yang sama: **service memutuskan** kapan guard aktif; **repository mengeksekusi** deaktivasi + create/update secara atomik.

---

## 2. Files Impact Analysis

### File DIMODIFIKASI (2)
| File | Perubahan |
|------|-----------|
| `src/main/services/academic-year.service.ts` | Guard decision: bila `isActive===true` → panggil metode repo transaksional (deaktivasi tahun lain dulu, lalu create/update target); bila tidak → path biasa (create/update apa adanya). |
| `src/main/repositories/academic-year.repository.ts` | Tambah 2 metode transaksional (pola `borrow.repository`): `createExclusiveActive(data)` dan `updateExclusiveActive(id, data)` — dalam satu `$transaction`: `updateMany(isActive:true → false)` lalu create/update target `isActive:true`. |

### File BARU (2)
| File | Tujuan |
|------|--------|
| `wo4_ay1a_smoke/smoke.ts` | Smoke DB pada fresh DB: buat A aktif → buat B aktif (A harus nonaktif) → aktivasi ulang A via update (B nonaktif) → `findActive()` ≤ 1 di setiap langkah → assert "dua aktif mustahil". |
| `WORK_ORDER_4_AY1A_IMPLEMENTATION_REPORT.md` + `WO4_FINAL_REVIEW.md` + `WO4_RELEASE_REPORT.md` | Gate implementasi / final review / release (alur permanen). Nama pakai suffix `_AY1A_` — `WORK_ORDER_4_IMPLEMENTATION_REPORT.md` sudah dipakai laporan sprint lama, jangan ditimpa. |

### File TIDAK disentuh (eksplisit N/A)
| Layer | Alasan |
|-------|--------|
| `prisma/schema.prisma` + `prisma/migrations/` | Guard logika service; tidak ada schema change, tidak ada migration baru. |
| IPC / Preload / `env.d.ts` / DTO | WBS WO-4 Flow: Repo/…/UI = N/A; channel `academic-years:*` sudah ada. |
| UI (routes/pages) | UI Tahun Ajaran = WO AY-2. |
| `member-class-resolver.service.ts` dll. | Tidak dipakai guard; konsumen `findActive` menikmati guard tanpa perubahan. |

---

## 3. Dependency Analysis

| Dependency | Status | Catatan |
|------------|--------|---------|
| Repo `AcademicYearRepository` | **ADA** | Cukup; hanya ditambah 2 metode transaksional. |
| `findActive()` | ADA | Tidak diubah; exit criteria tercapai otomatis karena guard mencegah >1 aktif. |
| F1 (config), F2a/F2b | DONE | Tidak dipakai oleh guard (guard berdiri sendiri). |
| WO-5 AY-1b | BELUM | AY-1b ("Buka/Tutup Tahun") dibangun **di atas** guard AY-1a. |
| Migration baru | TIDAK ADA | — |

Dependency graph: `AY-1a (guard) → AY-1b (operasi)` — urutan WBS §7 benar.

---

## 4. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| **Race** dua aktivasi simultan → dua aktif | Rendah | Tinggi | Deaktivasi + create/update dalam **satu `$transaction`** (SQLite serialisasi tulis; pola eksisting). |
| **Regresi** create/update biasa (non-aktif) berubah perilaku | Rendah | Sedang | Guard hanya aktif bila `isActive===true`; path non-aktif tetap memakai `create`/`update` biasa. |
| **Rollback tidak utuh** bila create/update gagal | Rendah | Sedang | `$transaction` all-or-nothing; bila create gagal, deaktivasi ikut rollback (tahun lama tetap aktif). |
| **Over-reach scope** (menyentuh IPC/UI/schema) | Rendah | Sedang | Checklist WBS WO-4; diff review. |
| Nama metode ambigu (create/update "ExclusiveActive") | Rendah | Rendah | Naming eksplisit + doc comment singkat. |

---

## 5. Architecture Compliance

| Aturan (RFC/WBS) | Pemenuhan |
|------------------|-----------|
| RFC §2.4: `AcademicYear` guard 1-aktif | ✔ create/update/aktivasi `isActive=true` menonaktifkan tahun lain dalam transaksi |
| RFC §17: "Dua tahun `isActive` sekaligus" → mitigasi "Guard aktivasi eksklusif (1 aktif) di service" | ✔ guard decision di service; eksekusi atomik via repo |
| WBS WO-4 scope: `academic-year.service.ts` | ✔ perubahan utama di service |
| WBS WO-4 flow: Service → Testing → PO Review (Repo/UI = N/A) | ✔ repo existing hanya +metode transaksional; tanpa file repo baru |
| WBS WO-4 deliverable: Guard + test negatif | ✔ guard + smoke (aktivasi B nonaktifkan A; dua aktif mustahil) |
| WBS WO-4 validation: unit + lint + build | ✔ smoke + `npm run lint` + `npm run build` |
| WBS WO-4 exit criteria: `findActive()` ≤ 1 record | ✔ dijamin guard; di-assert smoke tiap langkah |
| Tidak membuat Source of Truth baru | ✔ hanya laporan; RFC/WBS tidak dimodifikasi |
| Tidak menyentuh WO berikutnya (AY-1b/AY-2) | ✔ tidak ada operasi Buka/Tutup, tidak ada UI |

**Tidak ada pelanggaran ditemukan.**

---

## 6. Implementation Plan

### 6.1 `academic-year.repository.ts` — 2 metode transaksional (pola `borrow.repository`)
```
async createExclusiveActive(data: CreateAcademicYearData & { isActive: true }): Promise<AcademicYear> {
  return this.prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })
    return tx.academicYear.create({ data })
  })
}

async updateExclusiveActive(id: string, data: UpdateAcademicYearData & { isActive: true }): Promise<AcademicYear> {
  return this.prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({ where: { isActive: true }, data: { isActive: false } })
    return tx.academicYear.update({ where: { id }, data })
  })
}
```
Catatan: `updateMany(isActive:true → false)` menonaktifkan **semua** tahun aktif termasuk target; `update` target `isActive:true` menyalakannya lagi → net: hanya target aktif. Ini menjaga "tepat satu" tanpa branch `id != target` di query.

### 6.2 `academic-year.service.ts` — guard decision
- `create`: setelah cek nama unik → bila `input.isActive === true` panggil `repository.createExclusiveActive(...)`; selainnya `repository.create(...)` (perilaku lama).
- `update`: setelah cek eksistensi + nama unik → bila `input.isActive === true` panggil `repository.updateExclusiveActive(...)`; selainnya `repository.update(...)` (perilaku lama).
- Tidak ada perubahan lain (findMany/findById/delete/toDTO utuh).

### 6.3 `wo4_ay1a_smoke/smoke.ts` (fresh DB)
- Seed awal: `AcademicYear A (isActive:true)`, `AcademicYear B (isActive:false)` via **repository/service**.
- Skenario:
  1. `create(B, {isActive:true})` → B aktif, **A nonaktif**; `findActive()` = B.
  2. `create(C, {isActive:true})` → C aktif, **B nonaktif**; count `isActive=true` = 1.
  3. `update(A, {isActive:true})` → A aktif, **C nonaktif**; `findActive()` = A.
  4. `update(B, {isActive:false})` → path biasa (tidak menyentuh A).
- Assert di tiap langkah: `count({isActive:true})` === 1 (dua aktif mustahil); `findActive()` benar.
- Fresh DB wajib (`prisma migrate deploy`); DB uji dibersihkan setelah run.

### 6.4 Urutan eksekusi
1. Modifikasi repo + service → 2. tulis smoke → 3. fresh DB deploy + compile tsc + run smoke → 4. `npm run lint` + `npm run build` → 5. laporan + update `AGENTS.md` → 6. **ONE FINAL COMMIT** + push → berhenti menunggu review PO.

---

## 7. Validation Plan

| Check | Metode | Kriteria |
|-------|--------|----------|
| Fresh DB deploy | `prisma migrate deploy` (DATABASE_URL absolute temp) | 4 migrations applied, urutan benar |
| Smoke guard | `wo4_ay1a_smoke/smoke.ts` pada fresh DB | tiap langkah `count(isActive=true)===1`; `findActive()` benar; aktivasi B menonaktifkan A |
| Dua aktif mustahil | setelah tiap operasi service | count `isActive=true` selalu 1 |
| Path non-aktif tidak berubah | `update(id,{isActive:false})` / create tanpa isActive | tahun aktif lain tidak terpengaruh |
| lint | `npm run lint` | PASS (tsc node+web) |
| build | `npm run build` | PASS |
| Documentation | AGENTS.md + laporan | konsisten |

---

## 8. Exit Criteria

1. Aktivasi B menonaktifkan A (create & update) — dibuktikan smoke.
2. `findActive()` ≤ 1 record di setiap kondisi — dijamin guard + di-assert smoke.
3. Dua `isActive=true` mustahil melalui service (create/update/aktivasi).
4. Perilaku create/update non-aktif tidak berubah.
5. `npm run lint` + `npm run build` PASS.
6. Laporan + `AGENTS.md` final; **ONE FINAL COMMIT** + push; working tree bersih; **BERHENTI** menunggu review PO (tidak lanjut WO-5/AY-1b).

---

## 9. Decision Points (rekomendasi — tidak menyimpang dari RFC)

| # | Keputusan | Rekomendasi | Alasan |
|---|-----------|-------------|--------|
| D1 | Lokasi guard | Decision di `AcademicYearService`; eksekusi atomik di repo (pola `borrow.repository`) | WBS scope service; pola transaksi eksisting di repo |
| D2 | Cakupan deaktivasi | `updateMany(isActive:true → false)` **tanpa** exclude target | Target langsung di-set `isActive:true` berikutnya → net 1 aktif; query lebih sederhana |
| D3 | Path non-aktif | Tetap `create`/`update` biasa | Preservasi perilaku; guard hanya untuk aktivasi |
| D4 | Schema/DB | **Tidak diubah** | Guard logika; `@default(false)` cukup |
| D5 | IPC/UI | **Tidak diubah** | Handler ada; UI = AY-2 |
| D6 | Rollback | `$transaction` all-or-nothing | Mencegah "semua nonaktif" bila create/update target gagal |

Semua keputusan tetap dalam batas RFC — tidak ada kebijakan baru.

---

## 10. Verdict

**READY FOR IMPLEMENTATION**

Alasan:
- Scope kecil & jelas (2 file source + smoke), kompleksitas LOW per WBS.
- Repo existing memadai; pola transaksi sudah terbukti di `borrow.repository`.
- Tidak ada schema/migration/IPC/UI change → risiko rendah, tidak menabrak WO lain.
- Exit criteria WBS (`findActive()` ≤ 1) dan validasi ("aktivasi B menonaktifkan A; dua aktif mustahil") terdefinisi sebagai smoke assertion.

Tidak ada revisi yang dibutuhkan. Menunggu persetujuan Product Owner untuk implementasi.
