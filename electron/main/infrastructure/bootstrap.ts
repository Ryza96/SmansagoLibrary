import { app } from 'electron'
import { createAppPaths, appDirectoryList, AppPaths } from '../../../src/main/infrastructure/paths'
import { DirectoryManager } from '../../../src/main/infrastructure/directory-manager'

export const USER_DATA_OVERRIDE_ENV = 'APPLIBRARY_USER_DATA'

export interface BootstrapDataInfrastructureResult {
  root: string
  paths: AppPaths
  newlyCreated: string[]
  alreadyExisted: string[]
}

export async function bootstrapDataInfrastructure(): Promise<BootstrapDataInfrastructureResult> {
  const root = process.env[USER_DATA_OVERRIDE_ENV] ?? app.getPath('userData')
  const paths = createAppPaths(root)
  const result = await new DirectoryManager().ensureAll(appDirectoryList(paths))
  return {
    root: paths.root,
    paths,
    newlyCreated: result.newlyCreated,
    alreadyExisted: result.alreadyExisted,
  }
}
