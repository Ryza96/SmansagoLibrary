// WO-2 (LOGO MANAGEMENT — BACKEND) — Kontrak IPC pemilihan logo.
// Sumber: RFC_LOGO_MANAGEMENT_ARCHITECTURE.md (LOCKED REVISION 1) §15.1:
//   pickLogo() → handler → showOpenDialog → { filePath, size, uri } untuk preview.
// Renderer HANYA konsumen; seluruh validasi & resize terjadi di main (WO-2).
// `previewUri` = data URI hasil RESIZE (≤ 512×512, sama dengan yang akan
// disimpan) agar preview WYSIWYG dengan kartu cetak (RFC §9).

export type PickLogoResult =
  | { canceled: true }
  | {
      canceled: false
      filePath: string
      sizeBytes: number
      previewUri: string
    }
