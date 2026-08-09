// FILE MENU — dropdown kustom (renderer) menggantikan native Electron File menu.
// Sumber kebenaran SATU-satunya untuk item menu File (Backup, Restore, Cetak
// Kartu Peminjaman, Exit). Modul MURNI (tanpa React/lucide) agar bisa di-smoke
// headless (plain node). Ikon memakai string key yang di-map ke komponen lucide
// di FileMenuDropdown (icon map tidak boleh hidup di modul ini agar smoke tetap
// bebas dependency React).

import { LABELS } from '../../utils/labels'
import { ROUTES } from '../../utils/navigation'

export type FileMenuItemId = 'backup' | 'restore' | 'borrowCardPrint' | 'exit'

export type FileMenuIcon = 'database-backup' | 'database-restore' | 'printer' | 'exit'

export interface FileMenuItemConfig {
  id: FileMenuItemId
  label: string
  icon: FileMenuIcon
  route?: string
  exit?: boolean
}

export const FILE_MENU_ITEMS: readonly FileMenuItemConfig[] = [
  {
    id: 'backup',
    label: LABELS.FILE_MENU.BACKUP,
    icon: 'database-backup',
    route: ROUTES.BACKUP,
  },
  {
    id: 'restore',
    label: LABELS.FILE_MENU.RESTORE,
    icon: 'database-restore',
    route: ROUTES.RESTORE,
  },
  {
    id: 'borrowCardPrint',
    label: LABELS.FILE_MENU.CETAK_KARTU_PEMINJAMAN,
    icon: 'printer',
    route: ROUTES.BORROW_CARD_PRINT,
  },
  {
    id: 'exit',
    label: LABELS.FILE_MENU.EXIT,
    icon: 'exit',
    exit: true,
  },
]
