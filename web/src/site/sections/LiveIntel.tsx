import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../../brand'
import { phaseLabel } from '../../components/game'
import { formatClock, useCountdown, useLiveScoreboard } from '../../lib/live'
import type { PlayerLine, Scoreboard, Team } from '../../lib/types'
import { useNearView } from '../hooks'
import { gsap, MOTION_OK } from '../motion'
import { SplitWords } from '../SplitWords'

/** A team score that rolls up to each new value and flashes when it changes. */
function AnimatedScore({ value, team }: { value: number; team: Team }) {
  const el = useRef<HTMLDivElement>(null)
  const shown = useRef(value)
  useEffect(() => {
    const node = el.current
    if (!node || value === shown.current) return
    if (!matchMedia(MOTION_OK).matches) {
      shown.current = value
      node.textContent = String(value)
      return
    }
    const obj = { v: shown.current }
    shown.current = value
    const tl = gsap.timeline()
    tl.to(obj, { v: value, duration: 0.6, ease: 'power2.out', onUpdate: () => (node.textContent = String(Math.round(obj.v))) })
      .fromTo(node, { scale: 1.35, filter: 'brightness(2)' }, { scale: 1, filter: 'brightness(1)', duration: 0.8, ease: 'expo.out' }, 0)
    return () => {
      tl.kill()
    }
  }, [value])
  return (
    <div ref={el} className={`score origin-center text-[clamp(3.5rem,12vw,8rem)] ${team === 'red' ? 'text-red' : 'text-blue'}`}>
      {value}
    </div>
  )
}

