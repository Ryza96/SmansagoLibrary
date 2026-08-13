# IMPORT MEMBER — WHATSAPP/EMAIL VALIDATION AUDIT

Mode: READ ONLY — investigasi saja, TANPA perubahan kode/schema/migration, TANPA commit/push.

## 1. Executive Summary

Import Anggota Siswa saat ini menolak seluruh 418 baris (Valid 0, Error 418, Duplicate 0) dengan pesan per-baris
**"No. WhatsApp wajib diisi."** karena lapisan **validasi di renderer**
(`src/services/MemberImportValidationService.ts`, baris 88–90) mewajibkan sel WhatsApp terisi, sementara aturan
bisnis Product Owner menetapkan **No. WhatsApp dan Email OPSIONAL**. Email tidak divalidasi wajib (sudah sesuai
aturan PO); WhatsApp-lah satu-satunya yang menyimpang. Aturan "whatsapp wajib" ini **bukan regresi** — sudah ada
sejak commit pertama fitur import anggota (`a7adf66`, 2026-08-02). Tidak ada versi sebelumnya tanpa aturan
tersebut di riwayat git repo ini.

## 2. Import Pipeline

```
File .xlsx
  → MemberExcelParserService.parse()            (renderer)   → ParsedMemberRow[]
  → MemberImportValidationService.validate()     (renderer)   → MemberValidationResult {valid, validCount, errorCount}
  → MemberPreviewService                         (renderer)   → preview DTO (validasi + duplicate intra-file)
  → IPC members:previewCheck / members:import   (electron)
  → MemberImportService.previewCheck/import      (main)
  → MemberDuplicateChecker.checkDatabase         (main)       → duplicate vs DB (NISN/email)
  → MemberRepository / Prisma
```

Titik yang menghasilkan 418 error = **`MemberImportValidationService.validateRow`** (renderer), BUKAN backend.
Backend (`MemberImportService`) tidak pernah memvalidasi whatsapp/email — hanya meneruskan `row.phone`/`row.email`.

## 3. WhatsApp Validation

`src/services/MemberImportValidationService.ts:88-90`:

```ts
if (isBlank(row.whatsapp)) {
  errors.push({ messageKey: ERROR_REQUIRED_VALUE, label: 'No. WhatsApp' })
}
```

- `isBlank` (baris 26–28): `null` / `undefined` / string yang `trim()` kosong → blank.
- `ERROR_REQUIRED_VALUE = 'memberImport.requiredValue'` (baris 47).
- Pesan dirender di UI via `src/utils/labels.ts:448`: `requiredValue: (label) => `${label} wajib diisi.``
  → label `'No. WhatsApp'` → **"No. WhatsApp wajib diisi."** (teks verbatim tidak ada di source; disusun dari
  messageKey + label).
- Parser menyediakan `whatsapp: get('whatsapp')` (`MemberExcelParserService.ts:102`); sel kosong → `null`
  (baris 91) → dipandang blank → error.

## 4. Email Validation

Tidak ada `isBlank(row.email)` / validasi format email di `MemberImportValidationService`. Email TIDAK wajib di
layer validasi import (sesuai aturan PO). Kontak email hanya muncul sebagai **duplicate check** di backend:
`MemberDuplicateChecker` (`src/main/services/member-duplicate-checker.service.ts:100-113`) — email yang sudah
dipakai member lain hanya menjadi blocker untuk baris dengan NISN BARU; baris NISN existing tidak diblokir (MI-3).

## 5. Template Rules

Sumber: `src/config/memberImport.template.ts` — `requiredHeader` = kolom HEADER wajib hadir di baris 1
(di-enforce `MemberExcelParserService.columnIndexByKey`, baris 56-58); `requiredValue` = isi sel wajib
(di-enforce validator).

