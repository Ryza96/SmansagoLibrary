// WO MEMBER PHOTO — alias runtime untuk smoke (plain node).
// App memetakan '@prisma/client' -> src/generated/prisma/index.js via vite alias.
// Raw node tidak membaca alias, sehingga require('@prisma/client') jatuh ke
// node_modules/@prisma/client (client BAWAAN yang STALE — tanpa kolom photoPath).
// Preload ini meneruskan resolusi ke src/generated/prisma/index.js (client segar
// hasil `prisma generate` dengan output custom).
// Jalankan: node --require <abs>\prisma-alias.cjs ...\smoke.js
'use strict'

const Module = require('module')
const path = require('path')

const originalResolveFilename = Module._resolveFilename
const target = path.join(__dirname, '..', 'src', 'generated', 'prisma', 'index.js')

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === '@prisma/client') {
    return target
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}
