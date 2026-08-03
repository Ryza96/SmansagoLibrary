# WORK ORDER 1 (F1) — SHARED DOMAIN CONFIG — IMPLEMENTATION REPORT

**Peran:** Project Engineer
**Mode:** IMPLEMENTATION — refactor preservasi nilai; **TIDAK** ada perubahan schema/migration/DB; **TIDAK** ada commit.
**Source of Truth:** `MASTER_DATA_AKADEMIK_ARCHITECTURE_RFC.md` (LOCKED) + `MASTER_DATA_AKADEMIK_WBS.md` (LOCKED) + `WO1_DISCOVERY_REPORT.md` (APPROVED, READY FOR IMPLEMENTATION).

> Catatan penamaan: nama output WO-1 (`WORK_ORDER_1_IMPLEMENTATION_REPORT.md`) sudah dipakai laporan sprint Import Anggota (WO-1 lama). Laporan baru memakai suffix `_F1_` agar tidak overwrite riwayat.

**Status: DONE — Architecture Gate BERHENTI**, menunggu review Product Owner (tidak lanjut WO berikutnya, AY-1a).

---

## 1. Ringkasan

Shared Domain Config untuk `MemberType` dan `EducationLevel` dibuat di `src/shared/config/` sebagai **satu definisi** pengganti 10+ lokasi tersebar. Seluruh konsumen (11 file) di-refactor ke config tanpa perubahan perilaku; nilai-nilai dipertahankan identik (S/G/U, 'Siswa'/'Guru'/'Umum', 2/5/10 & 7/30/90).

| Aspek | Hasil |
|-------|-------|
| File baru | 2 (`member-type.ts`, `education-level.ts`) |
| File dimodifikasi | 11 (3 main + 7 renderer + 1 DTO) |
| Schema / migration / DB | **0 perubahan** |
| Perilaku | Identik (preservasi nilai) |
| Gate | lint PASS · build PASS · smoke 31/31 PASS · grep 0 hardcode |
| Commit | **TIDAK** (menunggu review PO) |

---

## 2. File Baru

### 2.1 `src/shared/config/member-type.ts` — definisi tunggal MemberType
- `MemberTypeDefinition` interface (code/label/memberNumberPrefix/borrowRights/hasAcademicRecord) + `MemberBorrowRights`.
- `MEMBER_TYPES` record `student`/`teacher`/`general` dengan `as const satisfies Record<string, MemberTypeDefinition>` → literal type penuh + konformansi skema. **Extensible:** menambah properti domain (mis. `academicRecord`, `cardPrintLabel`) cukup menambah field per entri, tanpa refactor konsumen.
- `MemberTypeCode = keyof typeof MEMBER_TYPES` (union `'student'|'teacher'|'general'`); `MemberType = (typeof MEMBER_TYPES)[MemberTypeCode]` (value object literal).
- **Primitive:** `getMemberType(type?: string|null)` → `MemberType|null` — satu-satunya tempat guard null/invalid; mengembalikan value object utuh (RFC §5).
- **Thin projections** (delegasi ke primitive): `isMemberTypeCode(value)` (type guard), `memberTypeLabel(type?)` → `string|null`, `memberNumberPrefix(type?)` → default `S` (STUDENT) utk tipe tak dikenal/undefined, `memberBorrowRights(type?)` → `MemberBorrowRights|null`. Desain ini hasil `WO1_FINAL_REVIEW.md` (primitive + projections).
- Nilai identik dengan sumber lama: prefix `S`/`G`/`U`; label `Siswa`/`Guru`/`Umum`; rights `2/7/'1x'`, `5/30/'3x'`, `10/90/'Tidak Terbatas'`; `hasAcademicRecord` true hanya STUDENT.

### 2.2 `src/shared/config/education-level.ts`
- `EDUCATION_LEVELS = new Set(['X','XI','XII'])` (RFC §2.3).
- `levelOrder(level)`: `X→1`, `XI→2`, `XII→3`, invalid → `NaN`.

### 2.3 Aturan arsitektur terpenuhi
- **Config = leaf node** (nol import) → tidak ada siklus; aman dikompilasi dua sisi.
- `src/shared/**/*` sudah tercakup `tsconfig.node.json` dan `tsconfig.web.json` (pola sama dengan `src/shared/dto`).

