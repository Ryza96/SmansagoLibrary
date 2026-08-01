# REACT_RENDER_TREE_AUDIT.md

**Audit Render Tree — "Menu Buku" (`/books`)**

- **Mode:** READ ONLY — tidak ada perubahan kode, tidak build, tidak menjalankan aplikasi.
- **Status:** SELESAI — berhenti menunggu review Product Owner.

---

## 1. Route "/books" dirender oleh file apa?

**`src/pages/BooksPage.tsx`** — referensi tunggal dan statis.

- Definisi route: `src/routes/index.tsx:34` → `{ path: 'books', element: <BooksPage /> }`
- Router tunggal: `createHashRouter` (`src/routes/index.tsx:27`), dipakai lewat `RouterProvider` di `src/renderer/App.tsx:5`, di-root oleh `src/renderer/main.tsx`.
- **Tidak ada lazy route** — semua halaman di-import statis di `src/routes/index.tsx:5-25`.
- Sidebar menu "Buku" (`Sidebar.tsx:19`) → `to: '/books'` → fall-through persis ke route ini. Tidak ada route lain yang mencocokkan `/books` (grep `'/books'`/`path: 'books'` = hanya Sidebar, routes/index, navigation).

---

## 2. Hirarki render lengkap

```
main.tsx
  └─ <StrictMode>
      └─ App                       src/renderer/App.tsx
          └─ <RouterProvider router>
              └─ router            src/routes/index.tsx (createHashRouter)
                  └─ route "/" → AppLayout          src/components/layout/AppLayout.tsx
                      ├─ TopBar                     (src/components/layout/TopBar.tsx)
                      ├─ div.flex
                      │   ├─ Sidebar                (Sidebar.tsx — NavLink "Buku" → /books)
                      │   └─ main (Outlet)
                      │       └─ BooksPage          ← route "/books" — src/pages/BooksPage.tsx
                      │           ├─ h1 "Buku"
                      │           └─ div.bg-white.rounded-lg.shadow-sm
                      │               ├─ div.p-4.border-b           ← TOOLBAR (lihat §5)
                      │               │   ├─ Search input
                      │               │   ├─ button Refresh (RefreshCw)
                      │               │   ├─ button Import Buku (Upload)   ← tombol dimaksud
                      │               │   └─ button Buku Baru (Plus, biru)
                      │               └─ div.p-4
                      │                   ├─ (loading ? teks "Memuat..." : BookTable)
                      │                   └─ BookTable             src/components/books/BookTable.tsx
                      │                       ├─ thead (Judul, ISBN, Kategori, Penerbit, Tahun, Eks. Eksemplar, Aksi)
                      │                       └─ tbody rows (Eye / Pencil / Trash2 per baris)
                      └─ StatusBar
```

- `BooksPage` **bukan** komponen toolbar terpisah — toolbar adalah JSX inline di `BooksPage.tsx`. Tidak ada `BookToolbar` component.
- Satu-satunya conditional di `BooksPage` (baris 89-93) hanya menukar area **tabel** (`loading ? "Memuat..." : <BookTable>`) — **tidak menyentuh toolbar**.

---

## 3. Apakah BooksPage.tsx yang diubah Sprint 10 benar-benar dirender?

**YA.** Dan tombol Import Buku benar-benar dirender.

Bukti berlapis:

1. **Source** (`src/pages/BooksPage.tsx:71-77`): tombol Import Buku (ikon `Upload`, `navigate(ROUTES.BOOK_IMPORT)`) dirender **tanpa syarat** — selalu masuk JSX setiap render.
2. **Built bundle** (`out/renderer/assets/index-DiqpmWbM.js`, offset 509951): JSX tombol nyata ada di artifact:
   ```
   "button",
   { onClick: () => navigate(ROUTES.BOOK_IMPORT),
     className: "flex items-center gap-1.5 ml-auto px-3 py-2 border ..." },
   ```
3. **Artifact = build terbaru**: SHA256 `app.asar` ≡ `out/` untuk semua bundle (lihat `RELEASE_ARTIFACT_AUDIT.md` §3.2) → bundle yang memuat tombol di atas adalah yang di-package hari ini.

**Mengapa tombol tidak muncul di aplikasi PO?**

