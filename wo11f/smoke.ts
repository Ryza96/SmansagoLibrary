import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readXlsxFile from 'read-excel-file/node'

const TEMPLATE_FILE_NAME = 'Template_Import_Buku_v2.0.xlsx'
const SOURCE_PATH = path.resolve('templates', TEMPLATE_FILE_NAME)

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

async function main(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo11f-'))
  const destPath = path.join(tempDir, TEMPLATE_FILE_NAME)

  check('S1: template v2 ada di repositori', fs.existsSync(SOURCE_PATH))

  fs.copyFileSync(SOURCE_PATH, destPath)
  check('S2: file berhasil disalin (simulasi save dialog)', fs.existsSync(destPath))

  const sourceBytes = fs.readFileSync(SOURCE_PATH)
  const destBytes = fs.readFileSync(destPath)
  check(
    'S3: isi identik byte-per-byte',
    sourceBytes.length === destBytes.length && sourceBytes.equals(destBytes),
    `source=${sourceBytes.length}B dest=${destBytes.length}B`
  )

  const sheets = await readXlsxFile(destPath)
  const sheet = (sheets ?? [])[0]
  const header = sheet?.data[0]
  const firstSix = header?.slice(0, 6).map((c) => String(c))
  check('S4: file dapat dibuka sebagai xlsx (1 sheet)', sheets?.length === 1, `sheets=${sheets?.length}`)
  check('S5: sheet bernama "Import Buku"', sheet?.sheet === 'Import Buku', `name=${JSON.stringify(sheet?.sheet)}`)
  check(
    'S6: header 17 kolom data + kolom petunjuk (19 sel)',
    header?.length === 19,
    `cols=${header?.length}`
  )
  check(
    'S6b: kolom 17 kosong, kolom 18 = PETUNJUK PENGGUNAAN',
    header?.[17] == null && String(header?.[18]) === 'PETUNJUK PENGGUNAAN',
    `c17=${JSON.stringify(header?.[17])} c18=${JSON.stringify(header?.[18])}`
  )
  check(
    'S7: 6 kolom wajib urutan benar',
    JSON.stringify(firstSix) === JSON.stringify(['Judul', 'Penulis', 'Penerbit', 'Tahun Terbit', 'Kategori', 'Jumlah Copy']),
    `header=${JSON.stringify(firstSix)}`
  )

  const missingSource = path.join(tempDir, 'tidak-ada.xlsx')
  const missingDest = path.join(tempDir, 'subdir-tidak-ada', TEMPLATE_FILE_NAME)
  check('S8: guard template tidak ditemukan (existsSync false)', !fs.existsSync(missingSource))
  let writeFailed = false
  try {
    fs.copyFileSync(SOURCE_PATH, missingDest)
  } catch {
    writeFailed = true
  }
  check('S9: write ke folder tidak valid melempar error', writeFailed)

  fs.rmSync(tempDir, { recursive: true, force: true })

  console.log(`WO11F RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
