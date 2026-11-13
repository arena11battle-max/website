import { useEffect, useState } from 'react'
import { formatClock } from '../lib/live'
import type { FeedItem, PlayerLine, Scoreboard, Team } from '../lib/types'

const teamText = { red: 'text-red', blue: 'text-blue' } as const
const teamName = { red: 'Red', blue: 'Blue' } as const
const teamCallsign = { red: 'Red Wolves', blue: 'Blue Falcons' } as const
const teamColor = { red: 'var(--color-red)', blue: 'var(--color-blue)' } as const

export function phaseLabel(b: Scoreboard) {
  const t = b.timer
  switch (t.status) {
    case 'setup':
      return 'Ready to start'
    case 'live':
      return `Round ${t.round} of ${t.rounds}`
    case 'break':
      return `Break · Round ${t.round + 1} next`
    case 'paused':
      return `Paused · ${t.pausedFrom === 'break' ? 'break' : `round ${t.round}`}`
    case 'finished':
      return b.match.winner === 'draw' ? 'Final · Draw' : `Final · ${teamName[b.match.winner as Team]} wins`
  }
}

/** Team insignia: a shield with chevrons and a crosshair, in the team colour. */
export function Insignia({ team, className = 'h-12 w-12' }: { team: Team; className?: string }) {
  const c = teamColor[team]
  return (
    <svg viewBox="0 0 64 72" className={className} aria-hidden>
      <path d="M32 2 60 12v22c0 18-12 30-28 36C16 64 4 52 4 34V12Z" fill="#12150f" stroke={c} strokeWidth="3" />
      <path d="M32 8 54 16v18c0 14-9 24-22 29C19 58 10 48 10 34V16Z" fill={c} opacity="0.14" />
      <path d="m16 40 16-9 16 9M16 50l16-9 16 9" fill="none" stroke={c} strokeWidth="4" strokeLinejoin="miter" />
      <circle cx="32" cy="22" r="7" fill="none" stroke="#e8e4d4" strokeWidth="2" />
      <path d="M32 11v6m0 10v6M21 22h6m10 0h6" stroke="#e8e4d4" strokeWidth="2" />
    </svg>
  )
}

/** Big two-team score with the mission clock between. `size="tv"` for the arena display. */
export function ScoreHeader({ board, remaining, size = 'md' }: { board: Scoreboard; remaining: number; size?: 'md' | 'tv' }) {
  const t = board.timer
  const tv = size === 'tv'
  const urgent = t.status === 'live' && remaining <= 30_000
  const clockColor = t.status === 'break' || t.status === 'paused' || t.status === 'finished' ? 'text-amber glow-amber' : urgent ? 'text-red glow-red' : 'text-lime glow-lime'

  return (
    <div className="hud overflow-hidden">
      <div className="hazard-thin" />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4 sm:gap-6 sm:px-8 sm:py-6">
        <TeamScore team="red" board={board} tv={tv} />
        <div className="text-center">
          <div className={`label ${tv ? 'text-sm sm:text-lg' : 'text-[9px] sm:text-[11px]'}`}>Mission clock</div>
          <div className={`instrument relative mx-auto mt-1.5 px-3 pt-2 pb-1 sm:px-5 ${tv ? 'sm:px-8' : ''}`}>
            <div
              className={`score ${clockColor} ${t.status === 'paused' ? 'blink' : ''} ${tv ? 'text-[min(13vw,9.5rem)]' : 'text-5xl sm:text-7xl'}`}
              aria-live="off"
            >
              {t.status === 'finished' ? '00:00' : formatClock(remaining)}
            </div>
          </div>
          <div className={`mt-2 font-display uppercase tracking-[0.15em] ${t.status === 'live' ? 'text-text' : 'text-amber'} ${tv ? 'text-lg sm:text-2xl' : 'text-[11px] sm:text-sm'}`}>
            {phaseLabel(board)}
          </div>
          <RoundPips board={board} />
        </div>
        <TeamScore team="blue" board={board} tv={tv} />
      </div>
    </div>
  )
}

