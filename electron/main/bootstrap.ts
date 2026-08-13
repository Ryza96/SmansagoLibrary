import path from 'path'
import { BookService } from './services/book.service'
import { BookRepository } from './repositories/book.repository'
import { AuthorService } from './services/author.service'
import { AuthorRepository } from './repositories/author.repository'
import { PublisherService } from './services/publisher.service'
import { PublisherRepository } from './repositories/publisher.repository'
import { CategoryService } from './services/category.service'
import { CategoryRepository } from './repositories/category.repository'
import { AssetEventRepository } from './repositories/asset-event.repository'
import { BookCopyRepository } from './repositories/book-copy.repository'
import { BookCopyService } from './services/book-copy.service'
import { InventoryAllocator } from './services/inventory-allocator'
import { PrintService } from './services/print.service'

import { MemberService } from '../../src/main/services/member.service'
import { MemberDuplicateChecker } from '../../src/main/services/member-duplicate-checker.service'
import { MemberClassResolver } from '../../src/main/services/member-class-resolver.service'
import { MemberImportService } from '../../src/main/services/member-import.service'
import { NumberGeneratorService } from '../../src/main/services/number-generator.service'
import { TeacherDuplicateChecker } from '../../src/main/services/teacher-duplicate-checker.service'
import { TeacherImportService } from '../../src/main/services/teacher-import.service'
import { MemberRepository as NewMemberRepository } from '../../src/main/repositories/member.repository'
import { BorrowService } from '../../src/main/services/borrow.service'
import { BorrowRepository } from '../../src/main/repositories/borrow.repository'
import { BorrowDetailRepository } from '../../src/main/repositories/borrow-detail.repository'
import { BookCopyService as NewBookCopyService } from '../../src/main/services/book-copy.service'
import { BookCopyRepository as NewBookCopyRepository } from '../../src/main/repositories/book-copy.repository'
import { ReturnService as NewReturnService } from '../../src/main/services/return.service'
import { InventoryService } from './services/inventory.service'
import { AssetEventService } from './services/asset-event.service'
import { SettingService } from './services/setting.service'
import { SettingRepository } from './repositories/setting.repository'
import { ResetDatabaseService } from '../../src/main/services/reset-database.service'
import { AcademicYearService } from '../../src/main/services/academic-year.service'
import { AcademicYearRepository } from '../../src/main/repositories/academic-year.repository'
import { CurriculumService } from '../../src/main/services/curriculum.service'
import { CurriculumRepository } from '../../src/main/repositories/curriculum.repository'
import { ClassService } from '../../src/main/services/class.service'
import { ClassRepository } from '../../src/main/repositories/class.repository'
import { EnrollmentService } from '../../src/main/services/enrollment.service'
import { EnrollmentRepository } from '../../src/main/repositories/enrollment.repository'
import { PromotionRunService } from '../../src/main/services/promotion-run.service'
import { PromotionRepository } from '../../src/main/repositories/promotion.repository'
import { PromotionPreviewService } from '../../src/main/services/promotion-preview.service'
import { PromotionExecuteService } from '../../src/main/services/promotion-execute.service'
import { MatchingEngineService } from '../../src/services/MatchingEngineService'
import { createProductionStrategies } from '../../src/main/strategies/index'
import { AutoCreateService } from '../../src/main/services/auto-create.service'
import { BookImportService } from '../../src/main/services/book-import.service'
import { AuthorRepository as NewAuthorRepository } from '../../src/main/repositories/author.repository'
import { PublisherRepository as NewPublisherRepository } from '../../src/main/repositories/publisher.repository'
import { CategoryRepository as NewCategoryRepository } from '../../src/main/repositories/category.repository'
import { BookRepository as NewBookRepository } from '../../src/main/repositories/book.repository'
import { DashboardService } from '../../src/main/services/dashboard.service'
import { DashboardRepository } from '../../src/main/repositories/dashboard.repository'
import { ReportService } from '../../src/main/services/report.service'
import { ReportRepository } from '../../src/main/repositories/report.repository'
import { AppPaths } from '../../src/main/infrastructure/paths'
import { ProviderRegistry, RestoreHandlerRegistry } from '../../src/main/domain/provider/provider-registry'
import { DatabaseProvider } from '../../src/main/infrastructure/providers/database.provider'
import { AssetBackupProvider } from '../../src/main/infrastructure/providers/asset.provider'
import { MemberPhotosBackupProvider } from '../../src/main/infrastructure/providers/member-photos.provider'
import { SchemaVersionReader } from '../../src/main/infrastructure/backup/schema-version.reader'
import { ManifestBuilder } from '../../src/main/infrastructure/backup/manifest-builder'
import { BackupPackager } from '../../src/main/infrastructure/backup/packager'
import { BackupVerifier } from '../../src/main/infrastructure/backup/verifier'
import { BackupService } from '../../src/main/infrastructure/backup/backup.service'
import { DatabaseRestoreHandler } from '../../src/main/infrastructure/restore/database-restore.handler'
import { AssetRestoreHandler } from '../../src/main/infrastructure/restore/asset-restore.handler'
import { MemberPhotosRestoreHandler } from '../../src/main/infrastructure/restore/member-photos-restore.handler'
import { RestoreService, createRestoreDirs } from '../../src/main/infrastructure/restore/restore.service'
import { resolveLiveDatabaseFile } from '../../src/main/infrastructure/database-path'
import { BackupUIController, RestoreUIController, BackupInspector } from '../../src/main/services/backup-ui.service'
import { AppInfoService } from '../../src/main/services/app-info.service'
import { AuthService } from '../../src/main/services/auth.service'
import { AdminRepository } from '../../src/main/repositories/admin.repository'
import { AdminSessionRepository } from '../../src/main/repositories/admin-session.repository'
import { PasswordHasher } from '../../src/main/services/password-hasher'
import { SessionManager } from '../../src/main/services/session-manager'
import { connectPrisma, disconnectPrisma } from '../../src/main/repositories/base/prisma'
import { initDatabase, closeDatabase } from './database'

