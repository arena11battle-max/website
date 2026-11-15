import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, ErrorText, PageHeader, Panel, Spinner, StatusBadge } from '../components/ui'
import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { GUN_NAMES, type Kit, type Player, type Scoreboard, type Team } from '../lib/types'

interface DashboardData {
  totalMatchesPlayed: number
  completedMatches: number
  totalBookings: number
  todayRevenue: number
  pendingPayments: { count: number; amountInr: number }
  totalPlayers: number
  recentMatches: {
    id: number
    name: string
    status: string
    winner: string | null
    rounds: number
    roundSeconds: number
    redScore: number
    blueScore: number
    finishedAt: string | null
  }[]
  playerStats: {
    id: number
    displayName: string
    name: string
    matches: number
    kills: number
    deaths: number
    damageDealt: number
  }[]
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [error, setError] = useState<string | null>(null)

  // Quick Next Match directly on the main dashboard (not hidden in tabs)
  const [redId, setRedId] = useState<number | ''>('')
  const [blueId, setBlueId] = useState<number | ''>('')
  const [minutes, setMinutes] = useState(5)
  const [seconds, setSeconds] = useState(0)
  const [rounds, setRounds] = useState(1)
  const [launching, setLaunching] = useState(false)

  const load = useCallback(() => {
    setError(null)
    Promise.all([
      get<DashboardData>('/api/admin/dashboard'),
      get<{ players: Player[] }>('/api/players'),
      get<{ kits: Kit[] }>('/api/admin/kits'),
    ])
      .then(([d, p, k]) => {
        setData(d)
        setPlayers(p.players)
        setKits(k.kits.filter((x) => x.active))
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  async function launchNextMatch() {
    if (!redId || !blueId || redId === blueId) {
      setError('Pick two different players for Red and Blue teams.')
      return
    }
    const totalSec = Math.max(10, Math.round(minutes * 60 + seconds))
    const redKit = kits.find((k) => k.team === 'red')
    const blueKit = kits.find((k) => k.team === 'blue')
    if (!redKit || !blueKit) {
      setError('Missing active Red or Blue kit in Settings > Kits.')
      return
    }
    setLaunching(true)
    setError(null)
    try {
      const created = await post<Scoreboard>('/api/matches', {
        rounds,
        roundSeconds: totalSec,
        breakSeconds: 0,
        players: [
          { playerId: Number(redId), team: 'red' as Team, kitId: redKit.id },
          { playerId: Number(blueId), team: 'blue' as Team, kitId: blueKit.id },
        ],
      })
      navigate(`/command/matches/${created.match.id}`)
    } catch (e) {
      setError((e as Error).message)
      setLaunching(false)
    }
  }

  if (user?.role !== 'admin') {
    return <ErrorText error="Admin access required for the business dashboard." />
  }
  if (!data && !error) return <Spinner label="Loading dashboard" />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Dashboard"
        sub="Live business metrics, match history, player performance & instant match launch"
        action={
          <div className="flex gap-2">
            <Link to="/command/matches/new">
              <Button variant="primary" size="sm">
                + Custom Match
              </Button>
            </Link>
            <Button size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
        }
      />

      <ErrorText error={error} />

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="dogtag p-4">
              <div className="label">Matches Played</div>
              <div className="score mt-1 text-3xl">{data.totalMatchesPlayed}</div>
            </div>
            <div className="dogtag p-4">
              <div className="label">Completed</div>
              <div className="score mt-1 text-3xl text-lime">{data.completedMatches}</div>
            </div>
            <div className="dogtag p-4">
              <div className="label">Total Bookings</div>
              <div className="score mt-1 text-3xl">{data.totalBookings}</div>
            </div>
            <div className="dogtag p-4">
              <div className="label">Today&apos;s Revenue</div>
              <div className="score mt-1 text-3xl text-amber">₹{data.todayRevenue}</div>
            </div>
            <div className="dogtag p-4">
              <div className="label">Pending Payments</div>
              <div className="score mt-1 text-3xl text-red">
                {data.pendingPayments.count} <span className="text-base text-muted">(₹{data.pendingPayments.amountInr})</span>
              </div>
            </div>
            <div className="dogtag p-4">
              <div className="label">Total Players</div>
              <div className="score mt-1 text-3xl">{data.totalPlayers}</div>
            </div>
          </div>

          {/* Direct NEXT MATCH launcher on the main dashboard */}
          <Panel title="Next Match — Instant 1v1 Launch">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
              <label className="block">
                <span className="label text-red">Red Player</span>
                <select className="field mt-1" value={redId} onChange={(e) => setRedId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select Red…</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname || p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label text-blue">Blue Player</span>
                <select className="field mt-1" value={blueId} onChange={(e) => setBlueId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Select Blue…</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nickname || p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Minutes</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  className="field mt-1"
                  value={minutes}
                  onChange={(e) => setMinutes(Math.max(0, Number(e.target.value)))}
                />
              </label>
              <label className="block">
                <span className="label">Seconds</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  className="field mt-1"
                  value={seconds}
                  onChange={(e) => setSeconds(Math.min(59, Math.max(0, Number(e.target.value))))}
                />
              </label>
              <label className="block">
                <span className="label">Rounds</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="field mt-1"
                  value={rounds}
                  onChange={(e) => setRounds(Math.min(10, Math.max(1, Number(e.target.value))))}
                />
              </label>
              <div className="flex items-end">
                <Button variant="go" className="w-full" disabled={launching} onClick={launchNextMatch}>
                  {launching ? 'Creating…' : '▶ Next Match'}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted">
              <span>Quick duration:</span>
              {[1, 2, 3, 4, 5, 6, 10, 15].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMinutes(m)
                    setSeconds(0)
                  }}
                  className={`border px-2 py-0.5 font-mono ${minutes === m && seconds === 0 ? 'border-amber text-amber' : 'border-line-2 hover:text-text'}`}
                >
                  {m}m
                </button>
              ))}
              <span className="ml-auto font-mono">
                Kits: {kits.find((k) => k.team === 'red')?.label ?? '-'} ({GUN_NAMES[kits.find((k) => k.team === 'red')?.gun ?? 1]}) vs{' '}
                {kits.find((k) => k.team === 'blue')?.label ?? '-'} ({GUN_NAMES[kits.find((k) => k.team === 'blue')?.gun ?? 1]})
              </span>
            </div>
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Recent Match History">
              {data.recentMatches.length === 0 ? (
                <p className="p-4 text-sm text-muted">No matches played yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.recentMatches.map((m) => (
                    <li key={m.id}>
                      <Link to={`/command/matches/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel-2">
                        <div>
                          <div className="font-bold">
                            #{m.id} · {m.name}
                          </div>
                          <div className="text-xs text-muted">
                            <span className="text-red">{m.redScore}</span> – <span className="text-blue">{m.blueScore}</span> ·{' '}
                            {m.winner ? (m.winner === 'draw' ? 'DRAW' : `${m.winner.toUpperCase()} WON`) : m.status === 'finished' ? 'No scoring events' : 'In progress'}
                          </div>
                        </div>
                        <StatusBadge status={m.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Player Performance Statistics">
              {data.playerStats.length === 0 ? (
                <p className="p-4 text-sm text-muted">No completed match stats yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-line font-mono text-xs uppercase text-muted">
                      <tr>
                        <th className="px-4 py-2">Player</th>
                        <th className="px-3 py-2 text-right">Matches</th>
                        <th className="px-3 py-2 text-right">Kills</th>
                        <th className="px-3 py-2 text-right">Deaths</th>
                        <th className="px-4 py-2 text-right">Damage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.playerStats.map((p) => (
                        <tr key={p.id} className="hover:bg-panel-2">
                          <td className="px-4 py-2 font-bold">{p.displayName}</td>
                          <td className="px-3 py-2 text-right font-mono">{p.matches}</td>
                          <td className="px-3 py-2 text-right font-mono text-lime">{p.kills}</td>
                          <td className="px-3 py-2 text-right font-mono text-red">{p.deaths}</td>
                          <td className="px-4 py-2 text-right font-mono text-amber">{p.damageDealt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
