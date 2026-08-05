# IMPLEMENTATION AUDIT — Laporan Keterlambatan (R-4)

- **Tujuan:** Audit implementasi STATIS (proof by implementation) atas 2 invariant R-4, TANPA smoke.
- **Dasar kode:** HEAD `7a2a4ab` + 2 edit defensive hardening di working tree (`report.repository.ts` trim-normalisasi, `report.service.ts` clamp `slice(0, limit)`).
- **Status:** BELUM RELEASE. Tidak ada commit. Tidak ada push.
- **Scope file yang diaudit:**
  1. `src/main/repositories/report.repository.ts`
  2. `src/main/services/report.service.ts`
  3. `electron/ipc/report.ipc.ts` + `electron/preload/report.preload.ts` + `src/renderer/env.d.ts`
  4. `src/pages/report/OverdueReportPage.tsx`
  - Pendukung: `src/shared/dto/report.ts`, `src/main/repositories/base/pagination.ts`

---

## 0. Alur data (read-only — tidak ada transformasi di tengah)

```
OverdueReportPage.tsx:63-70
  api.reports.overdues({ from, to, search: search || undefined, page, limit })   // 1 nilai search
        │
electron/preload/report.preload.ts
  overdues: (filter) => ipcRenderer.invoke('reports:overdues', filter)            // pass-through
        │
electron/ipc/report.ipc.ts:7
  ipcMain.handle('reports:overdues', (_e, filter) => reportService.getOverdueReport(filter))  // pass-through
        │
src/main/services/report.service.ts:184  getOverdueReport(filter)
  search yang SAMA difan-out ke 4 query:  countActiveOverdueDetails / countReturnedLateBetween
                                          findActiveOverdueDetails / findReturnedLateBetween
        │
src/main/repositories/report.repository.ts  (2 predicate builder + 2 raw SQL)
```

**Fakta kunci:** renderer mengirim **satu** string `search`; IPC dan preload murni pass-through (tidak ada modifikasi nilai); Service meneruskan nilai yang sama ke keempat query. Oleh karena itu asimetri search antar kategori hanya mungkin jika predicate builder di Repository berbeda — dan keduanya diaudit di bawah.

---

## 1. INVARIANT A — Search (borrowNumber | memberNumber | memberName | bookTitle) identik untuk ACTIVE dan RETURNED

### 1.1 Predicate ACTIVE — `buildActiveOverdueWhere` (report.repository.ts:164-182)

```ts
const s = search?.trim()                          // line 172  → NORMALISASI trim
if (s) {
  where.OR = [
    { bookTitle:              { contains: s } },  // line 175 — kolom detail (snapshot)
    { borrow: { borrowNumber: { contains: s } } },// line 176
    { borrow: { memberNumber: { contains: s } } },// line 177
    { borrow: { memberName:   { contains: s } } } // line 178
  ]
}
```
Base (tanpa search): `returnedAt: null` AND `borrow.returnDate: null` AND `borrow.dueDate < asOf`.

Efektif SQL: `(bd.bookTitle LIKE %s% OR b.borrowNumber LIKE %s% OR b.memberNumber LIKE %s% OR b.memberName LIKE %s%)` — **satu grup OR di level row** (BorrowDetail). Tidak ada relasi/join tambahan → tidak ada multiplikasi baris.

### 1.2 Predicate RETURNED — `buildReturnedLateSearchSql` (report.repository.ts:187-197)

```ts
const s = search?.trim()                          // line 188  → NORMALISASI trim (SAMA)
return s ? Prisma.sql`AND (
  b.borrowNumber LIKE ${'%'+s+'%'}
  OR b.memberNumber LIKE ${'%'+s+'%'}
  OR b.memberName LIKE ${'%'+s+'%'}
  OR bd.bookTitle LIKE ${'%'+s+'%'}
)` : Prisma.empty
```
Dipakai oleh `findReturnedLateBetween` (line 362) dan `countReturnedLate` (line 287) → row query dan count memakai filter yang sama persis.

### 1.3 Bukti kesetaraan

