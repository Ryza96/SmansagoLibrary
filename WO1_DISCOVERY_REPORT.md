# WO-1 (F1) — SHARED DOMAIN CONFIG — DISCOVERY REPORT

**Peran:** Project Engineer
**Mode:** DISCOVERY ONLY — tidak ada perubahan kode, tidak ada migration, tidak ada implementasi, tidak ada commit.
**Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED)

**Status: READY FOR IMPLEMENTATION** (alasan di bagian 8).

---

## 1. Current Architecture

Saat ini `MemberType` dan `EducationLevel` adalah **konstanta tersebar tanpa definisi tunggal**:

### MemberType (4 lokasi nilai + 4 lokasi konsumsi UI)
| Lokasi | Isi | Jenis |
|--------|-----|-------|
| `src/utils/labels.ts:218-222` | `MEMBER_TYPES: [{value:'student',label:'Siswa'}, {value:'teacher',label:'Guru'}, {value:'general',label:'Umum'}]` | Definisi UI |
| `src/utils/labels.ts:227-231` | `MEMBER_RIGHTS: {student:{maxBooks:2,maxDays:7,extensions:'1x'}, teacher:{maxBooks:5,maxDays:30,...}, general:{maxBooks:10,maxDays:90,...}}` | Hak pinjam (display-only) |
| `src/main/services/number-generator.service.ts:31-35` | `MEMBER_TYPE_PREFIX: {student:'S', teacher:'G', general:'U'}` | Prefix nomor anggota |
| `src/main/services/member-import.service.ts:200,219` | literal `'student'` (hardcode) | Impor (semua baris siswa) |
| `src/components/members/MemberForm.tsx:21` | `MEMBER_TYPES = ['student','teacher','general'] as const` | Opsi form (duplikat) |
| `src/pages/MembersPage.tsx:10-14` | `MEMBER_TYPE_LABEL` lokal | Label UI (duplikat) |
| `src/pages/MemberListPage.tsx:11-15` | `MEMBER_TYPE_LABEL` lokal | Label UI (duplikat) |
| `src/pages/MemberDetailPage.tsx:20-24` | `MEMBER_TYPE_LABEL` lokal + `MemberTypeKey = keyof typeof LABELS.MEMBER_RIGHTS` | Label + hak UI |
| `src/routes/index.tsx:53-55` | `memberType="student"/"teacher"/"general"` literal | Route |
| `src/components/members/RightsSidebar.tsx:5-7`, `MemberDetailPage.tsx:60-64` | interface `Rights {maxBooks,maxDays,extensions}` (duplikat) | Tipe hak |

### EducationLevel (2 lokasi)
| Lokasi | Isi |
|--------|-----|
| `src/main/services/member-class-resolver.service.ts:32` | `EDUCATION_LEVELS = new Set(['X','XI','XII'])` |
| `prisma/schema.prisma:15` | komentar `// EducationLevel: X | XI | XII` (dokumentasi) |

### Kondisi lain
- `Member.memberType` di DB = string bebas (`schema.prisma`, DTO `member.ts`, `env.d.ts:87`).
- Hak pinjam (`MEMBER_RIGHTS`) **display-only** — tidak ada enforcement; `BorrowService.MAX_BOOKS=20` hardcoded (Technical Debt, di luar scope WO-1).
- `class.service.ts` **belum** memvalidasi `educationLevel` (validasi akan ditambahkan di WO CL-1, bukan WO-1).

---

## 2. Files Impact Analysis

### File baru (2)
| File | Fungsi |
|------|--------|
| `src/shared/config/member-type.ts` | `MemberType` value object: code/label/prefix/borrowRights/hasAcademicRecord (RFC §5) |
| `src/shared/config/education-level.ts` | `EDUCATION_LEVELS` + `levelOrder(level)` (RFC §2.3) |

### File yang dimodifikasi (11) — hanya refactor konsumen, tanpa perubahan perilaku
| File | Perubahan |
|------|-----------|
| `src/main/services/number-generator.service.ts` | `MEMBER_TYPE_PREFIX` → `MemberType[code].memberNumberPrefix` |
| `src/main/services/member-import.service.ts` | literal `'student'` (×2) → `MemberType.STUDENT.code` |
| `src/main/services/member-class-resolver.service.ts` | `EDUCATION_LEVELS` Set → `EDUCATION_LEVELS` dari config |
| `src/utils/labels.ts` | `MEMBER_TYPES`/`MEMBER_RIGHTS` → derive dari config |
| `src/components/members/MemberForm.tsx` | hapus `MEMBER_TYPES` lokal → `MemberType.codes` |
| `src/pages/MembersPage.tsx` | hapus `MEMBER_TYPE_LABEL` lokal → `MemberType[code].label` |
| `src/pages/MemberListPage.tsx` | hapus `MEMBER_TYPE_LABEL` lokal → config |
| `src/pages/MemberDetailPage.tsx` | `MEMBER_TYPE_LABEL`+`MemberTypeKey`+`Rights` → config |
| `src/components/members/RightsSidebar.tsx` | interface `Rights` → tipe dari config |
| `src/routes/index.tsx` | literal `student/teacher/general` → `MemberType.STUDENT.code` dst. |
| `src/shared/dto/member.ts` | tambahkan import tipe `MemberType` (opsional, untuk konsistensi tipe) |

