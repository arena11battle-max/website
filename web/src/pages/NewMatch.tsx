import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, ErrorText, Field, PageHeader, Panel, Select, Spinner } from '../components/ui'
import { get, patch, post } from '../lib/api'
import { GUN_NAMES, type Kit, type Player, type Scoreboard, type Team } from '../lib/types'
import { PlayerForm } from './Players'
import QuickStart from './QuickStart'

interface Slot {
  playerId: number
  team: Team
  kitId: number
}

const MAX_PLAYERS = 8

export default function NewMatch() {
  const { id } = useParams()
  const editId = id ? Number(id) : null
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [kits, setKits] = useState<Kit[]>([])
  const [lineup, setLineup] = useState<Slot[]>([])
  const [name, setName] = useState('')
  const [rounds, setRounds] = useState(3)
  const [roundMin, setRoundMin] = useState(8)
  const [breakMin, setBreakMin] = useState(2)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([get<{ players: Player[] }>('/api/players'), get<{ kits: Kit[] }>('/api/admin/kits')])
      .then(([p, k]) => {
        setPlayers(p.players)
        setKits(k.kits.filter((x) => x.active))
      })
      .catch((e) => setError(e.message))
    if (editId) {
      Promise.all([get<Scoreboard>(`/api/matches/${editId}`), get<{ players: Slot[] }>(`/api/matches/${editId}/lineup`)])
        .then(([b, l]) => {
          setName(b.match.name)
          setRounds(b.timer.rounds)
          setRoundMin(b.timer.roundSeconds / 60)
          setBreakMin(b.timer.breakSeconds / 60)
          setLineup(l.players)
        })
        .catch((e) => setError(e.message))
    }
  }, [editId])

  const freeKit = (team: Team, taken: Slot[]) => kits.find((k) => k.team === team && !taken.some((s) => s.kitId === k.id))

  function addTo(playerId: number, team: Team) {
    setError(null)
    setLineup((cur) => {
      const rest = cur.filter((s) => s.playerId !== playerId)
      if (rest.length >= MAX_PLAYERS) {
        setError(`A match has at most ${MAX_PLAYERS} players`)
        return cur
      }
      const kit = freeKit(team, rest)
      if (!kit) {
        setError(`No free ${team} kit left`)
        return cur
      }
      return [...rest, { playerId, team, kitId: kit.id }]
    })
  }

  const remove = (playerId: number) => setLineup((cur) => cur.filter((s) => s.playerId !== playerId))
  const setKit = (playerId: number, kitId: number) => setLineup((cur) => cur.map((s) => (s.playerId === playerId ? { ...s, kitId } : s)))

  /** Random fair split of everyone picked so far. */
  function shuffle() {
    const ids = lineup.map((s) => s.playerId).sort(() => Math.random() - 0.5)
    const next: Slot[] = []
    ids.forEach((pid, i) => {
      const team: Team = i % 2 === 0 ? 'red' : 'blue'
      const kit = freeKit(team, next)
      if (kit) next.push({ playerId: pid, team, kitId: kit.id })
    })
    setLineup(next)
  }

  const available = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (players ?? []).filter(
      (p) => !lineup.some((s) => s.playerId === p.id) && (!term || p.name.toLowerCase().includes(term) || p.nickname?.toLowerCase().includes(term)),
    )
  }, [players, lineup, q])

  async function save() {
    setBusy(true)
    setError(null)
    const body = { name, rounds, roundSeconds: Math.round(roundMin * 60), breakSeconds: Math.round(breakMin * 60), players: lineup }
    try {
      const res = editId ? await patch<Scoreboard>(`/api/matches/${editId}`, body) : await post<Scoreboard>('/api/matches', body)
      navigate(`/command/matches/${res.match.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!players) return error ? <ErrorText error={error} /> : <Spinner />

  const playerById = new Map(players.map((p) => [p.id, p]))
  const red = lineup.filter((s) => s.team === 'red')
  const blue = lineup.filter((s) => s.team === 'blue')
  const canSave = red.length > 0 && blue.length > 0 && lineup.length >= 2
  const totalMin = rounds * roundMin + Math.max(0, rounds - 1) * breakMin

  const teamPanel = (team: Team, slots: Slot[]) => (
    <Panel
      accent={team}
      title={
        <span className={team === 'red' ? 'text-red' : 'text-blue'}>
          {team} team · {slots.length}
        </span>
      }
    >
      {slots.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-dim">Tap {team === 'red' ? '“Red”' : '“Blue”'} next to a player to add them.</p>
      ) : (
        <ul className="divide-y divide-line">
          {slots.map((s) => {
            const p = playerById.get(s.playerId)
            return (
              <li key={s.playerId} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-bold">{p ? p.nickname || p.name : `#${s.playerId}`}</span>
                <Select
                  aria-label="Kit"
                  value={s.kitId}
                  onChange={(e) => setKit(s.playerId, Number(e.target.value))}
                  className="!w-36 !py-1.5 text-sm"
                >
                  {kits
                    .filter((k) => k.team === team && (k.id === s.kitId || !lineup.some((x) => x.kitId === k.id)))
                    .map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label} · {GUN_NAMES[k.gun]}
                      </option>
                    ))}
                </Select>
                <button onClick={() => remove(s.playerId)} className="px-2 text-xl text-dim hover:text-red" aria-label="Remove from team">
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )

  return (
    <div className="space-y-5">
      <PageHeader title={editId ? 'Edit match' : 'New match'} sub="Pick players, split them into Red and Blue, set the clock." />

      <Panel title="Game timing">
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Match name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Birthday party" maxLength={60} />
          <Select label="Rounds" value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'round' : 'rounds'}
              </option>
            ))}
          </Select>
          <Select label="Round length" value={roundMin} onChange={(e) => setRoundMin(Number(e.target.value))}>
            {[1, 3, 5, 6, 8, 10, 12, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n} min
              </option>
            ))}
          </Select>
          <Select label="Break between rounds" value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))}>
            {[0, 0.5, 1, 2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? 'No break' : n < 1 ? '30 sec' : `${n} min`}
              </option>
            ))}
          </Select>
        </div>
        <p className="border-t border-line px-4 py-2 text-sm text-muted">
          Total time about <span className="font-bold text-text">{totalMin} min</span>
        </p>
      </Panel>

      {!editId && (
        <QuickStart
          players={players}
          kits={kits}
          timing={{ name, rounds, roundSeconds: Math.round(roundMin * 60), breakSeconds: Math.round(breakMin * 60) }}
          onPlayerCreated={(p) => setPlayers((cur) => [p, ...(cur ?? [])])}
        />
      )}
      {!editId && <p className="font-mono text-xs uppercase tracking-[0.25em] text-dim">Or pick saved players by hand</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <Panel
          title={`Players · ${available.length}`}
          action={
            <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
              + New
            </Button>
          }
          className="lg:row-span-2"
        >
          <div className="p-3">
            <input className="field" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
          </div>
          <ul className="max-h-[50dvh] divide-y divide-line overflow-y-auto lg:max-h-[60dvh]">
            {available.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-bold">
                  {p.nickname || p.name}
                  {p.nickname && <span className="ml-2 text-sm font-normal text-muted">{p.name}</span>}
                </span>
                <Button size="sm" variant="red" onClick={() => addTo(p.id, 'red')}>
                  Red
                </Button>
                <Button size="sm" variant="blue" onClick={() => addTo(p.id, 'blue')}>
                  Blue
                </Button>
              </li>
            ))}
            {available.length === 0 && <li className="px-4 py-6 text-center text-sm text-dim">No more players. Add a new one.</li>}
          </ul>
        </Panel>
        {teamPanel('red', red)}
        {teamPanel('blue', blue)}
      </div>

      <ErrorText error={error} />
      <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 border border-line bg-panel/95 p-3 backdrop-blur md:bottom-4">
        <span className="text-sm text-muted">
          {lineup.length}/{MAX_PLAYERS} players · <span className="text-red">{red.length} red</span> vs <span className="text-blue">{blue.length} blue</span>
        </span>
        <div className="flex gap-2">
          <Button onClick={shuffle} disabled={lineup.length < 2}>
            ⇄ Shuffle teams
          </Button>
          <Button variant="primary" disabled={!canSave || busy} onClick={save}>
            {editId ? 'Save match' : 'Create match'}
          </Button>
        </div>
      </div>

      <PlayerForm
        player={adding ? 'new' : null}
        onClose={() => setAdding(false)}
        onSaved={(p) => {
          setAdding(false)
          setPlayers((cur) => [p, ...(cur ?? [])])
        }}
      />
    </div>
  )
}
