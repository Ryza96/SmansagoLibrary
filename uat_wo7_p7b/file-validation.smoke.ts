import { validateImportFile, getImportErrorMessage } from '../src/utils/bookImport'
import { IMPORT_CONFIG } from '../src/config/import.config'

let pass = 0
let fail = 0

function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function makeFile(name: string, size: number): File {
  return new File([new Uint8Array(Math.max(0, size))], name)
}

async function main(): Promise<void> {
  // S1 — file valid (.xlsx, di bawah batas) -> null (lolos)
  const valid = makeFile('anggota.xlsx', 1024)
  check('S1 file valid .xlsx kecil: lolos', validateImportFile(valid) === null, `code=${validateImportFile(valid)}`)

  // S2 — extension salah -> IMP-002
  check('S2 .csv -> IMP-002', validateImportFile(makeFile('anggota.csv', 1024)) === 'IMP-002')
  check('S2 .txt -> IMP-002', validateImportFile(makeFile('anggota.txt', 1024)) === 'IMP-002')
  check('S2 tanpa extension -> IMP-002', validateImportFile(makeFile('anggota', 1024)) === 'IMP-002')

  // S3 — ukuran > maxFileSize -> IMP-003 (extension sudah benar)
  const tooBig = makeFile('anggota.xlsx', IMPORT_CONFIG.maxFileSize + 1)
  check('S3 > maxFileSize (.xlsx) -> IMP-003', validateImportFile(tooBig) === 'IMP-003', `size=${tooBig.size}`)
  const exact = makeFile('anggota.xlsx', IMPORT_CONFIG.maxFileSize)
  check('S3 ukuran tepat maxFileSize: lolos', validateImportFile(exact) === null, `size=${exact.size}`)

  // S4 — tidak ada file -> IMP-001
  check('S4 null file -> IMP-001', validateImportFile(null) === 'IMP-001')

  // S5 — pesan error non-kosong untuk tiap kode (mapping ke label)
  const msg1 = getImportErrorMessage('IMP-001')
  const msg2 = getImportErrorMessage('IMP-002')
  const msg3 = getImportErrorMessage('IMP-003')
  check('S5 pesan IMP-001 terisi', msg1.length > 0, msg1)
  check('S5 pesan IMP-002 terisi', msg2.length > 0, msg2)
  check('S5 pesan IMP-003 terisi', msg3.length > 0, msg3)

  console.log(`P7B SMOKE RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