### Tidak terdampak
`prisma/schema.prisma` (komentar tidak diubah), `class.service.ts`/`class.repository.ts` (validasi level = WO CL-1), `borrow.service.ts` (MAX_BOOKS = Technical Debt, di luar scope), DB/migration (tidak ada).

---

## 3. Dependency Analysis

### MemberType — dependensi
| Konsumen | Kebutuhan dari config | Arah |
|----------|----------------------|------|
| `number-generator.service.ts` | `memberNumberPrefix` (S/G/U) | main → config |
| `labels.ts` | `label` + `borrowRights` | renderer → config |
| `MemberForm` / `MembershipSection` / `SummarySidebar` | `codes` + `label` (dropdown) | renderer → config |
| `MembersPage` / `MemberListPage` / `MemberDetailPage` | `label` + `borrowRights` | renderer → config |
| `RightsSidebar` | tipe `Rights` | renderer → config |
| `member-import.service.ts` | `STUDENT.code` | main → config |
| `routes/index.tsx` | `codes` | renderer → config |

### EducationLevel — dependensi
| Konsumen | Kebutuhan | Arah |
|----------|-----------|------|
| `member-class-resolver.service.ts` | set valid `X/XI/XII` + `levelOrder` (untuk parse) | main → config |
| *(masa depan)* `class.service.ts` (CL-1) | `levelOrder` untuk validasi | main → config |

### Aturan arsitektur
- **Config = leaf node.** `src/shared/config/*` **tidak boleh mengimpor apa pun** (tanpa dependensi; tanpa import dari `labels.ts`/service/komponen) → bebas dari siklus dan aman dipakai main (electron) + renderer (sudah terbukti pola `src/shared/dto` dipakai dua sisi).
- `src/shared/config` dipakai oleh main dan renderer (pola sama dengan `src/shared/dto/member.ts` yang diimpor electron/main + renderer).
- `env.d.ts` boleh mengimpor tipe config (opsional, konsisten dengan pola impor DTO).

---

## 4. Hardcode Audit (kondisi sekarang → target WO-1)

| Hardcode | Lokasi | WO-1 menghapus? |
|----------|--------|-----------------|
| `MEMBER_TYPE_PREFIX {student:'S',teacher:'G',general:'U'}` | number-generator:31 | YA |
| literal `'student'` | member-import:200,219 | YA |
| `MEMBER_TYPES` array | labels:218 | YA (derive dari config) |
| `MEMBER_RIGHTS` | labels:227 | YA (derive dari config) |
| `MEMBER_TYPE_LABEL` lokal (×3) | MembersPage:10, MemberListPage:11, MemberDetailPage:20 | YA |
| `MEMBER_TYPES = ['student',...]` lokal | MemberForm:21 | YA |
| `memberType="student"` literal route | routes:53-55 | YA |
| `EDUCATION_LEVELS` Set | resolver:32 | YA |
| **BUKAN scope WO-1** `MAX_BOOKS=20` | borrow.service:11 | TIDAK (Technical Debt, bukan domain MemberType/EducationLevel) |
| **BUKAN scope WO-1** validasi `educationLevel` di `class.service` | — | TIDAK (WO CL-1) |
| `Member.memberType` string di DB | schema/DTO | TIDAK (tetap string; tipe dipakai hanya via config) |

---

## 5. Architecture Compliance (WO-1 vs RFC/WBS)

| Klausul | Kepatuhan |
|---------|-----------|
| RFC §2.3 — konstanta terpusat `EDUCATION_LEVELS` + `levelOrder` | ✓ dibuat persis |
| RFC §5 — `MemberType` konsep domain, satu sumber definisi | ✓ dibuat sebagai value object config; keputusan enum-vs-string ditunda ke WO (tidak menyentuh DB) |
| RFC §6 — status akademik dipisah | ✓ tidak tersentuh (di luar scope WO-1) |
| WBS F1 — "tidak mengubah schema, tidak mengubah perilaku" | ✓ tidak ada schema/migration; refactor preservasi nilai |
| WBS F1 — "tidak ada literal tipe terduplikasi; konsumen memakai config" | ✓ target akhir grep bersih |
| RFC §15 — fase additif | ✓ WO-1 murni additif (file baru + refactor baca) |
| **Tidak menambah Source of Truth baru** | ✓ config adalah SATU definisi pengganti 10+ lokasi tersebar; bukan sumber tambahan |

**Batas scope yang dijaga:** WO-1 **tidak** menambah validasi `educationLevel` di `ClassService` (itu CL-1), **tidak** menegakkan borrow rights (display-only tetap), **tidak** mengubah DB/schema.

---

## 6. Risk Analysis

