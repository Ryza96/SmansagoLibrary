import { contextBridge } from 'electron'
import { appAPI } from './app.preload'
import { bookAPI } from './book.preload'
import { bookCopyAPI } from './book-copy.preload'
import { memberAPI } from './member.preload'
import { borrowAPI } from './borrow.preload'
import { authorAPI } from './author.preload'
import { publisherAPI } from './publisher.preload'
import { categoryAPI } from './category.preload'
import { printAPI } from './print.preload'
import { academicYearAPI } from './academic-year.preload'
import { curriculumAPI } from './curriculum.preload'
import { classAPI } from './class.preload'
import { inventoryAPI } from './inventory.preload'
import { assetEventAPI } from './asset-event.preload'
import { settingAPI } from './setting.preload'

const electronAPI = {
  ...appAPI,
  ...bookAPI,
  ...bookCopyAPI,
  ...memberAPI,
  ...borrowAPI,
  ...authorAPI,
  ...publisherAPI,
  ...categoryAPI,
  ...printAPI,
  ...academicYearAPI,
  ...curriculumAPI,
  ...classAPI,
  ...inventoryAPI,
  ...assetEventAPI,
  ...settingAPI
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
