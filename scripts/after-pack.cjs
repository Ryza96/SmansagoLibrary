// electron-builder afterPack hook (see electron-builder.yml: afterPack)
// signAndEditExecutable is false (winCodeSign extraction needs Developer Mode
// on this machine), so rcedit is invoked manually to embed the BAM icon and
// version metadata into the packaged executable BEFORE the NSIS step runs.
// This keeps the installer + shortcuts carrying the BAM icon.
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawnSync } = require('child_process')

function findRcedit() {
  const cacheRoot = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
  if (!fs.existsSync(cacheRoot)) return null
  const walk = (dir) => {
    let found = null
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      let st
      try {
        st = fs.statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        found = walk(full)
      } else if (name === 'rcedit-x64.exe' || name === 'rcedit.exe') {
        return full
      }
      if (found) return found
    }
    return null
  }
  return walk(cacheRoot)
}

module.exports = async (context) => {
  const { appOutDir, packager } = context
  const appInfo = packager.appInfo
  const rcedit = findRcedit()
  if (!rcedit) throw new Error('[after-pack] rcedit-x64.exe not found in electron-builder winCodeSign cache')
  const exe = path.join(appOutDir, `${appInfo.productFilename}.exe`)
  if (!fs.existsSync(exe)) throw new Error(`[after-pack] packaged exe not found: ${exe}`)
  const icon = path.join(__dirname, '..', 'resources', 'icon.ico')
  if (!fs.existsSync(icon)) throw new Error(`[after-pack] icon not found: ${icon}`)

  const args = [
    exe,
    '--set-icon', icon,
    '--set-version-string', 'ProductName', 'BAM',
    '--set-version-string', 'FileDescription', 'BAM',
    '--set-version-string', 'CompanyName', 'KontenYou',
    '--set-version-string', 'ProductVersion', appInfo.version,
    '--set-version-string', 'FileVersion', appInfo.version,
    '--set-version-string', 'InternalName', 'BAM',
    '--set-version-string', 'OriginalFilename', appInfo.productFilename + '.exe',
  ]
  const res = spawnSync(rcedit, args, { encoding: 'utf8' })
  if (res.status !== 0) {
    throw new Error(`[after-pack] rcedit failed (${res.status}): ${res.stderr || res.stdout}`)
  }
  console.log(`[after-pack] BAM icon + version embedded into ${path.basename(exe)} (${fs.statSync(exe).size} bytes)`)
}
