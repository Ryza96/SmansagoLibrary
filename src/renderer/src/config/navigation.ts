export const ROUTES = {
  DASHBOARD: '/dashboard',
  BOOKS: '/books',
  BOOK_NEW: '/books/new',
  BOOK_DETAIL: '/books/:id',
  BOOK_EDIT: '/books/:id/edit',
  MEMBERS: '/members',
  BORROWINGS: '/borrowings',
  RETURNS: '/returns',
  INVENTORY: '/inventory',
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

export function authorEditPath(id: string) {
  return `/master/authors/${id}/edit`
}

export function publisherEditPath(id: string) {
  return `/master/publishers/${id}/edit`
}

export function categoryEditPath(id: string) {
  return `/master/categories/${id}/edit`
}
