# Architecture Discovery Report — SmansagoLibrary (APLibrary)

**Project:** APLibrary v0.1.0  
**Stack:** Electron 33 + React 18 + TypeScript + Prisma 5 + SQLite  
**Date:** 2026-07-29  
**Mode:** READ ONLY — no modifications made.

---

## Section 1 — Project Structure

```
APLibrary/
├── .env                          # DATABASE_URL (SQLite path)
├── electron-builder.yml          # NSIS installer config
├── electron.vite.config.ts       # Vite config (main/preload/renderer)
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # Root config (references only)
├── tsconfig.node.json            # TS config for main + preload + shared
├── tsconfig.web.json             # TS config for renderer + shared
├── tailwind.config.js
├── postcss.config.js
│
├── prisma/
│   ├── schema.prisma             # 6 models: Book, Author, BookAuthor,
│   │                             #   Publisher, Category, BookCopy
│   ├── aplibrary.db              # SQLite database file
│   └── migrations/               # 3 migrations
│
├── scripts/
│   ├── dev-setup.ps1             # One-command dev setup
│   └── run.ps1                   # npm run dev wrapper
│
├── src/
│   ├── main/                     # Electron Main Process
│   │   ├── index.ts              #   Entry: window creation, IPC handler registration
│   │   ├── database.ts           #   Prisma client singleton
│   │   ├── repositories/         #   Data access layer (5 repos)
│   │   ├── services/             #   Business logic layer (5 services)
│   │   └── shared/               #   Main-only utilities (errors, enums, string utils)
│   │
│   ├── preload/
│   │   └── index.ts              # contextBridge: exposes electronAPI to renderer
│   │
│   ├── renderer/                 # Electron Renderer Process (React UI)
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx          #   React entry point
│   │       ├── App.tsx           #   Root component
│   │       ├── env.d.ts          #   ElectronAPI type declarations
│   │       ├── assets/styles.css #   Tailwind directives
│   │       ├── components/       #   UI components (books/, layout/, master/)
│   │       ├── config/           #   Navigation/route constants
│   │       ├── constants/        #   App constants, UI labels
│   │       ├── pages/            #   Page components (11 + 6 master pages)
│   │       ├── routes/           #   React Router (createHashRouter)
│   │       └── types/dtos/       #   Re-exports of shared DTOs
│   │
│   └── shared/
│       └── dto/                  # Canonical DTO interfaces
│           ├── book.ts           #   Book domain (5 interfaces)
│           └── master.ts         #   Master data (13 interfaces)
│
└── resources/                    # Build resources (icons, DLLs) — empty
```

### Folder Functions

| Folder | Function |
|--------|----------|
| `src/main/` | Electron main process: app lifecycle, window management, IPC handlers, services, repositories |
| `src/preload/` | Bridge between renderer and main via `contextBridge` (secure IPC exposure) |
| `src/renderer/` | React UI: pages, components, routing, DTO types |
| `src/shared/` | DTO interfaces shared by both main and renderer processes |
| `prisma/` | Database schema, SQLite file, migration history |
| `scripts/` | PowerShell automation for dev setup and running |

---

## Section 2 — Layer Analysis

### Architecture Stack

```
Renderer (React)
    ↓  IPC (invoke/handle)
Preload (contextBridge)
    ↓  IPC (invoke/handle)
Main Process: IPC Handlers (src/main/index.ts)
    ↓
Service Layer (src/main/services/)
    ↓
Repository Layer (src/main/repositories/)
    ↓
Prisma ORM (src/main/database.ts)
    ↓
SQLite (prisma/aplibrary.db)
```

### Layer Compliance

| Check | Result |
|-------|--------|
| Renderer → Repository directly | **PASS** — No direct repository access from renderer |
| Renderer → Prisma directly | **PASS** — All DB access goes through IPC |
| Renderer → SQLite directly | **PASS** — SQLite is isolated in main process |
| Service → UI/Renderer | **PASS** — Services return data only, no UI interaction |
| Repository → IPC | **PASS** — Repositories only call Prisma |
| Repository → Service | **PASS** — No upward dependency |

### Violations Found

