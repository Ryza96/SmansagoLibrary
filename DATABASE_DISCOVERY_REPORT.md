# Database Discovery Report — SmansagoLibrary (APLibrary)

**Source of Truth:** `prisma/schema.prisma`  
**Provider:** SQLite  
**Migrations:** 3 (init → book_domain → add_category_code_and_indexes)  
**Date:** 2026-07-29  
**Mode:** READ ONLY — no modifications made.

---

## Section 1 — Entity Inventory

### Model: `Book`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Stores bibliographic metadata for each book title in the library |
| **PK** | `id` (UUID, auto-generated) |
| **FKs** | `publisherId` → `Publisher.id` (optional, ON DELETE SET NULL), `categoryId` → `Category.id` (optional, ON DELETE SET NULL) |
| **Unique** | None enforced at schema level (ISBN is not unique in schema — duplicate ISBNs allowed) |
| **Indexes** | `title`, `isbn`, `publicationYear` |

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | String | ✅ | `uuid()` | Primary key |
| `title` | String | ✅ | — | Book title |
| `isbn` | String? | ❌ | — | ISBN-10 or ISBN-13; **not unique** |
| `publisherId` | String? | ❌ | — | FK to Publisher |
| `categoryId` | String? | ❌ | — | FK to Category |
| `publicationYear` | Int? | ❌ | — | Year of publication |
| `edition` | String? | ❌ | — | Edition info |
| `language` | String? | ❌ | — | Language code or name |
| `pageCount` | Int? | ❌ | — | Number of pages |
| `description` | String? | ❌ | — | Synopsis or description |
| `coverImage` | String? | ❌ | — | File path or URL |
| `createdAt` | DateTime | ✅ | `now()` | Audit timestamp |
| `updatedAt` | DateTime | ✅ | `@updatedAt` | Audit timestamp |

---

### Model: `Author`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Stores author names (shared across books via BookAuthor join table) |
| **PK** | `id` (UUID) |
| **FKs** | None |
| **Unique** | None (duplicate names allowed) |
| **Indexes** | `name` |

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | String | ✅ | `uuid()` | Primary key |
| `name` | String | ✅ | — | Author name |
| `createdAt` | DateTime | ✅ | `now()` | Audit timestamp |
| `updatedAt` | DateTime | ✅ | `@updatedAt` | Audit timestamp |

---

### Model: `BookAuthor`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Many-to-many join table between Book and Author |
| **PK** | Composite `(bookId, authorId)` |
| **FKs** | `bookId` → `Book.id` (ON DELETE RESTRICT), `authorId` → `Author.id` (ON DELETE RESTRICT) |
| **Unique** | Composite PK ensures no duplicate (book, author) pairs |
| **Indexes** | None (PK serves as index on both columns) |

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `bookId` | String | ✅ | — | FK to Book (part of composite PK) |
| `authorId` | String | ✅ | — | FK to Author (part of composite PK) |

---

### Model: `Publisher`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Stores publisher names |
| **PK** | `id` (UUID) |
| **FKs** | None |
| **Unique** | None (duplicate names allowed) |
| **Indexes** | `name` |

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | String | ✅ | `uuid()` | Primary key |
| `name` | String | ✅ | — | Publisher name |
| `createdAt` | DateTime | ✅ | `now()` | Audit timestamp |
| `updatedAt` | DateTime | ✅ | `@updatedAt` | Audit timestamp |

---

### Model: `Category`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Book categories/classification with a unique short code |
| **PK** | `id` (UUID) |
| **FKs** | None |
| **Unique** | `code` (unique) |
| **Indexes** | `name` |

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | String | ✅ | `uuid()` | Primary key |
| `code` | String | ✅ | — | Short unique code (e.g., "FIC", "NF") |
| `name` | String | ✅ | — | Display name |
| `description` | String? | ❌ | — | Optional description |
| `createdAt` | DateTime | ✅ | `now()` | Audit timestamp |
| `updatedAt` | DateTime | ✅ | `@updatedAt` | Audit timestamp |

---

### Model: `BookCopy`

