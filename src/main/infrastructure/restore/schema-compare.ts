// WO-5 — Perbandingan schema version backup vs live (murni).
// RFC-004 §4.4 (schema gate) / ADR-001 §6:
//   - same    → tanpa migrasi (Align tidak diperlukan)
//   - older   → backup lebih lama → butuh migrasi-on-restore (Align) —
//               belum didukung v1 → ditolak dengan pesan jelas
//   - newer   → forward protect — ditolak (tidak ada downgrade schema)
//   - unknown → nama skema tidak dapat dibandingkan — ditolak (jalur aman)
// Urutan migration Prisma = urutan sort lexicographic nama folder (timestamp
// diawal); perbandingan string kanonik benar selama kedua nama memakai pola
// ^\d{8,}_ (timestamp). Murni domain-infra: tanpa IO.

import { SchemaVersion } from '../../domain/manifest/schema-version'

export type SchemaComparison = 'same' | 'older' | 'newer' | 'unknown'

const MIGRATION_TIMESTAMP_PATTERN = /^\d{8,}_/

export function compareSchemaVersions(backup: SchemaVersion, current: SchemaVersion): SchemaComparison {
  if (backup.equals(current)) {
    return 'same'
  }
  if (!MIGRATION_TIMESTAMP_PATTERN.test(backup.value) || !MIGRATION_TIMESTAMP_PATTERN.test(current.value)) {
    return 'unknown'
  }
  if (backup.value < current.value) {
    return 'older'
  }
  if (backup.value > current.value) {
    return 'newer'
  }
  return 'unknown'
}
