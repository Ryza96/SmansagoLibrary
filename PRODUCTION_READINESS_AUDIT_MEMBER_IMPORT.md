# Production Readiness Audit — Member Import

**Work Order:** 7 (P6)
**Mode:** READ ONLY — tidak ada perubahan kode, tidak ada implementasi, tidak ada commit.
**Audit scope:** Seluruh pipeline Upload Excel → Parse → Validation → Duplicate File → Duplicate Database → Class Resolver → Preview → Import → Transaction → Progress → Result.
**Status keseluruhan: NOT READY** (dengan 4 blocker moderat — lihat §9; inti alur produksi telah valid).

---

## 1. Architecture Review

Pipeline dua-lapis yang jelas dan sesuai RFC:

```
Renderer (UI)                          Main (bisnis + DB)
─────────────────────────────          ─────────────────────────────
FileUploadDropzone → parse ──IPC──▶ previewCheck → preflight(dup+class)
MemberImportValidationService         MemberImportService.import()
MemberPreviewService (merge) ◀─DTO─── preflight ULANG + writePhase
MemberImportDialog (Import klik) ──IPC+progress▶ $transaction:
  onProgress(cb)      ◀── event ──       allocateMemberNumbers +
  MemberImportResultDTO                 createManyWithTx (chunk 500)
```

- **Layering:** renderer memegang validasi format + duplicate dalam file + presentasi; backend memegang duplicate database, class resolver, transaksi, numbering, result DTO. Kontrak via `src/shared/dto/member.ts` (`MemberImportRowInput`, `MemberImportPreviewDTO`, `MemberImportResultDTO`, `MemberImportProgressEvent`).
- **Konsistensi IPC:** `member.ipc.ts` ↔ `member.preload.ts` ↔ `env.d.ts` ↔ dialog selaras (channel `members:previewCheck` / `members:import` / `members:importProgress`, `memberImport.previewCheck/import/onProgress`).
- **DI:** `electron/main/bootstrap.ts` membangun `MemberImportService(duplicateChecker, classResolver, numberGenerator, memberRepository)` sesuai RFC §7.1.
- **Lempar-vs-return konsisten:** kasus bisnis → result object; error sistem → throw/reject.
- **Kelebihan:** transaksi tunggal all-or-nothing, nomor tidak reuse setelah rollback, preflight dijalankan ulang saat import (anti drift), single-flight, tanpa listener abadi di main, template di-pack via `electron-builder.yml extraResources`.

---

## 2. Risk Analysis

Per dimensi audit (15):

| # | Dimensi | Temuan | Severity |
|---|---------|--------|----------|
| 1 | Race condition | Single-flight (`importRunning`) aman. Drift preview→import ditutup preflight ulang. Race dengan `MemberService.create` manual → P2002 → import rollback bersih (bukan korupsi). Aman | RENDAH |
| 2 | Rollback | `$transaction` tunggal; exception/P2002 → ROLLBACK penuh 0 baris; force-close → journal SQLite. Benar | OK |
| 3 | Memory leak | Renderer unsubscribe di `finally`+`handleClose`+unmount (ref idempotent); main tanpa listener persisten; singleton `getPrisma`. Tidak ada leak | OK |
| 4 | Listener leak | `onProgress` → `removeListener`; `ipcMain.handle` tidak mengakumulasi. Tidak ada leak | OK |
| 5 | Transaction leak | Tidak ada begin/commit manual; timeout NOT SET | **MODERAT** (lihat §4-5) |
| 6 | Chunk | Lookup 900 / write 500; `createMany` 500×13 kolom ≈ 6.500 bind — di bawah 32.766 (SQLite ≥3.32). Valid | OK |
| 7 | Duplicate | Lihat §4 — NISN aman (DB `@unique`), Email TIDAK aman (tidak `@unique` + lookup case-sensitive + whitespace) | **MODERAT** |
| 8 | Invalid class | `classNotFound`/`classAmbiguous` memuat `className`; tanpa auto-create (keputusan PO). Benar | OK |
| 9 | Invalid excel | Error parse tertangkap; **batas ukuran 5MB tidak ditegakkan** di dialog anggota | **MODERAT** |
| 10 | Progress consistency | Stage per-fase membuat bar tidak monoton (0→100% per fase lalu turun); fase tulis tanpa emisi → bar terpaku "Generating Member Number 0/N" | **MODERAT (UX)** |
| 11 | Numbering consistency | max+1 di dalam tx, tidak reuse setelah rollback; batas lexicographic ~999.999/prefix (tidak realistis) | RENDAH |
| 12 | Exception flow | Bisnis→result, sistem→throw, P2002→result. Konsisten | OK |
| 13 | DTO consistency | Field konsisten; renderer memakai ResultDTO langsung (P5B) tanpa DTO baru. `warnings` selalu 0 (vestigial) | OK |
| 14 | IPC consistency | Channel & payload selaras; pesan system error terbungkus prefiks Electron | RENDAH |
| 15 | Renderer consistency | `canImport` = semua VALID; status priority; keterangan merge; progress dari DTO tanpa hitung ulang | OK |

