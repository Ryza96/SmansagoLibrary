import bwipjs from 'bwip-js/node'

export function generateBarcodeSvg(value: string): string {
  return bwipjs.toSVG({
    bcid: 'code128',
    text: value,
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
    textsize: 9
  })
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