function TeamScore({ team, board, tv }: { team: Team; board: Scoreboard; tv: boolean }) {
  const totals = board.teams[team]
  const winner = board.match.status === 'finished' && board.match.winner === team
  const right = team === 'blue'
  return (
    <div className={`flex min-w-0 items-center gap-2 sm:gap-4 ${right ? 'flex-row-reverse text-right' : ''}`}>
      <Insignia team={team} className={tv ? 'hidden h-28 w-24 shrink-0 sm:block' : 'hidden h-16 w-14 shrink-0 sm:block'} />
      <div className={`flex min-w-0 flex-col ${right ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-2 ${right ? 'flex-row-reverse' : ''}`}>
          <span className={`font-display uppercase tracking-wider ${teamText[team]} ${tv ? 'text-2xl sm:text-4xl' : 'text-sm sm:text-xl'}`}>{teamName[team]}</span>
          {winner && <span className="stamp text-xs text-amber sm:text-sm">Victory</span>}
        </div>
        <div className={`hidden font-display text-[10px] uppercase tracking-[0.25em] text-muted sm:block ${tv ? 'sm:text-sm' : ''}`}>{teamCallsign[team]}</div>
        <div className={`score ${teamText[team]} ${team === 'red' ? 'glow-red' : 'glow-blue'} ${tv ? 'mt-2 text-[min(17vw,13rem)]' : 'mt-1 text-7xl sm:text-[8.5rem]'}`}>
          {totals.score}
        </div>
        <div className={`label mt-1 ${tv ? 'text-xs sm:text-base' : 'text-[9px] sm:text-[11px]'}`}>
          {totals.alive}/{totals.players} alive · {totals.damage} dmg
        </div>
      </div>
    </div>
  )
}

function RoundPips({ board }: { board: Scoreboard }) {
  return (
    <div className="mt-2 flex justify-center gap-1">
      {board.rounds.map((r) => {
        const done = r.round < board.timer.round || board.match.status === 'finished'
        const current = r.round === board.timer.round && board.match.status !== 'finished'
        const lead = r.red === r.blue ? 'var(--color-muted)' : r.red > r.blue ? 'var(--color-red)' : 'var(--color-blue)'
        const color = done ? lead : current ? 'var(--color-amber)' : 'var(--color-line-2)'
        return (
          <svg key={r.round} viewBox="0 0 20 12" className="h-3 w-6" aria-label={`Round ${r.round}: ${r.red}–${r.blue}`}>
            <title>{`Round ${r.round}: ${r.red}–${r.blue}`}</title>
            <path d="M1 11 10 3l9 8" fill="none" stroke={color} strokeWidth="3.5" />
          </svg>
        )
      })}
    </div>
  )
}

/** Armour plates: one segment per 10 HP, turning amber when low. */
/** Ten armour plates: green when healthy, amber at 30 HP or below, red when dead. */
export function HealthBar({ hp, segments = 10 }: { hp: number; team?: Team; segments?: number }) {
  const dead = hp <= 0
  const lit = dead ? segments : Math.ceil((hp / 100) * segments)
  const color = dead ? 'var(--color-red-deep)' : hp <= 30 ? 'var(--color-amber)' : 'var(--color-lime)'
  return (
    <div className="flex gap-[3px]" role="meter" aria-valuenow={hp} aria-valuemin={0} aria-valuemax={100} aria-label="Health">
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1"
          style={{
            clipPath: 'polygon(25% 0, 100% 0, 75% 100%, 0 100%)',
            background: i < lit ? `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 55%, black))` : '#232a1d',
            boxShadow: i < lit ? `0 0 8px color-mix(in srgb, ${color} 50%, transparent)` : undefined,
          }}
        />
      ))}
    </div>
  )
}

function useRespawnCountdown(respawnAt: string | null) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!respawnAt) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [respawnAt])
  return respawnAt ? Math.max(0, Math.ceil((new Date(respawnAt).getTime() - Date.now()) / 1000)) : 0
}

