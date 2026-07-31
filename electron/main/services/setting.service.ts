import { SettingRepository } from '../repositories/setting.repository'

export class SettingService {
  constructor(
    private settingRepository: SettingRepository
  ) {}

  async get() {
    const settings = await this.settingRepository.get()
    if (!settings) {
      return this.settingRepository.createDefaultIfNotExists()
    }
    return settings
  }

  async update(data: Record<string, unknown>) {
    const allowedFields = [
      'libraryName', 'schoolName', 'address', 'phone', 'email', 'website', 'logoPath',
      'principalName', 'principalNip', 'librarianName', 'librarianNip',
      'defaultBorrowDays', 'maxBorrowBooks', 'lateFee', 'allowRenewal',
      'inventoryPrefix', 'defaultShelfLocation', 'barcodeFormat',
      'reportPaperSize', 'reportDateFormat', 'reportSigner'
    ]

    const filtered: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in data) {
        filtered[key] = data[key]
      }
    }

    await this.settingRepository.update(filtered)
    return this.get()
  }
}