export interface RestoreWiring {
  liveDatabaseFile: string
  disconnectLiveClients: () => Promise<void>
  reconnectLiveClients: () => Promise<void>
}

const defaultDisconnectLiveClients = async (): Promise<void> => {
  await disconnectPrisma().catch(() => undefined)
  await closeDatabase().catch(() => undefined)
}

const defaultReconnectLiveClients = async (): Promise<void> => {
  await connectPrisma()
  await initDatabase()
}

export interface Container {
  bookService: BookService
  authorService: AuthorService
  publisherService: PublisherService
  categoryService: CategoryService
  bookCopyService: BookCopyService
  memberService: MemberService
  memberImportService: MemberImportService
  teacherDuplicateChecker: TeacherDuplicateChecker
  teacherImportService: TeacherImportService
  borrowService: BorrowService
  printService: PrintService
  academicYearService: AcademicYearService
  curriculumService: CurriculumService
  classService: ClassService
  enrollmentService: EnrollmentService
  promotionRunService: PromotionRunService
  promotionPreviewService: PromotionPreviewService
  promotionExecuteService: PromotionExecuteService
  newBookCopyService: NewBookCopyService
  newReturnService: NewReturnService
  borrowDetailRepository: BorrowDetailRepository
  borrowRepository: BorrowRepository
  inventoryService: InventoryService
  assetEventService: AssetEventService
  settingService: SettingService
  resetDatabaseService: ResetDatabaseService
  matchingEngine: MatchingEngineService
  autoCreateService: AutoCreateService
  bookImportService: BookImportService
  dashboardService: DashboardService
  reportService: ReportService
  providerRegistry: ProviderRegistry
  restoreHandlerRegistry: RestoreHandlerRegistry
  databaseProvider: DatabaseProvider
  assetBackupProvider: AssetBackupProvider
  memberPhotosBackupProvider: MemberPhotosBackupProvider
  backupService: BackupService
  databaseRestoreHandler: DatabaseRestoreHandler
  assetRestoreHandler: AssetRestoreHandler
  memberPhotosRestoreHandler: MemberPhotosRestoreHandler
  restoreService: RestoreService
  backupUIController: BackupUIController
  restoreUIController: RestoreUIController
  backupInspector: BackupInspector
  appInfoService: AppInfoService
  authService: AuthService
}

