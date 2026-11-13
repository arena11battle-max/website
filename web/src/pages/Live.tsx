import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Empty, ErrorText, Panel, Spinner, StatusBadge } from '../components/ui'
import { get } from '../lib/api'
import type { MatchSummary } from '../lib/types'
import MatchConsole from './MatchConsole'

/** Home: the running match's console, otherwise matches ready to start. */
export default function Live() {
  const [running, setRunning] = useState<MatchSummary | null | undefined>(undefined)
  const [ready, setReady] = useState<MatchSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([get<{ matches: MatchSummary[] }>('/api/matches?status=running'), get<{ matches: MatchSummary[] }>('/api/matches?status=setup')])
      .then(([r, s]) => {
        setRunning(r.matches[0] ?? null)
        setReady(s.matches)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorText error={error} />
  if (running === undefined) return <Spinner />
  if (running) return <MatchConsole matchId={running.id} />

  return (
    <div className="space-y-6">
      <div className="hud hud-corner flex flex-col items-start gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="radar h-24 w-24 shrink-0 sm:h-32 sm:w-32">
          <span className="radar-blip bg-red" style={{ top: '30%', left: '60%' }} />
          <span className="radar-blip bg-blue" style={{ top: '65%', left: '30%', animationDelay: '1.6s' }} />
        </div>
        <div className="flex-1">
          <div className="label text-amber">Arena status</div>
          <h1 className="mt-1 font-display text-2xl tracking-wider uppercase sm:text-4xl">No match running</h1>
          <p className="mt-1 text-muted">Set up teams, kits and round timing, then start the clock.</p>
        </div>
        <Link to="/command/matches/new">
          <Button variant="primary" size="lg">
            + New match
          </Button>
        </Link>
      </div>

      <Panel title="Ready to start">
        {ready.length === 0 ? (
          <Empty title="No matches waiting" />
        ) : (
          <ul className="divide-y divide-line">
            {ready.map((m) => (
              <li key={m.id}>
                <Link to={`/command/matches/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-panel-2">
                  <div>
                    <div className="font-bold">{m.name}</div>
                    <div className="text-sm text-muted">
                      {m.players} players · {m.rounds} × {Math.round(m.roundSeconds / 60)} min
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}

export function MatchPage() {
  const { id } = useParams()
  return <MatchConsole key={id} matchId={Number(id)} />
}