---

## 3. Technical Debt

| ID | Deskripsi | Lokasi | Prioritas |
|----|-----------|--------|-----------|
| TD-1 | `writePhase(_onProgress)` — parameter progress TIDAK dipakai; stage `saving` di DTO tidak pernah dipancarkan backend | `member-import.service.ts:195` | TINGGI (UX) |
| TD-2 | `runTransaction` = `prisma.$transaction(fn)` tanpa `{ timeout }` — memakai default 5 detik Prisma | `base/transaction.ts:7` | TINGGI |
| TD-3 | `Member.email` tanpa `@unique` dan tanpa index → kebijakan duplicate email hanya best-effort + `IN` email full-scan | `schema.prisma:107`, `member.repository.ts:123` | SEDANG |
| TD-4 | Nilai NISN/email/`fullName` tidak di-trim sebelum disimpan (renderer `toMemberImportRows` memakai `String()` polos) → whitespace bypass deteksi & `@unique` NISN | `MemberImportDialog.tsx` (toMemberImportRows) | SEDANG |
| TD-5 | Batas `IMPORT_CONFIG.maxFileSize` (5MB) tidak dipakai jalur anggota; parser memuat seluruh workbook ke memori | `MemberImportDialog.tsx` (handleFileChange) | SEDANG |
| TD-6 | Import menjalankan preflight LENGKAP dua kali (preview + import) → 2× duplicate lookup + class resolve | `member-import.service.ts:96` | RENDAH |
| TD-7 | Konsep `warnings` vestigial — backend tidak pernah menghasilkan warning | `member-import.service.ts` | RENDAH |
| TD-8 | Banyak `any`/duplikasi layanan lama Stack B (`borrowing.service.ts` dll) masih hidup — di luar scope audit ini | `electron/main/services/*` | RENDAH (dari audit WO-007) |
| TD-9 | Normalisasi gender/email tidak seragam antara renderer (`toKey` trim saja) vs backend (`normalizeEmail` lowercase) | preview vs duplicate-checker | RENDAH |

---

## 4. Potential Bug

