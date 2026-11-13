import { lazy, Suspense } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from './components/ui'
import Home from './site/Home'
import SiteLayout from './site/SiteLayout'

// The public site loads first; the staff console and the TV board are separate chunks.
const StaffApp = lazy(() => import('./StaffApp'))
const Display = lazy(() => import('./pages/Display'))
const Legal = lazy(() => import('./site/Legal'))

// A preview build (VITE_PREVIEW=1) is hosted as a static page without the server and without real URL paths,
// so it keeps routes in memory.
const Router = import.meta.env.VITE_PREVIEW ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <Suspense fallback={<Spinner label="Loading" />}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path=":page" element={<Legal />} />
          </Route>
          <Route path="/display" element={<Display />} />
          <Route path="/command/*" element={<StaffApp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Router>
  )
}
