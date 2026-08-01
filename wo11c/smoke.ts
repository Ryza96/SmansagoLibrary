import path from 'node:path'
import readXlsxFile from 'read-excel-file/node'
import { validationEngineService } from '../src/services/ValidationEngineService'
import { BOOK_IMPORT_TEMPLATE, LEGACY_BOOK_IMPORT_TEMPLATE } from '../src/config/bookImport.template'
import type { RawWorkbook } from '../src/types/import'

const V1_PATH = path.resolve('templates/Template_Import_Buku_v1.0.xlsx')
const V2_PATH = path.resolve('templates/Template_Import_Buku_v2.0.xlsx')

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

async function readWorkbook(filePath: string): Promise<RawWorkbook> {
  const sheets = await readXlsxFile(filePath)
  return {
    sheets: (sheets ?? []).map((sheet) => ({
      name: sheet.sheet,
      rows: sheet.data as RawWorkbook['sheets'][number]['rows'],
    })),
  }
}

async function main(): Promise<void> {
  check(
    'V2 template: 17 kolom',
    BOOK_IMPORT_TEMPLATE.columns.length === 17,
    `count=${BOOK_IMPORT_TEMPLATE.columns.length}`
  )
  check(
    'V1 template: 6 kolom (legacy)',
    LEGACY_BOOK_IMPORT_TEMPLATE.columns.length === 6,
    `count=${LEGACY_BOOK_IMPORT_TEMPLATE.columns.length}`
  )

  const v2Keys = BOOK_IMPORT_TEMPLATE.columns.map((c) => c.key)
  const expectedNewKeys = [
    'copyCount',
    'language',
    'edition',
    'pageCount',
    'description',
    'shelfLocation',
    'initialCondition',
    'acquisitionSource',
    'acquisitionDate',
    'acquisitionCost',
    'bookCode',
  ] as const
  check(
    'V2 template: memuat 11 field baru',
    expectedNewKeys.every((k) => v2Keys.includes(k)),
    `missing=${expectedNewKeys.filter((k) => !v2Keys.includes(k)).join(',') || 'none'}`
  )

  const v1Order = LEGACY_BOOK_IMPORT_TEMPLATE.columns.map((c) => c.key)
  check(
    'V1 template: urutan kolom tetap (title, authors, publisher, year, category, isbn)',
    v1Order.join(',') === 'title,authors,publisher,year,category,isbn',
    `order=${v1Order.join(',')}`
  )

  const v2Required = BOOK_IMPORT_TEMPLATE.columns.filter((c) => c.requiredColumn).map((c) => c.key)
  check(
    'V2 template: 6 kolom WAJIB (title, authors, publisher, year, category, copyCount)',
    v2Required.join(',') === 'title,authors,publisher,year,category,copyCount',
    `required=${v2Required.join(',')}`
  )

  const wb1 = await readWorkbook(V1_PATH)
  const r1 = validationEngineService.validate(wb1)
  check('V1: parsing PASS', r1.validationResult.valid, `errors=${r1.validationResult.errors.map((e) => e.code).join(',')}`)
  check(
    'V1: 6 header data sesuai template legacy (instruction column diabaikan)',
    r1.normalizedHeaders.slice(0, 6).join(',') === 'judul,penulis,penerbit,tahun terbit,kategori,isbn',
    `headers=${r1.normalizedHeaders.join(',')}`
  )
  check('V1: 2 canonical rows (contoh data)', r1.canonicalRows.length === 2, `rows=${r1.canonicalRows.length}`)
  const v1First = r1.canonicalRows[0]
  check(
    'V1: canonical row memakai key legacy (tidak ada copyCount)',
    !!v1First && !('copyCount' in v1First.values),
    `keys=${v1First ? Object.keys(v1First.values).join(',') : 'none'}`
  )
  check(
    'V1: nilai year tersimpan (2005)',
    v1First?.values.year === 2005,
    `year=${v1First?.values.year}`
  )

  const wb2 = await readWorkbook(V2_PATH)
  const r2 = validationEngineService.validate(wb2)
  check('V2: parsing PASS', r2.validationResult.valid, `errors=${r2.validationResult.errors.map((e) => e.code).join(',')}`)
  check('V2: 2 canonical rows (contoh data)', r2.canonicalRows.length === 2, `rows=${r2.canonicalRows.length}`)
  const v2First = r2.canonicalRows[0]
  check(
    'V2: canonical row memuat 17 key',
    v2First !== undefined && Object.keys(v2First.values).length === 17,
    `count=${v2First ? Object.keys(v2First.values).length : 0}`
  )
  check(
    'V2: seluruh 11 field baru ada',
    expectedNewKeys.every((k) => v2First !== undefined && k in v2First.values),
    `missing=${expectedNewKeys.filter((k) => !(v2First && k in v2First.values)).join(',') || 'none'}`
  )
  check('V2: copyCount terisi (1)', v2First?.values.copyCount === 1, `copyCount=${v2First?.values.copyCount}`)
  check('V2: language terisi', v2First?.values.language === 'Bahasa Indonesia', `language=${v2First?.values.language}`)
  check('V2: pageCount terisi (529)', v2First?.values.pageCount === 529, `pageCount=${v2First?.values.pageCount}`)
  check(
    'V2: description terisi',
    v2First?.values.description ===
      'Kisah perjuangan anak-anak Belitung mengejar mimpi di sekolah Muhammadiyah.',
    `desc=${v2First?.values.description}`
  )
  check('V2: shelfLocation terisi', v2First?.values.shelfLocation === 'Rak A-1', `shelf=${v2First?.values.shelfLocation}`)
  check('V2: initialCondition terisi', v2First?.values.initialCondition === 'Baik', `cond=${v2First?.values.initialCondition}`)
  check(
    'V2: acquisitionSource terisi',
    v2First?.values.acquisitionSource === 'PEMBELIAN',
    `source=${v2First?.values.acquisitionSource}`
  )
  check(
    'V2: acquisitionDate bertipe Date',
    v2First?.values.acquisitionDate instanceof Date,
    `date=${v2First?.values.acquisitionDate}`
  )
  check('V2: acquisitionCost terisi (85000)', v2First?.values.acquisitionCost === 85000, `cost=${v2First?.values.acquisitionCost}`)
  check('V2: bookCode null (contoh data kosong)', v2First?.values.bookCode === null, `code=${JSON.stringify(v2First?.values.bookCode)}`)
  check('V2: isbn tetap string (regresi)', v2First?.values.isbn === '9789793062792', `isbn=${JSON.stringify(v2First?.values.isbn)}`)

  const v2Second = r2.canonicalRows[1]
  check(
    'V2 baris 2: acquisitionSource DONASI',
    v2Second?.values.acquisitionSource === 'DONASI',
    `source=${v2Second?.values.acquisitionSource}`
  )
  check(
    'V2 baris 2: acquisitionCost null (opsional kosong lolos)',
    v2Second?.values.acquisitionCost === null,
    `cost=${JSON.stringify(v2Second?.values.acquisitionCost)}`
  )

  const wbMinimal = await readWorkbook(V2_PATH)
  const requiredHeaders = BOOK_IMPORT_TEMPLATE.columns
    .filter((c) => c.requiredColumn)
    .map((c) => c.label)
  wbMinimal.sheets[0].rows = wbMinimal.sheets[0].rows.map((row) => row.slice(0, 6))
  wbMinimal.sheets[0].rows[0] = requiredHeaders
  const r3 = validationEngineService.validate(wbMinimal)
  check(
    'V2 minimal (6 kolom WAJIB saja): parsing PASS (opsional boleh kosong)',
    r3.validationResult.valid,
    `errors=${r3.validationResult.errors.map((e) => e.code).join(',')}`
  )
  check(
    'V2 minimal: canonical row memuat 17 key (opsional null)',
    r3.canonicalRows[0] !== undefined &&
      Object.keys(r3.canonicalRows[0].values).length === 17 &&
      r3.canonicalRows[0].values.isbn === null,
    `count=${r3.canonicalRows[0] ? Object.keys(r3.canonicalRows[0].values).length : 0}`
  )
  check(
    'V2 minimal: copyCount tetap terisi (1)',
    r3.canonicalRows[0]?.values.copyCount === 1,
    `copyCount=${r3.canonicalRows[0]?.values.copyCount}`
  )

  console.log(`WO11C RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
