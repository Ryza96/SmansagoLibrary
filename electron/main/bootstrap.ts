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
import { NumberGeneratorService } from '../../src/main/services/number-generator.service'
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
import { AcademicYearService } from '../../src/main/services/academic-year.service'
import { AcademicYearRepository } from '../../src/main/repositories/academic-year.repository'
import { CurriculumService } from '../../src/main/services/curriculum.service'
import { CurriculumRepository } from '../../src/main/repositories/curriculum.repository'
import { ClassService } from '../../src/main/services/class.service'
import { ClassRepository } from '../../src/main/repositories/class.repository'

export interface Container {
  bookService: BookService
  authorService: AuthorService
  publisherService: PublisherService
  categoryService: CategoryService
  bookCopyService: BookCopyService
  memberService: MemberService
  borrowService: BorrowService
  printService: PrintService
  academicYearService: AcademicYearService
  curriculumService: CurriculumService
  classService: ClassService
  newBookCopyService: NewBookCopyService
  newReturnService: NewReturnService
  borrowDetailRepository: BorrowDetailRepository
  borrowRepository: BorrowRepository
  inventoryService: InventoryService
  assetEventService: AssetEventService
  settingService: SettingService
}

export function createContainer(): Container {
  const bookRepository = new BookRepository()
  const bookService = new BookService(bookRepository)
  const authorService = new AuthorService(new AuthorRepository(), bookRepository)
  const publisherService = new PublisherService(new PublisherRepository(), bookRepository)
  const categoryService = new CategoryService(new CategoryRepository(), bookRepository)
  const bookCopyRepository = new BookCopyRepository()
  const inventoryAllocator = new InventoryAllocator()
  const assetEventRepository = new AssetEventRepository()
  const bookCopyService = new BookCopyService(bookCopyRepository, bookRepository, inventoryAllocator, assetEventRepository)
  const newMemberRepository = new NewMemberRepository()
  const numberGeneratorService = new NumberGeneratorService(newMemberRepository)
  const memberService = new MemberService(newMemberRepository, numberGeneratorService)
  const newBookCopyRepository = new NewBookCopyRepository()
  const borrowRepository = new BorrowRepository()
  const borrowDetailRepository = new BorrowDetailRepository()
  const borrowService = new BorrowService(borrowRepository, borrowDetailRepository, newMemberRepository, newBookCopyRepository)
  const newBookCopyService = new NewBookCopyService(newBookCopyRepository)
  const newReturnService = new NewReturnService(borrowRepository, borrowDetailRepository, newBookCopyRepository)

  const inventoryService = new InventoryService(newBookCopyRepository)

  const assetEventService = new AssetEventService(assetEventRepository)

  const settingRepository = new SettingRepository()
  const settingService = new SettingService(settingRepository)

  const printService = new PrintService(borrowRepository, settingService)

  const academicYearRepository = new AcademicYearRepository()
  const curriculumRepository = new CurriculumRepository()
  const classRepository = new ClassRepository()
  const academicYearService = new AcademicYearService(academicYearRepository, classRepository)
  const curriculumService = new CurriculumService(curriculumRepository, classRepository)
  const classService = new ClassService(classRepository, academicYearRepository, curriculumRepository, newMemberRepository)

  return {
    bookService,
    authorService,
    publisherService,
    categoryService,
    bookCopyService,
    memberService,
    borrowService,
    printService,
    academicYearService,
    curriculumService,
    classService,
    newBookCopyService,
    newReturnService,
    borrowDetailRepository,
    borrowRepository,
    inventoryService,
    assetEventService,
    settingService
  }
}