| Aspek | ACTIVE | RETURNED | Identik? |
|---|---|---|---|
| Field yang dicari | bookTitle, borrowNumber, memberNumber, memberName | bd.bookTitle, b.borrowNumber, b.memberNumber, b.memberName | **Ya — 4 field sama, sumber kolom sama (snapshot)** |
| Normalisasi whitespace | `search?.trim()` (172) | `search?.trim()` (188) | **Ya — byte-identical** |
| Search kosong / spasi saja | `if (s)` skip → tanpa OR → unfiltered | `Prisma.empty` → tanpa AND → unfiltered | **Ya** |
| Semantik case | SQLite `LIKE` (case-insensitive ASCII) | SQLite `LIKE` (case-insensitive ASCII) | **Ya** |
| Boolean OR | satu grup OR (row level) | satu grup OR (row level) | **Ya** |
| Count == fetch konsisten | `countActiveOverdueDetails` (350) pakai builder sama | `countReturnedLate` (287) pakai SQL sama | **Ya** |
| Basis kategori (ortogonal ke search) | returnedAt null + returnDate null + due<now | returnedAt not null + range + returnedAt>due | berbeda **hanya** di filter kategori — search di-AND di atasnya pada kedua jalur |

Kesimpulan A: satu nilai `search` di-AND-kan di atas filter kategori pada KEDUA jalur dengan predicate builder yang menormalisasi identik dan memakai 4 kolom yang sama. **Search untuk ACTIVE dan RETURNED mustahil divergen secara kode** — divergensi hanya bisa datang dari transformasi di tengah (tidak ada; pass-through murni) atau dari builder berbeda (dibuktikan identik).

### 1.4 Catatan tambahan invariant A
- UI `search: search || undefined` (OverdueReportPage.tsx:67): string kosong → `undefined` (tanpa filter). String spasi saja (`"   "`) → truthy → terkirim → kedua builder `trim()` → kosong → unfiltered. Konsisten kedua kategori.
- Periode `from/to` **hanya** membatasi RETURNED (oleh kontrak R-4: MASIH TERLAMBAT selalu tampil). Ini **bukan** asimetri search — ACTIVE memang tak punya batas periode; search yang sama tetap diterapkan di dalam populasi masing-masing.

---

## 2. INVARIANT B — rows.length TIDAK PERNAH melebihi limit (semua kombinasi)

### 2.1 Jalur pagination gabungan (report.service.ts:184-258)

```ts
page  = Math.max(1, filter.page ?? 1)              // 187  → page ≥ 1
limit = Math.min(100, Math.max(1, filter.limit ?? 10)) // 188 → 1 ≤ limit ≤ 100
...
const slice = computeOverdueSlice(page, limit, activeTotal, returnedTotal)  // 197
```
`computeOverdueSlice` (73-86):
```ts
start = (page-1)*limit
end   = page*limit
activeSkip   = min(start, A)
activeTake   = max(0, min(end, A) - activeSkip)
returnedSkip = min(max(0, start - A), R)
returnedTake = max(0, min(end, A+R) - A - returnedSkip)
```

### 2.2 Bukti aljabar `activeTake + returnedTake ≤ limit` (untuk semua A,R ≥ 0, page ≥ 1, limit ≥ 1)

**Kasus (i) — `start ≥ A`** (semua baris ACTIVE sudah lewat sebelum halaman ini):
- `activeTake = max(0, min(end,A) − A) = 0`.
- Jika `start − A ≥ R`: `returnedSkip = R` → `returnedTake = max(0, min(end,A+R) − A − R) = 0`. Total `0 ≤ L`. ∎
- Jika `start − A < R`: `returnedSkip = start − A`; `returnedTake = max(0, min(end, A+R) − start) ≤ max(0, end − start) = L`. Total `0 + ≤ L`. ∎

**Kasus (ii) — `start < A`** (halaman ini memuat baris ACTIVE):
- Sub-kasus `end ≤ A`: `activeTake = end − start = L`; `returnedSkip = 0`; `min(end, A+R) ≤ A` → `returnedTake = 0`. Total `L`. ∎
- Sub-kasus `end > A`: `activeTake = A − start`; `returnedSkip = 0`.
  - Jika `end ≤ A+R`: `returnedTake = end − A = (start+L) − A = L − (A − start) = L − activeTake` → total `= L`. ∎
  - Jika `end > A+R`: `returnedTake = A+R − A = R` → total `= (A − start) + R`; dan `end > A+R ⇒ start + L > A + R ⇒ L > (A−start) + R` → total `< L`. ∎

