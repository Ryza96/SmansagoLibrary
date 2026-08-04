# BORROW RECEIPT REDESIGN — DESIGN AMENDMENT

| | |
|---|---|
| **WO** | Borrow Receipt Redesign — Phase 1 Discovery & Design |
| **Mode** | READ ONLY — DESIGN AMENDMENT (revisi atas 3 dokumen discovery yang telah di-approve) |
| **Tanggal** | 2026-08-04 |
| **Status** | Menunggu approval Product Owner |

Dokumen ini berisi 6 revisi desain yang diminta PO. Akhir dokumen berisi **FINAL DESIGN DECISION** — ringkasan seluruh keputusan desain yang menjadi acuan implementasi.

---

## REVISION 1 — FOTO SISWA (Audit)

### Metode audit
Grep menyeluruh terhadap seluruh pohon source untuk `photo`, `foto`, `avatar`, `photoPath`, `profilePicture`, `image`, `gambar`, `blob`, `base64`, `dataUri`, `storage`, `uploads` — dengan case-insensitive, di 3 lokasi: `src/`, `electron/`, `prisma/`.

### Hasil

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| Kolom foto di schema | **TIDAK ADA** | `prisma/schema.prisma` `model Member` (:163-191): `memberNumber, memberType, fullName, gender, nisn, nip, nuptk, nik, birthPlace, birthDate, address, phone, email, classId, status` — **tidak ada kolom foto** |
| DTO Member | **TIDAK ADA** | `src/shared/dto/member.ts` `MemberDTO` (:3-29), `CreateMemberDTO` (:31-45), `UpdateMemberDTO` (:47-62) — tidak ada field foto |
| Service Member | **TIDAK ADA** | `src/main/services/member.service.ts` — grep foto = 0 match |
| Repository Member | **TIDAK ADA** | `src/main/repositories/member.repository.ts` — grep foto = 0 match |
| Storage abstraksi | **TIDAK ADA** | grep `Storage/storage/blob/base64/dataUri/data:image` di `src/` = **0 match**; tidak ada folder `uploads/`/`storage/` di pohon aplikasi |
| Folder aset | Hanya `styles.css` | `src/renderer/assets/` hanya berisi `styles.css` — tidak ada gambar default |
| UI menampilkan foto | **TIDAK ADA** | Tidak ada komponen renderer yang menampilkan foto anggota (grep di `.tsx` = 0 match selain CSS `background-image` yang tidak terkait) |
| UI unggah foto | **TIDAK ADA** | Form anggota (`MemberForm`/`MemberEditPage`) tidak punya input foto |
| Sumber foto lain (Storage/path/DB) | **TIDAK ADA** | Tidak ada kode yang membaca file gambar untuk anggota; tidak ada `fs.readFile` gambar, tidak ada kolom blob |

**Satu-satunya gambar terkait identitas di seluruh aplikasi** adalah `Setting.logoPath` — dan itu pun **path string tanpa upload**: `SettingsPage.tsx:210` menampilkan `Path Logo` sebagai input `readOnly` dengan helper **"Fitur upload logo belum tersedia."** Jadi `logoPath` praktis selalu kosong dan tidak bisa diisi via UI.

### Simpulan (berdasarkan bukti, bukan asumsi)
> **Aplikasi SAAT INI tidak memiliki foto anggota dari sumber mana pun** — bukan dari DB (tidak ada kolom), bukan dari Storage (tidak ada abstraksi/folder), bukan dari path lokal (tidak ada kolom path), dan UI tidak punya cara mengunggah/menampilkannya. Oleh karena itu, untuk Phase 1, foto anggota **WAJIB digantikan placeholder** — direkomendasikan **avatar inisial** (huruf depan nama) yang digambar sebagai **inline SVG di dalam template** (self-contained, tanpa aset eksternal).

- Tidak ada migrasi `Member.photoPath` di Phase 1. Bila PO ingin foto asli di masa depan, itu adalah **WO terpisah** (schema + migration + upload UI + data URI resolver) — dicatat di backlog.

---

## REVISION 2 — QR CODE PAYLOAD

Spesifikasi: payload stabil jangka panjang, bukan `borrowNumber`. Konteks: QR pada kartu adalah **token verifikasi mesin** (scan-back untuk audit/verifikasi/reprint), bukan dokumen mandiri.

