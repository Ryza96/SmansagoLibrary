import path from 'path'

export const DATABASE_FILENAME = 'aplibrary.db'

export interface AppPaths {
  root: string
  databaseDir: string
  databaseFile: string
  backupDir: string
  backupManualDir: string
  backupScheduledDir: string
  logsDir: string
  tempDir: string
  settingsDir: string
  assetsDir: string
  assetMemberPhotosDir: string
  assetSchoolLogoDir: string
  assetTemplatesDir: string
}

function sub(root: string, ...parts: string[]): string {
  return path.join(root, ...parts)
}

export function createAppPaths(root: string): AppPaths {
  const resolvedRoot = path.resolve(root)
  return {
    root: resolvedRoot,
    databaseDir: sub(resolvedRoot, 'database'),
    databaseFile: sub(resolvedRoot, 'database', DATABASE_FILENAME),
    backupDir: sub(resolvedRoot, 'backup'),
    backupManualDir: sub(resolvedRoot, 'backup', 'manual'),
    backupScheduledDir: sub(resolvedRoot, 'backup', 'scheduled'),
    logsDir: sub(resolvedRoot, 'logs'),
    tempDir: sub(resolvedRoot, 'temp'),
    settingsDir: sub(resolvedRoot, 'settings'),
    assetsDir: sub(resolvedRoot, 'assets'),
    assetMemberPhotosDir: sub(resolvedRoot, 'assets', 'member-photos'),
    assetSchoolLogoDir: sub(resolvedRoot, 'assets', 'school-logo'),
    assetTemplatesDir: sub(resolvedRoot, 'assets', 'templates'),
  }
}

export function appDirectoryList(paths: AppPaths): string[] {
  return [
    paths.root,
    paths.databaseDir,
    paths.backupDir,
    paths.backupManualDir,
    paths.backupScheduledDir,
    paths.logsDir,
    paths.tempDir,
    paths.settingsDir,
    paths.assetsDir,
    paths.assetMemberPhotosDir,
    paths.assetSchoolLogoDir,
    paths.assetTemplatesDir,
  ]
}