| Severity | Violation | Location |
|----------|-----------|----------|
| **Medium** | `(window as any).electronAPI` bypasses type-safe `Window.electronAPI` | All 10 renderer pages/components that access the API use `as any` instead of the typed `window.electronAPI` |
| **Medium** | `getById()` returns raw Prisma objects instead of DTOs | `src/main/services/author.service.ts:23`, `publisher.service.ts:23`, `category.service.ts:25` — `createdAt`/`updatedAt` are `Date` objects instead of ISO strings |
| **Low** | Service imports `BookRepository` for referential integrity checks | `AuthorService`, `CategoryService`, `PublisherService` — cross-repository dependency is acceptable but increases coupling |
| **Low** | `BookCopyService` uses `Prisma.BookCopyCreateInput` type instead of a DTO | `src/main/services/book-copy.service.ts:2` — couples service layer to ORM types |

---

## Section 3 — Dependency Graph

### Main Dependencies

```
IPC Handlers (src/main/index.ts)
  ├── BookService ──────────► BookRepository ──────────► Prisma
  ├── AuthorService ────────► AuthorRepository ─────────► Prisma
  │                         └► BookRepository
  ├── PublisherService ─────► PublisherRepository ──────► Prisma
  │                         └► BookRepository
  ├── CategoryService ──────► CategoryRepository ───────► Prisma
  │                         └► BookRepository
  └── (system: db:ping, app:info, window:*) ───────────► Prisma / Electron API
```

### Circular Dependency Check

| Check | Result |
|-------|--------|
| Circular between services | **NONE** — Services only depend downward on repositories |
| Circular between repositories | **NONE** — Repositories only depend on Prisma singleton |
| Circular between services ↔ repositories | **NONE** — Unidirectional: Service → Repository |
| Circular across layers | **NONE** — Strict unidirectional flow |

### Dependency Injection Pattern

Services use constructor-based DI:
- `new BookService(bookRepository)` — single repo
- `new AuthorService(authorRepository, bookRepository)` — two repos
- `new PublisherService(publisherRepository, bookRepository)` — two repos
- `new CategoryService(categoryRepository, bookRepository)` — two repos

All wired manually in `src/main/index.ts:13-17` (no DI container).

---

## Section 4 — IPC Analysis

### Channel Inventory (25 channels)

| Domain | Channels |
|--------|----------|
| **System** | `db:ping`, `app:info` |
| **Window** | `window:minimize`, `window:maximize`, `window:close` |
| **Books** | `books:findMany`, `books:findById`, `books:create`, `books:update`, `books:delete` |
| **Authors** | `authors:findMany`, `authors:findById`, `authors:create`, `authors:update`, `authors:delete` |
| **Publishers** | `publishers:findMany`, `publishers:findById`, `publishers:create`, `publishers:update`, `publishers:delete` |
| **Categories** | `categories:findMany`, `categories:findById`, `categories:create`, `categories:update`, `categories:delete` |

### Findings

| Check | Result |
|-------|--------|
| **Duplicate channels** | **NONE** — All 25 channel names are unique |
| **Unused handlers** | **NONE** — Every handler is consumed by at least one renderer component |
| **Naming consistency** | **PASS** — All channels follow `domain:action` pattern (lowercase, colon-separated) |
| **Missing channels** | No IPC channels exist for book copies, members, borrowings, returns, inventory, or reports (these are unimplemented) |
| **Handler organization** | **⚠️ All 25 handlers in a single function** `registerIpcHandlers()` in `src/main/index.ts:47-163`. Not modularized. |

### Issues

| Issue | Detail |
|-------|--------|
| `input: any` in handlers | All create/update handlers accept `input: any` instead of typed DTOs — no compile-time validation across IPC boundary |
| `query?: any` in handlers | `findMany` handlers for authors/publishers/categories accept `query?: any` |
| `books:findMany` inconsistency | Unlike master data `findMany`, `books:findMany` does not accept search/filter params — search is done client-side |

---

## Section 5 — Service Analysis

### BookService (`src/main/services/book.service.ts`)