---

## 3. Refactor Konsumen (11 file, preservasi nilai)

### Sisi main (3)
| File | Sebelum | Sesudah |
|------|---------|---------|
| `src/main/services/number-generator.service.ts` | `MEMBER_TYPE_PREFIX` + `DEFAULT_PREFIX` | `resolveMemberNumberPrefix()` → `memberNumberPrefix(memberType)` |
| `src/main/services/member-class-resolver.service.ts` | `const EDUCATION_LEVELS = new Set(['X','XI','XII'])` | import `EDUCATION_LEVELS` dari config |
| `src/main/services/member-import.service.ts` | literal `'student'` (×2: `allocateMemberNumbers`, `buildPayload`) | `MEMBER_TYPES.student.code` |

### Sisi renderer (7)
| File | Perubahan |
|------|-----------|
| `src/utils/labels.ts` | `MEMBER_TYPES`/`MEMBER_RIGHTS` di-derive dari config (`MEMBER_TYPE_OPTIONS` + `MEMBER_RIGHTS_LOOKUP`), bukan hardcode |
| `src/components/members/MemberForm.tsx` | hapus `MEMBER_TYPES`+`type MemberType` lokal → `memberBorrowRights()` + `isMemberTypeCode()`; payload memakai `memberTypeCode` ter-narrow |
| `src/pages/MembersPage.tsx` | hapus `MEMBER_TYPE_LABEL` lokal → `memberTypeLabel(m.memberType)` |
| `src/pages/MemberListPage.tsx` | hapus `MEMBER_TYPE_LABEL` lokal; `memberType === 'student'` → `memberType === MEMBER_TYPES.student.code` |
| `src/pages/MemberDetailPage.tsx` | hapus `MEMBER_TYPE_LABEL`/`MemberTypeKey`/`interface Rights` → `memberTypeLabel()` + `memberBorrowRights()` + `type MemberBorrowRights` |
| `src/components/members/RightsSidebar.tsx` | hapus `interface RightsData` → `type MemberBorrowRights` |
| `src/routes/index.tsx` | literal `"student"/"teacher"/"general"` → `MEMBER_TYPES.*.code` |

### DTO (1)
| File | Perubahan |
|------|-----------|
| `src/shared/dto/member.ts` | `CreateMemberDTO.memberType`/`UpdateMemberDTO.memberType` → `MemberTypeCode` (input ter-validasi domain). `MemberDTO.memberType` **tetap `string | null`** — faithful ke kolom string bebas DB |

---

## 4. Architecture Compliance (WO-1 vs RFC/WBS)

| Klausul | Kepatuhan |
|---------|-----------|
| RFC §2.3 — konstanta terpusat `EDUCATION_LEVELS` + `levelOrder` | ✓ dibuat persis |
| RFC §5 — `MemberType` konsep domain, satu sumber definisi | ✓ `MEMBER_TYPES` value-object config; keputusan enum-vs-string DB ditunda (tidak menyentuh DB) |
| RFC §6 — status akademik dipisah | ✓ tidak tersentuh (di luar scope WO-1) |
| RFC §15 — fase additif | ✓ murni additif (file baru + refactor baca) |
| WBS F1 — tidak mengubah schema/perilaku | ✓ 0 perubahan schema/migration; refactor preservasi nilai |
| WBS F1 — tidak ada literal tipe terduplikasi; konsumen memakai config | ✓ grep bersih (lihat §6) |
| Layer Repository/IPC/Preload = N/A | ✓ (config statis, tidak ada data/channel/api baru) |
| Tidak menambah Source of Truth baru | ✓ config = SATU definisi pengganti, bukan tambahan |

**Batas scope dijaga:** tidak menambah validasi `educationLevel` di `ClassService` (WO CL-1), tidak menegakkan borrow rights (display-only tetap), tidak mengubah `BorrowService.MAX_BOOKS` (Technical Debt), tidak mengubah schema.

---

## 5. Validation

### 5.1 `npm run lint` — PASS
`tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit` — 0 error (kedua sisi memuat `src/shared/config`).

