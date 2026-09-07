import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppNav } from '@/components/AppNav'
import { MapView } from '@/components/map/MapView'
import { RequireAuth } from '@/components/RequireAuth'
import { AuthProvider } from '@/context/AuthContext'
import { DashboardListPage } from '@/pages/DashboardListPage'
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
              <Route path="/" element={<MapView />} />
              <Route path="/login" element={<LoginPage />} />
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