| Aspect | Detail |
|--------|--------|
| **Responsibilities** | Full book lifecycle: list, detail, create (ISBN validation), update (partial + ISBN check), delete with cascade |
| **Methods** | `getAllBooks()`, `getBookById(id)`, `createBook(input)`, `updateBook(id, input)`, `deleteBook(id)` |
| **Business Logic** | ISBN uniqueness validation, DTO mapping with relation extraction, partial update assembly, existence gating |
| **Dependencies** | `BookRepository` |

### AuthorService (`src/main/services/author.service.ts`)

| Aspect | Detail |
|--------|--------|
| **Responsibilities** | Author CRUD with duplicate name prevention, referential integrity guard on delete |
| **Methods** | `getAll(query?)`, `getById(id)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | Name normalization, duplicate name detection, referential integrity check (via `BookRepository.existsByAuthorId`) |
| **Dependencies** | `AuthorRepository`, `BookRepository`, `normalizeName`, `DuplicateResourceError`, `ResourceInUseError` |

### PublisherService (`src/main/services/publisher.service.ts`)

| Aspect | Detail |
|--------|--------|
| **Responsibilities** | Publisher CRUD with duplicate name prevention, referential integrity guard on delete |
| **Methods** | `getAll(query?)`, `getById(id)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | Same pattern as AuthorService (normalize → check duplicate → CRUD → check referential integrity on delete) |
| **Dependencies** | `PublisherRepository`, `BookRepository`, `normalizeName`, error classes |

### CategoryService (`src/main/services/category.service.ts`)

| Aspect | Detail |
|--------|--------|
| **Responsibilities** | Category CRUD with dual uniqueness (code + name), referential integrity guard on delete |
| **Methods** | `getAll(query?)`, `getById(id)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | Code trim + name normalization → check unique code + unique name → CRUD → check referential integrity on delete |
| **Dependencies** | `CategoryRepository`, `BookRepository`, `normalizeName`, error classes |

### BookCopyService (`src/main/services/book-copy.service.ts`)

| Aspect | Detail |
|--------|--------|
| **Responsibilities** | Book copy CRUD with status validation, lookup by inventory number and barcode |
| **Methods** | `getAll()`, `getById(id)`, `getByInventoryNumber(n)`, `getByBarcode(b)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | Status value validation, all other methods are pass-through to repository |
| **Dependencies** | `BookCopyRepository`, `Prisma` types, `BookCopyStatus` constant |

### Assessment

**All business logic is in the Service layer.** No business logic leaks into repositories or UI. However, three services (Author, Publisher, Category) follow an identical pattern suggesting a reusable abstraction opportunity.

---

## Section 6 — Repository Analysis

### BookRepository (`src/main/repositories/book.repository.ts`)

| Aspect | Detail |
|--------|--------|
| **Methods** | `findMany()`, `findManyWithCount()`, `findById(id)`, `findByIdWithDetails(id)`, `createWithAuthors(input)`, `replaceAuthors(bookId, authorIds)`, `updateBook(id, data)`, `deleteWithAuthors(id)`, `existsByIsbn(isbn, excludeId?)`, `findByIsbn(isbn, excludeId?)`, `existsByAuthorId(authorId)`, `existsByPublisherId(publisherId)`, `existsByCategoryId(categoryId)` |
| **Business Logic** | **None** — All methods are pure Prisma queries. Transactional coordination (`replaceAuthors`, `deleteWithAuthors`) is data integrity, not business logic. |

### AuthorRepository (`src/main/repositories/author.repository.ts`)

| Aspect | Detail |
|--------|--------|
| **Methods** | `findMany(query?)`, `findById(id)`, `existsByName(name, excludeId?)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | **None** — Conditional WHERE building for search, raw SQL for case-insensitive name check |

### PublisherRepository (`src/main/repositories/publisher.repository.ts`)

| Aspect | Detail |
|--------|--------|
| **Methods** | `findMany(query?)`, `findById(id)`, `existsByName(name, excludeId?)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | **None** — Identical pattern to AuthorRepository |

### CategoryRepository (`src/main/repositories/category.repository.ts`)

