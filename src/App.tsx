import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { AddTaskPage } from './pages/AddTask'
import { DashboardPage } from './pages/Dashboard'
import { MemberDetailPage } from './pages/MemberDetail'
import { ReportBuilderPage } from './pages/ReportBuilder'
import { ReportDetailPage } from './pages/ReportDetail'
import { ReportsPage } from './pages/Reports'
import { SettingsPage } from './pages/Settings'
import { TaskEditPage } from './pages/TaskEdit'
import { TasksPage } from './pages/Tasks'
import { TeamPage } from './pages/Team'
import { IS_ARTIFACT } from './lib/env'
import { AuthGate } from './state/AuthGate'

// Bản 1 tệp chạy trong khung nhúng: dùng router trong bộ nhớ.
const Router = IS_ARTIFACT ? MemoryRouter : BrowserRouter

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="tasks/:id" element={<TaskEditPage />} />
        <Route path="add" element={<AddTaskPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="team/:id" element={<MemberDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/new" element={<ReportBuilderPage />} />
        <Route path="reports/:id" element={<ReportDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Router>
        <AuthGate>
          <AppRoutes />
        </AuthGate>
      </Router>
    </ToastProvider>
  )
}
