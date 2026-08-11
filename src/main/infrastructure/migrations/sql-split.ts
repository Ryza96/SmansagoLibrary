export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    const next = sql[i + 1]

    if (inLineComment) {
      current += ch
      if (ch === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      current += ch
      if (ch === '*' && next === '/') {
        current += next
        inBlockComment = false
        i++
      }
      continue
    }

    if (inSingleQuote) {
      current += ch
      if (ch === "'") {
        if (next === "'") {
          current += next
          i++
        } else {
          inSingleQuote = false
        }
      }
      continue
    }

    if (inDoubleQuote) {
      current += ch
      if (ch === '"') {
        if (next === '"') {
          current += next
          i++
        } else {
          inDoubleQuote = false
        }
      }
      continue
    }

    if (ch === '-' && next === '-') {
      inLineComment = true
      current += ch + next
      i++
      continue
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true
      current += ch + next
      i++
      continue
    }

    if (ch === "'") {
      inSingleQuote = true
      current += ch
      continue
    }

    if (ch === '"') {
      inDoubleQuote = true
      current += ch
      continue
    }

    if (ch === ';') {
      statements.push(current.trim())
      current = ''
      continue
    }

    current += ch
  }

  if (current.trim().length > 0) {
    statements.push(current.trim())
  }

  return statements
}
