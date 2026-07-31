import { PrismaClient } from '@prisma/client'

async function main() {
  const p = new PrismaClient()
  const tables = await p.$queryRawUnsafe<{ name: string; sql: string }[]>(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations' ORDER BY name"
  )
  console.log('=== TABLES (' + tables.length + ') ===')
  for (const t of tables) {
    const cols = await p.$queryRawUnsafe<{ name: string; type: string; notnull: number; dflt: string | null; pk: number }[]>(
      'PRAGMA table_info("' + t.name + '")'
    )
    const fks = await p.$queryRawUnsafe<{ table: string; from: string; to: string }[]>(
      'PRAGMA foreign_key_list("' + t.name + '")'
    )
    const idxs = await p.$queryRawUnsafe<{ name: string; unique: number }[]>(
      'PRAGMA index_list("' + t.name + '")'
    )
    console.log('\nTABLE ' + t.name)
    console.log('  columns: ' + cols.map((c) => c.name + ':' + c.type + (c.pk ? '[PK]' : '') + (c.notnull ? ' NOTNULL' : '')).join(', '))
    console.log('  FKs: ' + (fks.length ? fks.map((f) => f.from + '->' + f.table + '(' + f.to + ')').join(', ') : '(none)'))
    console.log('  indexes: ' + (idxs.length ? idxs.map((i) => i.name + (i.unique ? '[U]' : '')).join(', ') : '(none)'))
  }
  await p.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