| ID | Bug | Path | Severity |
|----|-----|------|----------|
| B-1 | **Email duplikat dapat tersimpan.** Tidak ada `@unique` pada `Member.email`; lookup backend menormalisasi input ke lowercase tetapi query `email IN` SQLite case-sensitive terhadap nilai tersimpan → `Foo@Bar.com` vs `foo@bar.com` tidak terdeteksi dan tidak diblokir DB | `member-duplicate-checker.service.ts:70`, `schema.prisma:107` | MODERAT |
| B-2 | **Whitespace bypass NISN.** Nilai `"12345 "` (trailing space) tersimpan apa adanya; lookup `nisn IN ('12345')` tidak cocok → bukan duplicate; `@unique` juga tidak aktif karena string berbeda → NISN kembar boleh masuk lintas file | `toMemberImportRows` → `buildPayload`, `member-duplicate-checker.service.ts:41` | MODERAT |
| B-3 | **Transaction timeout default 5 detik (P2028).** Import besar (≥ beberapa ribu baris) atau disk lambat → `prisma.$transaction` dibatalkan → bukan P2002 → di-throw sebagai system error "transaction timed out"; user harus ulangi seluruh file | `base/transaction.ts:7` | MODERAT |
| B-4 | **Progress bar non-monoton + terpaku 0% saat tulis.** DTO memancarkan 0 lalu N per fase (checking-duplicate → 0/100%, resolving-class → 0/100%, generating-number → 0%, tulis tanpa emisi, completed → 100%) → bar naik-turun dan diam sepanjang fase terpanjang | `member-import.service.ts:94-115,192-203` | MODERAT (UX) |
| B-5 | **Tanpa batas ukuran file.** Dropzone `accept` hanya filter dialog; drag-drop bisa memuat file raksasa → `read-excel-file` memuat penuh ke memori renderer → freeze/DoS | `MemberImportDialog.tsx`, `WorkbookReaderService.ts:17` | MODERAT |
| B-6 | **Nomor anggota rusak > 999.999/prefix.** `orderBy memberNumber desc` adalah urutan lexicographic; pada 7 digit urutan tidak lagi numerik → alokasi bertabrakan → P2002 (import gagal). Tidak realistis untuk sekolah | `member.repository.ts:136-144` | RENDAH |
| B-7 | **Pesan system error dibungkus prefiks** `Error invoking remote method 'members:import': ...` (default Electron) ditampilkan mentah di dialog | `MemberImportDialog.tsx` (catch → `error.message`) | RENDAH |
| B-8 | **Tanggal teks ambigu.** `new Date("03/12/2005")` dan `Date.parse` memakai format US (MM/DD) → file dengan format DD/MM bisa salah tanggal tanpa error | `member-import.service.ts:232-236`, `MemberImportValidationService.ts:42` | RENDAH |
| B-9 | **NISN numerik dengan leading zero.** Excel menyimpan angka → leading zero hilang → nilai tersimpan salah (mis. NISN `0…`). Mitigasi template format teks | `MemberExcelParserService.ts` (`toString`) | RENDAH |
| B-10 | **Status baris menyembunyikan error kelas bila juga duplicate** (DUPLICATE menang atas ERROR); keterangan tetap memuat semua pesan | `MemberPreviewService.ts:90-96` | RENDAH |

---

## 5. Performance

- **Reads:** preview = 2 lookup ber-chunk (NISN 900/email 900) paralel + `findActive` + `findByAcademicYear`. Import mengulang semuanya + fase tulis. Total ~6 query IN + 2 query class + `N/500` `createMany`.
- **Writes:** `createMany` 500/statement di dalam satu transaksi — efisien untuk SQLite.
- **Memori renderer:** seluruh workbook + array `ParsedMemberRow` + payload dibangun penuh di memori. 5.000 baris wajar; tanpa cap ukuran, file besar berisiko freeze (§4 B-5).
- **Index DB:** `nisn/nip/nuptk/nik/memberNumber` ter-index; `email` TIDAK ter-index → `findManyByEmails` full scan pada tabel besar (tidak signifikan untuk skala sekolah).
- **No parallelism** antar-chunk tulis (sekuensial) — tepat untuk SQLite single-writer.
- Tidak ada smoke skala besar (100/500/1.000/5.000, boundary chunk, ukuran waktu) yang terlihat di working tree — uji P7 RFC belum dieksekusi/dilaporkan.

---

## 6. Security

