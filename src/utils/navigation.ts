export const ROUTES = {
  DASHBOARD: '/dashboard',
  BOOKS: '/books',
  BOOK_NEW: '/books/new',
  BOOK_IMPORT: '/books/import',
  BOOK_IMPORT_PREVIEW: '/books/import/preview',
  BOOK_DETAIL: '/books/:id',
  BOOK_EDIT: '/books/:id/edit',
  BOOK_LABEL_PREVIEW: '/books/:id/labels-preview',
  MEMBERS: '/members',
  MEMBERS_STUDENTS: '/members/students',
  MEMBERS_TEACHERS: '/members/teachers',
  MEMBERS_GENERAL: '/members/general',
  MEMBERS_NEW: '/members/new',
  MEMBER_DETAIL: '/members/:id',
  MEMBERS_EDIT: '/members/:id/edit',
  BORROWINGS: '/borrowings',
  RETURNS: '/returns',
  INVENTORY: '/inventory',
  INVENTORY_DETAIL: '/inventory/:id',
  REPORTS: '/reports',
  SETTINGS: '/settings',
  MASTER_AUTHORS: '/master/authors',
  MASTER_AUTHOR_NEW: '/master/authors/new',
  MASTER_AUTHOR_EDIT: '/master/authors/:id/edit',
  MASTER_PUBLISHERS: '/master/publishers',
  MASTER_PUBLISHER_NEW: '/master/publishers/new',
  MASTER_PUBLISHER_EDIT: '/master/publishers/:id/edit',
  MASTER_CATEGORIES: '/master/categories',
  MASTER_CATEGORY_NEW: '/master/categories/new',
  MASTER_CATEGORY_EDIT: '/master/categories/:id/edit',
} as const

export function bookDetailPath(id: string) {
  return `/books/${id}`
}

export function bookEditPath(id: string) {
  return `/books/${id}/edit`
}

export function bookLabelPreviewPath(id: string) {
  return `/books/${id}/labels-preview`
}

export function memberDetailPath(id: string) {
  return `/members/${id}`
}

export function memberEditPath(id: string) {
  return `/members/${id}/edit`
}

export function authorEditPath(id: string) {
  return `/master/authors/${id}/edit`
}

export function publisherEditPath(id: string) {
  return `/master/publishers/${id}/edit`
}

export function categoryEditPath(id: string) {
  return `/master/categories/${id}/edit`
}

export function inventoryDetailPath(id: string) {
  return `/inventory/${id}`
}