### Perbandingan 4 kandidat

| Kandidat | Isi | Kelebihan | Kekurangan |
|---|---|---|---|
| **A. `borrowing.id`** (UUID, PK) | `a1b2c3d4-...` | Kanonik, **immutable**, unik global, tanpa relasi format; sudah dipakai seluruh IPC; tidak perlu migrasi; resolusi ke transaksi = 1 lookup `findById` | Opaque (tidak terbaca manusia); memerlukan DB utk resolusi (fine — app desktop dgn DB lokal) |
| **B. `borrowNumber`** | `PJ/202607/0001` | Terbaca manusia; tertera juga di kartu (correlation visual) | Format berisi `/` (URL-unfriendly); **derivasi bisnis** (generated sequence) — rawan berubah bila format/prefix dirubah; resolusi butuh lookup `findByBorrowNumber` juga |
| **C. `transactionNumber`** (field baru) | idem A tapi field khusus | Terpisah dari business number; bisa dibuat alphanumeric pendek | **Migrasi + generator baru**; duplikasi dengan `borrowNumber` yang sudah unik; over-engineering |
| **D. JSON payload** | `{"id":...,"no":"PJ/...","tgl":...}` | Self-contained, multi-field, terbaca manual | **Kapasitas QR membesar** (versity density, scan lebih sulit); **versi schema JSON** = kontrak kedua yang harus dijaga; menyimpan snapshot yang bisa usang; over-engineered utk token |

### Rekomendasi final
> **Payload QR = `borrowing.id` (UUID).**

Alasan: QR pada kartu adalah **token lookup mesin**, bukan dokumen mandiri. UUID adalah kunci kanonik yang sudah menjadi basis seluruh IPC (`borrowings:findById`, `printing:*`), immutable, tanpa risiko perubahan format, dan tanpa migrasi. `borrowNumber` tetap tercetak sebagai teks di kartu untuk korelasi manusia; QR hanya membawa identitas stabil transaksi.

Catatan evolusi (tanpa blokir): di masa depan boleh menambah **namespace prefix** (mis. `APL-BORROW:<uuid>`) agar satu skema QR bisa mengakomodasi tipe lain (member/kartu). Penambahan prefix adalah **non-breaking** karena semua pembaca QR dibuat oleh aplikasi ini sendiri; tidak dilakukan di Phase 1.

---

## REVISION 3 — STATUS BADGE (scalable)

Wireframe harus mendukung **AKTIF / DIKEMBALIKAN / TERLAMBAT**, meskipun Phase 1 hanya menghasilkan **AKTIF**.

### Derivasi status (pure function)
```ts
// src/shared/config/borrow-status.ts (BARU, leaf node — pola config F1)
type BorrowStatus = 'ACTIVE' | 'RETURNED' | 'OVERDUE'

function deriveBorrowStatus(returnDate: Date | null, dueDate: Date, now: Date): BorrowStatus {
  if (returnDate !== null) return 'RETURNED'          // sudah dikembalikan
  return dueDate < now ? 'OVERDUE' : 'ACTIVE'          // jatuh tempo lewat = TERLAMBAT
}
```
- **AKTIF** → `returnDate === null` dan `dueDate >= now` (satu-satunya yang diproduksi Phase 1, karena kartu dicetak tepat setelah peminjaman).
- **TERLAMBAT** → `returnDate === null` dan `dueDate < now`.
- **DIKEMBALIKAN** → `returnDate !== null` (bila kartu dicetak ulang setelah kembali).

### Desain badge (scalable)
Badge dirender sebagai **pill** dengan token kode + pasangan label/kelas yang didefinisikan dalam **satu config table** (pattern `MEMBER_TYPES` / `ACADEMIC_STATUS`):

```ts
export const BORROW_STATUS = {
  ACTIVE:   { code: 'ACTIVE',   label: 'AKTIF',        className: 'badge-active' },
  RETURNED: { code: 'RETURNED', label: 'DIKEMBALIKAN', className: 'badge-returned' },
  OVERDUE:  { code: 'OVERDUE',  label: 'TERLAMBAT',    className: 'badge-overdue' },
} as const
```

