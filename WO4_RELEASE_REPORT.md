# WO4_RELEASE_REPORT

**WO-4 — AY-1a: AcademicYear exclusive-active guard**
**Tanggal: 2026-08-03**
**Status: DONE — READY review PO**

---

## Isi Rilis

| Komponen | File | Deskripsi |
|----------|------|-----------|
| Repository | `src/main/repositories/academic-year.repository.ts` | +2 metode transaksional `createExclusiveActive` / `updateExclusiveActive` (`$transaction`: deaktivasi seluruh tahun aktif → set target aktif) |
| Service | `src/main/services/academic-year.service.ts` | Guard decision: `isActive===true` → metode exclusive-active; selainnya path biasa (perilaku lama dipertahankan) |
| Smoke Test | `wo4_ay1a_smoke/smoke.ts` | 21 assertion pada fresh DB (aktivasi menonaktifkan tahun lain, dua aktif mustahil, regresi) |
| Laporan | `WORK_ORDER_4_AY1A_IMPLEMENTATION_REPORT.md`, `WO4_FINAL_REVIEW.md`, `WO4_RELEASE_REPORT.md` | Dokumentasi WO-4 |
| Discovery (referensi) | `WO4_DISCOVERY_REPORT.md` | Dasar implementasi (READY FOR IMPLEMENTATION) |

## Ringkasan Guard

| Skenario | Sebelum | Sesudah |
|----------|---------|---------|
| create B aktif saat A aktif | 2 baris `isActive=true` (BUG) | A → false, B → true (hanya B aktif) |
| update A aktif saat B aktif | 2 baris `isActive=true` (BUG) | B → false, C → false, A → true (hanya A aktif) |
| create/update nonaktif | tahun aktif tidak terganggu | tahun aktif tidak terganggu (path biasa) |
| kegagalan create/update target | - | rollback total (tahun lama tetap aktif) |

## Hasil Validasi

| # | Check | Hasil |
|---|-------|-------|
| 1 | Fresh DB PASS | deploy (4 migrations) + smoke 21/21 |
| 2 | Dua aktif mustahil PASS | count `isActive=true` === 1 di tiap langkah |
| 3 | Aktivasi B menonaktifkan A PASS | create & update path |
| 4 | Path non-aktif tidak berubah PASS | tidak menyentuh tahun aktif lain |
| 5 | Regresi PASS | nama duplikat & id tidak ada tetap ditolak |
| 6 | lint PASS | `npm run lint` |
| 7 | build PASS | `npm run build` |

## Hal yang Perlu Diketahui Reviewer

1. **Tidak ada perubahan schema/migration/IPC/Preload/UI/DTO** — guard hidup murni di service (WBS WO-4: Repo/UI = N/A, repo sudah ada).
2. **Eksekusi atomik** — deaktivasi + aktivasi dalam satu `$transaction`; dua tahun aktif mustahil, dan tidak ada window "nol aktif" (rollback bila target gagal).
3. **Guard mengikat jalur service** — caller yang memanggil repository langsung bisa bypass; konsisten keputusan RFC bahwa guard hidup di service. AY-1b akan mengekspos operasi Buka/Tutup resmi.
4. **Pola transaksi** meniru `borrow.repository.createWithItems`/`processReturn` (keputusan bisnis di service, eksekusi atomik di repo).

## Status

**READY.** Menunggu review Product Owner sebelum lanjut ke Work Order berikutnya (AY-1b).
