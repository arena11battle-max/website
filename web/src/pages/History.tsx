import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, ErrorText, PageHeader, Panel, Spinner, StatusBadge } from '../components/ui'
import { get } from '../lib/api'
import type { MatchSummary } from '../lib/types'

export default function History() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    get<{ matches: MatchSummary[] }>('/api/matches?limit=100')
      .then((r) => setMatches(r.matches))
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div>
      <PageHeader title="Match history" />
      <ErrorText error={error} />
      <Panel>
        {!matches ? (
          <Spinner />
        ) : matches.length === 0 ? (
          <Empty title="No matches yet" />
        ) : (
          <ul className="divide-y divide-line">
            {matches.map((m) => (
              <li key={m.id}>
                <Link to={`/command/matches/${m.id}`} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 hover:bg-panel-2 sm:grid-cols-[1fr_auto_auto]">
                  <div className="min-w-0">
                    <div className="truncate font-display tracking-wide uppercase">{m.name}</div>
                    <div className="text-sm text-muted">
                      {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {m.players} players
                    </div>
                  </div>
                  <div className="score text-4xl">
                    <span className="text-red">{m.redScore}</span>
                    <span className="mx-1.5 text-dim">:</span>
                    <span className="text-blue">{m.blueScore}</span>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <StatusBadge status={m.status} />
                    {m.status === 'finished' && m.winner && (
                      <span className={`ml-2 text-xs font-bold uppercase ${m.winner === 'red' ? 'text-red' : m.winner === 'blue' ? 'text-blue' : 'text-muted'}`}>
                        {m.winner === 'draw' ? 'Draw' : `${m.winner} won`}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
