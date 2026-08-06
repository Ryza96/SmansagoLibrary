// WO-4 — Schema Version Reader.
// ADR-001 §6: schemaVersion = IDENTITAS skema database = label migration
// terakhir yang TER-Aplikasi (_prisma_migrations, rolled_back_at IS NULL).
// Infra: boleh menyentuh Prisma — hasilnya VO domain (SchemaVersion).
// Dipakai Backup Engine saat membangun manifest (RFC-003 §4.4 / ADR-001 §6).

import { getPrisma } from '../../repositories/base/prisma'
import { SchemaVersion } from '../../domain/manifest/schema-version'

export class SchemaVersionReader {
  async read(): Promise<SchemaVersion> {
    const rows = (await getPrisma().$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`
    )) as Array<{ migration_name: string }>
    const name = rows?.[0]?.migration_name
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('tidak ada migration ter-aplikasi — schema version tidak dapat ditentukan')
    }
    return SchemaVersion.of(name)
  }
}
