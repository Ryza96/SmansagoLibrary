// WO-3 — Pre-flight Validation model + Failure decision.
// Validasi provider-level RFC-003 §4.2 / §4.3 + Failure Strategy ADR-001 (SSOT):
//   - Semua kegagalan pre-flight = batalkan SEBELUM menulis apa pun.
//   - Provider WAJIB gagal → Abort (backup FAILED).
//   - Provider OPSIONAL gagal → dilewati (warning), backup tetap jalan.
// Hasil dirangkum menjadi laporan pre-flight (lulus/gagal per item + pesan).
// Murni domain: tidak menyentuh filesystem/electron/zip/sqlite.

import { ProviderDomainError } from './domain-error'
import { ProviderId } from './provider-id'
import { ProviderRequirement, PROVIDER_REQUIREMENTS } from './provider'

export const PREFLIGHT_STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  WARNING: 'warning',
} as const satisfies Record<string, string>

export type PreflightStatus = (typeof PREFLIGHT_STATUS)[keyof typeof PREFLIGHT_STATUS]

export function isPreflightStatus(value: unknown): value is PreflightStatus {
  return (
    typeof value === 'string' && (Object.values(PREFLIGHT_STATUS) as string[]).includes(value)
  )
}

export interface PreflightItemProps {
  name: string
  status: PreflightStatus
  message: string
}

export class PreflightItem {
  private constructor(private readonly _props: PreflightItemProps) {}

  static of(props: PreflightItemProps): PreflightItem {
    if (typeof props.name !== 'string' || props.name.trim().length === 0) {
      throw new ProviderDomainError('preflight.name wajib string non-kosong')
    }
    if (!isPreflightStatus(props.status)) {
      throw new ProviderDomainError('preflight.status tidak dikenal (pass|fail|warning)')
    }
    if (typeof props.message !== 'string') {
      throw new ProviderDomainError('preflight.message wajib string')
    }
    return new PreflightItem({ ...props })
  }

  get name(): string {
    return this._props.name
  }

  get status(): PreflightStatus {
    return this._props.status
  }

  get message(): string {
    return this._props.message
  }

  toJSON(): PreflightItemJSON {
    return {
      name: this._props.name,
      status: this._props.status,
      message: this._props.message,
    }
  }
}

export interface PreflightItemJSON {
  name: string
  status: string
  message: string
}

export class PreflightReport {
  private constructor(private readonly _items: PreflightItem[]) {}

  static of(items: PreflightItem[]): PreflightReport {
    if (!Array.isArray(items) || items.some((item) => !(item instanceof PreflightItem))) {
      throw new ProviderDomainError('preflight.items wajib array PreflightItem')
    }
    return new PreflightReport([...items])
  }

  get items(): PreflightItem[] {
    return [...this._items]
  }

  get ok(): boolean {
    return this._items.every((item) => item.status !== PREFLIGHT_STATUS.FAIL)
  }

  get hasWarning(): boolean {
    return this._items.some((item) => item.status === PREFLIGHT_STATUS.WARNING)
  }

  get failedItems(): PreflightItem[] {
    return this._items.filter((item) => item.status === PREFLIGHT_STATUS.FAIL)
  }

  get warningItems(): PreflightItem[] {
    return this._items.filter((item) => item.status === PREFLIGHT_STATUS.WARNING)
  }
}

export interface ProviderPreflightState {
  providerId: ProviderId
  requirement: ProviderRequirement
  status: PreflightStatus
  message: string
}

export interface ProviderPreflightDecision {
  proceed: boolean
  abortedBecause: string[]
  skippedProviders: string[]
  warnings: string[]
}

export function decideProviderPreflight(
  states: ProviderPreflightState[]
): ProviderPreflightDecision {
  const abortedBecause: string[] = []
  const skippedProviders: string[] = []
  const warnings: string[] = []
  for (const state of states) {
    if (state.status === PREFLIGHT_STATUS.PASS) continue
    const detail = `${state.providerId.fullName}: ${state.message}`
    if (state.status === PREFLIGHT_STATUS.FAIL) {
      if (state.requirement === PROVIDER_REQUIREMENTS.REQUIRED) {
        abortedBecause.push(detail)
      } else {
        skippedProviders.push(state.providerId.fullName)
        warnings.push(detail)
      }
    } else {
      warnings.push(detail)
    }
  }
  return {
    proceed: abortedBecause.length === 0,
    abortedBecause,
    skippedProviders,
    warnings,
  }
}
