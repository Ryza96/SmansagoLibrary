// WO-3 — Provider Registry & Restore Handler Registry.
// Titik pendaftaran tunggal Provider (backup) dan Restore Handler (restore) —
// RFC-003 §3/§7 · RFC-004 §8 · ADR-001 (SSOT):
//   - Provider mendaftar dengan identitas unik (nama+versi).
//   - Engine tidak pernah diubah saat jenis data baru — cukup daftar.
// Murni domain: tidak menyentuh filesystem/electron/zip/sqlite.

import { ProviderDomainError } from './domain-error'
import { ProviderId } from './provider-id'
import { ProviderKind } from './provider-kind'
import { BackupProvider, PROVIDER_REQUIREMENTS } from './provider'
import { RestoreHandler } from './restore-handler'

export class ProviderRegistry {
  private readonly _providers: BackupProvider[] = []

  register(provider: BackupProvider): void {
    if (this._providers.some((existing) => existing.id.equals(provider.id))) {
      throw new ProviderDomainError(`provider sudah terdaftar: ${provider.id.fullName}`)
    }
    this._providers.push(provider)
  }

  discover(): BackupProvider[] {
    return [...this._providers]
  }

  count(): number {
    return this._providers.length
  }

  findById(id: ProviderId): BackupProvider | undefined {
    return this._providers.find((provider) => provider.id.equals(id))
  }

  findByKind(kind: ProviderKind): BackupProvider[] {
    return this._providers.filter((provider) => provider.kind === kind)
  }

  requiredProviders(): BackupProvider[] {
    return this._providers.filter(
      (provider) => provider.requirement === PROVIDER_REQUIREMENTS.REQUIRED
    )
  }

  optionalProviders(): BackupProvider[] {
    return this._providers.filter(
      (provider) => provider.requirement === PROVIDER_REQUIREMENTS.OPTIONAL
    )
  }
}

export class RestoreHandlerRegistry {
  private readonly _handlers: RestoreHandler[] = []

  register(handler: RestoreHandler): void {
    if (this._handlers.some((existing) => existing.id.equals(handler.id))) {
      throw new ProviderDomainError(`restore handler sudah terdaftar: ${handler.id.fullName}`)
    }
    this._handlers.push(handler)
  }

  discover(): RestoreHandler[] {
    return [...this._handlers]
  }

  count(): number {
    return this._handlers.length
  }

  findById(id: ProviderId): RestoreHandler | undefined {
    return this._handlers.find((handler) => handler.id.equals(id))
  }

  findByKind(kind: ProviderKind): RestoreHandler[] {
    return this._handlers.filter((handler) => handler.kind === kind)
  }

  requiredHandlers(): RestoreHandler[] {
    return this._handlers.filter(
      (handler) => handler.requirement === PROVIDER_REQUIREMENTS.REQUIRED
    )
  }

  optionalHandlers(): RestoreHandler[] {
    return this._handlers.filter(
      (handler) => handler.requirement === PROVIDER_REQUIREMENTS.OPTIONAL
    )
  }
}
