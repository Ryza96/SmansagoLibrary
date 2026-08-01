export function normalizeForComparison(value: string): string {
  return value.trim().toLowerCase()
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  let previous = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const current = [i]
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[n]
}

export function levenshteinRatio(a: string, b: string): number {
  const distance = levenshtein(a, b)
  const maxLength = Math.max(a.length, b.length)
  return maxLength === 0 ? 1 : 1 - distance / maxLength
}
