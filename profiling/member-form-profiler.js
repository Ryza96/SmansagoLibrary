/**
 * MemberForm Profiling Script
 *
 * Cara penggunaan:
 * 1. Jalankan `npm run dev`
 * 2. Buka halaman Tambah Anggota
 * 3. Buka DevTools (F12) → Console
 * 4. Copy-paste script ini ke console
 * 5. Hasil akan muncul di console
 */

;(function () {
  'use strict'

  const profile = {
    counters: {},
    marks: {},
    results: []
  }

  function reset() {
    profile.counters = {}
    profile.marks = {}
    profile.results = []
    // Reset module-level counters on MemberForm
    if (window.__sectionCnt) window.__sectionCnt = 0
    if (window.__cardCnt) window.__cardCnt = 0
    if (window.__srowCnt) window.__srowCnt = 0
    if (window.__rrowCnt) window.__rrowCnt = 0
  }

  function findInputs() {
    return document.querySelectorAll('input[type="text"], input[type="email"], textarea, select')
  }

  function simulateType(input, text) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set || Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set

    if (!nativeInputValueSetter) {
      input.value = text
    } else {
      nativeInputValueSetter.call(input, text)
    }
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function simulateSelect(select, value) {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  async function runScenario(name, fn) {
    console.log(`\n========== SCENARIO: ${name} ==========`)
    reset()
    performance.mark(`scenario-${name}-start`)

    // Clear existing render logs
    const originalLog = console.log
    const logs = []
    console.log = (...args) => {
      const msg = args.join(' ')
      if (msg.includes('[MemberForm]') || msg.includes('[Section]') || msg.includes('[Card]') || msg.includes('[SummaryRow]') || msg.includes('[RightRow]')) {
        logs.push(msg)
      }
      originalLog.apply(console, args)
    }

    await fn()

    await wait(500) // Wait for any pending renders

    console.log = originalLog

    performance.mark(`scenario-${name}-end`)
    performance.measure(`scenario-${name}`, `scenario-${name}-start`, `scenario-${name}-end`)

    const measure = performance.getEntriesByName(`scenario-${name}`)[0]
    const memberFormLogs = logs.filter(l => l.includes('[MemberForm]'))
    const sectionLogs = logs.filter(l => l.includes('[Section]'))
    const cardLogs = logs.filter(l => l.includes('[Card]'))

    const result = {
      name,
      durationMs: measure ? measure.duration.toFixed(2) : 'N/A',
      memberFormRenders: memberFormLogs.length,
      sectionRenders: sectionLogs.length,
      cardRenders: cardLogs.length,
      totalRenderLogs: logs.length
    }

    profile.results.push(result)

    console.log(`\n--- RESULT: ${name} ---`)
    console.log(`  Duration: ${result.durationMs}ms`)
    console.log(`  MemberForm renders: ${result.memberFormRenders}`)
    console.log(`  Section renders: ${result.sectionRenders}`)
    console.log(`  Card renders: ${result.cardRenders}`)
    console.log(`  Total component renders logged: ${result.totalRenderLogs}`)
  }

  async function runAll() {
    const inputs = findInputs()
    if (inputs.length === 0) {
      console.error('Tidak menemukan form inputs. Pastikan halaman Tambah Anggota sudah terbuka.')
      return
    }

    console.log(`Ditemukan ${inputs.length} input/select elements`)

    // Scenario 1: Page load (already loaded, just measure initial render)
    console.log('\nScenario 1: Initial page load render')
    console.log('(Catat jumlah Render #1 dari log di atas)')

    // Scenario 2: Type "Andi" in Nama field
    const namaInput = Array.from(inputs).find(i => i.placeholder?.includes('nama'))
    if (namaInput) {
      await runScenario('Type Nama "Andi"', async () => {
        simulateType(namaInput, 'A')
        await wait(50)
        simulateType(namaInput, 'An')
        await wait(50)
        simulateType(namaInput, 'And')
        await wait(50)
        simulateType(namaInput, 'Andi')
        await wait(50)
      })
    } else {
      console.log('Scenario 2 skipped: Nama input not found')
    }

    // Scenario 3: Select Tipe Anggota
    const typeSelect = Array.from(inputs).find(i => {
      const opts = i.querySelectorAll('option')
      return Array.from(opts).some(o => o.textContent === 'Siswa')
    })
    if (typeSelect) {
      await runScenario('Select Tipe Anggota = Siswa', async () => {
        simulateSelect(typeSelect, 'student')
        await wait(100)
      })
    } else {
      console.log('Scenario 3 skipped: Tipe Anggota select not found')
    }

    // Scenario 4: Type in Catatan
    const notesTextarea = Array.from(inputs).find(i => i.placeholder?.includes('catatan'))
    if (notesTextarea) {
      await runScenario('Type Catatan 10 chars', async () => {
        for (const ch of 'Catatan tes') {
          simulateType(notesTextarea, notesTextarea.value + ch)
          await wait(30)
        }
      })
    } else {
      console.log('Scenario 4 skipped: Catatan textarea not found')
    }

    // Scenario 5: Change Status dropdown
    const statusSelect = Array.from(inputs).find(i => {
      const opts = i.querySelectorAll('option')
      return Array.from(opts).some(o => o.textContent === 'Nonaktif')
    })
    if (statusSelect) {
      await runScenario('Change Status to Nonaktif', async () => {
        simulateSelect(statusSelect, 'inactive')
        await wait(100)
        simulateSelect(statusSelect, 'active')
        await wait(100)
      })
    } else {
      console.log('Scenario 5 skipped: Status select not found')
    }

    // Final report
    console.log('\n========================================')
    console.log('            PROFILING SUMMARY')
    console.log('========================================')
    console.table(profile.results)
    console.log('\nRENDER BREAKDOWN:')
    console.log('- MemberForm: renders on EVERY state change (monolithic)')
    console.log('- Section (4x): renders EVERY time MemberForm renders (no memo)')
    console.log('- Card (3x): renders EVERY time MemberForm renders (no memo)')
    console.log('- SummaryRow (7x): renders EVERY time MemberForm renders (no memo)')
    console.log('- RightRow (3x): renders EVERY time MemberForm renders (when rights visible)')
    console.log('\nTOTAL per keystroke: 1 MemberForm + 4 Section + 3 Card + 7 SummaryRow + 0-3 RightRow = ~15-18 komponen')
  }

  // Expose for console use
  window.__profileMemberForm = runAll

  console.log('=== MemberForm Profiler loaded ===')
  console.log('Run: __profileMemberForm()')
})()

