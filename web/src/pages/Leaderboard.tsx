import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, ErrorText, PageHeader, Panel, Spinner } from '../components/ui'
import { get } from '../lib/api'

interface Row {
  id: number
  name: string
  nickname: string | null
  matches: number
  wins: number
  kills: number
  deaths: number
  hits: number
  damage: number
  mvps: number
}

const periods = [
  { label: 'Today', days: 1, period: 'today' },
  { label: '7 days', days: 7, period: '7' },
  { label: '30 days', days: 30, period: '30' },
  { label: 'All time', days: 0, period: 'all' },
]

export default function Leaderboard() {
  const [days, setDays] = useState(0)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    get<{ leaderboard: Row[] }>(`/api/leaderboard?period=${periods.find((p) => p.days === days)?.period ?? 'all'}`)
      .then((r) => setRows(r.leaderboard))
      .catch((e) => setError(e.message))
  }, [days])

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        sub="Finished matches only. Ranked by kills, then damage, then fewest deaths."
        action={
          <div className="flex border border-line-2">
            {periods.map((p) => (
              <button
                key={p.days}
                onClick={() => setDays(p.days)}
                className={`px-3 py-1.5 text-sm font-bold uppercase ${days === p.days ? 'bg-amber text-ink' : 'text-muted hover:text-text'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />
      <ErrorText error={error} />
      <Panel>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty title="No finished matches in this period" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="label text-left">
                  <th className="px-4 py-2 font-semibold">Rank</th>
                  <th className="px-2 py-2 font-semibold">Player</th>
                  <th className="px-2 py-2 text-right font-semibold">Kills</th>
                  <th className="px-2 py-2 text-right font-semibold">K/D</th>
                  <th className="px-2 py-2 text-right font-semibold">Damage</th>
                  <th className="px-2 py-2 text-right font-semibold">Deaths</th>
                  <th className="px-2 py-2 text-right font-semibold">MVP</th>
                  <th className="px-4 py-2 text-right font-semibold">Wins / played</th>
                </tr>
              </thead>
              <tbody className="digits">
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className={`score text-3xl ${i === 0 ? 'text-amber glow-amber' : i < 3 ? 'text-khaki' : 'text-muted'}`}>{i + 1}</span>
                        {i < 3 && (
                          <svg viewBox="0 -2 20 20" className={`h-4 w-5 ${i === 0 ? 'text-amber' : 'text-khaki'}`} aria-hidden>
                            {Array.from({ length: 3 - i }, (_, k) => (
                              <path key={k} d={`M2 ${15 - k * 5} 10 ${9 - k * 5}l8 6`} fill="none" stroke="currentColor" strokeWidth="2.6" />
                            ))}
                          </svg>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-sans">
                      <Link to={`/command/players/${r.id}`} className="font-display tracking-wide uppercase hover:text-amber">
                        {r.nickname || r.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right text-base font-bold">{r.kills}</td>
                    <td className="px-2 py-2.5 text-right">{(r.kills / Math.max(1, r.deaths)).toFixed(2)}</td>
                    <td className="px-2 py-2.5 text-right">{r.damage}</td>
                    <td className="px-2 py-2.5 text-right">{r.deaths}</td>
                    <td className="px-2 py-2.5 text-right text-amber">{r.mvps}</td>
                    <td className="px-4 py-2.5 text-right text-muted">
                      {r.wins} / {r.matches}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
