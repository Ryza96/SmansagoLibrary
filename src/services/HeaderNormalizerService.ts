const HEADER_SYNONYMS: Record<string, string> = {
  publisher: 'penerbit',
  'tahun': 'tahun terbit',
  'jumlah': 'jumlah copy',
  'jumlah eksemplar': 'jumlah copy',
}

export class HeaderNormalizerService {
  normalizeHeader(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
    return HEADER_SYNONYMS[normalized] ?? normalized
  }
}

export const headerNormalizerService = new HeaderNormalizerService()
