import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { AppLayout } from './components/layout/AppLayout'

// Auth
import LoginPage from './pages/auth/LoginPage'
import OTPPage from './pages/auth/OTPPage'

// Main
import DashboardPage from './pages/DashboardPage'

// Schedule
import SchedulePage from './pages/schedule/SchedulePage'
import OpenShiftsPage from './pages/schedule/OpenShiftsPage'

// Timesheets
import TimesheetsPage from './pages/timesheets/TimesheetsPage'

// Leave
import LeavePage from './pages/leave/LeavePage'

// Messages
import MessagesPage from './pages/messages/MessagesPage'

// Reports
import LabourCostPage from './pages/reports/LabourCostPage'
import OvertimePage from './pages/reports/OvertimePage'
import LeaveLiabilityPage from './pages/reports/LeaveLiabilityPage'
import AwardCompliancePage from './pages/reports/AwardCompliancePage'

// Agreements
import AgreementsListPage from './pages/agreements/AgreementsListPage'
import AgreementDetailPage from './pages/agreements/AgreementDetailPage'

// Paycodes
import PaycodesPage from './pages/paycodes/PaycodesPage'

// Prospects
import ProspectsPage from './pages/prospects/ProspectsPage'

// Export
import ExportPage from './pages/export/ExportPage'

// Admin
import OrgsPage from './pages/admin/OrgsPage'
import UsersPage from './pages/admin/UsersPage'
import LocationsPage from './pages/admin/LocationsPage'
import LeaveTypesPage from './pages/admin/LeaveTypesPage'
import SettingsPage from './pages/admin/SettingsPage'

// Audit
import AuditPage from './pages/audit/AuditPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  if (!accessToken) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/otp" element={<OTPPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          {/* Schedule */}
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="schedule/open" element={<OpenShiftsPage />} />

          {/* Timesheets */}
          <Route path="timesheets" element={<TimesheetsPage />} />

          {/* Leave */}
          <Route path="leave" element={<LeavePage />} />

          {/* Messages */}
          <Route path="messages" element={<MessagesPage />} />

          {/* Reports */}
          <Route path="reports/labour-cost" element={<LabourCostPage />} />
          <Route path="reports/overtime" element={<OvertimePage />} />
          <Route path="reports/leave-liability" element={<LeaveLiabilityPage />} />
          <Route path="reports/award-compliance" element={<AwardCompliancePage />} />

          {/* Agreements */}
          <Route path="agreements" element={<AgreementsListPage />} />
          <Route path="agreements/new" element={<Navigate to="/agreements?new=true" replace />} />
          <Route path="agreements/:id" element={<AgreementDetailPage />} />

          {/* Paycodes */}
          <Route path="paycodes" element={<PaycodesPage />} />

          {/* Prospects */}
          <Route path="prospects" element={<ProspectsPage />} />

          {/* Export */}
          <Route path="export" element={<ExportPage />} />

          {/* Admin */}
          <Route path="admin/orgs" element={<OrgsPage />} />
          <Route path="admin/users" element={<UsersPage />} />
          <Route path="admin/locations" element={<LocationsPage />} />
          <Route path="admin/leave-types" element={<LeaveTypesPage />} />
          <Route path="admin/settings" element={<SettingsPage />} />

          {/* Audit */}
          <Route path="audit" element={<AuditPage />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
