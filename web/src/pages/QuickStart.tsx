import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorText, Panel } from '../components/ui'
import { post } from '../lib/api'
import type { Kit, Player, Scoreboard, Team } from '../lib/types'

// Fastest way to start a game: pick the format, type the names, go.
// Names that match a saved player (name or nickname) reuse that player so their stats add up; new names are saved as players.

const FORMATS = [1, 2, 3, 4] as const

export default function QuickStart({
  players,
  kits,
  timing,
  onPlayerCreated,
}: {
  players: Player[]
  kits: Kit[]
  timing: { name: string; rounds: number; roundSeconds: number; breakSeconds: number }
  onPlayerCreated: (p: Player) => void
}) {
  const navigate = useNavigate()
  const [size, setSize] = useState<number>(2)
  const [names, setNames] = useState<Record<Team, string[]>>({ red: ['', '', '', ''], blue: ['', '', '', ''] })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const setName = (team: Team, i: number, v: string) => setNames((cur) => ({ ...cur, [team]: cur[team].map((n, j) => (j === i ? v : n)) }))
  const picked = (team: Team) => names[team].slice(0, size).map((n) => n.trim())
  const all = [...picked('red'), ...picked('blue')]
  const filled = all.every(Boolean)
  const dupes = new Set(all.map((n) => n.toLowerCase())).size !== all.length
  const kitsFor = (team: Team) => kits.filter((k) => k.team === team)
  const enoughKits = kitsFor('red').length >= size && kitsFor('blue').length >= size

  async function start() {
    setError(null)
    if (!filled) return setError('Type a name for every player.')
    if (dupes) return setError('Each player needs a different name.')
    if (!enoughKits) return setError(`Not enough active kits for ${size} vs ${size}. Check Settings → Kits.`)
    setBusy(true)
    try {
      const known = new Map<string, Player>()
      for (const p of players) {
        if (p.archived) continue
        known.set(p.name.toLowerCase(), p)
        if (p.nickname) known.set(p.nickname.toLowerCase(), p)
      }
      const lineup: { playerId: number; team: Team; kitId: number }[] = []
      for (const team of ['red', 'blue'] as const) {
        const teamKits = kitsFor(team)
        const list = picked(team)
        for (let i = 0; i < list.length; i++) {
          let p = known.get(list[i].toLowerCase())
          if (!p) {
            const res = await post<{ player: Player }>('/api/players', { name: list[i], nickname: list[i].slice(0, 24) })
            p = res.player
            known.set(list[i].toLowerCase(), p)
            onPlayerCreated(p)
          }
          lineup.push({ playerId: p.id, team, kitId: teamKits[i].id })
        }
      }
      const res = await post<Scoreboard>('/api/matches', { ...timing, name: timing.name || `${size} vs ${size}`, players: lineup })
      navigate(`/command/matches/${res.match.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const column = (team: Team) => (
    <div className="space-y-2">
      <p className={`font-display text-sm uppercase tracking-[0.2em] ${team === 'red' ? 'text-red' : 'text-blue'}`}>{team === 'red' ? 'Red team' : 'Blue team'}</p>
      {Array.from({ length: size }, (_, i) => {
        const kit = kitsFor(team)[i]
        return (
          <label key={i} className="flex items-center gap-2">
            <span className={`w-10 shrink-0 font-mono text-xs ${team === 'red' ? 'text-red' : 'text-blue'}`}>{kit?.label ?? '—'}</span>
            <input
              className="field"
              list="quick-players"
              value={names[team][i]}
              onChange={(e) => setName(team, i, e.target.value)}
              placeholder={`Player ${i + 1} name`}
              maxLength={80}
              aria-label={`${team} player ${i + 1} name`}
            />
          </label>
        )
      })}
    </div>
  )

  return (
    <Panel title="Quick start">
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Match format">
          {FORMATS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={size === n}
              onClick={() => setSize(n)}
              className={`border px-4 py-2 font-display text-lg uppercase transition-colors ${size === n ? 'border-hazard bg-hazard/15 text-text' : 'border-line text-muted hover:border-text/40'}`}
            >
              {n} vs {n}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {column('red')}
          {column('blue')}
        </div>
        <datalist id="quick-players">
          {players
            .filter((p) => !p.archived)
            .map((p) => (
              <option key={p.id} value={p.nickname || p.name} />
            ))}
        </datalist>
        <ErrorText error={error} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">Each player gets the next free kit of their team. Saved players are reused, new names are saved.</p>
          <Button variant="primary" disabled={busy || !filled} onClick={start}>
            {busy ? 'Starting…' : `Create ${size} vs ${size} match`}
          </Button>
        </div>
      </div>
    </Panel>
  )
}