| Aspect | Detail |
|--------|--------|
| **Purpose** | Individual physical copy of a book. Central to inventory and future borrowing transactions |
| **PK** | `id` (UUID) |
| **FKs** | `bookId` → `Book.id` (required, ON DELETE RESTRICT) |
| **Unique** | `inventoryNumber` (unique), `barcode` (optional, unique) |
| **Indexes** | `status` |

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `id` | String | ✅ | `uuid()` | Primary key |
| `bookId` | String | ✅ | — | FK to Book |
| `inventoryNumber` | String | ✅ | — | Format: `BK-000001` (6-digit, prefix BK-), permanent & never reused |
| `barcode` | String? | ❌ | — | Optional scanned barcode |
| `status` | String | ✅ | `"AVAILABLE"` | One of: AVAILABLE, BORROWED, RESERVED, LOST, DAMAGED, REPAIR, WITHDRAWN |
| `acquisitionDate` | DateTime? | ❌ | — | Date copy was acquired |
| `acquisitionPrice` | Float? | ❌ | — | Purchase price |
| `notes` | String? | ❌ | — | Misc notes |
| `createdAt` | DateTime | ✅ | `now()` | Audit timestamp |
| `updatedAt` | DateTime | ✅ | `@updatedAt` | Audit timestamp |

---

## Section 2 — Relationship Analysis

### Entity Relationship Diagram (Text Form)

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│  Author  │       │  BookAuthor  │       │   Book   │
│──────────│       │──────────────│       │──────────│
│ id (PK)  │──1──┐│ bookId (PK)  │┌──M──│ id (PK)  │
│ name     │     └│ authorId(PK) ││     │ title    │
└──────────┘      └──────────────┘│     │ isbn     │
                                  │     │ pubYear  │
┌──────────┐       ┌──────────────┐     │ edition  │
│Publisher │       │    Book      │     │ language │
│──────────│       │──────────────│     │ pageCount│
│ id (PK)  │──1──┐│ publisherId   │     │ desc     │
│ name     │     └│ (FK,optional) │     └────┬─────┘
└──────────┘      └──────────────┘           │
                                              │1
┌──────────┐       ┌──────────────┐           │
│ Category │       │    Book      │           │
│──────────│       │──────────────│           │
│ id (PK)  │──1──┐│ categoryId   │           │
│ code (U) │     └│ (FK,optional)│           │
│ name     │      └──────────────┘           │
│ desc     │                                  │
└──────────┘                                  │
                                              │M
                                    ┌─────────┴──────┐
                                    │   BookCopy     │
                                    │────────────────│
                                    │ id (PK)        │
                                    │ bookId (FK)    │
                                    │ inventory# (U) │
                                    │ barcode (U)    │
                                    │ status         │
                                    └────────────────┘
