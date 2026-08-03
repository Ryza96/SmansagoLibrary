# MILESTONE A — PRODUCTION READINESS

- **WO:** WO-13 PR-A — Production Readiness Assessment
- **Status:** **PRODUCTION READY**

---

## 1. Production Readiness Assessment

### 1.1 Readiness criteria
| Kategori | Keterangan | Status |
|----------|------------|--------|
| Fungsional | Semua fitur Milestone A berfungsi (master data: Tahun Ajaran, Kurikulum, Kelas) | ✅ LULUS (259/259 smoke + UAT) |
| Data & migrasi | 4 migrations, fresh DB deploy PASS, schema additif + backfill hijau | ✅ LULUS |
| Gate kualitas | `npm run lint` PASS · `npm run build` PASS | ✅ LULUS |
| Artifact | `app.asar` memuat seluruh fitur Milestone A (grep main+renderer) | ✅ LULUS |
| Distribusi | `win-unpacked` + installer NSIS `APLibrary Setup 0.1.0.exe` fresh | ✅ LULUS |
| Impor anggota | Blocker impor anggota teratasi (WO-2/WO-3 sprint Import, terverifikasi di artifact) | ✅ LULUS |

### 1.2 Ringkasan fungsional yang dirilis
1. **Tahun Ajaran** — CRUD, *exclusive-active* (1 aktif, guard AY-1a), Buka/Tutup (AY-1b), warning di UI, delete-guard saat dipakai kelas.
2. **Kurikulum** — CRUD, guard duplikat & delete saat dipakai kelas.
3. **Kelas** — CRUD, *immutability* tingkat & paralel (CL-1), clone ke tahun baru (CL-2b), fetch-all + filter client-side (CL-2a).
4. **Fondasi** — config shared F1, schema MemberEnrollment/PromotionRun(+Item) F2a, backfill `Member.classId → MemberEnrollment` F2b.

---

## 2. Technical Debt Summary

### Critical — none.
Tidak ada debt critical yang menghalangi Milestone A maupun Milestone B.

### High — resolve sebelum rilis luas modul terkait
| # | Debt | Dampak | Wajib-before-B? |
|---|------|--------|-----------------|
| H1 | Stack B legacy borrow module (`electron/main/services/{borrowing,return,print}.service.ts` + repositories) masih mereferensi model Prisma `Borrowing`/`BorrowingItem`/`Return` yang sudah tidak ada di schema; masih ter-register di `bootstrap.ts` (`printService`, `NewReturnService`). | Pemanggilan jalur legacy (mis. cetak kwitansi peminjaman lama) = runtime crash. | ❌ Bukan prasyarat Milestone B (track modul Peminjaman; sudah dianut sejak WO-007). **WAJIB** sebelum rilis umum yang memakai modul Peminjaman. |

### Medium — wajib dituntaskan dalam Milestone B (F3), boleh ditunda dari A
| # | Debt | Dampak | Catatan |
|---|------|--------|---------|
| M1 | **T3** — class delete guard masih `Member.classId` legacy; cutover ke `enrollment.count` = WO E-2 (Milestone B). | Tidak ada dampak saat kolom masih ada; guard salah kalau kelas punya enrollment tapi `classId` kosong. | Wajib **SEBELUM** F3 menghapus kolom `Member.classId` (akhir Milestone B). |
| M2 | Import UAT **B1** — baris yang gagal di pipeline tidak tampil ke user (`imports:match` resolve tanpa throw). | User tak tahu baris mana gagal/dilewati. | Follow-up Sprint 10; bukan prasyarat Milestone B. |
| M3 | Import UAT **B2** — `AutoCreateService.apply` berjalan sebelum deteksi ISBN duplikat → entitas yatim. | Orphan untuk baris ISBN duplikat. | Follow-up Sprint 10. |
| M4 | `MAX_BOOKS=20` hardcoded di `borrow.service.ts` (debt WO-006). | Batas peminjaman tidak konfigurable. | Track modul Peminjaman. |

### Low — boleh ditunda (deferrable)
| # | Debt | Dampak |
|---|------|--------|
| L1 | Import UAT B3 (tanpa pesan per-baris) & B4 (header synonyms terbatas). | Ergonomi impor. |
| L2 | `Setting.barcodeFormat` tidak dikonsumsi (keputusan WO-8; barcode = inventoryNumber). | Field legacy menganggur. |
| L3 | `FIELD.PRICE` label mati "Harga Beli" (peninggalan pra-WO13-R1; tidak dipakai). | Kosmetik. |
| L4 | Installer **unsigned** + **icon default Electron** (proyek tidak punya certificate/icon; WO-13 build dengan `signAndEditExecutable=false` karena Windows tanpa Developer Mode menolak symlink cache `winCodeSign`). | Peringatan SmartScreen/estetika; bukan hambatan fungsional. Aksi environment/admin, bukan kode. |

---

## 3. Verdict
# ✅ PRODUCTION READY

- Seluruh fitur Milestone A terkandung dalam artifact (`app.asar` terverifikasi).
- Verifikasi end-to-end hijau: lint PASS, build PASS, smoke 259/259, UAT WO-12 FINAL APPROVED, fresh-DB migrate PASS.
- Technical debt yang ada **bukan blocker Milestone A**; M1 wajib dituntaskan sebagai bagian dari Milestone B (WO E-2) sebelum F3 menghapus `Member.classId`; lainnya dijadwalkan sesuai track-nya.
- **Action berikutnya:** ONE FINAL COMMIT (3 laporan WO-12 FINAL + 3 laporan Milestone A) + push; kemudian **BERHENTI menunggu keputusan PO** untuk memulai Milestone B (Enrollment/Promotion) dan memutuskan penanganan debt di atas.
