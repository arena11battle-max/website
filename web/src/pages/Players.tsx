import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Empty, ErrorText, Field, Modal, PageHeader, Panel, Spinner, StatusBadge } from '../components/ui'
import { get, patch, post } from '../lib/api'
import type { Player } from '../lib/types'

export default function Players() {
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [q, setQ] = useState('')
  const [archived, setArchived] = useState(false)
  const [editing, setEditing] = useState<Player | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    const params = new URLSearchParams({ archived: String(archived) })
    if (q.trim()) params.set('q', q.trim())
    get<{ players: Player[] }>(`/api/players?${params}`)
      .then((r) => setPlayers(r.players))
      .catch((e) => setError(e.message))
  }, [q, archived])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  return (
    <div>
      <PageHeader
        title="Players"
        sub="Everyone who has played or is about to."
        action={
          <Button variant="primary" onClick={() => setEditing('new')}>
            + Add player
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className="field max-w-sm" placeholder="Search name, nickname or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-amber" />
          Show archived
        </label>
      </div>
      <ErrorText error={error} />
      <Panel>
        {!players ? (
          <Spinner />
        ) : players.length === 0 ? (
          <Empty title={q ? 'No match for that search' : 'No players yet'}>
            {!q && (
              <Button variant="primary" onClick={() => setEditing('new')}>
                Add the first player
              </Button>
            )}
          </Empty>
        ) : (
          <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-3">
            {players.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:border-b sm:border-line">
                <Link to={`/command/players/${p.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg tracking-wide uppercase">{p.nickname || p.name}</div>
                  <div className="truncate text-sm text-muted">
                    {p.nickname ? `${p.name} · ` : ''}
                    {p.matches ?? 0} matches · {p.kills ?? 0} kills
                  </div>
                </Link>
                <Button size="sm" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <PlayerForm
        player={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
    </div>
  )
}

export function PlayerForm({ player, onClose, onSaved }: { player: Player | 'new' | null; onClose: () => void; onSaved: (p: Player) => void }) {
  const existing = player && player !== 'new' ? player : null
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setName(existing?.name ?? '')
    setNickname(existing?.nickname ?? '')
    setPhone(existing?.phone ?? '')
    setError(null)
  }, [player])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const body = { name, nickname, phone }
      const res = existing ? await patch<{ player: Player }>(`/api/players/${existing.id}`, body) : await post<{ player: Player }>('/api/players', body)
      onSaved(res.player)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleArchive() {
    if (!existing) return
    const res = await patch<{ player: Player }>(`/api/players/${existing.id}`, { archived: !existing.archived })
    onSaved(res.player)
  }

  return (
    <Modal open={!!player} onClose={onClose} title={existing ? 'Edit player' : 'Add player'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus />
        <Field label="Nickname (shown on scoreboard)" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={24} placeholder="e.g. Viper" />
        <Field
          label="Phone (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={20}
          hint="Only staff can see this. Never shown on the scoreboard."
        />
        <ErrorText error={error} />
        <div className="flex flex-wrap justify-between gap-2">
          {existing ? (
            <Button type="button" variant="danger" onClick={toggleArchive}>
              {existing.archived ? 'Restore' : 'Archive'}
            </Button>
          ) : (
            <span />
          )}
          <Button variant="primary" disabled={busy}>
            {existing ? 'Save' : 'Add player'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface PlayerDetailData {
  player: Player
  totals: { matches: number; wins: number; kills: number; deaths: number; hits: number; damage: number }
  history: { matchId: number; name: string; status: string; winner: string | null; team: 'red' | 'blue'; createdAt: string; kills: number; deaths: number; hits: number; damage: number }[]
}

export function PlayerDetail() {
  const { id } = useParams()
  const [data, setData] = useState<PlayerDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    get<PlayerDetailData>(`/api/players/${id}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [id])
  if (error) return <ErrorText error={error} />
  if (!data) return <Spinner />
  const { player, totals } = data
  const stats = [
    ['Matches', totals.matches],
    ['Wins', totals.wins],
    ['Kills', totals.kills],
    ['Deaths', totals.deaths],
    ['K/D', (totals.kills / Math.max(1, totals.deaths)).toFixed(2)],
    ['Damage', totals.damage],
  ]
  return (
    <div className="space-y-5">
      <PageHeader title={player.nickname || player.name} sub={player.nickname ? player.name : undefined} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="hud px-3 py-3">
            <div className="label">{label}</div>
            <div className="score mt-1 text-4xl text-amber">{value}</div>
          </div>
        ))}
      </div>
      <Panel title="Match history">
        {data.history.length === 0 ? (
          <Empty title="No matches yet" />
        ) : (
          <ul className="divide-y divide-line">
            {data.history.map((h) => (
              <li key={h.matchId}>
                <Link to={`/command/matches/${h.matchId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-panel-2">
                  <div>
                    <div className="font-bold">
                      <span className={h.team === 'red' ? 'text-red' : 'text-blue'}>■</span> {h.name}
                    </div>
                    <div className="text-sm text-muted">
                      {h.kills} K · {h.deaths} D · {h.hits} hits · {h.damage} dmg
                    </div>
                  </div>
                  {h.status === 'finished' ? (
                    <span className={`text-sm font-bold uppercase ${h.winner === h.team ? 'text-lime' : h.winner === 'draw' ? 'text-muted' : 'text-red'}`}>
                      {h.winner === h.team ? 'Won' : h.winner === 'draw' ? 'Draw' : 'Lost'}
                    </span>
                  ) : (
                    <StatusBadge status={h.status} />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
