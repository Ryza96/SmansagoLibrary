import { AssetEventRepository } from '../repositories/asset-event.repository'
import { AppError } from '../errorHandler'

export class AssetEventService {
  constructor(
    private assetEventRepository: AssetEventRepository
  ) {}

  async findByBookCopyId(bookCopyId: string) {
    const events = await this.assetEventRepository.findByBookCopyId(bookCopyId)
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId,
      metadata: e.metadata ? this.tryParseJson(e.metadata) : null,
      notes: e.notes,
      occurredAt: e.occurredAt.toISOString()
    }))
  }

  private tryParseJson(value: string): Record<string, unknown> | string {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
}
