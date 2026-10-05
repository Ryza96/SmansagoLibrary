// Validasi murni untuk pengaturan denda.
export interface FineSettingsInput {
  lateFee: number
  defaultBookValue: number
}

export interface FineSettingsValidation {
  ok: boolean
  errors: { lateFee?: string; defaultBookValue?: string }
}

export function validateFineSettings(input: FineSettingsInput): FineSettingsValidation {
  const errors: FineSettingsValidation['errors'] = {}

  if (typeof input.lateFee !== 'number' || !Number.isInteger(input.lateFee)) {
    errors.lateFee = 'Denda keterlambatan harus bilangan bulat.'
  } else if (input.lateFee < 0 || input.lateFee > 1_000_000) {
    errors.lateFee = 'Denda keterlambatan harus antara 0 dan 1.000.000.'
  }

  if (typeof input.defaultBookValue !== 'number' || !Number.isInteger(input.defaultBookValue)) {
    errors.defaultBookValue = 'Nilai default buku harus bilangan bulat.'
  } else if (input.defaultBookValue < 1 || input.defaultBookValue > 100_000_000) {
    errors.defaultBookValue = 'Nilai default buku harus antara 1 dan 100.000.000.'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}
