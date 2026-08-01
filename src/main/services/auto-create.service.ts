import type { MatchedWorkbook, MatchedRow, MatchingIssue, MatchCandidate } from '../../types/import'
import { AuthorRepository } from '../repositories/author.repository'
import { PublisherRepository } from '../repositories/publisher.repository'
import { CategoryRepository } from '../repositories/category.repository'

const AMBIGUOUS_MESSAGE_KEY = 'autoCreate.ambiguous'
const CREATE_FAILED_MESSAGE_KEY = 'autoCreate.createFailed'

const CREATABLE_FIELDS: ReadonlySet<string> = new Set(['authors', 'publisher', 'category'])

function toCategoryCode(name: string): string {
  const code = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return code || 'CATEGORY'
}

export class AutoCreateService {
  private readonly created = new Map<string, MatchCandidate>()

  constructor(
    private readonly authorRepository: AuthorRepository,
    private readonly publisherRepository: PublisherRepository,
    private readonly categoryRepository: CategoryRepository
  ) {}

  async apply(workbook: MatchedWorkbook): Promise<MatchedWorkbook> {
    const issues: MatchingIssue[] = []

    for (const row of workbook.matchedRows) {
      const rowIssues = await this.applyRow(row)
      row.issues.push(...rowIssues)
      issues.push(...rowIssues)
    }

    workbook.matchingResult.warnings.push(...issues)
    return workbook
  }

  private async applyRow(row: MatchedRow): Promise<MatchingIssue[]> {
    const issues: MatchingIssue[] = []

    for (const field of row.matches) {
      if (field.status === 'AMBIGUOUS') {
        field.resolvedEntity = null
        issues.push({ rowNumber: row.rowNumber, messageKey: AMBIGUOUS_MESSAGE_KEY })
        continue
      }

      if (field.status === 'SKIPPED') {
        field.resolvedEntity = null
        continue
      }

      if (field.status === 'FOUND') {
        field.resolvedEntity = field.candidates[0] ?? null
        continue
      }

      field.resolvedEntity = null
      if (!CREATABLE_FIELDS.has(field.field)) {
        continue
      }

      const name = this.valueToString(row.canonicalRow.values[field.field])
      if (!name) {
        continue
      }

      const resolved = await this.createEntity(field.field, name)
      field.resolvedEntity = resolved
      if (!resolved) {
        issues.push({ rowNumber: row.rowNumber, messageKey: CREATE_FAILED_MESSAGE_KEY })
      }
    }

    return issues
  }

  private valueToString(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  }

  private async createEntity(field: string, name: string): Promise<MatchCandidate | null> {
    const key = `${field}::${name}`
    const cached = this.created.get(key)
    if (cached) return cached

    try {
      const candidate = await this.persistEntity(field, name)
      this.created.set(key, candidate)
      return candidate
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error
      }
      const recovered = await this.recoverExisting(field, name)
      if (recovered) {
        this.created.set(key, recovered)
      }
      return recovered
    }
  }

  private async persistEntity(field: string, name: string): Promise<MatchCandidate> {
    switch (field) {
      case 'authors': {
        const author = await this.authorRepository.create({ name })
        return { id: author.id, label: author.name }
      }
      case 'publisher': {
        const publisher = await this.publisherRepository.create({ name })
        return { id: publisher.id, label: publisher.name }
      }
      case 'category': {
        const category = await this.categoryRepository.create({ name, code: toCategoryCode(name) })
        return { id: category.id, label: category.name }
      }
      default:
        throw new Error(`AutoCreate: field "${field}" is not creatable`)
    }
  }

  private async recoverExisting(field: string, name: string): Promise<MatchCandidate | null> {
    let existing: Array<{ id: string; name: string }> = []
    if (field === 'authors') existing = await this.authorRepository.findExact(name)
    else if (field === 'publisher') existing = await this.publisherRepository.findExact(name)
    else if (field === 'category') existing = await this.categoryRepository.findExact(name)
    else return null

    const first = existing[0]
    return first ? { id: first.id, label: first.name } : null
  }
}