| Field         | Required (Header) | Required (Cell) | Type   | Nullable | Validation |
|---------------|-------------------|-----------------|--------|----------|------------|
| Nama          | true              | true            | string | no       | requiredValue |
| Kelas         | true              | true            | string | no       | requiredValue |
| Jenis Kelamin | true              | true            | string | no       | requiredValue + invalidGender |
| NISN          | true              | true            | string | no       | requiredValue |
| Tempat Lahir  | false             | false           | string | yes      | — |
| Tanggal Lahir | false             | false           | date   | yes      | invalidDate (bila terisi) |
| Alamat        | true              | true            | string | no       | requiredValue |
| **No. WhatsApp** | true           | **true (mismatch)** | string | no   | requiredValue |
| Email         | false             | false           | string | yes      | — |

## 6. Domain/Database Rules

- Prisma `Member`: `phone String?` (schema.prisma:177), `email String?` (schema.prisma:178) → **nullable**.
- `CreateMemberDTO`/`UpdateMemberDTO` (`src/shared/dto/member.ts:42-43,62-63`): `phone`/`email` opsional.
- Manual entry `MemberForm.tsx`: `phone || undefined`, `email || undefined` — tanpa validasi wajib; `validate()`
  hanya memeriksa fullName/gender/memberType/kelas.
- `MemberService.create/update` (`member.service.ts:152-153,179-180,206-207`): meneruskan `input.phone`/`input.email`
  apa adanya, tanpa guard wajib.
- `MemberImportRowInput.phone: string` (member.ts:77) bertipe **wajib** — mencerminkan asumsi bahwa phone selalu
  ada (tidak nullable), selaras dengan validasi wajib di validator; bertentangan dengan aturan bisnis.
- Duplicate checker: NISN = identitas (existing bukan error sejak MI-3); email hanya blocker utk NISN baru.

## 7. Git History

- `git log -S "No. WhatsApp" -- src/services/MemberImportValidationService.ts src/config/memberImport.template.ts`
  → hanya **`a7adf66`** "feat: implement member import foundation with preview and template" (2026-08-02).
- `git log --all -- src/services/MemberImportValidationService.ts` → hanya **`a7adf66`** (satu-satunya commit file
  ini; tidak pernah dimodifikasi setelahnya).
- `git blame -L 85,93` → semua baris berasal dari `a7adf66a`.
- Commit lain terkait import (MI-1 `b35810b` … MI-4 `d73aa68`, `4462cd8`) TIDAK menyentuh aturan whatsapp-wajib.
- **Kesimpulan:** aturan "No. WhatsApp wajib" sudah ada sejak fitur import anggota diluncurkan (`a7adf66`) dan
  tidak pernah berubah. Klaim "sebelumnya bisa import tanpa WhatsApp" TIDAK didukung riwayat git repo ini untuk
  jalur import — selisihnya adalah antara keputusan bisnis PO (opsional) vs implementasi (wajib) sejak awal.

## 8. Root Cause

**Import Anggota gagal karena renderer-side validation engine (`MemberImportValidationService.validateRow`,
baris 88–90) mewajibkan kolom "No. WhatsApp" terisi (`isBlank(row.whatsapp)` → error `memberImport.requiredValue`),
bertentangan dengan aturan bisnis PO bahwa WhatsApp/Email opsional; seluruh baris ber-WhatsApp kosong ditolak
sebelum mencapai backend (Valid 0, Error 418).**

- **PRIMARY:** validasi wajib WhatsApp di `src/services/MemberImportValidationService.ts:88-90` (belum pernah
  disesuaikan dengan keputusan PO bahwa WhatsApp opsional).
- **SECONDARY (kontributor):** tipe `MemberImportRowInput.phone: string` (wajib, non-nullable) di
  `src/shared/dto/member.ts:77` merepresentasikan asumsi "phone selalu ada"; dan `requiredHeader: true` untuk
  WhatsApp di template — meski ini hanya memaksa baris header "No. WhatsApp" hadir (bukan isi sel), tetap menegaskan
  WhatsApp sebagai kolom inti. Backend tidak punya penyelamat karena validasi terjadi penuh di renderer.

## 9. Expected vs Current

