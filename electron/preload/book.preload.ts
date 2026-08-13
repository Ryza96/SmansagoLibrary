import { ipcRenderer } from 'electron'
import type { CreateBookDTO, UpdateBookDTO } from '../../src/shared/dto/book'

async function invokeClean(channel: string, ...args: unknown[]): Promise<unknown> {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const idx = raw.indexOf(': ')
    const clean = idx !== -1 ? raw.slice(idx + 2) : raw
    const marker = 'AppError: '
    const finalMsg = clean.startsWith(marker) ? clean.slice(marker.length) : clean
    throw new Error(finalMsg || raw)
  }
}

export const bookAPI = {
  books: {
    findMany: () => invokeClean('books:findMany'),
    findById: (id: string) => invokeClean('books:findById', id),
    create: (input: CreateBookDTO) => invokeClean('books:create', input),
    update: (id: string, input: UpdateBookDTO) => invokeClean('books:update', id, input),
    delete: (id: string) => invokeClean('books:delete', id),
    pickCover: () => invokeClean('books:pickCover'),
    getCoverDataUri: (id: string) => invokeClean('books:getCoverDataUri', id),
    removeCover: (id: string) => invokeClean('books:removeCover', id)
  }
}
