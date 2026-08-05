# WORK ORDER — MEMBERSHIP STATUS FIRST BORROW ACTIVATION
**Laporan Implementasi**
Status: DONE — menunggu review PO · Tanggal: 2026-08-05

## 1. Latar Belakang

Bug "Semua anggota NONAKTIF" (laporan `MEMBERSHIP_STATUS_BUG_REPORT.md`): 395/395 `Member.status` = `INACTIVE`. Root cause = **design gap** — tidak ada jalur otomatis `INACTIVE → ACTIVE` pada operasi normal aplikasi. Baseline data memang `INACTIVE` (backfill WO-22A sengaja tidak menyentuh `Member.status`), dan satu-satunya penulis status adalah form edit manual (`MemberService.update`), `EnrollmentService.close` (E-3), dan `PromotionExecuteService` (P-2).

## 2. Keputusan Bisnis (PO Approved)

- **Membership Status ≠ Academic Status ≠ Borrow Eligibility.**
- Aturan baru: Anggota baru = `INACTIVE` → **peminjaman pertama yang BERHASIL** mengaktifkan keanggotaan → `ACTIVE`.
- Status `ACTIVE` **tidak pernah kembali `INACTIVE`** hanya karena semua buku dikembalikan (ReturnService tidak menulis `Member.status`).
- Eligibility peminjaman **tetap berbasis `MemberEnrollment.status=ACTIVE`** (IT-1 HOTFIX) — TIDAK berubah.

## 3. Scope

### Diubah (1 file source)
`src/main/services/borrow.service.ts` — `create()`:
- Blok "FIRST BORROW ACTIVATION" ditanam **SETELAH** `borrowRepository.createWithItems(...)` berhasil, **SEBELUM** `return toDTO(created)`.
- Guard: `if (member.status === 'INACTIVE') await this.memberRepository.update(member.id, { status: 'ACTIVE' })`.
- Menjamin hanya **transaksi peminjaman yang sukses** yang mengaktifkan (tidak ada aktivasi parsial).
- `memberRepository` sudah tersedia di constructor; `member` sudah dimuat dengan `.status` sebelum peminjaman dibuat.

### TIDAK diubah
- Enrollment, Promotion, Dashboard, Borrow Eligibility, ReturnService, UI, schema, migration, IPC/preload/bootstrap, repository lain. **Tidak ada refactor.**
- `member.status` tidak dibaca untuk guard eligibility (tetap enrollment-based).

## 4. Validasi

| Gate | Hasil |
|------|-------|
| Smoke baru `membership_first_borrow_smoke` | **20/20 PASS** |
| Regression Borrow (it1 34 · eligibility 7 · wo14_e2 36 · borrow_card_uat 29) | **106/106 PASS** |
| Regression Dashboard (`dashboard_phase1` 30) | **30/30 PASS** |
| Regression Enrollment (wo13_e1 39 · wo15_e3 78) | **117/117 PASS** |
| `npm run lint` | PASS |
| `npm run build` | PASS (main 1,844.57 kB · preload 9.47 kB · renderer 1,060.86 kB) |
| `prisma migrate diff` (from-migrations & from-url) | empty migration |
| `prisma migrate status` | up to date (4 migrations) |

### Skenario smoke (5 mandat)
1. Member INACTIVE → pinjam pertama → status **ACTIVE**.
2. Pinjam kedua → status **tetap ACTIVE**.
3. Kembalikan seluruh buku → status **tetap ACTIVE** (returnDate terisi, ReturnService tidak menulis status).
4. Eligibility tetap berbasis Enrollment:
   - Siswa INACTIVE tanpa enrollment → ditolak `tidak memiliki enrollment aktif`, status tetap INACTIVE.
   - Siswa **ACTIVE** tanpa enrollment → ditolak (status TIDAK memberi eligibilitas).
   - Guru INACTIVE tanpa enrollment → pinjam sukses (guru/umum tidak butuh enrollment) → status ACTIVE (aktivasi berlaku semua tipe member).
5. Dashboard tetap berjalan (summary/today/recentActivity benar setelah aktivasi & return).

## 5. Perilaku Data

- **TIDAK ada backfill.** 395 member di dev DB tetap `INACTIVE` sampai mereka melakukan pinjam pertama yang sukses — perubahan organik sesuai keputusan bisnis.
- S-000012 (satu-satunya peminjaman aktif saat investigasi) sudah `INACTIVE` dan akan menjadi `ACTIVE` bila member tersebut meminjam lagi.

## 6. Deliverable

- `src/main/services/borrow.service.ts` (modifikasi)
- `membership_first_borrow_smoke/smoke.ts` (baru)
- `WORK_ORDER_MEMBERSHIP_FIRST_BORROW_REPORT.md` (ini)
- `MEMBERSHIP_FIRST_BORROW_FINAL_REVIEW.md`
- `MEMBERSHIP_FIRST_BORROW_RELEASE_REPORT.md`
- `AGENTS.md` (sesi)