**Kesimpulan B1:** untuk seluruh ruang input, `activeTake + returnedTake ≤ limit`. ∎

### 2.3 Penegakan di layer DB (lapis kedua)

- Query ACTIVE: `borrowDetail.findMany({ ..., take: slice.activeTake })` (report.repository.ts:333-337) → `active.data.length ≤ activeTake` (SQL `LIMIT` di-enforce DB).
- Query RETURNED: raw SQL `LIMIT ${take} OFFSET ${skip}` (report.repository.ts:385) dengan `take = slice.returnedTake` → `returned.data.length ≤ returnedTake`.
- Gabungan: `rows.length = activeRows.length + returnedRows.length ≤ activeTake + returnedTake ≤ L` (B1).

### 2.4 Clamping defensif final (lapis ketiga)

`rows = [...activeRows, ...returnedRows].slice(0, limit)` (report.service.ts:246).

Bahkan bila B1+DB-LIMIT gagal karena kondisi tak terduga, `slice(0, limit)` memastikan `rows.length ≤ limit` secara **mutlak**. Invariant B dijaga oleh TIGA lapis independen: aljabar slice → `LIMIT` SQL → `slice(0, limit)`.

### 2.5 Tidak ada duplikasi baris (pendukung)

- ACTIVE: tanpa join → satu `BorrowDetail` muncul satu kali. Grup OR menyeleksi baris yang sama (tanpa multiplikasi tabel).
- RETURNED: join `BorrowDetail ⋈ Borrow` pada `b.id = bd.borrowId` (1:1 via FK) → satu baris per detail.
- Lintas kategori: ACTIVE mensyaratkan `returnedAt IS NULL`; RETURNED mensyaratkan `returnedAt IS NOT NULL` → **disjoint by konstruksi** — sebuah detail mustahil masuk kedua kategori. Maka `activeTotal + returnedTotal = pagination.total` dan `summary.active + summary.returned = total`.

### 2.6 Verifikasi per kombinasi yang diminta PO

| Kombinasi | Hasil aljabar | rows.length |
|---|---|---|
| ACTIVE = 0, RETURNED > limit | `start ≥ 0 = A` → Kasus (i) — seluruh kuota dialokasikan ke RETURNED, `take ≤ L` | `≤ L` ✓ |
| ACTIVE > limit, RETURNED = 0 | `A+R = A` → page 1..⌈A/L⌉: `activeTake = L` (halaman terakhir sisanya); `returnedTake = 0` | `≤ L` ✓ |
| ACTIVE + RETURNED > limit | halaman campuran dihitung persis (ii.b) = `L`; halaman tunggal = `L`; halaman terakhir = sisa `< L` | `≤ L` ✓ |
| ACTIVE sedikit, RETURNED banyak (mis. A=2, R=100, L=10) | p1: active 2 + returned 8 = 10; p2..p11: returned-only 10, 10, …; p11: 2 | `≤ 10` ✓ |
| RETURNED sedikit, ACTIVE banyak (mis. A=100, R=2, L=10) | p1..p10: active-only 10; p11: returned 2 | `≤ 10` ✓ |
| ACTIVE = 0, RETURNED = 0 | take keduanya 0 → rows [] | `0 ≤ L` ✓ |
| Halaman melampaui totalPages (page=999) | `start ≥ A+R` → kedua take = 0 → rows [] | `0 ≤ L` ✓ |

---

## 3. Edge case yang ditemukan (dilaporkan, bukan pelanggaran invariant)

