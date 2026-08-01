# SPRINT10 — WO-2 Decision Log (Revisi)
**Import Commit** — menutup dead-end Import Preview.

## A. Keputusan Teknis (implementasi — kondisi final)
| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| D-1 | Lokasi komputasi ringkasan hasil | (a) renderer, (b) backend | **(b) backend — TIDAK dilakukan sekarang.** Iterasi awal menghitung statistik di renderer dari `MatchedWorkbook`; **ditolak PO** (business logic import tidak boleh di renderer; messageKey `bookImport.*` bukan kontrak sistem). Backend tidak boleh diubah pada WO-2, dan kontrak IPC baru tidak boleh ditambah → ringkasan resmi **ditunda**; UI cukup menampilkan status sukses. | Tidak ada komputasi di renderer; `buildImportSummary`/`ImportSummary`/`BOOK_FAILURE_MESSAGE_KEYS` dihapus. |
| D-2 | Semantik pesan sukses | (a) ringkasan angka, (b) status sukses saja | **(b) status sukses saja** ("Import selesai."). Sesuai instruksi PO: "Jika backend belum menyediakan summary resmi, cukup tampilkan status sukses tanpa statistik." | Kartu sukses hijau tanpa angka; tidak ada asumsi tentang hasil. |
| D-3 | State commit | (a) summary object, (b) boolean `importSuccess` | **(b) boolean.** Karena tidak ada data statistik lagi, state cukup menandai sukses/gagal untuk mengunci tombol & mengganti label tombol kembali. | `handleCommit` hanya `await` invoke; renderer tidak membaca isi `MatchedWorkbook`. |
| D-4 | Loading state | (a) komponen generic (Spinner/ProgressBar/Modal), (b) state sederhana inline | **(b) state sederhana.** Instruksi melarang komponen generic baru & redesign UI. Tombol disabled + ikon `Hourglass` + teks "Memproses import...". | Tidak ada komponen baru; perubahan UI minimal. |
| D-5 | Setelah sukses, posisi tombol kembali | (a) selalu "Kembali", (b) label berubah jadi "Kembali ke Daftar Buku" | **(b) label berubah saat `importSuccess`.** Menandai alur selesai; navigasi tetap `ROUTES.BOOKS`. Tombol "Import Buku" disembunyikan setelah sukses agar tidak dobel-import. | Alur jelas: pra-commit = "Kembali" + "Import Buku"; pasca-commit = pesan sukses + "Kembali ke Daftar Buku". |

## B. Keputusan yang TIDAK diambil (di luar scope)
| ID | Pertanyaan | Keputusan | Alasan |
|----|-----------|-----------|--------|
| N-1 | Tambah summary resmi dari backend (mis. return `ImportResult`) | Tidak | WO-2 melarang perubahan backend & penambahan kontrak IPC baru; kandidat WO lanjutan bila PO menginginkan statistik |
| N-2 | Ubah urutan pipeline (match → autoCreate → importBooks) agar entitas tidak dibuat untuk baris gagal | Tidak | Backend dilarang diubah pada WO-2 |
| N-3 | Reset `BookImportContext` setelah sukses | Tidak | Provider di-scope ke subtree `/books/import`; navigasi ke `/books` meng-unmount dan mereset state secara natural |
| N-4 | Menampilkan daftar issue per baris | Tidak | Di luar permintaan; backend tidak boleh diubah & tidak ada kontrak detail baris ke renderer |

## C. Revisi (Review PO)
| ID | Keputusan | Opsi | Keputusan & Alasan | Konsekuensi |
|----|-----------|------|---------------------|-------------|
| R-1 | `buildImportSummary()` di renderer | (a) pertahankan, (b) **hapus** | **(b) hapus.** Business logic import & dependensi messageKey `bookImport.*` bukan tanggung jawab renderer. | Dihapus dari `src/utils/bookImport.ts`; tipe `ImportSummary` & `BOOK_FAILURE_MESSAGE_KEYS` dihapus. |
| R-2 | Statistik 5 angka di UI | (a) pertahankan, (b) **hapus** | **(b) hapus.** Tanpa summary resmi dari backend, UI hanya menampilkan status sukses. | Kartu statistik diganti pesan sukses tanpa angka; label `SUMMARY_*` dihapus; `SUMMARY_HINT` → `COMMIT_HINT`. |
| R-3 | Ubah backend / kontrak IPC | (a) ya, (b) **tidak** | **(b) tidak.** Sesuai instruksi: jangan ubah backend, jangan tambah kontrak IPC baru, jangan ubah Matching/Validation/AutoCreate. | Zero perubahan di `electron/` dan `src/main/`; channel `imports:match` tetap seperti sebelumnya. |

## Catatan
- D-1 s.d. D-5 adalah keputusan implementasi menjaga **minimal file changes** (3 file renderer),
  **zero backend change**, dan **zero business logic di renderer** (per Review PO).
- Kontrak IPC `imports:match` tidak berubah; renderer hanya menunggu resolve/reject promise.
