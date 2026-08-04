import type { Prisma } from '@prisma/client'
import type { MatchedRow, MatchCandidate } from '../../types/import'
import { AuthorRepository } from '../repositories/author.repository'
import { PublisherRepository } from '../repositories/publisher.repository'
import { CategoryRepository } from '../repositories/category.repository'

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
  constructor(
    private readonly authorRepository: AuthorRepository,
    private readonly publisherRepository: PublisherRepository,
    private readonly categoryRepository: CategoryRepository
  ) {}

  async resolveRow(row: MatchedRow, tx: Prisma.TransactionClient): Promise<void> {
    for (const field of row.matches) {
      if (field.status === 'AMBIGUOUS' || field.status === 'SKIPPED') {
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

      field.resolvedEntity = await this.resolveEntity(tx, field.field, name)
    }
  }

  private async resolveEntity(
    tx: Prisma.TransactionClient,
    field: string,
    name: string
  ): Promise<MatchCandidate | null> {
    const existing = await this.findExactWithTx(tx, field, name)
    if (existing.length > 0) {
      const first = existing[0]
      return { id: first.id, label: first.name }
    }

    try {
      const created = await this.createWithTx(tx, field, name)
      return { id: created.id, label: created.name }
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') {
        throw error
      }
      const recovered = await this.findExactWithTx(tx, field, name)
      const first = recovered[0]
      return first ? { id: first.id, label: first.name } : null
    }
  }

  private async findExactWithTx(
    tx: Prisma.TransactionClient,
    field: string,
    name: string
  ): Promise<Array<{ id: string; name: string }>> {
    if (field === 'authors') return this.authorRepository.findExactWithTx(tx, name)
    if (field === 'publisher') return this.publisherRepository.findExactWithTx(tx, name)
    if (field === 'category') return this.categoryRepository.findExactWithTx(tx, name)
    return []
  }

  private async createWithTx(
    tx: Prisma.TransactionClient,
    field: string,
    name: string
  ): Promise<{ id: string; name: string }> {
    switch (field) {
      case 'authors': {
        const author = await this.authorRepository.createWithTx(tx, { name })
        return { id: author.id, name: author.name }
      }
      case 'publisher': {
        const publisher = await this.publisherRepository.createWithTx(tx, { name })
        return { id: publisher.id, name: publisher.name }
      }
      case 'category': {
        const category = await this.categoryRepository.createWithTx(tx, { name, code: toCategoryCode(name) })
        return { id: category.id, name: category.name }
      }
      default:
        throw new Error(`AutoCreate: field "${field}" is not creatable`)
    }
  }

  private valueToString(value: unknown): string {
    if (value === null || value === undefined) return ''
    return String(value).trim()
  }
}
