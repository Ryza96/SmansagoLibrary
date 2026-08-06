import { app } from 'electron'
import { createAppPaths, appDirectoryList, AppPaths } from '../../../src/main/infrastructure/paths'
import { DirectoryManager } from '../../../src/main/infrastructure/directory-manager'

export interface BootstrapDataInfrastructureResult {
  root: string
  paths: AppPaths
  newlyCreated: string[]
  alreadyExisted: string[]
}

export async function bootstrapDataInfrastructure(rootOverride?: string): Promise<BootstrapDataInfrastructureResult> {
  const root = rootOverride ?? app.getPath('userData')
  const paths = createAppPaths(root)
  const result = await new DirectoryManager().ensureAll(appDirectoryList(paths))
  return {
    root: paths.root,
    paths,
    newlyCreated: result.newlyCreated,
    alreadyExisted: result.alreadyExisted,
  }
}