```css
/* Template — hanya 3 kelas, ditambah status baru = tambah baris config */
.badge { display:inline-block; padding: 0.5mm 2mm; border-radius: 1mm;
         font-size: 6pt; font-weight: 700; letter-spacing: 0.3px; }
.badge-active   { background:#dcfce7; color:#166534; }
.badge-returned { background:#e2e8f0; color:#334155; }
.badge-overdue  { background:#fee2e2; color:#991b1b; }
```

**Scalability rule:** menambah status baru = (1) tambah entri di config `BORROW_STATUS`, (2) tambah satu aturan CSS `.badge-<code>`, (3) perluas fungsi derivasi. Template **tidak berubah** — ia hanya memetakan `status.code → config → class`. Tidak ada string label hardcoded di template.

---

## REVISION 4 — DAFTAR BUKU (tanpa "+N lainnya")

Konteks: kartu adalah **dokumen transaksi** — semua buku harus tampil, tidak boleh disembunyikan. Ukuran kartu tetap 110×60mm per halaman. Catatan: `MAX_BOOKS = 20` (`src/main/services/borrow.service.ts:13`).

### Perbandingan alternatif

| Opsi | Deskripsi | Kelebihan | Kekurangan | Verdict |
|---|---|---|---|---|
| **A. Tinggi kartu bertambah otomatis** | Satu kartu membesar mengikuti jumlah buku | Semua buku di satu halaman | **Melanggar spesifikasi PO 11×6cm**; ukuran antar transaksi tidak konsisten; print/PDF ukuran variabel | ❌ |
| **B. Halaman kedua otomatis** | Buku dibagi ke beberapa **kartu** 60mm (page break) | Ukuran fisik **tetap** per halaman; menampung seluruh MAX_BOOKS=20; print/PDF paginate alami | Perlu logika pagination di template | ✅ **DIREKOMENDASIKAN** |
| **C. Font diperkecil** | Menyusut font agar lebih banyak baris muat | Tanpa halaman tambahan | Menurun ke readable-nya dokumen (6.5pt → di bawah 5pt tidak bisa dicetak jelas); kapasitas tetap terbatas (~5 baris di 13mm) | ❌ |
| **D. Grid tabel multi-kolom buku** | 2–3 kolom buku per kartu | Memanfaatkan lebar 110mm | Judul panjang terpotong parah; kartu pendek; tetap overflow bila buku banyak; tidak lebih baik dari B untuk kasus umum | ⚠️ komplementer |

### Rekomendasi final
> **B — auto pagination (multi-page card).** Setiap halaman = satu kartu **110×60mm**. Buku dibagi halaman; **seluruh buku tampil** (tidak ada "+N lainnya"); font tetap readable.

**Layout per halaman:**
- **Halaman 1 (kartu utama):** Header (logo+identitas sekolah) · Identitas anggota + info transaksi · daftar buku hingga zona penuh · footer (jumlah, status, QR, tanda tangan).
- **Halaman 2+ (kartu lanjutan):** Header ringkas (logo kecil + "Lanjutan") · daftar buku sisa (zona buku diperlebar — identitas/transaksi tidak diulang) · footer lengkap **diulang** (jumlah total, status, QR, tanda tangan) sehingga setiap halaman berdiri sendiri sebagai dokumen sah.

Kapasitas tipikal: halaman 1 ≈ 3–4 baris; halaman lanjutan ≈ 10–11 baris (zona buku ~42mm). Untuk `MAX_BOOKS=20` → 1 kartu utama + 2 kartu lanjutan.

**Implementasi:** template menghasilkan array halaman (loop `pagesHtml`, pola `label.service.ts:88-100`); zona buku dihitung dari konstan layout; preview menampilkan tiap halaman sebagai sheet terpisah.

---

## REVISION 5 — PREVIEW (toolbar lengkap)