### 5.2 `npm run build` — PASS
| Bundle | Ukuran |
|--------|--------|
| `out/main/index.js` | 1,775.41 kB |
| `out/preload/index.js` | 7.68 kB |
| `out/renderer/assets/index-*.js` | 940.37 kB |

### 5.3 Smoke config — 31/31 PASS
`wo1_config_smoke/config.smoke.ts` (dikompilasi terpisah `npx tsc --module commonjs ...` → dijalankan node):
- EducationLevel: `levelOrder` X/XI/XII = 1/2/3, invalid → NaN, Set berisi X/XI/XII & menolak IX.
- MemberType: 3 tipe; label Siswa/Guru/Umum; prefix S/G/U; default prefix `S` utk unknown/empty/undefined; rights 2/7/'1x', 5/30/'3x', 10/90/'Tidak Terbatas'; rights unknown → null; `hasAcademicRecord` true hanya student; `isMemberTypeCode` valid/invalid; label unknown/empty/undefined → null; konsistensi label vs config untuk semua kode.

### 5.4 Grep — 0 hardcode tersisa
- Literal `'student'/'teacher'/'general'` di `src/` = **hanya** di `src/shared/config/member-type.ts` (source of truth). 0 di `.tsx`; 0 di labels/routes/member-import/number-generator.
- `MEMBER_TYPE_LABEL` lokal = 0. `MEMBER_TYPE_PREFIX` = 0. `MEMBER_RIGHTS[...]` = 0. `MEMBER_TYPES.includes` = 0. `EDUCATION_LEVELS = new Set` hanya di config.

### 5.5 ESLint (`lint:eslint`) — pre-existing, bukan WO-1
Error `react-hooks/set-state-in-effect` (MembersPage:34, MemberListPage:42) + warnings `exhaustive-deps`/`TAB_IDS` berada di baris `useEffect(() => fetchMembers())` yang **tidak disentuh** WO-1 (pola lama). Gate resmi WO-1 (`npm run lint`) PASS.

---

## 6. Exit Criteria

| # | Kriteria | Hasil |
|---|----------|-------|
| 1 | `src/shared/config/member-type.ts` + `education-level.ts` dibuat; seluruh konsumen (11 file) mengacu config | ✓ |
| 2 | Grep 0 sisa hardcode pada lokasi diaudit | ✓ |
| 3 | lint PASS + build PASS + unit test PASS | ✓ (smoke 31/31) |
| 4 | Tidak ada perubahan schema/migration/perilaku; tidak ada Source of Truth baru | ✓ |
| 5 | Dokumentasi diperbarui; Gate PO Approval | ✓ (AGENTS.md + laporan ini) |

---

## 7. Risiko & Mitigasi (hasil)

| Risiko | Hasil |
|--------|-------|
| Perubahan perilaku saat refactor | Nilai dibandingkan di smoke (prefix S/G/U, rights, label) — identik |
| Siklus import | Config leaf node tanpa import; lint+build dua sisi PASS |
| Konflik nama tipe `MemberType` lokal | Alias lokal dihapus; satu sumber tipe dari config |
| Tipe longgar | `as const satisfies` + `MemberTypeCode = keyof typeof MEMBER_TYPES` |
| Melewati batas scope | Checklist WBS F1; diff hanya 11 file + 2 config |
| `src/shared` tidak terkompilasi salah satu side | Termasuk di kedua tsconfig; lint+build PASS |

---

## 8. Keputusan & Catatan

1. **`MemberDTO.memberType` tetap `string | null`** — kolom DB string bebas; union domain hanya di tipe INPUT (Create/Update) yang sudah tervalidasi; helper menerima `string | null` dan men-narrow.
2. **Nama file laporan** memakai suffix `_F1_` karena `WORK_ORDER_1_IMPLEMENTATION_REPORT.md` sudah ada (sprint Import Anggota) — tidak overwrite.
3. **Extensibility MemberType:** record `as const satisfies` — menambah properti domain (mis. `academicRecord`, hak eksemplar) tidak memerlukan refactor konsumen.
4. Smoke disimpan di `wo1_config_smoke/config.smoke.ts` (pola `uat_wo*`), tidak terikat test runner.

---

## 9. Status

**DONE — Architecture Gate BERHENTI.** Menunggu review Product Owner sebelum WO berikutnya (AY-1a). Tidak ada commit.
