import { useEffect, useState } from 'react'
import { useNearView } from '../hooks'
import { SplitWords } from '../SplitWords'

export interface LeaderRow {
  rank: number
  displayName: string
  kills: number
  deaths: number
  damage: number
  matches: number
  mvps: number
}

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: 'all', label: 'All time' },
] as const

/** Chevrons and stars by rank tier, like military rank insignia. */
export function RankInsignia({ rank }: { rank: number }) {
  const gold = rank === 1 ? '#f5b62a' : rank === 2 ? '#c9c9c0' : rank === 3 ? '#c9814a' : '#6b6d5b'
  const chevrons = rank <= 3 ? 3 : rank <= 10 ? 2 : 1
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      {rank <= 3 && <path d="M16 2l2.2 4.5 5 .7-3.6 3.5.8 5-4.4-2.4-4.4 2.4.8-5L8.8 7.2l5-.7z" fill={gold} />}
      {Array.from({ length: chevrons }, (_, i) => (
        <path key={i} d={`M5 ${rank <= 3 ? 18 + i * 4.5 : 9 + i * 6}l11 6 11-6`} fill="none" stroke={gold} strokeWidth="2.6" strokeLinejoin="round" />
      ))}
    </svg>
  )
}

export default function LeaderboardSection() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('30')
  const [rows, setRows] = useState<LeaderRow[] | null>(null)
  const [error, setError] = useState(false)
  const { ref, near } = useNearView<HTMLElement>('200px')

  useEffect(() => {
    if (!near) return
    let alive = true
    setError(false)
    fetch(`/api/leaderboard?period=${period}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b) => alive && setRows(b.leaderboard))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [near, period])

  const top = rows?.slice(0, 3) ?? []
  const podium = [top[1], top[0], top[2]]

  return (
    <section ref={ref} id="leaderboard" className="site-section bg-[#070806]" aria-labelledby="lb-title">
      <div className="mx-auto max-w-[1200px]">
        <div className="reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="kicker">10 // Hall of operators</p>
            <SplitWords as="h2" id="lb-title" className="headline mt-4 text-bone" parts={['The', { t: 'leaderboard', className: 'text-hazard' }]} />
          </div>
          <div className="flex gap-1" role="tablist" aria-label="Time period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-2 font-display text-[11px] uppercase tracking-[0.15em] transition sm:px-4 ${
                  period === p.id ? 'bg-hazard text-white' : 'border border-white/10 text-smoke hover:text-bone'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-10 text-smoke">The leaderboard is unavailable right now. Try again shortly.</p>
        ) : !rows ? (
          <div className="mt-10 h-64 animate-pulse bg-white/[0.02]" />
        ) : rows.length === 0 ? (
          <div className="plate mt-10 p-10 text-center">
            <p className="font-display text-2xl uppercase">No missions recorded</p>
            <p className="mt-2 text-smoke">Finished matches in this period will rank players here.</p>
          </div>
        ) : (
          <>
            <div className="mt-12 grid grid-cols-3 items-end gap-2 sm:gap-4">
              {podium.map((r, i) =>
                r ? (
                  <div
                    key={r.rank}
                    className={`reveal plate flex flex-col items-center p-3 text-center sm:p-6 ${r.rank === 1 ? 'pb-10 sm:pb-14' : r.rank === 2 ? 'pb-6' : 'pb-4'}`}
                    style={{ '--d': `${[200, 0, 400][i]}ms` } as React.CSSProperties}
                  >
                    <RankInsignia rank={r.rank} />
                    <span className={`score mt-2 text-4xl sm:text-6xl ${r.rank === 1 ? 'glow-amber text-amber' : 'text-bone'}`}>#{r.rank}</span>
                    <span className="mt-2 w-full truncate font-display text-sm uppercase sm:text-xl">{r.displayName}</span>
                    <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-smoke sm:text-xs">
                      {r.kills} kills · {r.damage} dmg
                    </span>
                  </div>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-white/10 font-display text-[10px] uppercase tracking-[0.2em] text-smoke">
                    <th className="py-3 pl-2">Rank</th>
                    <th>Operator</th>
                    <th className="text-right">Kills</th>
                    <th className="text-right">Deaths</th>
                    <th className="text-right">Damage</th>
                    <th className="text-right">Matches</th>
                    <th className="pr-2 text-right">MVP</th>
                  </tr>
                </thead>
                <tbody className="digits">
                  {rows.map((r) => (
                    <tr key={r.rank} className="border-b border-white/5 transition hover:bg-white/[0.03]">
                      <td className="py-2.5 pl-2">
                        <span className="flex items-center gap-2">
                          <RankInsignia rank={r.rank} />
                          {r.rank}
                        </span>
                      </td>
                      <td className="font-sans text-base font-semibold">{r.displayName}</td>
                      <td className="text-right text-hazard">{r.kills}</td>
                      <td className="text-right">{r.deaths}</td>
                      <td className="text-right">{r.damage}</td>
                      <td className="text-right">{r.matches}</td>
                      <td className="pr-2 text-right text-amber">{r.mvps}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
