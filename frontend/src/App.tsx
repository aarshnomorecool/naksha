import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppNav } from '@/components/AppNav'
import { MapView } from '@/components/map/MapView'
import { RequireAuth } from '@/components/RequireAuth'
import { AuthProvider } from '@/context/AuthContext'
import { CheckInPage } from '@/pages/CheckInPage'
import { ConsentPage } from '@/pages/ConsentPage'
import { DashboardListPage } from '@/pages/DashboardListPage'
import { DriverPage } from '@/pages/DriverPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { StudentDetailPage } from '@/pages/StudentDetailPage'

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
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/checkin"
                element={
                  <RequireAuth>
                    <CheckInPage />
                  </RequireAuth>
                }
              />
              <Route path="/driver" element={<DriverPage />} />
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