/** One operator row: name, kit, health bar and K/D. Rows slide when the order changes. */
function Operator({ p }: { p: PlayerLine }) {
  const hp = Math.max(0, Math.min(100, p.hp))
  return (
    <li className={`op-row grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-white/5 py-2.5 ${p.alive ? '' : 'opacity-45'}`}>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[10px] text-smoke">{p.kit}</span>
        <span className="truncate font-display text-sm uppercase tracking-wide text-bone">{p.displayName}</span>
        {!p.alive && <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-hazard">KIA</span>}
      </div>
      <div className="font-mono text-xs text-bone/80">
        {p.kills}
        <span className="text-smoke">/</span>
        {p.deaths}
      </div>
      <div className="col-span-2 h-[3px] bg-white/10">
        <div className={`h-full transition-[width] duration-700 ease-out ${p.team === 'red' ? 'bg-red' : 'bg-blue'}`} style={{ width: `${hp}%` }} />
      </div>
    </li>
  )
}

function Roster({ board, team }: { board: Scoreboard; team: Team }) {
  const list = board.players.filter((p) => p.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={`font-mono text-[10px] uppercase tracking-[0.3em] ${team === 'red' ? 'text-red' : 'text-blue'}`}>{team === 'red' ? BRAND.red : BRAND.blue}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">K / D</span>
      </div>
      <ul className="mt-1">
        {list.map((p) => (
          <Operator key={p.matchPlayerId} p={p} />
        ))}
      </ul>
    </div>
  )
}

// Real data only: the public scoreboard API and its WebSocket feed. No live match means "No active mission".
export default function LiveIntel() {
  const { ref, near } = useNearView<HTMLElement>('200px')
  const [initial, setInitial] = useState<Scoreboard | null | undefined>(undefined)
  const { data, none } = useLiveScoreboard(near ? 'display' : null, null)
  const board = none ? null : (data ?? initial ?? null)
  const remaining = useCountdown(board?.timer)

  useEffect(() => {
    if (!near) return
    fetch('/api/public/live')
      .then((r) => (r.ok ? r.json() : { match: null }))
      .then((b) => setInitial(b.match ? b : null))
      .catch(() => setInitial(null))
  }, [near])

  const loading = initial === undefined && !data && !none
  const active = board && board.match.status !== 'finished'

  return (
    <section ref={ref} id="live" className="site-section" aria-labelledby="live-title">
      <div className="mx-auto max-w-[1440px]">
        <div className="reveal flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="kicker flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${active ? 'blink bg-hazard' : 'bg-dim'}`} /> 09 // Live intel
            </p>
            <SplitWords as="h2" id="live-title" className="headline mt-4 text-bone" parts={['Live', { t: 'arena', className: 'text-hazard' }]} />
          </div>
          <Link to="/display" className="btn-ghost self-start text-xs md:self-auto">
            Open arena TV view
          </Link>
        </div>

        <div className="reveal plate mt-10 overflow-hidden" aria-live="polite">
          {loading ? (
            <div className="flex h-72 items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-dim">Establishing uplink…</div>
          ) : !board ? (
            <div className="flex flex-col items-center gap-6 px-6 py-16 text-center">
              <div className="radar h-40 w-40">
                <span className="radar-blip left-[30%] top-[35%] bg-lime" />
                <span className="radar-blip left-[62%] top-[60%] bg-lime" style={{ animationDelay: '1.2s' }} />
              </div>
              <div>
                <p className="font-display text-3xl uppercase sm:text-4xl">No active mission</p>
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.35em] text-smoke">Awaiting deployment.</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/5 p-4 sm:gap-6 sm:p-8">
                <div className="text-left">
                  <div className="font-display text-xs uppercase tracking-[0.2em] text-red sm:text-sm">{BRAND.red}</div>
                  <AnimatedScore value={board.teams.red.score} team="red" />
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
                    {board.teams.red.alive}/{board.teams.red.players} active
                  </div>
                </div>
                <div className="text-center">
                  <div className="chip mx-auto text-amber">{phaseLabel(board)}</div>
                  <div className="instrument digits mt-3 px-3 py-2 text-3xl text-bone sm:px-6 sm:text-5xl">{formatClock(remaining)}</div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em] text-smoke">
                    Round {Math.max(1, board.timer.round)} / {board.timer.rounds}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display text-xs uppercase tracking-[0.2em] text-blue sm:text-sm">{BRAND.blue}</div>
                  <AnimatedScore value={board.teams.blue.score} team="blue" />
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-smoke">
                    {board.teams.blue.alive}/{board.teams.blue.players} active
                  </div>
                </div>
              </div>
              <div className="grid gap-6 border-b border-white/5 p-4 sm:grid-cols-2 sm:gap-10 sm:p-8">
                <Roster board={board} team="red" />
                <Roster board={board} team="blue" />
              </div>
              <div className="grid gap-6 p-4 sm:p-8 md:grid-cols-[1fr_1.4fr]">
                <div>
                  <div className="label">Mission</div>
                  <div className="mt-1 font-display text-xl uppercase">{board.match.name}</div>
                  <div className="mt-4 label">Operators deployed</div>
                  <div className="score mt-1 text-5xl">{board.players.length}</div>
                  {board.match.status === 'finished' && board.mvp && (
                    <div className="mt-4">
                      <div className="label">MVP</div>
                      <div className={`mt-1 font-display text-xl ${board.mvp.team === 'red' ? 'text-red' : 'text-blue'}`}>{board.mvp.displayName}</div>
                    </div>
                  )}
                </div>
                <div>
                  <div className="label">Kill feed</div>
                  <ul className="mt-2 divide-y divide-white/5">
                    {board.feed.filter((f) => f.type === 'kill').slice(0, 6).map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                        <span className={f.shooterTeam === 'red' ? 'text-red' : 'text-blue'}>{f.shooter ?? (f.shooterTeam ? `${f.shooterTeam === 'red' ? 'Red' : 'Blue'} team` : 'Marshal')}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-hazard">✕ {f.gunName ?? 'kill'}</span>
                        <span className={f.victimTeam === 'red' ? 'text-red' : 'text-blue'}>{f.victim}</span>
                        <span className="ml-auto font-mono text-[10px] text-dim">
                          {new Date(f.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </li>
                    ))}
                    {board.feed.every((f) => f.type !== 'kill') && <li className="py-3 text-sm text-dim">No eliminations yet.</li>}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
