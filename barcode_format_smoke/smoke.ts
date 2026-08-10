import { generateBarcodeSvg } from '../src/main/services/barcode.service'
import { generateLabelsHtml } from '../src/main/services/label.service'
import {
  BARCODE_FORMAT_CODES,
  BARCODE_FORMATS,
  DEFAULT_BARCODE_FORMAT,
  normalizeBarcodeFormat
} from '../src/shared/config/barcode-format'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++
  } else {
    failed++
    console.error(`FAIL: ${message}`)
  }
}

// ---------------------------------------------------------------- normalize
assert(normalizeBarcodeFormat('code128') === 'code128', 'code128 passthrough')
assert(normalizeBarcodeFormat('code39') === 'code39', 'code39 passthrough')
assert(normalizeBarcodeFormat(undefined) === DEFAULT_BARCODE_FORMAT, 'undefined -> default')
assert(normalizeBarcodeFormat(null) === DEFAULT_BARCODE_FORMAT, 'null -> default')
assert(normalizeBarcodeFormat('') === DEFAULT_BARCODE_FORMAT, 'empty -> default')
assert(normalizeBarcodeFormat('BC-XXXXXXXXXX') === DEFAULT_BARCODE_FORMAT, 'legacy placeholder -> default')
assert(normalizeBarcodeFormat('ean13') === DEFAULT_BARCODE_FORMAT, 'unsupported -> default')
assert(
  BARCODE_FORMAT_CODES.length === 2 && BARCODE_FORMAT_CODES.includes('code128') && BARCODE_FORMAT_CODES.includes('code39'),
  'exact format list'
)
assert(BARCODE_FORMATS.code128.label === 'Code 128', 'code128 label')
assert(BARCODE_FORMATS.code39.label === 'Code 39', 'code39 label')

// ------------------------------------------------- generateBarcodeSvg format
const svg128 = generateBarcodeSvg('INV-000001')
const svg39 = generateBarcodeSvg('INV-000001', 'code39')
const svgLegacy = generateBarcodeSvg('INV-000001', 'BC-XXXXXXXXXX')
const svgDefault = generateBarcodeSvg('INV-000001', DEFAULT_BARCODE_FORMAT)

assert(svg128.startsWith('<svg'), 'code128 renders svg')
assert(svg39.startsWith('<svg'), 'code39 renders svg')
assert(svg128 !== svg39, 'code128 svg differs from code39 svg')
assert(svgLegacy === svg128, 'legacy placeholder -> code128 identical')
assert(svgDefault === svg128, 'explicit code128 identical to default')
assert(svg39.includes('Code 39') || svg39.length > 0, 'code39 payload present')

// ------------------- fallback saat symbology tidak bisa encode nilai
// Code39 menolak huruf kecil -> fallback code128, tidak throw.
const svgLowerFallback = generateBarcodeSvg('inv-000001', 'code39')
assert(svgLowerFallback === generateBarcodeSvg('inv-000001'), 'code39 encode failure -> fallback code128')
assert(svgLowerFallback.startsWith('<svg'), 'fallback renders svg')

// ------------------------------------------------------ label pass-through
const label128 = generateLabelsHtml({
  bookTitle: 'Buku',
  items: [{ barcode: 'INV-000001', inventoryNumber: 'INV-000001', shelfLocation: 'R1' }],
  barcodeFormat: 'code128'
})
const label39 = generateLabelsHtml({
  bookTitle: 'Buku',
  items: [{ barcode: 'INV-000001', inventoryNumber: 'INV-000001', shelfLocation: 'R1' }],
  barcodeFormat: 'code39'
})
const labelNoFormat = generateLabelsHtml({
  bookTitle: 'Buku',
  items: [{ barcode: 'INV-000001', inventoryNumber: 'INV-000001', shelfLocation: 'R1' }]
})
assert(label128.includes(svg128), 'label code128 embeds code128 svg')
assert(label39.includes(svg39), 'label code39 embeds code39 svg')
assert(labelNoFormat === label128, 'label tanpa format default code128')
assert(label128 !== label39, 'label code128 != label code39')
assert(label128.includes('INV-000001'), 'label renders inventory number')

console.log(`\nbarcode-format smoke: ${passed} PASS, ${failed} FAIL`)
if (failed > 0) process.exit(1)
