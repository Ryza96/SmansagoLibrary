import type { BookImportTemplate } from '../types/import'

export const LEGACY_BOOK_IMPORT_TEMPLATE = {
  id: 'book-import-v1',
  name: 'Template Import Buku v1',
  description:
    'Template legacy impor data buku. Kolom: Judul, Penulis, Penerbit, Tahun Terbit, Kategori, ISBN (dalam urutan ini).',
  columns: [
    {
      key: 'title',
      label: 'Judul',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'authors',
      label: 'Penulis',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'publisher',
      label: 'Penerbit',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'year',
      label: 'Tahun Terbit',
      requiredColumn: true,
      requiredValue: false,
      dataType: 'number',
      nullable: true,
    },
    {
      key: 'category',
      label: 'Kategori',
      requiredColumn: true,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'isbn',
      label: 'ISBN',
      requiredColumn: true,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
  ],
} as const satisfies BookImportTemplate

export const BOOK_IMPORT_TEMPLATE = {
  id: 'book-import-v2',
  name: 'Template Import Buku v2',
  description:
    'Template resmi impor data buku. Kolom: Judul, Penulis, Penerbit, Tahun Terbit, Kategori, Jumlah Copy, ISBN, Bahasa, Edisi, Jumlah Halaman, Deskripsi, Lokasi Rak, Kondisi Awal, Sumber Perolehan, Tanggal Perolehan, Harga Perolehan, Kode Buku (dalam urutan ini).',
  columns: [
    {
      key: 'title',
      label: 'Judul',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'authors',
      label: 'Penulis',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'publisher',
      label: 'Penerbit',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'year',
      label: 'Tahun Terbit',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'number',
      nullable: false,
    },
    {
      key: 'category',
      label: 'Kategori',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'string',
      nullable: false,
    },
    {
      key: 'copyCount',
      label: 'Jumlah Copy',
      requiredColumn: true,
      requiredValue: true,
      dataType: 'number',
      nullable: false,
      min: 1,
      max: 100,
    },
    {
      key: 'isbn',
      label: 'ISBN',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'language',
      label: 'Bahasa',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'edition',
      label: 'Edisi',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'pageCount',
      label: 'Jumlah Halaman',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'number',
      nullable: true,
    },
    {
      key: 'description',
      label: 'Deskripsi',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'shelfLocation',
      label: 'Lokasi Rak',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'initialCondition',
      label: 'Kondisi Awal',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'acquisitionSource',
      label: 'Sumber Perolehan',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
    {
      key: 'acquisitionDate',
      label: 'Tanggal Perolehan',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'date',
      nullable: true,
    },
    {
      key: 'acquisitionCost',
      label: 'Harga Perolehan',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'number',
      nullable: true,
    },
    {
      key: 'bookCode',
      label: 'Kode Buku',
      requiredColumn: false,
      requiredValue: false,
      dataType: 'string',
      nullable: true,
    },
  ],
} as const satisfies BookImportTemplate

export type BookImportColumnKey = (typeof BOOK_IMPORT_TEMPLATE.columns)[number]['key']

const BOOK_IMPORT_TEMPLATES: BookImportTemplate[] = [BOOK_IMPORT_TEMPLATE, LEGACY_BOOK_IMPORT_TEMPLATE]

function matchesHeaderPrefix(normalizedHeaders: string[], template: BookImportTemplate): boolean {
  if (normalizedHeaders.length < template.columns.length) return false
  return template.columns.every((column, index) => normalizedHeaders[index] === column.label.toLowerCase())
}

export function detectBookImportTemplate(normalizedHeaders: string[]): BookImportTemplate {
  for (const template of BOOK_IMPORT_TEMPLATES) {
    if (matchesHeaderPrefix(normalizedHeaders, template)) return template
  }
  return BOOK_IMPORT_TEMPLATE
}
