import { validationEngineService } from '../src/services/ValidationEngineService'
import type { RawWorkbook } from '../src/types/import'

function makeSheet(rows: Array<Array<string | number | null>>): RawWorkbook {
  return { sheets: [{ name: 'Sheet1', rows }] }
}

const HEADERS = ['Judul', 'Penulis', 'Penerbit', 'Tahun', 'Kategori', 'ISBN']

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

// S1 — Import normal (semua data valid)
{
  const wb = makeSheet([
    HEADERS,
    ['UAT Normal Buku', 'UAT Normal Penulis', 'UAT Normal Penerbit', 2020, 'UAT Normal Kategori', '978-000-200-000-1'],
  ])
  const v = validationEngineService.validate(wb)
  check('S1 normal: validation.valid', v.validationResult.valid)
  check('S1 normal: 1 canonical row', v.canonicalRows.length === 1, `rows=${v.canonicalRows.length}`)
  check(
    'S1 normal: canonical values intact',
    v.canonicalRows[0]?.values['title'] === 'UAT Normal Buku' &&
      v.canonicalRows[0]?.values['publisher'] === 'UAT Normal Penerbit'
  )
}

// S2 — Author baru (validasi tidak menolak; pembuatan diverifikasi di layer import)
// S3 — Publisher baru
// S4 — Category baru
{
  const wb = makeSheet([
    HEADERS,
    ['UAT Buku Entity', 'UAT Penulis Sangat Baru', 'UAT Penerbit Sangat Baru', 2021, 'UAT Kategori Sangat Baru', '978-000-200-000-2'],
  ])
  const v = validationEngineService.validate(wb)
  check('S2/S3/S4 (author/publisher/category baru): validation.valid', v.validationResult.valid)
  check('S2/S3/S4: 1 canonical row', v.canonicalRows.length === 1)
}

// S5 — ISBN sudah ada (validasi TIDAK punya cek duplikat ISBN -> tetap valid; duplikat ditangani layer import)
{
  const wb = makeSheet([
    HEADERS,
    ['UAT ISBN Dup', 'UAT Normal Penulis', 'UAT Normal Penerbit', 2020, 'UAT Normal Kategori', '978-000-200-000-1'],
  ])
  const v = validationEngineService.validate(wb)
  check('S5 (ISBN duplikat): validation.valid (tidak dicek di validasi)', v.validationResult.valid)
  check('S5: 1 canonical row', v.canonicalRows.length === 1)
}

// S6 — Judul kosong -> IMP-013, baris tidak valid, tidak masuk canonicalRows
{
  const wb = makeSheet([
    HEADERS,
    ['', 'UAT Normal Penulis', 'UAT Normal Penerbit', 2020, 'UAT Normal Kategori', '978-000-200-000-6'],
  ])
  const v = validationEngineService.validate(wb)
  const row = v.rowResults[0]
  check('S6 (judul kosong): validation.valid === false', v.validationResult.valid === false)
  check('S6: row invalid', row?.valid === false)
  check('S6: issue code IMP-013', row?.issues.some((i) => i.code === 'IMP-013') === true)
  check('S6: tidak masuk canonicalRows', v.canonicalRows.length === 0)
}

// S7 — Publisher kosong -> IMP-013, baris tidak valid, tidak masuk canonicalRows
{
  const wb = makeSheet([
    HEADERS,
    ['UAT Buku', 'UAT Normal Penulis', '', 2020, 'UAT Normal Kategori', '978-000-200-000-7'],
  ])
  const v = validationEngineService.validate(wb)
  const row = v.rowResults[0]
  check('S7 (publisher kosong): validation.valid === false', v.validationResult.valid === false)
  check('S7: row invalid', row?.valid === false)
  check('S7: issue code IMP-013', row?.issues.some((i) => i.code === 'IMP-013') === true)
  check('S7: tidak masuk canonicalRows', v.canonicalRows.length === 0)
}

// S8 — Header "Penerbit" (label resmi template)
{
  const wb = makeSheet([
    HEADERS,
    ['UAT Header Penerbit', 'UAT Normal Penulis', 'UAT Normal Penerbit', 2020, 'UAT Normal Kategori', '978-000-200-000-8'],
  ])
  const v = validationEngineService.validate(wb)
  check('S8 (header "Penerbit"): validation.valid', v.validationResult.valid)
  check('S8: 1 canonical row', v.canonicalRows.length === 1)
}

// S9 — Header "Publisher" (sinonim -> penerbit)
{
  const wb = makeSheet([
    ['Judul', 'Penulis', 'Publisher', 'Tahun', 'Kategori', 'ISBN'],
    ['UAT Header Publisher', 'UAT Normal Penulis', 'UAT Normal Penerbit', 2020, 'UAT Normal Kategori', '978-000-200-000-9'],
  ])
  const v = validationEngineService.validate(wb)
  check('S9 (header "Publisher"): validation.valid', v.validationResult.valid)
  check(
    'S9: normalized header publisher === penerbit',
    v.normalizedHeaders[2] === 'penerbit',
    `normalized=${JSON.stringify(v.normalizedHeaders)}`
  )
  check('S9: 1 canonical row', v.canonicalRows.length === 1)
}

// S10 — Lebih dari satu buku
{
  const wb = makeSheet([
    HEADERS,
    ['UAT Multi Buku A', 'UAT Multi Penulis A', 'UAT Multi Penerbit A', 2020, 'UAT Multi Kategori A', '978-000-200-100-1'],
    ['UAT Multi Buku B', 'UAT Multi Penulis B', 'UAT Multi Penerbit B', 2021, 'UAT Multi Kategori B', '978-000-200-100-2'],
    ['UAT Multi Buku C', 'UAT Multi Penulis A', 'UAT Multi Penerbit A', 2022, 'UAT Multi Kategori C', '978-000-200-100-3'],
  ])
  const v = validationEngineService.validate(wb)
  check('S10 (lebih dari satu buku): validation.valid', v.validationResult.valid)
  check('S10: 3 canonical rows', v.canonicalRows.length === 3, `rows=${v.canonicalRows.length}`)
}

console.log(`VALIDATION RESULT: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
