import { BrowserWindow } from 'electron'
import type { BookService } from '../main/services/book.service'
import type { AuthorService } from '../main/services/author.service'
import type { PublisherService } from '../main/services/publisher.service'
import type { CategoryService } from '../main/services/category.service'
import type { BookCopyService as LegacyBookCopyService } from '../main/services/book-copy.service'
import type { BookCopyService } from '../../src/main/services/book-copy.service'
import type { MemberService } from '../../src/main/services/member.service'
import type { MemberImportService } from '../../src/main/services/member-import.service'
import type { BorrowService } from '../../src/main/services/borrow.service'
import type { ReturnService as NewReturnService } from '../../src/main/services/return.service'
import type { PrintService } from '../main/services/print.service'
import type { BorrowDetailRepository } from '../../src/main/repositories/borrow-detail.repository'
import type { BorrowRepository } from '../../src/main/repositories/borrow.repository'
import type { AcademicYearService } from '../../src/main/services/academic-year.service'
import type { CurriculumService } from '../../src/main/services/curriculum.service'
import type { ClassService } from '../../src/main/services/class.service'
import type { EnrollmentService } from '../../src/main/services/enrollment.service'
import type { PromotionRunService } from '../../src/main/services/promotion-run.service'
import type { PromotionPreviewService } from '../../src/main/services/promotion-preview.service'
import type { PromotionExecuteService } from '../../src/main/services/promotion-execute.service'
import type { InventoryService } from '../main/services/inventory.service'
import type { AssetEventService } from '../main/services/asset-event.service'
import type { SettingService } from '../main/services/setting.service'
import type { MatchingEngineService } from '../../src/services/MatchingEngineService'
import type { BookImportService } from '../../src/main/services/book-import.service'
import { registerAppHandlers } from './app.ipc'
import { registerBookImportHandlers } from './book-import.ipc'
import { registerBookHandlers } from './book.ipc'
import { registerBookCopyHandlers } from './book-copy.ipc'
import { registerMemberHandlers } from './member.ipc'
import { registerBorrowHandlers } from './borrow.ipc'
import { registerAuthorHandlers } from './author.ipc'
import { registerPublisherHandlers } from './publisher.ipc'
import { registerCategoryHandlers } from './category.ipc'
import { registerPrintHandlers } from './print.ipc'
import { registerAcademicYearHandlers } from './academic-year.ipc'
import { registerCurriculumHandlers } from './curriculum.ipc'
import { registerClassHandlers } from './class.ipc'
import { registerEnrollmentHandlers } from './enrollment.ipc'
import { registerPromotionHandlers } from './promotion.ipc'
import { registerInventoryHandlers } from './inventory.ipc'
import { registerAssetEventHandlers } from './asset-event.ipc'
import { registerSettingHandlers } from './setting.ipc'

export function registerAllHandlers(
  services: {
    bookService: BookService
    authorService: AuthorService
    publisherService: PublisherService
    categoryService: CategoryService
    bookCopyService: LegacyBookCopyService
    memberService: MemberService
    memberImportService: MemberImportService
    borrowService: BorrowService
    printService: PrintService
    academicYearService: AcademicYearService
    curriculumService: CurriculumService
    classService: ClassService
    enrollmentService: EnrollmentService
    promotionRunService: PromotionRunService
    promotionPreviewService: PromotionPreviewService
    promotionExecuteService: PromotionExecuteService
    newBookCopyService: BookCopyService
    newReturnService: NewReturnService
    borrowDetailRepository: BorrowDetailRepository
    borrowRepository: BorrowRepository
    inventoryService: InventoryService
    assetEventService: AssetEventService
    settingService: SettingService
    matchingEngine: MatchingEngineService
    bookImportService: BookImportService
  },
  mainWindow: () => BrowserWindow | null
): void {
  registerAppHandlers(mainWindow)
  registerBookImportHandlers(services.matchingEngine, services.bookImportService)
  registerBookHandlers(services.bookService)
  registerBookCopyHandlers(services.bookCopyService, services.newBookCopyService)
  registerMemberHandlers(services.memberService, services.memberImportService)
  registerBorrowHandlers(services.borrowService, services.newReturnService, services.borrowDetailRepository, services.borrowRepository)
  registerAuthorHandlers(services.authorService)
  registerPublisherHandlers(services.publisherService)
  registerCategoryHandlers(services.categoryService)
  registerPrintHandlers(services.printService)
  registerAcademicYearHandlers(services.academicYearService)
  registerCurriculumHandlers(services.curriculumService)
  registerClassHandlers(services.classService)
  registerEnrollmentHandlers(services.enrollmentService)
  registerPromotionHandlers({
    runService: services.promotionRunService,
    previewService: services.promotionPreviewService,
    executeService: services.promotionExecuteService
  })
  registerInventoryHandlers(services.inventoryService)
  registerAssetEventHandlers(services.assetEventService)
  registerSettingHandlers(services.settingService)
}
