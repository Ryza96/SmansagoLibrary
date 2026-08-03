# WORK ORDER 1 — FINAL REVIEW — Shared Domain Config API Design

**Peran:** Project Engineer
**Mode:** FINAL REVIEW — refactor terbatas pada `src/shared/config/member-type.ts`; **TIDAK** mengubah behaviour, **TIDAK** mengubah RFC, **TIDAK** commit.

**Status:** **REFACTOR RECOMMENDED** (sudah dieksekusi) — lihat bagian Verdict.

---

## 1. Objek Review

API publik `src/shared/config/member-type.ts`:

```ts
export function memberTypeLabel(memberType?: string | null): string | null      // label atau null
export function memberNumberPrefix(memberType?: string | null): string          // prefix atau 'S' (default STUDENT)
export function memberBorrowRights(memberType?: string | null): MemberBorrowRights | null
```

Pertanyaan review: apakah tiga helper proyeksi ini desain terbaik, atau lebih baik API tunggal `getMemberType(code)` yang mengembalikan seluruh domain object?

## 2. Temuan Teknis

### 2.1 Duplikasi guard di 3 helper
Ketiga helper mengulang guard yang sama persis:
```ts
if (!memberType || !isMemberTypeCode(memberType)) return ...
```
Ada **3 salinan** logika guard/validasi yang identik. Jika guard berubah (mis. normalisasi huruf, trim, tipe baru), harus diedit di 3 tempat. Ini adalah duplication smell yang berpotensi menjadi sumber bug.

### 2.2 Tiga helper ≠ tiga semantik
| Helper | Semantik | Punya default? |
|--------|----------|----------------|
| `memberTypeLabel` | proyeksi murni | tidak (unknown → null) |
| `memberBorrowRights` | proyeksi murni | tidak (unknown → null) |
| `memberNumberPrefix` | **kebijakan** | **ya** (unknown → `S`, prefix STUDENT) |

Hanya `memberNumberPrefix` yang membawa kebijakan fallback domain ("tipe tak dikenal = siswa"). Kebijakan ini **harus tetap terpusat** di config — tidak boleh bocor ke konsumen (`number-generator.service.ts` dan pemanggil lain tidak boleh menebak `'S'` sendiri).

### 2.3 RFC §5 memandang MemberType sebagai value object
RFC §5 mendeskripsikan MemberType sebagai **objek domain** dengan banyak atribut (`code`, `label`, `memberNumberPrefix`, `borrowRights`, `hasAcademicRecord`, dan atribut masa depan). Value object semantics paling natural diakses sebagai **satu object**, bukan sekumpulan proyeksi field demi field.

### 2.4 Skalabilitas terhadap RFC masa depan
WO-1 adalah fondasi dari program MASTER DATA AKADEMIK (WBS: 39 WO, milestone A/B). RFC §5 akan tumbuh: `borrowRights` sudah punya `maxBooks/maxDays/extensions`; atribut masa depan (mis. `maxExtensionDays`, `academicRecord`, `cardLabel`, aturan promosi AY-2) akan ditambahkan ke `MemberTypeDefinition`.
- Desain sekarang: **setiap atribut baru ⇒ 1 helper baru** dengan guard terduplikasi (3→4→5… salinan). API surface tumbuh linear terhadap jumlah properti domain.
- Desain `getMemberType`: **0 helper baru** — konsumen membaca `getMemberType(code)?.atributBaru`.

## 3. Perbandingan

### 3.1 Maintainability
| Kriteria | Helper sekarang | `getMemberType` saja |
|----------|-----------------|----------------------|
| Jumlah tempat logika guard | 3 (duplikat) | 1 |
| Ubah guard/validasi | edit 3 fungsi | edit 1 fungsi |
| **Catatan:** kebijakan default prefix | terpusat ✓ | bocor ke konsumen ✗ bila helper dibuang |

### 3.2 Scalability
| Kriteria | Helper sekarang | `getMemberType` saja |
|----------|-----------------|----------------------|
| Atribut domain baru | 1 helper baru per atribut (API surface tumbuh) | 0 helper baru (akses `?.prop`) |
| Tipe anggota baru (mis. alumni/staff) | 0 perubahan | 0 perubahan |
| Konsumen baru | harus tahu 3+ nama helper | cukup tahu 1 aksesor |

### 3.3 Readability
| Kriteria | Helper sekarang | `getMemberType` saja |
|----------|-----------------|----------------------|
| `memberTypeLabel(m.memberType)` | sangat terbaca (intent jelas) | `getMemberType(m)?.label` — sedikit lebih verbose |
| Beban kognitif API | 3+ nama untuk dipelajari | 1 nama |
| Call site paling sering (label) | unggul | netral |

