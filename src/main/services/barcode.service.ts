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