| Risiko | Prob. | Dampak | Mitigasi |
|--------|-------|--------|----------|
| Perubahan perilaku saat refactor (label/prefix/rights berubah) | Rendah | Tinggi | Config memakai nilai identik (S/G/U, 'Siswa'/'Guru'/'Umum', 2/5/10); unit test banding nilai sebelum/sesudah |
| Siklus import (config mengimpor labels/service) | Rendah | Sedang | Config = leaf node, tanpa import; verifikasi lint + grep |
| Konflik nama tipe `MemberType` (lokal di MemberForm:22) | Sedang | Sedang | Naming jelas (`MemberType` dari config vs alias lokal dihapus); satu sumber tipe |
| `as const`/`keyof` extraction salah sehingga tipe longgar | Sedang | Sedang | Uji tipe; `MemberTypeCode = keyof typeof MEMBER_TYPES` |
| Melewati batas scope (mis. menyentuh `class.service`/schema) | Rendah | Sedang | Checklist WBS F1; review diff |
| `src/shared` tidak termasuk kompilasi salah satu side (main/renderer) | Rendah | Tinggi | Pola `src/shared/dto` sudah terbukti; verifikasi di lint+build |

---

## 7. Implementation Plan (mengikuti Implementation Flow WBS §3)

| Layer | Aksi | Alasan / catatan |
|-------|------|------------------|
| **Repository** | **N/A** | Config statis; tidak ada akses data. WBS §3 menetapkan N/A eksplisit. |
| **Service** | 1) Buat `src/shared/config/member-type.ts` + `education-level.ts`. 2) Refactor `number-generator.service.ts` (prefix), `member-class-resolver.service.ts` (EDUCATION_LEVELS), `member-import.service.ts` (`MemberType.STUDENT.code`). | Sisi main; preservasi perilaku. |
| **IPC** | **N/A** | Tidak ada channel baru. |
| **Preload** | **N/A** | Tidak ada api surface baru. |
| **UI** | Refactor `labels.ts` (derive MEMBER_TYPES/MEMBER_RIGHTS), `MemberForm`, `MembersPage`, `MemberListPage`, `MemberDetailPage`, `RightsSidebar`, `routes/index.tsx` (hapus literal/lokal → config). | Sisi renderer; label/hak dari config. |
| **Testing** | Unit test: `levelOrder` (X<XI<XII, invalid → NaN/error), tabel MemberType lengkap (code/label/prefix/rights/hasAcademicRecord), konsistensi label. Grep verifikasi nol literal tersisa. `npm run lint` + `npm run build`. | Gate WBS §4: lint+build+manual test+docs+PO Approval. |
| **PO Review** | Sajikan diff + hasil test. | Gate wajib sebelum WO berikutnya (AY-1a). |

**Lintasan akhir:** service/main (config + 3 refactor) → UI/renderer (8 refactor) → testing → PO Review. Layer Repository/IPC/Preload di-declare N/A.

---

## 8. Validation Plan & Exit Criteria

### Validation Plan
1. `npm run lint` PASS, `npm run build` PASS (main/preload/renderer).
2. Unit test config: `levelOrder('X')=1`, `levelOrder('XI')=2`, `levelOrder('XII')=3`, level invalid → NaN; `MemberType` punya `student/teacher/general` dengan `label`, `memberNumberPrefix` (S/G/U), `borrowRights` (2/5/10, 7/30/90), `hasAcademicRecord` (true untuk STUDENT).
3. Grep verifikasi: tidak ada literal `'student'/'teacher'/'general'` di `labels.ts`, `routes`, `member-import`, `number-generator`; tidak ada `MEMBER_TYPE_LABEL` lokal; tidak ada `EDUCATION_LEVELS` Set di resolver.
4. Uji banding perilaku: prefix nomor anggota tetap `S-`/`G-`/`U-`; resolver parse `X MERDEKA 1` tetap berfungsi.

### Exit Criteria
1. `src/shared/config/member-type.ts` + `education-level.ts` dibuat; seluruh konsumen (11 file) mengacu config.
2. Grep: **0** sisa hardcode pada lokasi yang diaudit (§4).
3. lint PASS + build PASS + unit test PASS.
4. Tidak ada perubahan schema/migration; tidak ada perilaku berubah; tidak ada Source of Truth baru (config = pengganti, bukan tambahan).
5. Dokumentasi: AGENTS.md + laporan WO-1 diperbarui; Gate PO Approval terpenuhi.

---

## 9. Status: **READY FOR IMPLEMENTATION**

**Alasan:**
1. Cakupan jelas & kecil: 2 file config baru + 11 refactor konsumen yang nilai-nilainya sudah terpetakan persis (tidak ada ambiguitas data).
2. Kepatuhan RFC/WBS terverifikasi (§5): hanya konstanta terpusat (RFC §2.3, §5; WBS F1), tanpa schema/perilaku/scope creep.
3. Tidak menambah Source of Truth: config adalah satu definisi pengganti untuk 10+ lokasi tersebar; arah dependensi satu arah (leaf node) — bebas siklus.
4. Risiko rendah & termitigasi (§6), dengan jalur rollback alami (refactor preservasi nilai; config dihapus = kembalikan literal).
5. Gate & Implementation Flow terdefinisi jelas (§7); layer Repository/IPC/Preload dinyatakan N/A dengan alasan.