### 3.4 Future RFC
| Kriteria | Helper sekarang | `getMemberType` saja |
|----------|-----------------|----------------------|
| Kesesuaian value-object semantics (RFC §5) | parsial (proyeksi per-field) | penuh (objek utuh) |
| Siap untuk atribut §5 masa depan | butuh refactor tiap kali | siap tanpa refactor |

### 3.5 Kesimpulan pembandingan
- **Helper sekarang** menang di *readability call site* dan *kebijakan default prefix terpusat*.
- **`getMemberType` murni** menang di *maintainability*, *scalability*, dan *future RFC*, TAPI mengorbankan readability dan memindahkan kebijakan default prefix ke konsumen.

## 4. Desain Terpilih: Primitive + Thin Projection (Hybrid)

Desain terbaik bukan memilih salah satu ekstrem, melainkan **menggabungkan keduanya**:

```ts
export type MemberType = (typeof MEMBER_TYPES)[MemberTypeCode]

// PRIMITIVE — satu-satunya tempat guard
export function getMemberType(memberType?: string | null): MemberType | null {
  if (!memberType || !isMemberTypeCode(memberType)) return null
  return MEMBER_TYPES[memberType]
}

// THIN PROJECTIONS — gula sintaksis di atas primitive
export function memberTypeLabel(memberType?: string | null): string | null {
  return getMemberType(memberType)?.label ?? null
}

export function memberNumberPrefix(memberType?: string | null): string {
  return getMemberType(memberType)?.memberNumberPrefix ?? MEMBER_TYPES.student.memberNumberPrefix
}

export function memberBorrowRights(memberType?: string | null): MemberBorrowRights | null {
  return getMemberType(memberType)?.borrowRights ?? null
}
```

### Mengapa ini optimal
| Dimensi | Hasil |
|---------|-------|
| Maintainability | Guard **1 tempat** (`getMemberType`); proyeksi = one-liner tanpa logika |
| Scalability | Atribut baru §5 → **0 perubahan API**; konsumen pakai `getMemberType(code)?.prop` |
| Readability | Call site existing tetap memakai helper yang self-documenting (tidak berubah) |
| Future RFC | Value object bisa diambil utuh; kebijakan default prefix **tetap terpusat** di `memberNumberPrefix` |
| Behaviour | Identik — semua helper adalah delegasi ke primitive yang sama; smoke memverifikasi kesetaraan |

### Batas desain yang disengaja
- **Tidak** membuang helper (readability + kebijakan default prefix tetap butuh wadah).
- **Tidak** menambah aksesor per-atribut baru ke depan — cukup `getMemberType(...)?.<prop>`.
- `MemberType` diekspor sebagai tipe value object literal (`typeof MEMBER_TYPES[MemberTypeCode]`) agar konsumen dapat tipe penuh (mis. `.code` ber-tipe `'student'|'teacher'|'general'`, `borrowRights` literal).

## 5. Refactor yang Dieksekusi

1. `src/shared/config/member-type.ts` — tambah `MemberType` type alias + `getMemberType()` primitive; tiga helper dijadikan proyeksi tipis yang mendelegasi ke primitive. **Behaviour tidak berubah** (nilai, default `S`, null-semantics identik).
2. `wo1_config_smoke/config.smoke.ts` — tambah blok uji `getMemberType` + verifikasi proyeksi ≡ primitive (setara dengan helper lama).

Konsumen (11 file) **tidak diubah** — mereka memakai helper yang kontraknya tetap identik.

## 6. Validation (setelah refactor)

| Gate | Hasil |
|------|-------|
| Smoke config | **46/46 PASS** (31 lama + 7 getMemberType + 9 kesetaraan proyeksi≡primitive) |
| `npm run lint` | PASS (tsc node + web) |
| `npm run build` | PASS (main 1,775.48 kB · preload 7.68 kB · renderer 940.40 kB) |
| Grep hardcode | tetap 0 di luar config (tidak ada perubahan konsumen) |

## 7. Verdict

**REFACTOR RECOMMENDED** — sudah dieksekusi.

**Alasan:** Helper proyeksi 3-tunggal menggandakan guard yang sama dan memaksa 1 helper baru per atribut domain ke depan — menjadi hambatan bagi pertumbuhan RFC §5 (WO-1 adalah fondasi 39-WO). Primitive `getMemberType()` sebagai satu-satunya sumber guard + thin projections mempertahankan seluruh keunggulan desain lama (readability, kebijakan default prefix terpusat) sekaligus menyelesaikan duplikasi dan menyiapkan API yang tidak perlu berubah saat atribut domain ditambahkan. Behaviour, RFC, dan konsumen tidak berubah.

**TIDAK commit.** Menunggu review Product Owner.
