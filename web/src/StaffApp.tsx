import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import Bookings from './pages/Bookings'
import Events from './pages/Events'
import History from './pages/History'
import Leaderboard from './pages/Leaderboard'
import Live, { MatchPage } from './pages/Live'
import Login from './pages/Login'
import NewMatch from './pages/NewMatch'
import Players, { PlayerDetail } from './pages/Players'
import Settings from './pages/Settings'

function Console() {
  const { user, ready } = useAuth()
  if (!ready) return <Spinner label="Connecting" />
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Live />} />
        <Route path="players" element={<Players />} />
        <Route path="players/:id" element={<PlayerDetail />} />
        <Route path="matches/new" element={<NewMatch />} />
        <Route path="matches/:id" element={<MatchPage />} />
        <Route path="matches/:id/edit" element={<NewMatch />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="events" element={<Events />} />
        <Route path="history" element={<History />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/command" replace />} />
      </Route>
    </Routes>
  )
}

export default function StaffApp() {
  return (
    <AuthProvider>
      <Console />
    </AuthProvider>
  )
}