Karena yang PO jalankan adalah **artifact lama (package 31/07 10:24)**, dibuat **sebelum** BooksPage diubah (timestamp source `BooksPage.tsx` = **31/07 19:17:38**, 9 jam setelah package lama). `app.asar` lama = **0** kemunculan `Import Buku`/`BOOK_IMPORT`/`books/import`. Jadi di aplikasi PO, `BooksPage` versi lama yang dirender — yang toolbarnya hanya berisi Search + Refresh + Buku Baru.

**Bukan** komponen lain yang aktif. Tidak ada BooksPage alternatif, tidak ada route/komponen bayangan (verifikasi: hanya satu `BooksPage`, satu route `books`, satu router).

---

## 4. Apakah ada conditional / role / permission / feature flag / environment / lazy / layout berbeda?

**TIDAK ADA.** Hasil audit:

| Faktor | Hasil |
|--------|-------|
| Conditional render | Tidak ada — tombol Import di `BooksPage.tsx:71-77` tanpa `if`; satu-satunya conditional (`:89-93`) hanya area tabel |
| Role | Tidak ada konsep role/autentikasi di seluruh `src/` |
| Permission | Tidak ada |
| Feature flag | Tidak ada (grep `flag|feature|featureFlag` = 0 di komponen render) |
| Environment | Tidak ada pengecekan `import.meta.env`/`process.env` di komponen buku |
| Lazy route | Tidak ada — semua route `import` statis (`routes/index.tsx:5-25`) |
| Layout berbeda | Satu layout tunggal `AppLayout` untuk semua route anak; `/books` di bawahnya sama dengan dashboard dll. |
| Route tertimpa/shadow | Tidak ada — `books` exact-match; `books/:id` butuh segment tambahan; tidak ada redirect |

Kesimpulan: pada build terbaru, tombol Import Buku **pasti tampil** di toolbar `/books` untuk setiap user, tanpa syarat apa pun.

---

## 5. Lokasi persis toolbar (UI pada screenshot PO)

Toolbar yang menghasilkan header menu Buku (Search + Refresh + tombol aksi) adalah **JSX inline di `src/pages/BooksPage.tsx:52-86`**:

- Container: `div.p-4.border-b` di dalam `div.bg-white.rounded-lg.shadow-sm` (`BooksPage.tsx:52`)
- Urutan render (kiri→kanan):
  1. Search input — `BooksPage.tsx:54-63`
  2. Tombol Refresh (ikon `RefreshCw`) — `BooksPage.tsx:64-70`
  3. **Tombol "Import Buku"** (ikon `Upload`, outline) — **`BooksPage.tsx:71-77`** — *hilang di artifact lama*
  4. Tombol "Buku Baru" (ikon `Plus`, biru solid `bg-blue-600`) — `BooksPage.tsx:78-84`

Di artifact lama (yang PO lihat), posisi #3 tidak ada → toolbar menampilkan Search, Refresh, dan langsung "Buku Baru" berwarna biru. Di build terbaru, "Import Buku" muncul di antara Refresh dan "Buku Baru".

Korrespondensi di bundle minified: `out/renderer/assets/index-DiqpmWbM.js` offset **509951** (`"button", { onClick: () => navigate(ROUTES.BOOK_IMPORT), ... }`).

---

## Kesimpulan

- Render tree `/books` = `AppLayout → BooksPage → toolbar inline + BookTable`. Tidak ada komponen perantara, tidak ada conditional/permission/lazy.
- `BooksPage` Sprint 10 **benar-benar dirender** pada build terbaru, tombol Import Buku ada di source, di bundle, dan di `app.asar` (identik).
- Tombol tidak muncul di aplikasi PO semata karena PO menjalankan **artifact lama (31/07 10:24, pre-Sprint-10)**. Distribusikan `dist/win-unpacked/APLibrary.exe` / installer NSIS (01/08 13:13) → tombol akan tampil.

---

*Sumber: `src/renderer/main.tsx`, `src/renderer/App.tsx`, `src/routes/index.tsx`, `src/pages/BooksPage.tsx`, `src/components/layout/AppLayout.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/books/BookTable.tsx`, `src/utils/navigation.ts`, `src/utils/labels.ts`, grep bundle `out/renderer/assets/index-DiqpmWbM.js`, grep router/route tunggal di `src/`.*
