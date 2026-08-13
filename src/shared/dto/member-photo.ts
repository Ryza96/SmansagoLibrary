// WO MEMBER PHOTO — Kontrak IPC pemilihan foto anggota.
// Mengikuti pola src/shared/dto/cover.ts (WO SAM SAMPUL BUKU):
//   pickPhoto() → handler → showOpenDialog → { filePath, size, uri } untuk preview.
// Renderer HANYA konsumen; seluruh validasi & resize terjadi di main.
// `previewUri` = data URI hasil RESIZE (≤ 512×512, sama dengan yang akan
// disimpan) agar preview WYSIWYG dengan detail anggota.

export type PickMemberPhotoResult =
  | { canceled: true }
  | {
      canceled: false
      filePath: string
      sizeBytes: number
      previewUri: string
    }