| # | Lokasi | Deskripsi | Severity |
|---|---|---|---|
| EC-1 | `contains` (Prisma) vs `LIKE` (raw) | **Prisma `contains` meng-escape `%`, `_`, `\`** (literal); raw SQL `LIKE %s%` TIDAK meng-escape → `%`/`_` berperilaku sebagai wildcard. Search berisi `%`/`_`/`\` memberi hasil BERBEDA antara ACTIVE (literal) dan RETURNED (wildcard). Ini adalah satu-satunya divergensi semantik search ACTIVE↔RETURNED yang dapat dibuktikan secara kode. | LOW (nama/nomor nyata jarang berisi wildcard) |
| EC-2 | Kedua jalur | Collation SQLite `LIKE` = case-insensitive **ASCII only** (mis. `É` vs `é` tidak dilipat). Konsisten di kedua kategori (bukan asimetri), tapi bukan full Unicode fold. | INFO |
| EC-3 | Service:187-188 | `page`/`limit` non-numerik dari caller IPC (mis. string `"abc"`) → `Math.max(1, NaN) = NaN` → `skip`/`LIMIT` NaN → Prisma reject (error, BUKAN baris > limit). Renderer ber-type aman selalu kirim number. Tidak ada validasi runtime NaN di service. | LOW |
| EC-4 | Service:186/193-213 | TOCTOU antara count dan fetch (`now` di-capture sekali, query paralel). Transisi borrow di sela (mis. dikembalikan) bisa membuat fetch RETURNED melihat baris lebih banyak dari `returnedTotal` — namun `LIMIT take` tetap memotong ke `returnedTake`, dan clamp `slice(0, limit)` menggagalkan kemungkinan overflow → **rows.length tidak pernah terdampak**; hanya `summary`/`total` bisa sesaat basi. | INFO |
| EC-5 | Repo:305/326 | Legacy `findActiveOverdue` (per-borrow, R-1) dipertahankan untuk regression; Service R-4 tidak memakainya. Bukan bug — dokumentasi. | INFO |
| EC-6 | Page:206 | Badge `STATUS_BADGE[row.category]` — key kategori dari DTO (union tipe `OverdueCategory`); nilai dijamin salah satu dari `ACTIVE`/`RETURNED` oleh service. Tidak ada lookup yang bisa miss. | INFO |

---

## 4. Kesimpulan

1. **Invariant A** (search identik ACTIVE↔RETURNED): **terpenuhi dan mustahil dilanggar secara kode** — satu nilai `search` difan-out pass-through ke 4 query; kedua predicate builder (`buildActiveOverdueWhere` line 172, `buildReturnedLateSearchSql` line 188) menormalisasi `trim()` identik, memakai 4 kolom snapshot yang sama, semantik `LIKE` yang sama, dan satu grup OR di level row. Count dan fetch memakai builder yang sama per kategori. Satu-satunya ketidaksetaraan semantik yang dapat dibuktikan adalah **EC-1** (`%`/`_`/`\` escape Prisma vs raw LIKE) — low-severity.

2. **Invariant B** (rows.length ≤ limit untuk SEMUA kombinasi): **terpenuhi dan mustahil dilanggar** — dibuktikan aljabar `activeTake + returnedTake ≤ L` untuk seluruh ruang input (Bagian 2.2), ditambah penegakan `LIMIT` di SQL (2.3) dan clamp defensif `slice(0, limit)` (2.4). Tiga lapis independen: jika lapis aljabar meleset, DB memotong; jika keduanya meleset, clamp menghentikan. Kategori ACTIVE dan RETURNED disjoint oleh konstruksi predicate (`returnedAt null` vs `not null`) sehingga tidak ada duplikasi lintas kategori yang bisa menaikkan jumlah baris.

3. **KESIMPULAN AUDIT:** Pada kode saat ini (HEAD `7a2a4ab` + hardening working tree), kedua invariant PO R-4 **dijamin oleh implementasi**, bukan oleh smoke. Kegagalan yang dilaporkan PO (search ACTIVE 0 match; halaman 1 memuat 13 baris = 10 ACTIVE + 3 RETURNED) **tidak dapat terjadi pada kode ini** — pola 13 baris adalah perilaku dari implementasi lama `Math.max(totalPages)` + penggabungan data mentah yang telah digantikan `computeOverdueSlice` (bukti: AGENTS.md pelajaran R-4). Indikasi terkuat: evaluasi PO dijalankan terhadap build paket yang basi (`dist/`), bukan kode ter-komit.
