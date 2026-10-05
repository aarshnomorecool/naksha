import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppNav } from '@/components/AppNav'
import { MapView } from '@/components/map/MapView'
import { RequireAuth } from '@/components/RequireAuth'
import { AuthProvider } from '@/context/AuthContext'
import { CheckInPage } from '@/pages/CheckInPage'
import { ConsentPage } from '@/pages/ConsentPage'
import { DashboardListPage } from '@/pages/DashboardListPage'
import { BuildingDetailPage } from '@/pages/BuildingDetailPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { MarksPage } from '@/pages/MarksPage'
import { MePage } from '@/pages/MePage'
import { RosterImportPage } from '@/pages/RosterImportPage'
import { ScanPage } from '@/pages/ScanPage'
import { StudentDetailPage } from '@/pages/StudentDetailPage'
import { TimetableEditorPage } from '@/pages/TimetableEditorPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="flex h-screen w-screen flex-col">
          <AppNav />
          <div className="min-h-0 flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/map" element={<MapView />} />
              <Route path="/map/building/:buildingId" element={<BuildingDetailPage />} />
              <Route path="/login" element={<LoginPage />} />
              {/* Public: students land here from a classroom QR, no login. */}
              <Route path="/scan" element={<ScanPage />} />
              {/* Public: a student's own dashboard, identified by their linked phone. */}
              <Route path="/me" element={<MePage />} />
              <Route
                path="/checkin"
                element={
                  <RequireAuth>
                    <CheckInPage />
                  </RequireAuth>
                }
              />
              <Route path="/consent" element={<ConsentPage />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <DashboardListPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard/timetable"
                element={
                  <RequireAuth>
                    <TimetableEditorPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard/marks"
                element={
                  <RequireAuth>
                    <MarksPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard/import"
                element={
                  <RequireAuth>
                    <RosterImportPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/dashboard/:studentId"
                element={
                  <RequireAuth>
                    <StudentDetailPage />
                  </RequireAuth>
                }
              />
            </Routes>
          </div>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