### Wireframe halaman preview

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ←   Pratinjau Kartu Peminjaman       PJ/202607/0001                       │
│                                 ┌──────┐ ┌────┐ ┌──────┐ ┌──────┐          │
│   [Zoom −]  [100%]  [Zoom +]  [Fit]│ C etak │ [Simpan PDF]  [ Tutup ] │
│                                 └──────┘ └────┘ └──────┘ └──────┘          │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌──────────────────────────────┐                   │
│                         │ ┌────────────────────────────┐ │                   │
│                         │ │   KARTU PEMINJAMAN 110×60mm │ │  ← sheet kartu   │
│                         │ │   (render HTML template)    │ │     discale      │
│                         │ └────────────────────────────┘ │                   │
│                         │ ┌────────────────────────────┐ │                   │
│                         │ │   hal.2 (lanjutan)          │ │                   │
│                         │ └────────────────────────────┘ │                   │
│                         └──────────────────────────────┘                   │
│              area scroll bebas (gulir vertikal)                              │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Toolbar — kontrol & perilaku

| Kontrol | Perilaku | Keterangan |
|---|---|---|
| **Zoom − / Zoom +** | ∓10% per klik | Rentang **50%–200%**, clamp |
| **100%** | Reset ke skala 1.0 | Tampilkan persentase aktif saat ini di tengah (mis. "100%") |
| **Fit** | Hitung skala agar sheet pas di lebar viewport (min. 50%) | `scale = min(1, (viewportW − 48px) / sheetW)` |
| **Cetak** | `api.print.borrowCard(id)` → hidden window `webContents.print` (pageSize 110×60mm) | Sama HTML dgn preview (single template) |
| **Simpan PDF** | `api.print.borrowCardPdf(id)` → `printToPDF` + `dialog.showSaveDialog` | Tampilkan path tersimpan saat sukses |
| **Tutup** | `navigate(-1)` kembali ke halaman Peminjaman | Di-cover tombol "←" juga |

**Implementasi zoom (renderer):**
- `html` dirender dalam `.preview-sheet` (pola `LabelPreviewPage.tsx:103`) yang dibungkus container berskala.
- Skala via `transform: scale(var(--zoom))` dengan `transform-origin: top center`; tinggi container dihitung ulang agar scrollbar benar (`sheetHeight × zoom`).
- Multi-halaman: `html` dari template sudah berisi beberapa blok kartu; `.preview-sheet` menampilkan semuanya; `Fit` memakai lebar kartu (110mm) sebagai acuan.
- Status: `busy` men-disable tombol Cetak/PDF selama proses; error → `alert(err.message)`.

---

## REVISION 6 — LOGO (fallback jika kosong)

Fakta: `Setting.logoPath` praktis selalu kosong (upload belum tersedia — `SettingsPage.tsx:210-211`). Maka fallback **bukan pilihan, tapi kebutuhan utama**.

### Hirarki fallback
1. **`logoPath` terisi & file terbaca** → baca file (fs) → **inline data URI** di template. (Satu-satunya jalur logo asli.)
2. **`logoPath` kosong / file tidak ada / gagal baca** → **placeholder SVG inline yang di-generate template**:
   - Bentuk: kotak/lingkaran membulat, warna aksen biru `#1d4ed8`, berisi **monogram** = inisial nama sekolah (`schoolName`) atau, bila kosong, nama perpustakaan (`libraryName`) — maksimal 2 huruf, kapital.
   - Contoh: "SMP Negeri 1 Tunas Bangsa" → `SN`; "APLibrary" → `AP`.
   - Digenapkan sebagai **inline SVG** (bukan `<img>`), sehingga tetap bekerja di `data:` URL hidden window tanpa masalah `file://`.
3. **Baik `schoolName` maupun `libraryName` kosong** → ikon **buku/library** sederhana (glyph SVG bawaan template).

### Mengapa bukan aset statis bawaan (bundled asset)
Template adalah string HTML murni yang dimuat via `data:` URL di hidden window; aset eksternal memerlukan mekanisme `file://` yang diblokir. **SVG inline = zero-dependency, self-contained**, dan tidak menambah file/asset ke package. Konsisten dengan template tunggal.

---

## FINAL DESIGN DECISION

Ringkasan **seluruh** keputusan desain Borrow Receipt Redesign — menjadi acuan implementasi (WO-1 s/d WO-5).

