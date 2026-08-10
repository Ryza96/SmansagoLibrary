export interface BarcodeFormatDefinition {
  code: string
  label: string
}

// Symbology barcode yang didukung label buku (Opsi A — nilai tetap
// inventoryNumber; hanya jenis kode batang yang dikonfigurasi).
// Nilai inventoryNumber berbentuk `INV-000001` (huruf besar + digit + dash)
// sehingga Code128 & Code39 keduanya aman. EAN-13/ITF butuh digit-only →
// TIDAK dimasukkan.
export const BARCODE_FORMATS = {
  code128: {
    code: 'code128',
    label: 'Code 128'
  },
  code39: {
    code: 'code39',
    label: 'Code 39'
  }
} as const satisfies Record<string, BarcodeFormatDefinition>

export type BarcodeFormatCode = keyof typeof BARCODE_FORMATS

export const BARCODE_FORMAT_CODES = Object.keys(BARCODE_FORMATS) as BarcodeFormatCode[]

export const DEFAULT_BARCODE_FORMAT: BarcodeFormatCode = 'code128'

const BARCODE_FORMAT_CODE_SET = new Set<string>(BARCODE_FORMAT_CODES)

// Fallback: nilai lama 'BC-XXXXXXXXXX' (placeholder desain awal) maupun nilai
// tak dikenal → code128. Renderer memakai ini untuk isi dropdown; main memakai
// untuk memilih bcid saat generate SVG.
export function normalizeBarcodeFormat(value?: string | null): BarcodeFormatCode {
  if (value && BARCODE_FORMAT_CODE_SET.has(value)) {
    return value as BarcodeFormatCode
  }
  return DEFAULT_BARCODE_FORMAT
}
