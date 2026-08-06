// WO-2 — Manifest Validator.
// Memvalidasi manifest mentah (hasil parse JSON on-disk, unknown) terhadap aturan
// RFC-002 §4 / ADR-001 (SSOT) — TANPA membaca file sama sekali:
//   1. field wajib (struktur + tipe)
//   2. schema version (format SchemaVersion)
//   3. duplicate entry (path unik di files[])
//   4. relative path (path relatif kanonik, forward-slash, tanpa ../)
//   5. checksum format (64 hex SHA-256)
// Field tak dikenal DIABAIKAN (format additive-only / forward-compat).
// Murni domain: tanpa filesystem, zip, electron, sqlite, provider.

import { Manifest } from './manifest'
import { MANIFEST_FORMAT } from './manifest'
import { ManifestMetadata, isNonEmptyString, isPositiveInteger } from './metadata'
import { ManifestEntry, ManifestEntryKind, MANIFEST_ENTRY_KINDS, isRelativeManifestPath } from './entry'
import { ManifestSummary } from './summary'
import { SchemaVersion } from './schema-version'
import { Checksum } from './checksum'
import { isNonNegativeInteger } from './entry'

export type ManifestValidationResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; errors: string[] }

export class ManifestValidator {
  validate(raw: unknown): ManifestValidationResult {
    const errors: string[] = []

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return { ok: false, errors: ['manifest wajib berupa objek JSON'] }
    }
    const manifest = raw as Record<string, unknown>

    // 1. field wajib — format
    if (manifest.format !== MANIFEST_FORMAT) {
      errors.push(`format wajib "${MANIFEST_FORMAT}"`)
    }

    // 1. field wajib — meta
    const meta = manifest.meta
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      errors.push('meta wajib berupa objek')
    } else {
      const metaRecord = meta as Record<string, unknown>
      if (!isPositiveInteger(metaRecord.backupVersion)) errors.push('meta.backupVersion wajib bilangan bulat >= 1')
      if (!isNonEmptyString(metaRecord.appVersion)) errors.push('meta.appVersion wajib string non-kosong')
      if (!isNonEmptyString(metaRecord.appName)) errors.push('meta.appName wajib string non-kosong')
      if (!isNonEmptyString(metaRecord.type)) errors.push('meta.type wajib string non-kosong')
      if (!SchemaVersion.isValid(metaRecord.schemaVersion)) {
        errors.push('meta.schemaVersion wajib string identitas skema non-kosong (tanpa karakter kontrol)')
      }
      if (
        typeof metaRecord.createdAt !== 'string' ||
        Number.isNaN(new Date(metaRecord.createdAt).getTime())
      ) {
        errors.push('meta.createdAt wajib string tanggal valid (ISO 8601)')
      }
    }

    // 1. field wajib — files
    if (!Array.isArray(manifest.files)) {
      errors.push('files wajib berupa array')
    } else {
      if (manifest.files.length === 0) errors.push('files wajib berisi minimal satu entri (database)')
      const seenPaths = new Set<string>()
      manifest.files.forEach((entry, index) => {
        const label = `files[${index}]`
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          errors.push(`${label} wajib berupa objek`)
          return
        }
        const entryRecord = entry as Record<string, unknown>

        // 4. relative path
        if (!isRelativeManifestPath(entryRecord.path)) {
          errors.push(`${label}.path wajib path relatif kanonik (forward-slash, tanpa ../)`)
        } else {
          // 3. duplicate entry
          const path = entryRecord.path as string
          if (seenPaths.has(path)) {
            errors.push(`${label}.path duplikat: "${path}"`)
          } else {
            seenPaths.add(path)
          }
        }

        if (!isNonNegativeInteger(entryRecord.sizeBytes)) {
          errors.push(`${label}.sizeBytes wajib bilangan bulat >= 0`)
        }
        // 5. checksum format — per entri
        if (!Checksum.isValid(entryRecord.sha256)) {
          errors.push(`${label}.sha256 wajib 64 karakter hex (SHA-256)`)
        }
        if (
          typeof entryRecord.kind !== 'string' ||
          !(Object.values(MANIFEST_ENTRY_KINDS) as string[]).includes(entryRecord.kind)
        ) {
          errors.push(`${label}.kind tidak dikenal (database|asset|log)`)
        }
      })
    }

    // 1. field wajib — summary
    const summary = manifest.summary
    if (typeof summary !== 'object' || summary === null || Array.isArray(summary)) {
      errors.push('summary wajib berupa objek')
    } else {
      const summaryRecord = summary as Record<string, unknown>
      if (!isNonNegativeInteger(summaryRecord.files)) errors.push('summary.files wajib bilangan bulat >= 0')
      if (!isNonNegativeInteger(summaryRecord.totalBytes)) errors.push('summary.totalBytes wajib bilangan bulat >= 0')
      if (summaryRecord.tables !== undefined && !isNonNegativeInteger(summaryRecord.tables)) {
        errors.push('summary.tables wajib bilangan bulat >= 0')
      }
      if (summaryRecord.members !== undefined && !isNonNegativeInteger(summaryRecord.members)) {
        errors.push('summary.members wajib bilangan bulat >= 0')
      }
    }

    // 1. field wajib — checksums
    const checksums = manifest.checksums
    if (typeof checksums !== 'object' || checksums === null || Array.isArray(checksums)) {
      errors.push('checksums wajib berupa objek')
    } else {
      const checksumsRecord = checksums as Record<string, unknown>
      // 5. checksum format — manifest
      if (!Checksum.isValid(checksumsRecord.manifestSha256)) {
        errors.push('checksums.manifestSha256 wajib 64 karakter hex (SHA-256)')
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors }
    }

    try {
      const manifestModel = Manifest.create({
        format: MANIFEST_FORMAT,
        meta: ManifestMetadata.of({
          backupVersion: (meta as Record<string, unknown>).backupVersion as number,
          appVersion: (meta as Record<string, unknown>).appVersion as string,
          schemaVersion: SchemaVersion.of((meta as Record<string, unknown>).schemaVersion as string),
          createdAt: new Date((meta as Record<string, unknown>).createdAt as string),
          appName: (meta as Record<string, unknown>).appName as string,
          type: (meta as Record<string, unknown>).type as string,
          engine:
            (meta as Record<string, unknown>).engine !== undefined
              ? String((meta as Record<string, unknown>).engine)
              : undefined,
          integrity:
            (meta as Record<string, unknown>).integrity !== undefined
              ? String((meta as Record<string, unknown>).integrity)
              : undefined,
        }),
        files: (manifest.files as Array<Record<string, unknown>>).map((entry) =>
          ManifestEntry.of({
            path: entry.path as string,
            sizeBytes: entry.sizeBytes as number,
            sha256: Checksum.of(entry.sha256 as string),
            kind: entry.kind as ManifestEntryKind,
          })
        ),
        summary: ManifestSummary.of({
          files: (summary as Record<string, unknown>).files as number,
          totalBytes: (summary as Record<string, unknown>).totalBytes as number,
          tables:
            (summary as Record<string, unknown>).tables !== undefined
              ? ((summary as Record<string, unknown>).tables as number)
              : undefined,
          members:
            (summary as Record<string, unknown>).members !== undefined
              ? ((summary as Record<string, unknown>).members as number)
              : undefined,
        }),
        checksums: {
          manifestSha256: Checksum.of((checksums as Record<string, unknown>).manifestSha256 as string),
        },
      })
      return { ok: true, manifest: manifestModel }
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : 'manifest tidak dapat dibangun'] }
    }
  }
}