```

### Relationship Matrix

| From | To | Type | FK Field | Required? | Delete Rule | Update Rule |
|------|----|------|----------|-----------|-------------|-------------|
| **Book** | Publisher | Many-to-One | `publisherId` | Optional | `SET NULL` | `CASCADE` |
| **Book** | Category | Many-to-One | `categoryId` | Optional | `SET NULL` | `CASCADE` |
| **Book** | BookAuthor | One-to-Many | (via BookAuthor.bookId) | Required | `RESTRICT` | `CASCADE` |
| **Book** | BookCopy | One-to-Many | `bookId` | Required | `RESTRICT` | `CASCADE` |
| **Author** | BookAuthor | One-to-Many | (via BookAuthor.authorId) | Required | `RESTRICT` | `CASCADE` |
| **BookAuthor** | Book | Many-to-One | `bookId` | Required | `RESTRICT` | `CASCADE` |
| **BookAuthor** | Author | Many-to-One | `authorId` | Required | `RESTRICT` | `CASCADE` |
| **Publisher** | Book | One-to-Many | (via Book.publisherId) | Optional | — | — |
| **Category** | Book | One-to-Many | (via Book.categoryId) | Optional | — | — |
| **BookCopy** | Book | Many-to-One | `bookId` | Required | `RESTRICT` | `CASCADE` |

### Relationship Summary

| Type | Present? | Examples |
|------|----------|---------|
| **One-to-One** | ❌ None | — |
| **One-to-Many** | ✅ | Publisher → Books, Category → Books, Book → BookCopies, Book → BookAuthors, Author → BookAuthors |
| **Many-to-Many** | ✅ | Book ⟷ Author (resolved via BookAuthor join table) |
| **Self-referencing** | ❌ None | — |

### Delete Rule Analysis

| Rule | Used On | Implication |
|------|---------|-------------|
| **RESTRICT** | BookAuthor (both FKs), BookCopy (bookId FK) | Prevents deletion of a Book if BookAuthors or BookCopies exist. **Application must manually delete child records first.** |
| **SET NULL** | Book → publisherId, Book → categoryId | Deleting a Publisher or Category sets the reference to NULL on related Books (safe, lossless metadata) |
| **CASCADE** | All FK update rules | Updating a PK cascades to all FKs (UUIDs don't change, so this is effectively moot) |

**Critical Finding:** `BookCopy.bookId` uses `ON DELETE RESTRICT`, but the application's `BookService.deleteBook()` only deletes `BookAuthor` records before deleting the Book — it does **not** delete `BookCopy` records. Attempting to delete a Book that has any BookCopies will **fail with a foreign key constraint error at the database level**.

---

## Section 3 — Constraint Analysis

### Primary Keys

| Model | PK Type | Fields |
|-------|---------|--------|
| Book | Single | `id` |
| Author | Single | `id` |
| BookAuthor | **Composite** | `(bookId, authorId)` |
| Publisher | Single | `id` |
| Category | Single | `id` |
| BookCopy | Single | `id` |

### Unique Constraints

| Model | Field(s) | Purpose |
|-------|----------|---------|
| Category | `code` | Each category code must be unique (e.g., only one "FIC") |
| BookCopy | `inventoryNumber` | Inventory numbers are permanent and never reused |
| BookCopy | `barcode` | Barcodes (if assigned) must be unique |

### Missing Unique Constraints

| Model | Field(s) | Risk |
|-------|----------|------|
| **Book** | `isbn` | ISBN is **not unique**. Multiple books can have the same ISBN (e.g., same title, different editions). This is by design, but the application enforces ISBN uniqueness at the service layer (`BookService.createBook`). If a different path bypasses the service, duplicates can occur. |
| **Author** | `name` | Author names are not unique. The application enforces uniqueness at the service layer via `existsByName`. |
| **Publisher** | `name` | Publisher names are not unique. The application enforces uniqueness at the service layer via `existsByName`. |

**Risk:** Uniqueness enforced at the application layer, not the database layer. Concurrent requests could bypass uniqueness checks. SQLite's default isolation level (SERIALIZABLE in WAL mode) mitigates this but does not eliminate it entirely.

### Foreign Key Constraints

| FK | Source | Target | On Delete | On Update |
|----|--------|--------|-----------|-----------|
| `Book_publisherId_fkey` | Book.publisherId | Publisher.id | `SET NULL` | `CASCADE` |
| `Book_categoryId_fkey` | Book.categoryId | Category.id | `SET NULL` | `CASCADE` |
| `BookAuthor_bookId_fkey` | BookAuthor.bookId | Book.id | `RESTRICT` | `CASCADE` |
| `BookAuthor_authorId_fkey` | BookAuthor.authorId | Author.id | `RESTRICT` | `CASCADE` |
| `BookCopy_bookId_fkey` | BookCopy.bookId | Book.id | `RESTRICT` | `CASCADE` |

### Constraint Risk Summary

| Risk | Severity | Detail |
|------|----------|--------|
| ISBN uniqueness at app layer only | **Medium** | Service layer check is not backed by DB constraint. Race condition possible. |
| Book deletion fails if BookCopies exist | **High** | `RESTRICT` on `BookCopy_bookId_fkey` prevents deletion. Application code does not handle this. |
| Name uniqueness at app layer only | **Low** | Author, Publisher names enforced by service only. Lower risk (less critical than ISBN). |

---

## Section 4 — Book Model Review

### Completeness Checklist

| Feature | Status | Notes |
|---------|--------|-------|
| Bibliographic metadata | ✅ | Title, ISBN, edition, language, page count, description, cover image |
| ISBN support | ✅ | `isbn` field exists (optional, String). Accepts both ISBN-10 and ISBN-13. Not unique at DB level. |
| Publisher relationship | ✅ | FK to Publisher (optional). Library may have books without known publisher. |
| Category relationship | ✅ | FK to Category (optional). |
| Authors (single) | ✅ | Single author via BookAuthor join (many-to-many supports single author too) |
| Authors (multiple) | ✅ | Many-to-many via BookAuthor join table |
| Publication year | ✅ | `publicationYear` as Int |
| Edition | ✅ | `edition` as String (supports "1st", "Revised", etc.) |
| Physical description | ✅ | `pageCount` |
| Language | ✅ | `language` as String (no controlled vocabulary) |
| Cover image | ✅ | `coverImage` as String (path/URL) |
| Description | ✅ | `description` as Text equivalent |

### Issues

| Issue | Detail |
|-------|--------|
| **ISBN not unique** | Service layer prevents duplicates, but no DB constraint. Two books could get same ISBN if race condition occurs. |
| **Language not normalized** | `language` is a free-text String. No lookup table or enum. Could lead to inconsistencies ("English", "english", "ENG"). |
| **No series/volume** | No field for book series name or volume number. |
| **No subjects/tags** | Categories are hierarchical but flat. No tagging or subject heading support. |
| **No page count validation** | `pageCount` is optional Int. No constraint ensuring positive values. |

### Assessment

The Book model covers essential bibliographic metadata adequately for a school library. Missing features (series, subjects, normalized language) are non-critical for MVP but should be considered for the future.

---

## Section 5 — BookCopy Review

### Field-by-Field Analysis

| Field | Assessment |
|-------|------------|
| `id` | UUID primary key — standard |
| `bookId` | FK to Book (required, RESTRICT) — **Problem:** prevents Book deletion when copies exist |
| `inventoryNumber` | `String @unique`, format `BK-000001`. **Permanent, never reused.** ✅ Correct design |
| `barcode` | `String? @unique`. Optional barcode. ✅ Allows unique scan-based identification |
| `status` | `String @default("AVAILABLE")`. Controlled by application code (7 states). Indexed. |
| `acquisitionDate` | `DateTime?`. Tracks when copy was acquired. |
| `acquisitionPrice` | `Float?`. Purchase price. |
| `notes` | `String?`. Misc notes. |
| `createdAt` / `updatedAt` | Audit timestamps. |

### BookCopyStatus Values (from application)

| Status | Meaning | Borrowable? |
|--------|---------|-------------|
| `AVAILABLE` | Ready to borrow | ✅ Yes |
| `BORROWED` | Currently on loan | ❌ No |
| `RESERVED` | Reserved for a member | ❌ No |
| `LOST` | Reported lost | ❌ No (may incur fine) |
| `DAMAGED` | Damaged | ❌ No |
| `REPAIR` | Under repair | ❌ No |
| `WITHDRAWN` | Removed from circulation | ❌ No |

### Readiness for Borrowing Transactions

| Requirement | Status | Notes |
|-------------|--------|-------|
| Unique copy identification | ✅ | `inventoryNumber` unique, `barcode` optional unique |
| Availability status | ✅ | `status` field with 7 states |
| Borrowable copies filtering | ⚠️ Partial | Status can filter AVAILABLE copies, but no query-level optimization |
| Borrowing history | ❌ Missing | No relation to future Borrowing/BorrowingItem model |
| Current borrower tracking | ❌ Missing | No `currentBorrowerId` or link to future Member |
| Due date tracking | ❌ Missing | No `dueDate` field (belongs in BorrowingItem, not BookCopy) |
| Fine calculation basis | ❌ Missing | No late return tracking mechanism |
| Reservation linking | ❌ Missing | No FK to future Reservation model |

### Issues

| Issue | Severity | Detail |
|-------|----------|--------|
| `status` is a String, not an enum | **Low** | SQLite doesn't support enums, but Prisma could use an enum. String allows invalid values. |
| No location/shelf field | **Low** | No `shelfLocation` field for physical retrieval |
| No condition rating | **Low** | No field for physical condition (beyond status) |
| No last-inventory date | **Low** | No field for stock-opname tracking |

### Assessment

BookCopy is **partially ready** for borrowing transactions. It can identify, track status, and filter copies. However, it **lacks all borrowing-domain relationships** (current borrower, due dates, borrowing history). The model provides the **physical inventory foundation** but the borrowing transaction schema must be built on top.

---

## Section 6 — Normalization Analysis

### Normal Form Checklist

| Normal Form | Status | Analysis |
|-------------|--------|----------|
| **1NF (Atomic values)** | ✅ | All fields contain atomic values. No arrays or JSON blobs. |
| **2NF (Full functional dependency)** | ✅ | All non-key fields depend on the entire PK. BookAuthor composite PK ensures proper 2NF. |
| **3NF (No transitive dependencies)** | ✅ | Publisher name depends on Publisher.id, not on Book. Properly separated. |
| **BCNF** | ✅ | All determinants are candidate keys. BookAuthor's composite PK ensures this. |

### Redundancy Check

| Check | Result |
|-------|--------|
| Duplicate fields across tables | **None** — Each piece of data lives in exactly one table. |
| Derived/computed fields | **None** — No fields that can be computed from other fields (e.g., no `age`, no `totalCopies`). |
| Stored counts or sums | **None** — Copy count is computed at query time via `_count`. |

### Schema Evaluation

The schema is in **BCNF (Boyce-Codd Normal Form)**. There is no:
- Redundancy
- Duplicated data
- Derived fields
- Partial dependencies
- Transitive dependencies

---

## Section 7 — Future Readiness

### Domain Readiness Matrix

#### 1. Member
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | No `Member` model exists |
| **Required fields** | — | Would need: `id`, `memberNumber`, `name`, `email`, `phone`, `address`, `joinDate`, `status` |
| **Risk** | **High** | New model, new migration, no existing data impact |

#### 2. Borrowing (Loan Header)
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | No `Borrowing` model exists |
| **Required fields** | — | Would need: `id`, `memberId`, `borrowDate`, `dueDate`, `returnDate?`, `status`, `notes` |
| **FKs needed** | — | `memberId → Member.id` |
| **Risk** | **High** | New model, but can reference existing BookCopy |

#### 3. BorrowingItem (Individual Items)
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | No `BorrowingItem` model |
| **Required fields** | — | Would need: `id`, `borrowingId`, `bookCopyId`, `dueDate`, `returnDate?`, `fineAmount?`, `notes` |
| **FKs needed** | — | `borrowingId → Borrowing.id`, `bookCopyId → BookCopy.id` |
| **Risk** | **Medium** | BookCopy already has correct PK; FK integration is straightforward |

#### 4. Return
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | Could be handled as Borrowing.returnDate + BorrowingItem.returnDate |
| **Risk** | **Low** | Can be absorbed into existing Borrowing/BorrowingItem models |

#### 5. Fine
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | No `Fine` model |
| **Required fields** | — | Would need: `id`, `borrowingItemId`, `memberId`, `amount`, `reason`, `paid`, `paidDate` |
| **Risk** | **Low-Medium** | New model referencing BorrowingItem and Member |

#### 6. Reservation
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | No `Reservation` model |
| **Required fields** | — | Would need: `id`, `bookCopyId`, `memberId`, `reserveDate`, `expiryDate`, `status`, `notes` |
| **FKs needed** | — | `bookCopyId → BookCopy.id`, `memberId → Member.id` |
| **Risk** | **Medium** | BookCopy already has RESERVED status; schema integration is clean |

#### 7. Inventory Audit
| Aspect | Readiness | Notes |
|--------|-----------|-------|
| **Schema exists?** | ❌ No | No inventory audit model |
| **Required fields** | — | Would need: `id`, `bookCopyId`, `expectedStatus`, `actualStatus`, `auditDate`, `auditor`, `notes` |
| **Risk** | **Low** | Standalone model, no existing schema impact |

### Existing Schema Advantages for Future Domains

| Feature | Benefit |
|---------|---------|
| `BookCopy` uses UUID PK | Easy to reference from BorrowingItem, Reservation |
| `BookCopy.status` supports AVAILABLE/BORROWED/RESERVED | Status transitions map directly to borrowing lifecycle |
| `BookCopy.inventoryNumber` is unique & permanent | Reliable identifier for physical tracking |
| `BookCopy.barcode` is optional unique | Supports barcode scanning without requiring it |
| All models use UUID PKs | No sequential ID collisions; safe for concurrent inserts |

### Critical Gap

The **BookCopy → Book FK uses ON DELETE RESTRICT** but the application's `deleteBook()` does **not** cascade to BookCopies. When borrowing is implemented and BookCopies have borrowing history, this RESTRICT will actually be the **correct behavior** (you should never delete a Book that has ever had copies borrowed). But for the current state, it's a functional bug.

---

## Section 8 — Migration Risk

### Adding Future Models

| New Model | Risk | Rationale |
|-----------|------|-----------|
| **Member** | **🟢 Low** | New table, no impact on existing schema. Simple `CREATE TABLE`. |
| **Borrowing** | **🟢 Low** | New table, no impact on existing schema. |
| **BorrowingItem** | **🟡 Medium** | New table, FK to `BookCopy.id`. Must ensure BookCopy cannot be deleted while referenced. Currently RESTRICT already prevents deletion, so this is **compatible**. |
| **Fine** | **🟢 Low** | New table referencing Member and BorrowingItem. No schema conflicts. |
| **Reservation** | **🟢 Low** | New table referencing `BookCopy.id` and `Member.id`. BookCopy status already has `RESERVED`. |
| **InventoryAudit** | **🟢 Low** | New table, no impact on existing schema. |

### Altering Existing Models

| Change | Risk | Notes |
|--------|------|-------|
| Add `Member` model | **🟢 Low** | No existing data migration. |
| Add FK from BookCopy to BorrowingItem | **🟡 Medium** | Would need to ensure existing BookCopies can have null FK (backfill). |
| Add `isbn` unique constraint to Book | **🟡 Medium** | Existing data may have duplicate ISBNs. Must deduplicate first. |
| Add `name` unique constraint to Author | **🟡 Medium** | Existing data may have duplicate names. Service already enforces this, so likely safe. |
| Add `name` unique constraint to Publisher | **🟡 Medium** | Same as Author. |
| Change `BookCopy.status` from String to enum | **🔴 High** | Would require data migration of all existing status strings. But Prisma enum vs String is a type-level change; SQLite stores as TEXT either way. |

### Overall Migration Risk

| Category | Risk Level |
|----------|------------|
| Adding new tables (Member, Borrowing, etc.) | **Low** — No existing data conflicts |
| Adding FKs from new tables to existing tables | **Low-Medium** — Existing data compatible |
| Adding unique constraints to existing columns | **Medium** — Requires data quality check first |
| Changing column types on existing tables | **High** — Requires data migration |

**Overall Assessment:** The current schema is **well-designed for extension**. All new borrowing-domain models can be added as new tables without modifying existing tables. No schema refactoring is required to support the full library transaction system.

---

## Section 9 — Database Score

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Schema Design** | **80/100** | Clean 6-table schema in BCNF. Proper use of UUIDs, audit timestamps, unique constraints. Deductions: ISBN not unique at DB level (enforced only in service), `status` as String instead of enum. |
| **Normalization** | **95/100** | Fully normalized to BCNF. No redundancy, no derived fields, no partial dependencies. Only minor deduction: language field is free-text (could be a lookup table). |
| **Scalability** | **70/100** | SQLite is single-writer — adequate for school library scale (<100 concurrent users). UUIDs are good for distributed scenarios. Indexes on searchable fields. No performance issues expected at small scale. |
| **Future Readiness** | **65/100** | Schema can accommodate new tables without refactoring. BookCopy model is borrowing-ready. But Member, Borrowing, and all transaction models are completely absent. 7 new domains require schema additions. |
| **Maintainability** | **85/100** | Simple, clear schema. 3 migrations with clean history. No dead columns or deprecated fields. Easy to understand and modify. |

### Overall: **79/100** — Good.

The schema is **well-normalized, clean, and correct** for the current book-inventory domain. It provides a solid foundation for adding borrowing transactions. The main risks are:
1. ISBN uniqueness enforced at application layer only (not DB)
2. `ON DELETE RESTRICT` on `BookCopy_bookId_fkey` is incompatible with current delete logic
3. No Member, Borrowing, or transaction models exist yet
