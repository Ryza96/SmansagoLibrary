import { computeImportResultSummary, getImportResultMessage } from '../src/utils/bookImport'
import type { ImportCellValue, MatchedRow, MatchedWorkbook } from '../src/types/import'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function makeRow(rowNumber: number, copyCount: ImportCellValue, messageKey: string | null): MatchedRow {
  const issues = messageKey ? [{ rowNumber, messageKey }] : []
  return {
    rowNumber,
    canonicalRow: { rowNumber, values: { copyCount } },
    matches: [],
    issues,
  }
}

function makeWorkbook(rows: MatchedRow[], errors: { rowNumber: number | null; messageKey: string }[]): MatchedWorkbook {
  return {
    canonicalRows: [],
    matchedRows: rows,
    matchingResult: { valid: true, errors, warnings: [] },
  }
}

const S1 = makeWorkbook(
  [makeRow(2, 3, null), makeRow(3, 1, null), makeRow(4, 5, null)],
  []
)

const S2 = makeWorkbook(
  [makeRow(2, 3, null), makeRow(3, 1, null), makeRow(8, 2, 'bookImport.isbnDuplicate'), makeRow(11, 1, 'bookImport.entityMissing'), makeRow(14, 0, 'bookImport.copyCreateFailed')],
  [
    { rowNumber: 8, messageKey: 'bookImport.isbnDuplicate' },
    { rowNumber: 11, messageKey: 'bookImport.entityMissing' },
    { rowNumber: 14, messageKey: 'bookImport.copyCreateFailed' },
  ]
)

const S3 = makeWorkbook(
  [makeRow(2, 1, 'bookImport.createFailed'), makeRow(3, 1, 'bookImport.titleMissing')],
  [
    { rowNumber: 2, messageKey: 'bookImport.createFailed' },
    { rowNumber: 3, messageKey: 'bookImport.titleMissing' },
  ]
)

const r1 = computeImportResultSummary(S1)
check('S1: import sukses penuh — booksCreated=3', r1.booksCreated === 3, `books=${r1.booksCreated}`)
check('S1: copiesCreated=3+1+5=9', r1.copiesCreated === 9, `copies=${r1.copiesCreated}`)
check('S1: failedRows=0 → pesan "Semua data berhasil diimport."', r1.failedRows === 0, `failed=${r1.failedRows}`)

const r2 = computeImportResultSummary(S2)
check('S2: sebagian gagal — booksCreated=2', r2.booksCreated === 2, `books=${r2.booksCreated}`)
check('S2: copiesCreated=3+1=4', r2.copiesCreated === 4, `copies=${r2.copiesCreated}`)
check('S2: failedRows=3', r2.failedRows === 3, `failed=${r2.failedRows}`)
check('S2: error baris 8 → ISBN sudah digunakan.', getImportResultMessage('bookImport.isbnDuplicate') === 'ISBN sudah digunakan.', getImportResultMessage('bookImport.isbnDuplicate'))
check('S2: error baris 11 → entitas tidak ditemukan.', getImportResultMessage('bookImport.entityMissing') === 'Entitas (Penulis/Penerbit/Kategori) tidak ditemukan.', getImportResultMessage('bookImport.entityMissing'))
check('S2: error baris 14 → Jumlah Copy harus lebih dari 0.', getImportResultMessage('bookImport.copyCreateFailed') === 'Jumlah Copy harus lebih dari 0.', getImportResultMessage('bookImport.copyCreateFailed'))

const r3 = computeImportResultSummary(S3)
check('S3: gagal total — booksCreated=0', r3.booksCreated === 0, `books=${r3.booksCreated}`)
check('S3: copiesCreated=0', r3.copiesCreated === 0, `copies=${r3.copiesCreated}`)
check('S3: failedRows=2', r3.failedRows === 2, `failed=${r3.failedRows}`)
check('S3: error baris 2 → Gagal menyimpan buku.', getImportResultMessage('bookImport.createFailed') === 'Gagal menyimpan buku.', getImportResultMessage('bookImport.createFailed'))
check('S3: error baris 3 → Judul tidak boleh kosong.', getImportResultMessage('bookImport.titleMissing') === 'Judul tidak boleh kosong.', getImportResultMessage('bookImport.titleMissing'))

check('S1 tidak berubah: matchingResult.errors tetap 0', S1.matchingResult.errors.length === 0, `errors=${S1.matchingResult.errors.length}`)
check('S2 tidak berubah: matchedRows tetap 5', S2.matchedRows.length === 5, `rows=${S2.matchedRows.length}`)
check('S3 tidak berubah: error keys tetap', S3.matchingResult.errors.map((e) => e.messageKey).join(',') === 'bookImport.createFailed,bookImport.titleMissing')

console.log(`TOTAL PASS=${pass} FAIL=${fail}`)
process.exit(fail > 0 ? 1 : 0)
