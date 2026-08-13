import { prisma } from '../database'
import type { Prisma } from '@prisma/client'

type SettingData = Prisma.SettingCreateInput

const DEFAULT_SETTINGS: SettingData = {
  libraryName: 'BAM',
  schoolName: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  logoPath: '',
  principalName: '',
  principalNip: '',
  librarianName: '',
  librarianNip: '',
  defaultBorrowDays: 7,
  maxBorrowBooks: 5,
  lateFee: 1000,
  allowRenewal: true,
  inventoryPrefix: 'INV',
  defaultShelfLocation: '',
  barcodeFormat: 'BC-XXXXXXXXXX',
  reportPaperSize: 'A4',
  reportDateFormat: 'DD/MM/YYYY',
  reportSigner: '',
  borrowCardPrinter: ''
}

export class SettingRepository {
  async get() {
    return prisma.setting.findFirst()
  }

  async update(data: Partial<SettingData>) {
    const existing = await prisma.setting.findFirst()
    if (!existing) {
      throw new Error('Settings not found. Call createDefaultIfNotExists first.')
    }
    return prisma.setting.update({
      where: { id: existing.id },
      data
    })
  }

  async createDefaultIfNotExists() {
    const existing = await prisma.setting.findFirst()
    if (existing) return existing
    return prisma.setting.create({ data: DEFAULT_SETTINGS })
  }
}
