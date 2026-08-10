// Tab "Informasi Aplikasi" (Settings) — DTO kontrak renderer ↔ main (tahap 1).
// UI HANYA klien: seluruh nilai dibangun di main (service layer), renderer
// hanya menampilkan. Read-only — tidak ada channel tulis.
// Error handling: partial success per field — field yang gagal dibaca = null
// (renderer menampilkan "Belum tersedia"), TIDAK menggagalkan seluruh permintaan.

export interface AppDatabaseInfoDTO {
  // Migration terakhir yang ter-aplikasi (SchemaVersionReader). null bila
  // pembacaan gagal / tabel migration kosong (belum ada migration).
  dbVersion: string | null
  // Versi format backup yang didukung aplikasi (MANIFEST_BACKUP_VERSION).
  backupVersion: number
  // Path file database live yang tersolve (resolveLiveDatabaseFile).
  dbLocation: string
  // Ukuran file .db utama dalam byte. null bila stat gagal (file belum ada).
  dbSizeBytes: number | null
}
