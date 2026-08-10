import bwipjs from 'bwip-js/node'
import { normalizeBarcodeFormat } from '../../shared/config/barcode-format'

// Label buku (Opsi A) — symbology dari Setting.barcodeFormat (normalize:
// unknown/'BC-XXXXXXXXXX' lama → code128). Bila symbology yang dipilih tidak
// bisa meng-encode nilai (mis. Code39 menolak huruf kecil), fallback ke
// code128 agar label tetap ter-render.
export function generateBarcodeSvg(value: string, format?: string | null): string {
  const bcid = normalizeBarcodeFormat(format)
  const options = {
    bcid,
    text: value,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
    textsize: 9
  } as const
  try {
    return bwipjs.toSVG(options)
  } catch {
    if (bcid === 'code128') {
      throw new Error(`Barcode tidak dapat di-generate untuk nilai "${value}".`)
    }
    return bwipjs.toSVG({ ...options, bcid: 'code128' })
  }
}

// Borrow Card (D8) — QR transaksi. Payload = borrowing.id (UUID, D7).
// quiet zone via paddingwidth/paddingheight (opsi type-safe bwip-js).
export function generateQrCodeSvg(value: string): string {
  return bwipjs.toSVG({
    bcid: 'qrcode',
    text: value,
    scale: 4,
    includetext: false,
    paddingwidth: 4,
    paddingheight: 4
  })
}