- **XSS:** semua render via React text (tanpa `dangerouslySetInnerHTML`) — aman; nilai Excel tidak dieksekusi.
- **SQL injection:** seluruh query via Prisma terparameterisasi — aman.
- **Path traversal / file:** template memakai jalur tetap + save-dialog; `extraResources` membatasi 2 file template — aman.
- **Formula/CSV injection:** tidak ada ekspor; nilai `=…` disimpan sebagai teks — aman.
- **DoS memori:** §4 B-5 (tanpa cap ukuran) — satu-satunya celah keamanan praktis yang teridentifikasi.

---

## 7. UX

- **Positif:** preview 50 baris + ringkasan; status/badge; keterangan multi-baris; kontrol di-disable saat import; result counts; progress stage + `current/total`; alur "Result tampil → tutup → daftar refresh".
- **Negatif:**
  1. Bar progress non-monoton dan terpaku 0% selama fase tulis terpanjang (§4 B-4).
  2. Gagal preflight saat import menampilkan "100%" (stage `resolving-class N/N`) lalu status gagal — membingungkan.
  3. Pesan system error mentah ber-prefiks Electron (§4 B-7).
  4. Setelah sukses, tombol Import di-disable; untuk import file lain user harus tutup–buka dialog (tidak fatal).
  5. `canImport` mengharuskan SEMUA baris valid — tidak ada opsi "import yang valid saja" (keputusan desain, bukan bug).

---

## 8. Production Checklist

| Item | Status |
|------|--------|
| `npm run lint` | PASS (P5B/P5C) |
| `npm run build` | PASS (P5B/P5C; renderer 938.79 kB) |
| Fresh DB `migrate deploy` / `migrate status` / `migrate diff` | PASS (P4C) |
| Smoke P4C (transaction/rollback/numbering) 48/48 | PASS |
| Smoke P4D (IPC contract/progress/unsubscribe) 25/25 | PASS |
| Smoke P5A REV1 (preview merge) 40/40 | PASS |
| Template anggota ter-pack (`extraResources`) | PASS |
| Transaction timeout eksplisit | **BELUM** (§3 TD-2) |
| Cap ukuran file jalur anggota | **BELUM** (§3 TD-5) |
| Trim nilai sebelum simpan | **BELUM** (§3 TD-4) |
| `@unique`/index pada email + lookup case-insensitive | **BELUM** (§3 TD-3) |
| Progress tulis (stage `saving` + persen kumulatif) | **BELUM** (§3 TD-1) |
| Smoke skala besar (P7: 100/500/1.000/5.000) | **BELUM terlihat** |

---

## 9. Final Recommendation

**Status: NOT READY** untuk rilis produksi penuh, dengan catatan: **inti alur produksi VALID dan layak UAT**, namun 4 item moderat wajib ditutup sebelum release (semuanya perbaikan kecil, tanpa perubahan arsitektur):

1. **TD-2 / B-3 — Transaction timeout:** atur `{ timeout }` di `runTransaction` (mis. 30–60 s) agar import besar tidak gagal P2028.
2. **TD-5 / B-5 — Cap ukuran file:** tegakkan `IMPORT_CONFIG.maxFileSize` di dialog anggota (sama seperti jalur buku) sebelum parse.
3. **TD-4 / B-2 — Trim nilai:** trim `fullName/kelas/nisn/email` sebelum dikirim ke backend agar `@unique` NISN benar-benar berfungsi.
4. **TD-1 / B-4 — Progress:** pancarkan stage `saving` + persentase per chunk dari `writePhase`, atau setidaknya emisi `saving 0/N → N/N` agar bar tidak non-monoton.

Tambahan yang disarankan (bukan blocker): B-1 (keputusan kebijakan email + normalisasi case/whitespace seragam), B-7 (rapikan pesan system error), dan eksekusi smoke skala P7.

**Ringkasan 15-dimensi:** 10 dimensi bersih/OK, 5 menemukan gap (5,7,9,10,11) — semuanya bertingkat RENDAH–MODERAT; **tidak ada korupsi data, race berbahaya, atau kebocoran resource** yang ditemukan. Posisi ini bisa naik ke READY setelah 4 blocker moderat ditutup + smoke skala.
