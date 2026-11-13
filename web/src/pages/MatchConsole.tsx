import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KillFeed, RoundTable, ScoreHeader, StatsTable, TeamRoster } from '../components/game'
import VestPanel from '../components/VestPanel'
import { Button, ErrorText, Modal, Panel, Select, Spinner, StatusBadge } from '../components/ui'
import { del, get, post } from '../lib/api'
import { useArenaSounds, useCountdown, useLiveScoreboard } from '../lib/live'
import { GUN_DAMAGE, GUN_NAMES, type Scoreboard } from '../lib/types'

type Confirm = { action: 'next' | 'end' | 'delete'; title: string; body: string } | null

export default function MatchConsole({ matchId }: { matchId: number }) {
  const navigate = useNavigate()
  const { data: board, setData, connected } = useLiveScoreboard(matchId)
  const remaining = useCountdown(board?.timer)
  const [sound, setSound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [manualOpen, setManualOpen] = useState(false)

  useArenaSounds(sound, remaining, `${board?.timer.status}-${board?.timer.round}`)

  // First paint over HTTP in case the socket is slow to connect.
  useEffect(() => {
    get<Scoreboard>(`/api/matches/${matchId}`)
      .then((b) => setData((cur) => cur ?? b))
      .catch((e) => setError(e.message))
  }, [matchId, setData])

  async function act(action: 'start' | 'pause' | 'resume' | 'next' | 'end') {
    setBusy(true)
    setError(null)
    try {
      setData(await post<Scoreboard>(`/api/matches/${matchId}/${action}`))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  async function remove() {
    try {
      await del(`/api/matches/${matchId}`)
      navigate('/command/history')
    } catch (e) {
      setError((e as Error).message)
      setConfirm(null)
    }
  }

  async function rematch() {
    setBusy(true)
    try {
      const lineup = await get<{ players: unknown[] }>(`/api/matches/${matchId}/lineup`)
      const t = board!.timer
      const created = await post<Scoreboard>('/api/matches', {
        rounds: t.rounds,
        roundSeconds: t.roundSeconds,
        breakSeconds: t.breakSeconds,
        players: lineup.players,
      })
      navigate(`/command/matches/${created.match.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function voidEvent(id: number) {
    try {
      await del(`/api/events/${id}`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!board) return error ? <ErrorText error={error} /> : <Spinner label="Loading match" />
  const s = board.timer.status
  const running = s === 'live' || s === 'break' || s === 'paused'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="truncate font-display text-xl tracking-wider uppercase sm:text-2xl">{board.match.name}</h1>
            <StatusBadge status={s} />
          </div>
          <p className="text-sm text-muted">
            {board.timer.rounds} rounds × {Math.round(board.timer.roundSeconds / 60)} min · {board.timer.breakSeconds / 60} min breaks ·{' '}
            {board.players.length} players
            {!connected && <span className="ml-2 text-amber">· reconnecting…</span>}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted select-none">
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="accent-amber" />
          Countdown sounds
        </label>
      </div>

      <ScoreHeader board={board} remaining={remaining} />

      {/* Match controls: a 2-column grid of big buttons on phones, one row on larger screens. */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&_button]:w-full [&_button]:whitespace-nowrap sm:[&_button]:w-auto">
        {s === 'setup' && (
          <>
            <Button variant="go" size="lg" disabled={busy} onClick={() => act('start')} className="flex-1 sm:flex-none">
              ▶ Start match
            </Button>
            <Link to={`/command/matches/${matchId}/edit`}>
              <Button size="lg">Edit lineup</Button>
            </Link>
            <Button
              variant="danger"
              size="lg"
              onClick={() => setConfirm({ action: 'delete', title: 'Delete match?', body: 'This match has not started. It will be removed.' })}
            >
              Delete
            </Button>
          </>
        )}
        {s === 'live' && (
          <Button variant="primary" size="lg" disabled={busy} onClick={() => act('pause')} className="flex-1 sm:flex-none">
            ❚❚ Pause
          </Button>
        )}
        {s === 'paused' && (
          <Button variant="go" size="lg" disabled={busy} onClick={() => act('resume')} className="flex-1 sm:flex-none">
            ▶ Resume
          </Button>
        )}
        {s === 'break' && (
          <>
            <Button variant="go" size="lg" disabled={busy} onClick={() => act('next')} className="flex-1 sm:flex-none">
              ▶ Start round {board.timer.round + 1} now
            </Button>
            <Button size="lg" disabled={busy} onClick={() => act('pause')}>
              ❚❚ Pause break
            </Button>
          </>
        )}
        {s === 'live' && (
          <Button
            size="lg"
            disabled={busy}
            onClick={() =>
              setConfirm({
                action: 'next',
                title: `End round ${board.timer.round} now?`,
                body: board.timer.round >= board.timer.rounds ? 'This is the last round, so the match will finish.' : 'The break starts straight away.',
              })
            }
          >
            ⏭ End round
          </Button>
        )}
        {running && (
          <>
            <Button size="lg" onClick={() => setManualOpen(true)}>
              + Add hit / kill
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => setConfirm({ action: 'end', title: 'End the match now?', body: 'Scores are final and the winner is decided on kills so far.' })}
            >
              ■ End match
            </Button>
          </>
        )}
        {s === 'finished' && (
          <Button variant="primary" size="lg" disabled={busy} onClick={rematch}>
            ↻ Rematch, same teams
          </Button>
        )}
      </div>
      <ErrorText error={error} />

      {/* Rosters and live feed: three columns on a laptop, two on a tablet, stacked on a phone. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_minmax(300px,380px)_1fr]">
        <Panel title={<span className="text-red">Red team</span>} accent="red">
          <div className="p-3">
            <TeamRoster board={board} team="red" />
          </div>
        </Panel>
        <Panel title="Kill feed" accent="amber" className="md:col-span-2 md:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1">
          <KillFeed feed={board.feed} onVoid={running ? voidEvent : undefined} />
        </Panel>
        <Panel title={<span className="text-blue">Blue team</span>} accent="blue">
          <div className="p-3">
            <TeamRoster board={board} team="blue" />
          </div>
        </Panel>
      </div>

      {s !== 'finished' && <VestPanel board={board} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
        <Panel title="Rounds">
          <RoundTable board={board} />
        </Panel>
        <Panel title="Player stats">
          <StatsTable board={board} />
        </Panel>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        <p className="text-muted">{confirm?.body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => (confirm?.action === 'delete' ? remove() : act(confirm!.action as 'next' | 'end'))}
          >
            Confirm
          </Button>
        </div>
      </Modal>

      <ManualEvent open={manualOpen} onClose={() => setManualOpen(false)} board={board} />
    </div>
  )
}

function ManualEvent({ open, onClose, board }: { open: boolean; onClose: () => void; board: Scoreboard }) {
  const [type, setType] = useState<'kill' | 'hit'>('kill')
  const [shooter, setShooter] = useState('')
  const [victim, setVictim] = useState('')
  const [damage, setDamage] = useState(25)
  const [gun, setGun] = useState('')
  const [error, setError] = useState<string | null>(null)
  const shooterLine = board.players.find((p) => String(p.matchPlayerId) === shooter)
  const shooterTeam = board.players.find((p) => String(p.matchPlayerId) === shooter)?.team
  const victims = board.players.filter((p) => !shooterTeam || p.team !== shooterTeam)

  async function save() {
    setError(null)
    try {
      await post(`/api/matches/${board.match.id}/events`, {
        type,
        shooterMatchPlayerId: Number(shooter),
        victimMatchPlayerId: Number(victim),
        gun: gun === '' ? undefined : Number(gun),
        damage: type === 'hit' ? damage : undefined,
      })
      setVictim('')
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a missed hit or kill">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['kill', 'hit'] as const).map((t) => (
            <Button key={t} variant={type === t ? 'primary' : 'ghost'} onClick={() => setType(t)}>
              {t}
            </Button>
          ))}
        </div>
        <Select label="Shooter" value={shooter} onChange={(e) => setShooter(e.target.value)}>
          <option value="">Choose…</option>
          {board.players.map((p) => (
            <option key={p.matchPlayerId} value={p.matchPlayerId}>
              {p.kit} · {p.displayName} ({p.team})
            </option>
          ))}
        </Select>
        <Select label="Hit player" value={victim} onChange={(e) => setVictim(e.target.value)}>
          <option value="">Choose…</option>
          {victims.map((p) => (
            <option key={p.matchPlayerId} value={p.matchPlayerId}>
              {p.kit} · {p.displayName} ({p.team})
            </option>
          ))}
        </Select>
        <Select
          label="Weapon"
          value={gun}
          onChange={(e) => {
            setGun(e.target.value)
            const g = e.target.value === '' ? shooterLine?.gun : Number(e.target.value)
            if (g != null) setDamage(GUN_DAMAGE[g])
          }}
        >
          <option value="">Shooter's kit{shooterLine ? ` (${shooterLine.gunName})` : ''}</option>
          {GUN_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n} · {GUN_DAMAGE[i]} HP
            </option>
          ))}
        </Select>
        {type === 'hit' && (
          <label className="block space-y-1.5">
            <span className="label">Damage: {damage}</span>
            <input type="range" min={5} max={95} step={5} value={damage} onChange={(e) => setDamage(Number(e.target.value))} className="w-full accent-amber" />
          </label>
        )}
        <ErrorText error={error} />
        <Button variant="primary" className="w-full" disabled={!shooter || !victim} onClick={save}>
          Record {type}
        </Button>
      </div>
    </Modal>
  )
}