| Aspect | Detail |
|--------|--------|
| **Methods** | `findMany(query?)`, `findById(id)`, `existsByName(name, excludeId?)`, `existsByCode(code, excludeId?)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | **None** — Same pattern plus code existence check |

### BookCopyRepository (`src/main/repositories/book-copy.repository.ts`)

| Aspect | Detail |
|--------|--------|
| **Methods** | `findMany()`, `findById(id)`, `findByInventoryNumber(n)`, `findByBarcode(b)`, `create(data)`, `update(id, data)`, `delete(id)` |
| **Business Logic** | **None** — Pure CRUD with three finder methods |

### Assessment

All 5 repositories are **clean data-access layers**. No business logic detected. They only:
- Build Prisma queries (with optional WHERE clauses)
- Execute CRUD operations
- Perform existence checks
- Manage transactional coordination (book repository only)

---

## Section 7 — Shared DTO Analysis

### Source of Truth

| File | Interfaces |
|------|------------|
| `src/shared/dto/master.ts` | 13 interfaces: `BaseQueryDTO`, `FindAuthorsQueryDTO`, `FindPublishersQueryDTO`, `FindCategoriesQueryDTO`, `AuthorDTO`, `CreateAuthorDTO`, `UpdateAuthorDTO`, `PublisherDTO`, `CreatePublisherDTO`, `UpdatePublisherDTO`, `CategoryDTO`, `CreateCategoryDTO`, `UpdateCategoryDTO` |
| `src/shared/dto/book.ts` | 5 interfaces: `BookListItemDTO`, `BookDetailDTO`, `CreateBookDTO`, `UpdateBookDTO`, `SelectOption` |

### Renderer Re-exports

| File | Content |
|------|---------|
| `src/renderer/src/types/dtos/master.ts` | Re-exports all 13 master DTOs via `export type { ... } from '../../../../shared/dto/master'` |
| `src/renderer/src/types/dtos/book.ts` | Re-exports all 5 book DTOs |

### Findings

| Issue | Severity | Detail |
|-------|----------|--------|
| `CreateBookRepoInput` duplicates `CreateBookDTO` | **Medium** | `src/main/repositories/book.repository.ts:4-15` defines identical shape to `CreateBookDTO`. Will silently diverge. |
| IPC handlers use `any` instead of DTO types | **High** | `src/main/index.ts` and `src/preload/index.ts` use `input: any` / `query?: any` for all create/update/findMany handlers |
| `getById()` returns raw Prisma objects | **Medium** | Author/Publisher/Category service `getById` returns `Date` fields instead of ISO strings |
| `BookCopyStatus` not shared to renderer | **Low** | Defined in `src/main/shared/book-copy-status.ts` but not exported to renderer; `BookDetail.tsx` uses raw string literals for status |
| No `BookCopyDTO` exists | **Low** | Copy data is inlined in `BookDetailDTO.copies` as anonymous `{ id, inventoryNumber, status }` |
| No DTOs for Member, Borrowing, Return, Inventory, Report | **Info** | These domains are not yet implemented |

---

## Section 8 — Routing Analysis

### Router Configuration

```typescript
createHashRouter([
  { path: '/', element: <AppLayout />, children: [
    { index: true, element: <Navigate to="/dashboard" replace /> },
    { path: 'dashboard',          element: <DashboardPage /> },
    { path: 'books',              element: <BooksPage /> },
    { path: 'books/new',          element: <BookFormPage /> },
    { path: 'books/:id',          element: <BookDetailPage /> },
    { path: 'books/:id/edit',     element: <BookFormPage /> },
    { path: 'members',            element: <MembersPage /> },
    { path: 'borrowings',         element: <BorrowingsPage /> },
    { path: 'returns',            element: <ReturnsPage /> },
    { path: 'inventory',          element: <InventoryPage /> },
    { path: 'reports',            element: <ReportsPage /> },
    { path: 'settings',           element: <SettingsPage /> },
    { path: 'master/authors',     element: <AuthorListPage /> },
    { path: 'master/authors/new',  element: <AuthorFormPage /> },
    { path: 'master/authors/:id/edit', element: <AuthorFormPage /> },
    { path: 'master/publishers',  element: <PublisherListPage /> },
    { path: 'master/publishers/new', element: <PublisherFormPage /> },
    { path: 'master/publishers/:id/edit', element: <PublisherFormPage /> },
    { path: 'master/categories',  element: <CategoryListPage /> },
    { path: 'master/categories/new', element: <CategoryFormPage /> },
    { path: 'master/categories/:id/edit', element: <CategoryFormPage /> },
  ]}
])
```

### Route Constants

All paths also defined in `src/renderer/src/config/navigation.ts` as `ROUTES` constants with helper functions for dynamic paths (`bookDetailPath(id)`, `authorEditPath(id)`, etc.).

### Assessment

| Check | Result |
|-------|--------|
| Hash-based routing | ✅ Correct for Electron (`createHashRouter`) |
| Route constant reuse | ✅ `ROUTES` object used consistently |
| Dynamic path helpers | ✅ Helper functions for parameterized routes |
| Naming consistency | ✅ All paths use kebab-case |
| Extensibility | ✅ Easy to add new routes under the `children` array |
| Lazy loading | ❌ All pages eagerly imported — could use `React.lazy()` for large apps |

---

## Section 9 — Reusable Component Analysis

### Component Inventory

| Component | File | Reusability |
|-----------|------|-------------|
| **MasterTable** | `src/renderer/src/components/master/MasterTable.tsx` | **✅ TRULY REUSABLE** — Generic `<T>` typing, configurable columns via `Column<T>[]`, all callbacks as props. Used by 3 pages. |
| **AppLayout** | `src/renderer/src/components/layout/AppLayout.tsx` | ✅ App shell — reusable as layout wrapper |
| **TopBar** | `src/renderer/src/components/layout/TopBar.tsx` | ⚠️ Partially — Electron API coupling via `(window as any).electronAPI` |
| **Sidebar** | `src/renderer/src/components/layout/Sidebar.tsx` | ❌ Tightly coupled — hardcoded menu items and routes |
| **StatusBar** | `src/renderer/src/components/layout/StatusBar.tsx` | ⚠️ Partially — Electron API coupling |
| **BookForm** | `src/renderer/src/components/books/BookForm.tsx` | ❌ Domain-specific — coupled to `BookDetailDTO` |
| **BookTable** | `src/renderer/src/components/books/BookTable.tsx` | ❌ Domain-specific — hardcoded columns for `BookListItemDTO` |
| **BookDetail** | `src/renderer/src/components/books/BookDetail.tsx` | ❌ Domain-specific — coupled to `BookDetailDTO` |
| **AuthorForm** | `src/renderer/src/components/master/AuthorForm.tsx` | ⚠️ Near-duplicate of PublisherForm |
| **PublisherForm** | `src/renderer/src/components/master/PublisherForm.tsx` | ⚠️ Near-duplicate of AuthorForm |
| **CategoryForm** | `src/renderer/src/components/master/CategoryForm.tsx` | ⚠️ Domain-specific but follows same pattern |

### Duplication

`AuthorForm` and `PublisherForm` are structurally identical (single name field form). They differ only in error messages and label references. They should be unified into a single `NameForm` component.

---

## Section 10 — Technical Debt

### Type Safety Debt

| Category | Count | Locations |
|----------|-------|-----------|
| `any` type usage | **31** | `src/preload/index.ts` (11), `src/main/index.ts` (11), renderer pages (9) |
| `as any` type assertions | **14** | `book.service.ts` (1), `book-copy.service.ts` (2), renderer pages (11) |
| `(window as any).electronAPI` | **10** | All pages/components that access the API bypass the typed `Window.electronAPI` |

### Code Quality Debt

| Category | Count | Detail |
|----------|-------|--------|
| Misused `useMemo` (should be `useEffect`) | **3** | `AuthorListPage.tsx:31`, `PublisherListPage.tsx:31`, `CategoryListPage.tsx:31` — debounce implementation uses `useMemo` for side effects (cleanup function never invoked) |
| Silent catch blocks | **3** | `AuthorForm.tsx:25`, `PublisherForm.tsx:25`, `CategoryForm.tsx:30` — catch blocks only call `setSubmitting(false)` without error handling |
| Non-null assertion (`!`) | **1** | `book.service.ts:64` — `(await this.getBookById(book.id))!` assumes result is non-null |
| Unused `_event` parameters | **17** | All IPC handlers in `src/main/index.ts` |

### Missing Implementation Debt

| Category | Count | Detail |
|----------|-------|--------|
| Placeholder pages | **7** | Dashboard, Members, Borrowings, Returns, Inventory, Reports, Settings — all show "under development" |
| Missing DTOs | **5** | No DTOs for BookCopy, Member, Borrowing, Return, Inventory domains |
| Missing IPC channels | **5** | No IPC for book copies, members, borrowings, returns, inventory |

### Structural Debt

| Issue | Detail |
|-------|--------|
| Monolithic IPC handler registration | All 25 handlers in a single `registerIpcHandlers()` function |
| AuthorForm/PublisherForm duplication | Near-identical components, should be unified |
| Inline `CreateBookRepoInput` | Duplicates `CreateBookDTO` shape in repository layer |
| `getById()` returns raw Prisma objects | Author/Publisher/Category services bypass DTO transformation |

---

## Section 11 — Architecture Risk

### High

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No type safety across IPC boundary** | `any` types in preload and main handlers allow silent contract violations at runtime | Replace `any` with shared DTO types in all IPC handler/preload signatures |
| **Misused `useMemo` for side effects** | Debounce in 3 master list pages is non-functional; search triggers may fire incorrectly | Replace `useMemo` with `useEffect` + `setTimeout` pattern |
| **7 placeholder pages** | Core features (members, borrowings, returns, inventory) are unimplemented | Complete implementation before production |

### Medium

| Risk | Impact | Mitigation |
|------|--------|------------|
| **`(window as any).electronAPI`** | Renderer bypasses `env.d.ts` type declarations, losing compile-time checking | Use typed `window.electronAPI` |
| **`getById()` returns raw Prisma objects** | Date serialization may fail across IPC; inconsistent with rest of API | Apply DTO transformation in all `getById` methods |
| **Duplicate type `CreateBookRepoInput`** | Silently diverges from `CreateBookDTO` | Remove `CreateBookRepoInput`, use `CreateBookDTO` directly |
| **Monolithic IPC handler file** | As app grows, `src/main/index.ts` becomes unmaintainable | Split handlers into domain-specific modules |

### Low

| Risk | Impact | Mitigation |
|------|--------|------------|
| **BookCopyStatus not shared to renderer** | Raw string literals used for status comparison | Export `BookCopyStatus` to `src/shared/` for cross-process use |
| **No DI container** | Manual wiring in `index.ts` works but doesn't scale | Consider a lightweight DI approach |
| **No lazy loading** | All routes eagerly imported | Use `React.lazy()` for better startup performance |
| **Silent catch blocks** | Errors silently swallowed in forms | Add error logging/user notification |
| **Non-null assertion** | Potential runtime crash if `getBookById` returns null after create | Handle null case properly |

---

## Section 12 — Overall Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Architecture** | **75/100** | Clean 4-layer separation (Renderer → IPC → Service → Repository → Prisma). No circular dependencies. But IPC typing is unsafe and some boundary violations exist. |
| **Maintainability** | **70/100** | Good modular structure with clear concerns. Reduced by monolithic IPC handler file, duplicated components (AuthorForm/PublisherForm), and misused `useMemo`. |
| **Scalability** | **60/100** | Architecture supports growth, but 7/14 pages are unimplemented placeholders. No lazy loading. Manual DI wiring will become unwieldy. No caching strategy. |
| **Layer Separation** | **85/100** | Strong separation of concerns. Services own all business logic. Repositories are pure data access. The main weakness is unsafe typing at the IPC boundary. |
| **Reusability** | **55/100** | `MasterTable` is a standout reusable component. But most domain components are tightly coupled. AuthorForm/PublisherForm are near-duplicates. No component library pattern established. |

### Overall: **69/100** — Fair. Solid foundation with clear architecture patterns, but significant technical debt in type safety, placeholder pages, and implementation inconsistencies that must be resolved before production.
