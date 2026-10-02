import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: [
      // Setara electron.vite.config.ts (main) — kode produksi memakai client hasil
      // `prisma generate` di src/generated/prisma, bukan client default di node_modules.
      // Regex anchored agar subpath (mis. @prisma/client/runtime) tidak ikut dialihkan.
      {
        find: /^@prisma\/client$/,
        replacement: path.resolve(__dirname, './src/generated/prisma/index.js'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
  },
})
