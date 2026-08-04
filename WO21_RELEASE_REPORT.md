# WO-21 Release Report — Import Buku Fix B1 & B2

## Ringkasan

Bug UAT import (B1 hasil per-baris tidak tampil, B2 orphan AutoCreate) diperbaiki dengan:
- **Per-baristransaction atomic** — AutoCreateService + Book + BookCopy dalam satu `runTransaction`; baris gagal tidak menulis apa pun ke DB.
- **`ImportResultDTO`** — backend mengembalikan `{totalRows, importedBooks, importedCopies, failedRows}`; UI me-render langsung dari DTO (tanpa business logic renderer).

## Validation Final

- Smoke `wo21_import_b1b2_smoke`: **48/48 PASS** (fresh DB temp, dibersihkan setelah run).
- `npm run lint` PASS; `npm run build` PASS; `prisma migrate diff` no-drift.
- Schema/migration **tidak disentuh** (tidak ada migration baru).

## File dalam rilis (12 modified + 1 smoke)

IPC: `book-import.ipc.ts`, `index.ts`; Main: `bootstrap.ts`; Services: `auto-create.service.ts`, `book-import.service.ts`; Repos: `author`, `publisher`, `category` (+createWithTx/findExactWithTx); Types: `src/types/import.ts`; Renderer: `BookImportPreviewPage.tsx`, `env.d.ts`, `utils/bookImport.ts`; Smoke: `wo21_import_b1b2_smoke/`.

## Tech Debt (dicatat, tidak diblokir)

- Pesan error per-baris di UI masih berbasis `messageKey`; DTO belum membawa pesan terformat.
- Smoke historis `uat_*` obsolete memakai API lama (di luar regression suite).

## Status: READY untuk rilis — menunggu review PO.