/** A soldier's dog tag: kit, callsign, weapon, kill stats and armour. Stamped KIA while dead. */
export function PlayerCard({ p, mvp, compact }: { p: PlayerLine; mvp?: boolean; compact?: boolean }) {
  const respawnIn = useRespawnCountdown(p.respawnAt)
  const dead = !p.alive && respawnIn > 0
  const hp = dead ? 0 : p.alive ? p.hp : 100
  return (
    <div className={`dogtag hit-pulse relative overflow-hidden py-2.5 pr-3 pl-5 ${dead ? 'grayscale-[0.7]' : ''}`}>
      {/* Team stripe and punch hole, like a real tag. */}
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: teamColor[p.team] }} />
      <span className="absolute top-1/2 left-3 h-2 w-2 -translate-y-1/2 rounded-full bg-ink shadow-[inset_0_1px_2px_black]" />
      <div className={`flex items-center justify-between gap-2 pl-2 ${dead ? 'opacity-45' : ''}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs ${teamText[p.team]}`}>{p.kit}</span>
            <span className={`truncate font-display tracking-wide uppercase ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>{p.displayName}</span>
            {mvp && <span className="bg-amber px-1 font-display text-[10px] text-ink uppercase">MVP</span>}
          </div>
          <div className="font-mono text-[11px] tracking-wider text-muted uppercase">
            ▸ {p.gunName}
          </div>
        </div>
        <div className="flex shrink-0 items-end gap-3 text-right">
          <Stat label="Kills" value={p.kills} strong />
          <Stat label="Deaths" value={p.deaths} />
          {!compact && <Stat label="Hits" value={p.hits} />}
          <Stat label="Dmg" value={p.damageDealt} />
        </div>
      </div>
      <div className={`mt-2 flex items-center gap-2 pl-2 ${dead ? 'opacity-45' : ''}`}>
        <div className="flex-1">
          <HealthBar hp={hp} team={p.team} />
        </div>
        <span className={`digits w-14 text-right text-xs ${hp <= 30 && !dead ? 'text-amber' : 'text-muted'}`}>{dead ? `${respawnIn}s` : `${hp} HP`}</span>
      </div>
      {dead && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55">
          <span className="stamp text-xl text-red sm:text-2xl">KIA · {respawnIn}s</span>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="leading-none">
      <div className={`score ${strong ? 'text-3xl text-text' : 'text-2xl text-text/75'}`}>{value}</div>
      <div className="font-display text-[8px] tracking-[0.18em] text-dim uppercase">{label}</div>
    </div>
  )
}

export function TeamRoster({ board, team, compact }: { board: Scoreboard; team: Team; compact?: boolean }) {
  const players = board.players.filter((p) => p.team === team).sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt)
  return (
    <div className="space-y-2">
      {players.map((p) => (
        // Keyed on damage taken so the card remounts, and flashes, whenever the player is hit.
        <PlayerCard key={`${p.matchPlayerId}-${p.damageTaken}`} p={p} mvp={board.match.status === 'finished' && board.mvp?.matchPlayerId === p.matchPlayerId} compact={compact} />
      ))}
    </div>
  )
}

function Crosshair({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 0v5M8 11v5M0 8h5M11 8h5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function KillFeed({ feed, limit = 12, onVoid }: { feed: FeedItem[]; limit?: number; onVoid?: (id: number) => void }) {
  if (!feed.length) return <p className="label px-4 py-8 text-center">No contact yet</p>
  return (
    <ol className="divide-y divide-line/60">
      {feed.slice(0, limit).map((f) => (
        <li key={f.id} className={`flash-in flex items-center gap-2 px-4 py-2 text-sm ${f.type === 'kill' ? 'bg-red-deep/15' : ''}`}>
          <span className={`truncate font-bold uppercase ${f.shooterTeam ? teamText[f.shooterTeam] : ''}`}>{f.shooter ?? (f.shooterTeam ? `${f.shooterTeam} team` : <span className="text-dim">Unknown</span>)}</span>
          {f.type === 'kill' ? (
            <span className="flex shrink-0 items-center gap-1 bg-amber px-1.5 py-0.5 font-display text-[10px] text-ink uppercase">
              <Crosshair className="h-3 w-3" /> {f.gunName}
            </span>
          ) : (
            <span className="shrink-0 border border-line-2 px-1.5 font-mono text-[10px] text-muted uppercase">{f.gunName}</span>
          )}
          <span className={`truncate font-bold uppercase ${teamText[f.victimTeam]}`}>{f.victim}</span>
          {f.type === 'kill' && <span className="hidden shrink-0 font-display text-[10px] text-red uppercase sm:inline">down</span>}
          <span className="digits ml-auto shrink-0 text-xs text-muted">−{f.damage}</span>
          {f.source !== 'device' && (
            <span className="shrink-0 font-mono text-[10px] text-dim uppercase">{f.source === 'manual' ? 'staff' : f.source === 'vest' ? 'vest' : 'sim'}</span>
          )}
          {onVoid && (
            <button onClick={() => onVoid(f.id)} className="shrink-0 px-1 text-dim hover:text-red" aria-label="Remove this event" title="Remove">
              ×
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

export function RoundTable({ board }: { board: Scoreboard }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="label text-left">
          <th className="px-4 py-2 font-normal">Round</th>
          <th className="px-2 py-2 text-right font-normal text-red">Red kills</th>
          <th className="px-2 py-2 text-right font-normal text-blue">Blue kills</th>
          <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">Damage R / B</th>
        </tr>
      </thead>
      <tbody className="digits">
        {board.rounds.map((r) => (
          <tr key={r.round} className={`border-t border-line ${r.round === board.timer.round && board.match.status !== 'finished' ? 'bg-amber/5' : ''}`}>
            <td className="px-4 py-2 font-display">R{r.round}</td>
            <td className="px-2 py-2 text-right">{r.red}</td>
            <td className="px-2 py-2 text-right">{r.blue}</td>
            <td className="hidden px-4 py-2 text-right text-muted sm:table-cell">
              {r.redDamage} / {r.blueDamage}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function StatsTable({ board }: { board: Scoreboard }) {
  const rows = [...board.players].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt || a.deaths - b.deaths)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="label text-left">
            <th className="px-4 py-2 font-normal">#</th>
            <th className="px-2 py-2 font-normal">Soldier</th>
            <th className="px-2 py-2 text-right font-normal">Kills</th>
            <th className="px-2 py-2 text-right font-normal">Deaths</th>
            <th className="px-2 py-2 text-right font-normal">K/D</th>
            <th className="px-2 py-2 text-right font-normal">Hits</th>
            <th className="px-2 py-2 text-right font-normal">Dmg dealt</th>
            <th className="px-4 py-2 text-right font-normal">Dmg taken</th>
          </tr>
        </thead>
        <tbody className="digits">
          {rows.map((p, i) => (
            <tr key={p.matchPlayerId} className="border-t border-line">
              <td className="px-4 py-2 text-muted">{i + 1}</td>
              <td className="px-2 py-2 font-sans">
                <span className={`mr-2 font-mono text-xs ${teamText[p.team]}`}>{p.kit}</span>
                <span className="font-display tracking-wide uppercase">{p.displayName}</span>
                {board.mvp?.matchPlayerId === p.matchPlayerId && board.match.status === 'finished' && (
                  <span className="ml-2 bg-amber px-1 font-display text-[10px] text-ink uppercase">MVP</span>
                )}
              </td>
              <td className="px-2 py-2 text-right text-base text-text">{p.kills}</td>
              <td className="px-2 py-2 text-right">{p.deaths}</td>
              <td className="px-2 py-2 text-right">{(p.kills / Math.max(1, p.deaths)).toFixed(2)}</td>
              <td className="px-2 py-2 text-right">{p.hits}</td>
              <td className="px-2 py-2 text-right">{p.damageDealt}</td>
              <td className="px-4 py-2 text-right text-muted">{p.damageTaken}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