| Field    | Expected (PO) | Current                  | Status  |
|----------|---------------|--------------------------|---------|
| WhatsApp | Opsional      | Wajib (validator r.88-90)| **MISMATCH** |
| Email    | Opsional      | Opsional (tanpa validasi)| OK      |

## 10. Recommended Fix (MINIMAL — tidak diimplementasikan)

1. Hapus blok `isBlank(row.whatsapp)` (baris 88–90) di `src/services/MemberImportValidationService.ts`.
2. Ubah `memberImport.template.ts` `whatsapp.requiredHeader` → `false` bila kolom WhatsApp boleh tidak hadir
   di file sama sekali (opsional; jika kolom selalu ada, bisa dibiarkan).
3. Ubah `MemberImportRowInput.phone` → `phone?: string` agar tipe selaras opsional.
4. (Opsional, kualitas) normalisasi whatsapp (`trim`, strip spasi pemisah) sebelum disimpan — pola yang sama
   dengan `member-import-normalization.ts` untuk email.

Catatan: perubahan schema/migration TIDAK diperlukan — kolom `Member.phone`/`Member.email` sudah nullable.

## 11. Regression Risk

- **418 baris yang ditolak** → setelah fix menjadi valid; risiko utamanya baris duplikat NISN yang kini lolos
  validasi (dideteksi fase berikutnya, tidak berubah).
- **Duplicate detection (NISN/email)** → tidak terpengaruh (logika di `MemberDuplicateChecker` tetap).
- **Nomor anggota** → alokasi nomor (S/G/U) tidak terkait whatsapp; tidak terpengaruh.
- **Login/auth, Dashboard, Peminjaman, Pengembalian** → tidak membaca validasi import; tidak terpengaruh.
- **Manual entry anggota** → sudah opsional; konsisten dengan fix.
- **Backup/Restore, Settings reset, Print, Report** → tidak menyentuh validator import; tidak terpengaruh.
- **Smoke member import** (`wo17_mi1` … `wo20_mi4`) yang menguji perilaku whatsapp-wajib akan berubah hasil bila
  ada kasus assert-nya; perlu dievaluasi saat implementasi.

## 12. Files That Would Need Modification

- `src/services/MemberImportValidationService.ts` (hapus validasi wajib whatsapp)
- `src/config/memberImport.template.ts` (opsional: `requiredHeader` whatsapp → false)
- `src/shared/dto/member.ts` (opsional: `phone?: string`)
- Smoke yang mengasumsikan whatsapp-wajib (bila ada)

## 13. Git Status

```
 M electron/ipc/book.ipc.ts
 M electron/main/bootstrap.ts
 M electron/main/services/book.service.ts
 M electron/preload/book.preload.ts
 M prisma/schema.prisma
 M src/components/books/BookDetail.tsx
 M src/components/books/BookForm.tsx
 M src/config/bookImport.template.ts
 M src/main/services/book-import.service.ts
 M src/renderer/env.d.ts
 M src/shared/dto/book.ts
 M src/utils/labels.ts
 M wo11e/smoke.ts
 M wo21_import_b1b2_smoke/smoke.ts
 M wo4_backup_smoke/smoke.ts
 M wo5_restore_smoke/smoke.ts
 M wo6_backup_restore_ui_smoke/smoke.ts
?? WORK_ORDER_BOOK_COVER_IMPLEMENTATION.md
?? prisma/migrations/20260810_wo_book_cover/
?? src/main/infrastructure/asset/book-cover-config.ts
?? src/main/infrastructure/asset/book-cover-resize.ts
?? src/main/infrastructure/providers/asset.provider.ts
?? src/main/infrastructure/restore/asset-restore.handler.ts
?? src/shared/dto/cover.ts
?? wo_book_cover_smoke/
```

Semua perubahan di atas adalah pekerjaan **Book Cover** yang sedang berjalan (pre-existing, TIDAK tersentuh audit ini).
Tidak ada file member-import yang berubah.

## FINAL VERDICT

AUDIT COMPLETE — ROOT CAUSE CONFIRMED

Audit dihentikan. Tidak ada kode/schema/migration yang diubah. Tidak ada commit/push.