| # | Keputusan | Nilai |
|---|---|---|
| **D1** | **Target workflow** | Simpan → Generate Borrow Card → **Preview** → Cetak / Simpan PDF / Tutup (bukan langsung Windows Print) |
| **D2** | **Satu template** | `generateBorrowCardHtml(data)` di `src/main/services/borrow-card.service.ts` dipakai oleh Preview, Cetak, dan PDF. Dilarang template kedua. |
| **D3** | **Template pure function** | `data → HTML`, tanpa Electron API/DB; escape HTML utk semua data user-visible (`escapeHtml`) |
| **D4** | **Ukuran kartu** | **110mm × 60mm landscape** per halaman; `@page { size: 110mm 60mm; margin: 0 }`; fixed per halaman |
| **D5** | **Data assembly terpisah** | `buildBorrowCardData(borrowing, settings)` menyiapkan seluruh konten (member, transaksi, buku, QR svg, logo data URI, status) — template hanya merender |
| **D6** | **Foto anggota** | **TIDAK ADA** foto di DB/Storage/path/UI (hasil audit R1). Phase 1: **avatar inisial inline SVG**. Kolom `Member.photoPath` = backlog WO terpisah. |
| **D7** | **QR payload** | **`borrowing.id` (UUID)** — token lookup mesin yang stable; bukan `borrowNumber`. Namespace prefix = evolusi non-blocking di masa depan. |
| **D8** | **QR generator** | `generateQrCodeSvg(value)` via `bwip-js` bcid `qrcode` (ditambah di `barcode.service.ts`) |
| **D9** | **Status badge** | 3 status **AKTIF / DIKEMBALIKAN / TERLAMBAT**; derivasi pure `deriveBorrowStatus()`; config table `BORROW_STATUS` (code/label/class); template memetakan via config (scalable). Phase 1 hanya menghasilkan AKTIF. |
| **D10** | **Daftar buku** | **Auto pagination multi-page card** (R4-B). Semua buku tampil, tanpa "+N lainnya". Halaman 1 = kartu utama; halaman 2+ = kartu lanjutan (header ringkas + buku + footer diulang). |
| **D11** | **Preview** | `BorrowReceiptPreviewPage.tsx` dgn **toolbar: Zoom − / % / Zoom + / Fit / Cetak / Simpan PDF / Tutup**; zoom via `transform: scale` 50–200%; multi-sheet per halaman kartu |
| **D12** | **Setelah simpan** | `BorrowingsPage.tsx` → `navigate('/borrowings/:id/receipt-preview')`; kotak hijau "CETAK BUKTI" lama dihapus. `create()` logic TIDAK diubah. |
| **D13** | **Logo fallback** | `logoPath` (data URI) → jika kosong/gagal: **monogram SVG inline** (inisial schoolName/libraryName) → jika keduanya kosong: ikon buku SVG bawaan. Tanpa aset eksternal. |
| **D14** | **Petugas** | Sumber = `Setting.librarianName` (tidak ada field officer per transaksi). Tanda tangan = nama + garis. |
| **D15** | **Channel baru** | `printing:borrowCardPreview` (read-only, tanpa window) · `printing:borrowCard` (print) · `printing:borrowCardPdf` (printToPDF + save dialog). Channel legacy `printing:borrowReceipt`/`returnReceipt` **dipertahankan** selama transisi. |
| **D16** | **PDF** | `webContents.printToPDF()` pada hidden window memuat **HTML yang sama**; simpan via `dialog.showSaveDialog` (pola `member.ipc.ts:16-47`). Tanpa dependency baru. |
| **D17** | **Print options** | `pageSize: { width: 110000, height: 60000 }` micron, `margins: none`, `printBackground: true` |
| **D18** | **Tidak menyentuh** | `BorrowService.create`, repository borrow, schema/migration, return flow, channel print legacy, dependency |
| **D19** | **WO implementasi** | WO-1 Template & Data Contract · WO-2 Preview · WO-3 Cetak · WO-4 PDF · WO-5 Regression & Cleanup (channel legacy dihapus hanya bila PO setuju) |
| **D20** | **Backlog (bukan Phase 1)** | `Member.photoPath` + upload UI; QR namespace prefix; tanda tangan digital gambar; mode warna aksen sekolah |

---

**BERHENTI. Menunggu approval Product Owner.** Tidak ada kode yang diubah; tidak ada commit.
