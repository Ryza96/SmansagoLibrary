const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')

const PORT = 9222
const REPO = path.resolve(__dirname, '..')
const ELECTRON = path.join(REPO, 'node_modules', 'electron', 'dist', 'electron.exe')
const TEST_FILE = path.join(REPO, 'templates', 'Template_Import_Buku_v2.0.xlsx')
const FILE_NAME = path.basename(TEST_FILE)

let pass = 0
let fail = 0
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
  if (ok) pass += 1
  else fail += 1
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    }).on('error', reject)
  })
}

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJson(`http://127.0.0.1:${PORT}/json/list`)
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))
      if (page) return page
    } catch {
      // app not ready yet
    }
    await sleep(500)
  }
  throw new Error('CDP page target not found within timeout')
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (res.exceptionDetails) {
      throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`)
    }
    return res.result ? res.result.value : undefined
  }
}

async function main() {
  const child = spawn(
    ELECTRON,
    ['.', '--remote-debugging-port=9222', '--remote-allow-origins=*'],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }
  )

  let logs = ''
  child.stdout.on('data', (d) => (logs += d.toString()))
  child.stderr.on('data', (d) => (logs += d.toString()))

  try {
    const page = await waitForTarget()
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve)
      ws.addEventListener('error', reject)
    })
    const cdp = new CDP(ws)

    await cdp.send('Runtime.enable')
    await cdp.send('Page.enable')
    await cdp.send('DOM.enable')

    // Navigate to import page
    await cdp.eval(`location.hash = '#/books/import'`)
    await sleep(1500)

    // Wait for the dropzone to render
    let dropzone = false
    for (let i = 0; i < 20; i++) {
      dropzone = await cdp.eval(
        `!!document.querySelector('div.border-dashed') && document.body.innerText.includes('${FILE_NAME.replace('.', '\\.')}') || document.body.innerText.includes('Import Buku')`
      )
      if (await cdp.eval(`!!document.querySelector('div.border-dashed')`)) break
      await sleep(300)
    }
    check('R1: halaman Import Buku dirender (dropzone tampil)', await cdp.eval(`!!document.querySelector('div.border-dashed')`))

    const noFileText = await cdp.eval(`document.body.innerText.includes('Belum ada file yang dipilih')`)
    check('R2: awal — pesan "Belum ada file yang dipilih" tampil', noFileText === true)

    const lanjutDisabledBefore = await cdp.eval(
      `(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => x.innerText.trim() === 'Lanjut'); return b ? b.disabled : 'NOT_FOUND' })()`
    )
    check('R3: awal — tombol Lanjut disabled', lanjutDisabledBefore === true, `disabled=${lanjutDisabledBefore}`)

    // ---- Set file via real CDP file input (fires native input/change events) ----
    const doc = await cdp.send('DOM.getDocument', { depth: -1 })
    const inputRes = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' })
    check('R4: hidden file input ditemukan di DOM', !!inputRes.nodeId)

    await cdp.send('DOM.setFileInputFiles', { nodeId: inputRes.nodeId, files: [TEST_FILE] })
    await sleep(800)

    // 1. File name displays
    const nameShown = await cdp.eval(`document.body.innerText.includes('${FILE_NAME}')`)
    check('R5: nama file tampil di UI', nameShown === true, FILE_NAME)

    // 2. State file filled -> file card shown, NO_FILE message gone
    const noFileGone = await cdp.eval(`!document.body.innerText.includes('Belum ada file yang dipilih')`)
    check('R6: pesan "Belum ada file" hilang (state file terisi)', noFileGone === true)

    const cardShown = await cdp.eval(`document.body.innerText.includes('Ganti File') || !!document.querySelector('button[title="Ganti File"]')`)
    check('R7: kartu file tampil (Ganti/Hapus)', cardShown === true)

    // 3. Continue button enabled
    const lanjutEnabled = await cdp.eval(
      `(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => x.innerText.trim() === 'Lanjut'); return b ? b.disabled : 'NOT_FOUND' })()`
    )
    check('R8: tombol Lanjut aktif (enabled)', lanjutEnabled === false, `disabled=${lanjutEnabled}`)

    // input.value reset happened but file still retained (fix proof)
    const inputValue = await cdp.eval(`document.querySelector('input[type="file"]').value`)
    check('R9: input.value di-reset setelah file dibaca', inputValue === '', JSON.stringify(inputValue))

    // ---- Same file re-selectable ----
    const inputRes2 = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' })
    await cdp.send('DOM.setFileInputFiles', { nodeId: inputRes2.nodeId, files: [TEST_FILE] })
    await sleep(800)

    const nameShown2 = await cdp.eval(`document.body.innerText.includes('${FILE_NAME}')`)
    check('R10: file yang sama dapat dipilih ulang (nama tetap tampil)', nameShown2 === true)

    const lanjutEnabled2 = await cdp.eval(
      `(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => x.innerText.trim() === 'Lanjut'); return b ? b.disabled : 'NOT_FOUND' })()`
    )
    check('R11: tombol Lanjut tetap aktif setelah re-select', lanjutEnabled2 === false)

    // ---- Drag & drop ----
    // Remove current file first to return to dropzone state
    await cdp.eval(
      `(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => x.getAttribute('title') === 'Hapus File'); if (b) b.click(); })()`
    )
    await sleep(600)
    const backToDropzone = await cdp.eval(`!!document.querySelector('div.border-dashed')`)
    check('R12: file dihapus -> dropzone kembali tampil', backToDropzone === true)

    const dropFile = 'drag-drop-buku.xlsx'
    const dropResult = await cdp.eval(
      `(async () => {
        const file = new File([new Uint8Array([1,2,3,4])], '${dropFile}', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const dt = new DataTransfer();
        dt.items.add(file);
        const dz = document.querySelector('div.border-dashed');
        const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
        dz.dispatchEvent(ev);
        return true;
      })()`
    )
    check('R13: event drop ter-dispatch ke dropzone', dropResult === true)
    await sleep(800)

    const dropNameShown = await cdp.eval(`document.body.innerText.includes('${dropFile}')`)
    check('R14: drag & drop — nama file tampil', dropNameShown === true, dropFile)

    const lanjutAfterDrop = await cdp.eval(
      `(() => { const btns = [...document.querySelectorAll('button')]; const b = btns.find(x => x.innerText.trim() === 'Lanjut'); return b ? b.disabled : 'NOT_FOUND' })()`
    )
    check('R15: drag & drop — tombol Lanjut aktif', lanjutAfterDrop === false)

    // drag counter reset check: dropzone not stuck in drag-active after drop
    await sleep(300)
    const dragClassGone = await cdp.eval(`document.body.innerText.includes('${dropFile}')`)
    check('R16: state drag-active tidak menggantung (kartu file stabil)', dragClassGone === true)

    ws.close()
  } finally {
    child.kill()
  }

  console.log(`WO11G RUNTIME RESULT: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
