const readXlsxFile = require('read-excel-file/node')

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('usage: node reader.check.cjs <path-to-xlsx>')
    process.exit(1)
  }
  const sheets = await readXlsxFile(filePath)
  console.log('SHEETS ' + JSON.stringify(sheets))
  const okSheetShape = Array.isArray(sheets) && sheets.length === 1 && sheets[0].sheet === 'Sheet1' && Array.isArray(sheets[0].data)
  const rows = okSheetShape ? sheets[0].data : []
  const okHeaders =
    rows.length >= 1 &&
    rows[0][0] === 'Judul' &&
    rows[0][1] === 'Penulis' &&
    rows[0][2] === 'Penerbit' &&
    rows[0][3] === 'Tahun' &&
    rows[0][4] === 'Kategori' &&
    rows[0][5] === 'ISBN'
  const okData =
    rows.length === 3 &&
    rows[1][0] === 'UAT XLSX Buku A' &&
    rows[1][3] === 2020 &&
    rows[1][5] === '978-000-300-000-1' &&
    rows[2][2] === 'UAT XLSX Penerbit B'
  console.log(`${okSheetShape ? 'PASS' : 'FAIL'}  reader: returns Sheet[] {sheet,data} shape`)
  console.log(`${okHeaders ? 'PASS' : 'FAIL'}  reader: header row parsed correctly`)
  console.log(`${okData ? 'PASS' : 'FAIL'}  reader: data rows parsed correctly (title/year/isbn/publisher)`)
  if (!okSheetShape || !okHeaders || !okData) process.exit(1)
  console.log('READER RESULT: PASS')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