export function createContainer(paths: AppPaths, restoreWiring?: RestoreWiring): Container {
  const bookRepository = new BookRepository()
  const assetBookCoversDir = path.join(paths.assetsDir, 'book-covers')
  const bookService = new BookService(bookRepository, assetBookCoversDir)
  const authorService = new AuthorService(new AuthorRepository(), bookRepository)
  const publisherService = new PublisherService(new PublisherRepository(), bookRepository)
  const categoryService = new CategoryService(new CategoryRepository(), bookRepository)
  const bookCopyRepository = new BookCopyRepository()
  const inventoryAllocator = new InventoryAllocator()
  const assetEventRepository = new AssetEventRepository()
  const bookCopyService = new BookCopyService(bookCopyRepository, bookRepository, inventoryAllocator, assetEventRepository)
  const newMemberRepository = new NewMemberRepository()
  const numberGeneratorService = new NumberGeneratorService(newMemberRepository)
  const enrollmentRepository = new EnrollmentRepository()
  const classRepository = new ClassRepository()
  const memberService = new MemberService(newMemberRepository, numberGeneratorService, enrollmentRepository, classRepository, paths.assetMemberPhotosDir)
  const newBookCopyRepository = new NewBookCopyRepository()
  const borrowRepository = new BorrowRepository()
  const borrowDetailRepository = new BorrowDetailRepository()
  const newBookCopyService = new NewBookCopyService(newBookCopyRepository)
  const newReturnService = new NewReturnService(borrowRepository, borrowDetailRepository, newBookCopyRepository)

  const inventoryService = new InventoryService(newBookCopyRepository)

  const assetEventService = new AssetEventService(assetEventRepository)

  const settingRepository = new SettingRepository()
  const settingService = new SettingService(settingRepository, paths.assetSchoolLogoDir)

  const resetDatabaseService = new ResetDatabaseService()

  const printService = new PrintService(borrowRepository, settingService, paths.root)

  const academicYearRepository = new AcademicYearRepository()
  const curriculumRepository = new CurriculumRepository()
  const academicYearService = new AcademicYearService(academicYearRepository, classRepository)
  const curriculumService = new CurriculumService(curriculumRepository, classRepository)
  const classService = new ClassService(classRepository, academicYearRepository, curriculumRepository, enrollmentRepository)
  const enrollmentService = new EnrollmentService(enrollmentRepository, newMemberRepository, classRepository)
  const promotionRepository = new PromotionRepository()
  const promotionRunService = new PromotionRunService(promotionRepository)
  const promotionPreviewService = new PromotionPreviewService(academicYearRepository, classRepository, enrollmentRepository)
  const promotionExecuteService = new PromotionExecuteService(
    academicYearRepository,
    classRepository,
    enrollmentRepository,
    promotionRepository,
    promotionRunService
  )
  const borrowService = new BorrowService(borrowRepository, borrowDetailRepository, newMemberRepository, newBookCopyRepository, enrollmentService)

  const memberDuplicateChecker = new MemberDuplicateChecker(newMemberRepository)
  const memberClassResolver = new MemberClassResolver(classRepository)
  const memberImportService = new MemberImportService(
    memberDuplicateChecker,
    memberClassResolver,
    numberGeneratorService,
    newMemberRepository,
    enrollmentRepository
  )

  const teacherDuplicateChecker = new TeacherDuplicateChecker(newMemberRepository)
  const teacherImportService = new TeacherImportService(
    teacherDuplicateChecker,
    numberGeneratorService,
    newMemberRepository
  )

  const matchingEngine = new MatchingEngineService(createProductionStrategies())
  const autoCreateService = new AutoCreateService(new NewAuthorRepository(), new NewPublisherRepository(), new NewCategoryRepository())
  const bookImportService = new BookImportService(new NewBookRepository(), new NewBookCopyRepository(), autoCreateService)

  const dashboardService = new DashboardService(new DashboardRepository())
  const reportService = new ReportService(new ReportRepository())

  const databaseProvider = new DatabaseProvider({ stagingDir: paths.tempDir })
  const assetBackupProvider = new AssetBackupProvider({ assetDir: assetBookCoversDir, stagingDir: paths.tempDir })
  const memberPhotosBackupProvider = new MemberPhotosBackupProvider({ assetDir: paths.assetMemberPhotosDir, stagingDir: paths.tempDir })
  const providerRegistry = new ProviderRegistry()
  providerRegistry.register(databaseProvider)
  providerRegistry.register(assetBackupProvider)
  providerRegistry.register(memberPhotosBackupProvider)
  const restoreHandlerRegistry = new RestoreHandlerRegistry()

  const backupService = new BackupService({
    providerRegistry,
    schemaVersionReader: new SchemaVersionReader(),
    manifestBuilder: new ManifestBuilder(),
    packager: new BackupPackager(),
    verifier: new BackupVerifier({ tempDir: paths.tempDir }),
    paths,
    providerStagingDirs: new Map([
      [databaseProvider.id.fullName, paths.tempDir],
      [assetBackupProvider.id.fullName, paths.tempDir],
      [memberPhotosBackupProvider.id.fullName, paths.tempDir],
    ]),
  })

  const restoreDirs = createRestoreDirs(paths.tempDir)
  const liveDatabaseFile =
    restoreWiring?.liveDatabaseFile ?? resolveLiveDatabaseFile(process.env.DATABASE_URL ?? '', paths.root)
  const databaseRestoreHandler = new DatabaseRestoreHandler({
    liveDatabaseFile,
    extractDir: restoreDirs.extractDir,
    stagingDir: restoreDirs.stagingDir,
    archiveDir: restoreDirs.archiveDir,
    snapshotDir: restoreDirs.snapshotDir,
    disconnectLiveClients: restoreWiring?.disconnectLiveClients ?? defaultDisconnectLiveClients,
    reconnectLiveClients: restoreWiring?.reconnectLiveClients ?? defaultReconnectLiveClients,
  })
  restoreHandlerRegistry.register(databaseRestoreHandler)

  const assetRestoreHandler = new AssetRestoreHandler({
    extractDir: restoreDirs.extractDir,
    stagingDir: restoreDirs.stagingDir,
    archiveDir: restoreDirs.archiveDir,
    liveDir: assetBookCoversDir,
  })
  restoreHandlerRegistry.register(assetRestoreHandler)

  const memberPhotosRestoreHandler = new MemberPhotosRestoreHandler({
    extractDir: restoreDirs.extractDir,
    stagingDir: restoreDirs.stagingDir,
    archiveDir: restoreDirs.archiveDir,
    liveDir: paths.assetMemberPhotosDir,
  })
  restoreHandlerRegistry.register(memberPhotosRestoreHandler)

  const restoreService = new RestoreService({
    verifier: new BackupVerifier({ tempDir: paths.tempDir }),
    schemaVersionReader: new SchemaVersionReader(),
    handlerRegistry: restoreHandlerRegistry,
    paths,
    liveDatabaseFile,
  })

  const backupUIController = new BackupUIController({ backupService, paths })
  const restoreUIController = new RestoreUIController({ restoreService })
  const backupInspector = new BackupInspector({
    verifier: new BackupVerifier({ tempDir: paths.tempDir }),
    tempDir: paths.tempDir,
  })

  const authService = new AuthService(new AdminRepository(), new PasswordHasher(), new SessionManager(new AdminSessionRepository()))

  const appInfoService = new AppInfoService({
    schemaVersionReader: new SchemaVersionReader(),
    liveDatabaseFile,
  })

  return {
    bookService,
    authorService,
    publisherService,
    categoryService,
    bookCopyService,
    memberService,
    memberImportService,
    teacherDuplicateChecker,
    teacherImportService,
    borrowService,
    printService,
    academicYearService,
    curriculumService,
    classService,
    enrollmentService,
    promotionRunService,
    promotionPreviewService,
    promotionExecuteService,
    newBookCopyService,
    newReturnService,
    borrowDetailRepository,
    borrowRepository,
    inventoryService,
    assetEventService,
    settingService,
    resetDatabaseService,
    matchingEngine,
    autoCreateService,
    bookImportService,
    dashboardService,
    reportService,
    providerRegistry,
    restoreHandlerRegistry,
    databaseProvider,
    assetBackupProvider,
    memberPhotosBackupProvider,
    backupService,
    databaseRestoreHandler,
    assetRestoreHandler,
    memberPhotosRestoreHandler,
    restoreService,
    backupUIController,
    restoreUIController,
    backupInspector,
    appInfoService,
    authService
  }
}
