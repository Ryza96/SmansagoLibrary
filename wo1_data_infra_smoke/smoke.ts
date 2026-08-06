import fs from 'fs'
import os from 'os'
import path from 'path'
import { createAppPaths, appDirectoryList, DATABASE_FILENAME, AppPaths } from '../src/main/infrastructure/paths'
import { DirectoryManager } from '../src/main/infrastructure/directory-manager'

let passed = 0
let failed = 0

function assert(condition: boolean, name: string, detail?: unknown) {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${detail !== undefined ? ` | ${JSON.stringify(detail)}` : ''}`)
  }
}

const tmpRoot = path.join(os.tmpdir(), `wo1-data-infra-${Date.now()}`)

async function main(): Promise<void> {
  // ---- Path Helper: createAppPaths (ADR-001 §3.1) ----
  {
    const root = path.join(tmpRoot, 'user')
    const p = createAppPaths(root)
    assert(path.isAbsolute(p.root) === true, '1. root di-resolve absolut', p.root)
    assert(p.databaseDir === path.join(root, 'database'), '2. databaseDir = <root>/database', p.databaseDir)
    assert(p.databaseFile === path.join(p.databaseDir, DATABASE_FILENAME), '3. databaseFile = <database>/aplibrary.db', p.databaseFile)
    assert(path.basename(p.databaseFile) === DATABASE_FILENAME, '4. nama file DB tetap aplibrary.db (tidak bergantung path)', DATABASE_FILENAME)
    assert(p.backupDir === path.join(root, 'backup'), '5. backupDir = <root>/backup', p.backupDir)
    assert(p.backupManualDir === path.join(p.backupDir, 'manual'), '6. backupManualDir = <backup>/manual', p.backupManualDir)
    assert(p.backupScheduledDir === path.join(p.backupDir, 'scheduled'), '7. backupScheduledDir = <backup>/scheduled', p.backupScheduledDir)
    assert(p.logsDir === path.join(root, 'logs'), '8. logsDir = <root>/logs', p.logsDir)
    assert(p.tempDir === path.join(root, 'temp'), '9. tempDir = <root>/temp', p.tempDir)
    assert(p.settingsDir === path.join(root, 'settings'), '10. settingsDir = <root>/settings', p.settingsDir)
    assert(p.assetsDir === path.join(root, 'assets'), '11. assetsDir = <root>/assets', p.assetsDir)
    assert(p.assetMemberPhotosDir === path.join(p.assetsDir, 'member-photos'), '12. assetMemberPhotosDir = <assets>/member-photos', p.assetMemberPhotosDir)
    assert(p.assetSchoolLogoDir === path.join(p.assetsDir, 'school-logo'), '13. assetSchoolLogoDir = <assets>/school-logo', p.assetSchoolLogoDir)
    assert(p.assetTemplatesDir === path.join(p.assetsDir, 'templates'), '14. assetTemplatesDir = <assets>/templates', p.assetTemplatesDir)
  }

  // ---- Anti-nesting: backup & DB terpisah ----
  {
    const p = createAppPaths(path.join(tmpRoot, 'user2'))
    const isInside = (child: string, parent: string) => {
      const rel = path.relative(parent, child)
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    }
    assert(isInside(p.backupDir, p.databaseDir) === false, '15. backup TIDAK di dalam databaseDir (anti-nesting)', p.backupDir)
    assert(isInside(p.databaseDir, p.backupDir) === false, '16. databaseDir TIDAK di dalam backupDir (anti-nesting)', p.databaseDir)
  }

  // ---- appDirectoryList: lengkap, unik, konsisten dengan AppPaths ----
  {
    const p = createAppPaths(path.join(tmpRoot, 'user3'))
    const list = appDirectoryList(p)
    assert(list.length === 12, '17. appDirectoryList berisi 12 entri (root + 11 subfolder)', list.length)

    const unique = new Set(list)
    assert(unique.size === list.length, '18. appDirectoryList tidak memiliki duplikat', list)

    const dirFields: (keyof AppPaths)[] = [
      'root',
      'databaseDir',
      'backupDir',
      'backupManualDir',
      'backupScheduledDir',
      'logsDir',
      'tempDir',
      'settingsDir',
      'assetsDir',
      'assetMemberPhotosDir',
      'assetSchoolLogoDir',
      'assetTemplatesDir',
    ]
    const missing = dirFields.filter((k) => !list.includes(p[k]))
    assert(missing.length === 0, '19. semua direktori di AppPaths ada di appDirectoryList', missing.map((k) => p[k]))

    const listValues = new Set(dirFields.map((k) => p[k]))
    const orphan = list.filter((v) => !listValues.has(v))
    assert(orphan.length === 0, '20. setiap entri appDirectoryList adalah direktori AppPaths', orphan)
  }

  // ---- Directory Manager: buat struktur penuh pada root baru ----
  {
    const root = path.join(tmpRoot, 'user4')
    const p = createAppPaths(root)
    const list = appDirectoryList(p)
    const result = await new DirectoryManager().ensureAll(list)

    assert(result.dirs.length === 12, '21. ensureAll memproses 12 direktori', result.dirs.length)
    assert(result.newlyCreated.length === 12, '22. run pertama: 12 direktori dibuat', result.newlyCreated.length)
    assert(result.alreadyExisted.length === 0, '23. run pertama: tidak ada yang sudah ada', result.alreadyExisted.length)

    for (const dir of list) {
      assert(fs.existsSync(dir) === true, `24. direktori tercipta: ${path.basename(dir)}`, dir)
    }
    for (const dir of list) {
      assert(fs.statSync(dir).isDirectory() === true, `25. berupa direktori (bukan file): ${path.basename(dir)}`, dir)
    }

    assert(JSON.stringify(result.dirs.map((d) => d.path)) === JSON.stringify(list), '26. urutan result sesuai urutan input', result.dirs.map((d) => d.path))
  }

  // ---- Directory Manager: idempoten (run kedua) ----
  {
    const root = path.join(tmpRoot, 'user5')
    const p = createAppPaths(root)
    const list = appDirectoryList(p)
    const manager = new DirectoryManager()
    await manager.ensureAll(list)
    const second = await manager.ensureAll(list)

    assert(second.newlyCreated.length === 0, '27. run kedua: tidak ada yang baru dibuat', second.newlyCreated.length)
    assert(second.alreadyExisted.length === 12, '28. run kedua: 12 direktori sudah ada', second.alreadyExisted.length)
    for (const dir of list) {
      assert(fs.statSync(dir).isDirectory() === true, `29. idempoten: direktori tetap ada: ${path.basename(dir)}`, dir)
    }
  }

  // ---- Directory Manager: mendeteksi folder yang sudah dibuat manual ----
  {
    const root = path.join(tmpRoot, 'user6')
    const p = createAppPaths(root)
    fs.mkdirSync(root, { recursive: true })
    fs.mkdirSync(p.logsDir)
    const result = await new DirectoryManager().ensureAll(appDirectoryList(p))

    assert(result.alreadyExisted.includes(p.logsDir) === true, '30. folder yang dibuat manual terdeteksi sebagai existing', result.alreadyExisted)
    assert(result.alreadyExisted.length === 2, '31. root + logsDir terdeteksi sudah ada pada run pertama', result.alreadyExisted)
    assert(result.newlyCreated.length === 10, '32. 10 direktori lain dibuat', result.newlyCreated.length)
  }

  // ---- Struktur final penuh sesuai ADR-001 ----
  {
    const root = path.join(tmpRoot, 'user7')
    const p = createAppPaths(root)
    await new DirectoryManager().ensureAll(appDirectoryList(p))
    const structure = fs.readdirSync(root, { withFileTypes: true }).map((e) => e.name).sort()
    const expected = ['assets', 'backup', 'database', 'logs', 'settings', 'temp']
    assert(JSON.stringify(structure) === JSON.stringify(expected), '33. struktur tingkat-1 <root> = database/backup/logs/temp/settings/assets', structure)
    assert(fs.existsSync(p.backupManualDir) && fs.existsSync(p.backupScheduledDir), '34. backup/manual & backup/scheduled tercipta', p.backupManualDir)
    const assets = fs.readdirSync(p.assetsDir, { withFileTypes: true }).map((e) => e.name).sort()
    assert(JSON.stringify(assets) === JSON.stringify(['member-photos', 'school-logo', 'templates']), '35. assets/member-photos|school-logo|templates tercipta', assets)
  }

  // ---- Kebersihan: helper tetap pure, tidak menulis sendiri ----
  {
    const p: AppPaths = createAppPaths(path.join(tmpRoot, 'user8'))
    assert(fs.existsSync(p.tempDir) === false, '36. createAppPaths murni: TIDAK membuat folder sendiri', p.tempDir)
  }
}

main()
  .then(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch {
      /* cleanup best-effort */
    }
    console.log(`\nwo1_data_infra_smoke: ${passed} passed, ${failed} failed`)
    if (failed > 0) process.exit(1)
  })
  .catch((error) => {
    console.error('smoke crashed:', error)
    process.exit(1)
  })
