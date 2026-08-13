// WO SAM: SAMPUL BUKU — Kontrak IPC pemilihan gambar sampul buku.
// Mengikuti pola src/shared/dto/logo.ts (RFC_LOGO_MANAGEMENT_ARCHITECTURE.md):
//   pickCover() → handler → showOpenDialog → { filePath, size, uri } untuk preview.
// Renderer HANYA konsumen; seluruh validasi & resize terjadi di main.
// `previewUri` = data URI hasil RESIZE (≤ 512×512, sama dengan yang akan
// disimpan) agar preview WYSIWYG dengan detail buku.

export type PickCoverResult =
  | { canceled: true }
  | {
      canceled: false
      filePath: string
      sizeBytes: number
      previewUri: string
    }
