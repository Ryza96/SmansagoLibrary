import { createHashRouter, Navigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import DashboardPage from '../pages/DashboardPage'
import BooksPage from '../pages/BooksPage'
import BookDetailPage from '../pages/BookDetailPage'
import BookFormPage from '../pages/BookFormPage'
import MembersPage from '../pages/MembersPage'
import MemberListPage from '../pages/MemberListPage'
import MemberCreatePage from '../pages/MemberCreatePage'
import MemberEditPage from '../pages/MemberEditPage'
import MemberDetailPage from '../pages/MemberDetailPage'
import BorrowingsPage from '../pages/BorrowingsPage'
import ReturnsPage from '../pages/ReturnsPage'
import InventoryPage from '../pages/InventoryPage'
import InventoryDetailPage from '../pages/InventoryDetailPage'
import ReportsPage from '../pages/ReportsPage'
import SettingsPage from '../pages/SettingsPage'
import AuthorListPage from '../pages/master/AuthorListPage'
import AuthorFormPage from '../pages/master/AuthorFormPage'
import PublisherListPage from '../pages/master/PublisherListPage'
import PublisherFormPage from '../pages/master/PublisherFormPage'
import CategoryListPage from '../pages/master/CategoryListPage'
import CategoryFormPage from '../pages/master/CategoryFormPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'books', element: <BooksPage /> },
      { path: 'books/new', element: <BookFormPage /> },
      { path: 'books/:id', element: <BookDetailPage /> },
      { path: 'books/:id/edit', element: <BookFormPage /> },
      { path: 'members', element: <Navigate to="/members/students" replace /> },
      { path: 'members/students', element: <MemberListPage memberType="student" title="Daftar Siswa" newButtonLabel="Tambah Siswa" /> },
      { path: 'members/teachers', element: <MemberListPage memberType="teacher" title="Daftar Guru" newButtonLabel="Tambah Guru" /> },
      { path: 'members/general', element: <MemberListPage memberType="general" title="Daftar Anggota Umum" newButtonLabel="Tambah Anggota Umum" /> },
      { path: 'members/new', element: <MemberCreatePage /> },
      { path: 'members/:id', element: <MemberDetailPage /> },
      { path: 'members/:id/edit', element: <MemberEditPage /> },
      { path: 'borrowings', element: <BorrowingsPage /> },
      { path: 'returns', element: <ReturnsPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/:id', element: <InventoryDetailPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'master/authors', element: <AuthorListPage /> },
      { path: 'master/authors/new', element: <AuthorFormPage /> },
      { path: 'master/authors/:id/edit', element: <AuthorFormPage /> },
      { path: 'master/publishers', element: <PublisherListPage /> },
      { path: 'master/publishers/new', element: <PublisherFormPage /> },
      { path: 'master/publishers/:id/edit', element: <PublisherFormPage /> },
      { path: 'master/categories', element: <CategoryListPage /> },
      { path: 'master/categories/new', element: <CategoryFormPage /> },
      { path: 'master/categories/:id/edit', element: <CategoryFormPage /> }
    ]
  }
])
