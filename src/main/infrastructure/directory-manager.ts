import fs from 'fs/promises'

export interface DirectoryStatus {
  path: string
  existedBefore: boolean
}

export interface EnsureDirectoriesResult {
  dirs: DirectoryStatus[]
  newlyCreated: string[]
  alreadyExisted: string[]
}

export class DirectoryManager {
  async ensureAll(directories: readonly string[]): Promise<EnsureDirectoriesResult> {
    const dirs: DirectoryStatus[] = []
    for (const dir of directories) {
      let existedBefore = false
      try {
        await fs.access(dir)
        existedBefore = true
      } catch {
        existedBefore = false
      }
      await fs.mkdir(dir, { recursive: true })
      dirs.push({ path: dir, existedBefore })
    }
    return {
      dirs,
      newlyCreated: dirs.filter((d) => !d.existedBefore).map((d) => d.path),
      alreadyExisted: dirs.filter((d) => d.existedBefore).map((d) => d.path),
    }
  }
}
