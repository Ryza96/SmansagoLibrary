import { createHashRouter, Navigate, Outlet } from 'react-router-dom'
import { MEMBER_TYPES } from '../shared/config/member-type'
import AuthGate from '../auth/AuthGate'
import SetupPage from '../pages/auth/SetupPage'
import LoginPage from '../pages/auth/LoginPage'
import AppLayout from '../components/layout/AppLayout'
import { BookImportProvider } from '../contexts/BookImportContext'
import DashboardPage from '../pages/DashboardPage'
import BooksPage from '../pages/BooksPage'
import BookDetailPage from '../pages/BookDetailPage'
import BookFormPage from '../pages/BookFormPage'
import LabelPreviewPage from '../pages/LabelPreviewPage'
import BorrowReceiptPreviewPage from '../pages/BorrowReceiptPreviewPage'
import BookImportPage from '../pages/BookImportPage'
import BookImportPreviewPage from '../pages/BookImportPreviewPage'
import MemberListPage from '../pages/MemberListPage'
import MemberCreatePage from '../pages/MemberCreatePage'
import MemberEditPage from '../pages/MemberEditPage'
import MemberDetailPage from '../pages/MemberDetailPage'
import EnrollmentHistoryPage from '../pages/EnrollmentHistoryPage'
import BorrowingsPage from '../pages/BorrowingsPage'
import ReturnsPage from '../pages/ReturnsPage'
import InventoryPage from '../pages/InventoryPage'
import InventoryDetailPage from '../pages/InventoryDetailPage'
import ReportsPage from '../pages/ReportsPage'
import BorrowingReportPage from '../pages/report/BorrowingReportPage'
import ReturnReportPage from '../pages/report/ReturnReportPage'
import OverdueReportPage from '../pages/report/OverdueReportPage'
import MemberReportPage from '../pages/report/MemberReportPage'
import CollectionReportPage from '../pages/report/CollectionReportPage'
import SettingsPage from '../pages/SettingsPage'
import AuthorListPage from '../pages/master/AuthorListPage'
import AuthorFormPage from '../pages/master/AuthorFormPage'
import PublisherListPage from '../pages/master/PublisherListPage'
import PublisherFormPage from '../pages/master/PublisherFormPage'
import CategoryListPage from '../pages/master/CategoryListPage'
import CategoryFormPage from '../pages/master/CategoryFormPage'
import AcademicYearListPage from '../pages/master/AcademicYearListPage'
import AcademicYearFormPage from '../pages/master/AcademicYearFormPage'
import CurriculumListPage from '../pages/master/CurriculumListPage'
import CurriculumFormPage from '../pages/master/CurriculumFormPage'
import ClassListPage from '../pages/master/ClassListPage'
import ClassFormPage from '../pages/master/ClassFormPage'
import PromotionHistoryPage from '../pages/promotion/PromotionHistoryPage'
import PromotionRunDetailPage from '../pages/promotion/PromotionRunDetailPage'
import PromotionPage from '../pages/promotion/PromotionPage'
import BackupPage from '../pages/backup/BackupPage'
import RestorePage from '../pages/restore/RestorePage'

export const router = createHashRouter([
  {
    element: <AuthGate />,
    children: [
      { path: '/setup', element: <SetupPage /> },
      { path: '/login', element: <LoginPage /> },
      {
        path: '/',
        element: <AppLayout />,
        children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'books', element: <BooksPage /> },
      { path: 'books/new', element: <BookFormPage /> },
      {
        path: 'books/import',
        element: (
          <BookImportProvider>
            <Outlet />
          </BookImportProvider>
        ),
        children: [
          { index: true, element: <BookImportPage /> },
          { path: 'preview', element: <BookImportPreviewPage /> },
        ],
      },
      { path: 'books/:id', element: <BookDetailPage /> },
      { path: 'books/:id/edit', element: <BookFormPage /> },
      { path: 'books/:id/labels-preview', element: <LabelPreviewPage /> },
      { path: 'members', element: <Navigate to="/members/students" replace /> },
      { path: 'members/students', element: <MemberListPage memberType={MEMBER_TYPES.student.code} title="Daftar Siswa" newButtonLabel="Tambah Siswa" /> },
      { path: 'members/teachers', element: <MemberListPage memberType={MEMBER_TYPES.teacher.code} title="Daftar Guru" newButtonLabel="Tambah Guru" /> },
      { path: 'members/general', element: <MemberListPage memberType={MEMBER_TYPES.general.code} title="Daftar Anggota Umum" newButtonLabel="Tambah Anggota Umum" /> },
      { path: 'members/new', element: <MemberCreatePage /> },
      { path: 'members/:id', element: <MemberDetailPage /> },
      { path: 'members/:id/edit', element: <MemberEditPage /> },
      { path: 'members/:id/enrollments', element: <EnrollmentHistoryPage /> },
      { path: 'borrowings', element: <BorrowingsPage /> },
      { path: 'borrowings/:id/receipt-preview', element: <BorrowReceiptPreviewPage /> },
      { path: 'returns', element: <ReturnsPage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/:id', element: <InventoryDetailPage /> },
      { path: 'promotions/run', element: <PromotionPage /> },
      { path: 'promotions', element: <PromotionHistoryPage /> },
      { path: 'promotions/:id', element: <PromotionRunDetailPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/borrowings', element: <BorrowingReportPage /> },
      { path: 'reports/returns', element: <ReturnReportPage /> },
      { path: 'reports/overdues', element: <OverdueReportPage /> },
      { path: 'reports/members', element: <MemberReportPage /> },
      { path: 'reports/collections', element: <CollectionReportPage /> },
      { path: 'backup', element: <BackupPage /> },
      { path: 'restore', element: <RestorePage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'master/authors', element: <AuthorListPage /> },
      { path: 'master/authors/new', element: <AuthorFormPage /> },
      { path: 'master/authors/:id/edit', element: <AuthorFormPage /> },
      { path: 'master/publishers', element: <PublisherListPage /> },
      { path: 'master/publishers/new', element: <PublisherFormPage /> },
      { path: 'master/publishers/:id/edit', element: <PublisherFormPage /> },
      { path: 'master/categories', element: <CategoryListPage /> },
      { path: 'master/categories/new', element: <CategoryFormPage /> },
      { path: 'master/categories/:id/edit', element: <CategoryFormPage /> },
      { path: 'master/academic-years', element: <AcademicYearListPage /> },
      { path: 'master/academic-years/new', element: <AcademicYearFormPage /> },
      { path: 'master/academic-years/:id/edit', element: <AcademicYearFormPage /> },
      { path: 'master/curricula', element: <CurriculumListPage /> },
      { path: 'master/curricula/new', element: <CurriculumFormPage /> },
      { path: 'master/curricula/:id/edit', element: <CurriculumFormPage /> },
      { path: 'master/classes', element: <ClassListPage /> },
      { path: 'master/classes/new', element: <ClassFormPage /> },
      { path: 'master/classes/:id/edit', element: <ClassFormPage /> }
        ]
      }
    ]
  }
])
