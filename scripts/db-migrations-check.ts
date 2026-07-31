import { PrismaClient } from '@prisma/client'

async function main() {
  const p = new PrismaClient()
  const rows = await p.$queryRawUnsafe<{ migration_name: string; finished_at: string | null; rolled_back_at: string | null }[]>(
    'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at'
  )
  console.log('=== _prisma_migrations (' + rows.length + ') ===')
  for (const r of rows) {
    console.log(
      (r.finished_at ? 'applied' : 'PENDING') +
        (r.rolled_back_at ? ' ROLLED_BACK' : '') +
        '  ' + r.migration_name
    )
  }
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
