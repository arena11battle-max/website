import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KillFeed, RoundTable, ScoreHeader, StatsTable, TeamRoster } from '../components/game'
import VestPanel from '../components/VestPanel'
import { Button, ErrorText, Field, Modal, Panel, Select, Spinner, StatusBadge } from '../components/ui'
import { del, get, post } from '../lib/api'
import { useArenaSounds, useCountdown, useLiveScoreboard } from '../lib/live'
import { GUN_DAMAGE, GUN_NAMES, type Kit, type Player, type Scoreboard, type Team } from '../lib/types'

type Confirm = { action: 'next' | 'end' | 'delete' | 'reset'; title: string; body: string } | null

interface HpHistoryItem {
  id: number
  round: number
  scope: 'player' | 'all'
  hpBefore: number | null
  hpAfter: number
  playerName: string | null
  team: Team | null
  resetBy: string | null
  createdAt: string
}

export default function MatchConsole({ matchId }: { matchId: number }) {
  const navigate = useNavigate()
  const { data: board, setData, connected } = useLiveScoreboard(matchId)
  const remaining = useCountdown(board?.timer)
  const [sound, setSound] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [nextMatchOpen, setNextMatchOpen] = useState(false)
  const [hpHistory, setHpHistory] = useState<HpHistoryItem[]>([])

  useArenaSounds(sound, remaining, `${board?.timer.status}-${board?.timer.round}`)

  const loadHpHistory = useCallback(() => {
    get<{ history: HpHistoryItem[] }>(`/api/matches/${matchId}/hp-history`)
      .then((r) => setHpHistory(r.history))
      .catch(() => {})
  }, [matchId])

  // First paint over HTTP in case the socket is slow to connect.
  useEffect(() => {
    get<Scoreboard>(`/api/matches/${matchId}`)
      .then((b) => setData((cur) => cur ?? b))
      .catch((e) => setError(e.message))
    loadHpHistory()
  }, [matchId, setData, loadHpHistory])

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

  async function resetHp(matchPlayerId?: number) {
    setBusy(true)
    setError(null)
    try {
      const res = await post<{ scoreboard: Scoreboard }>(`/api/matches/${matchId}/reset-hp`, {
        matchPlayerId,
      })
      setData(res.scoreboard)
      loadHpHistory()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function resetCurrentMatch() {
    setBusy(true)
    setError(null)
    try {
      setData(await post<Scoreboard>(`/api/matches/${matchId}/reset`))
      setConfirm(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
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
            <Button size="lg" variant="primary" disabled={busy} onClick={() => resetHp()}>
              ♥ HP Reset (All)
            </Button>
            <Button size="lg" onClick={() => setManualOpen(true)}>
              + Add hit / kill
            </Button>
            <Button
              size="lg"
              disabled={busy}
              onClick={() => setConfirm({ action: 'reset', title: 'Reset match?', body: 'All recorded hits/kills in this match will be voided and the timer reset to setup.' })}
            >
              ↺ Reset match
            </Button>
            <Button
              variant="danger"
              size="lg"
              onClick={() => setConfirm({ action: 'end', title: 'End the match now?', body: 'Scores are final and the winner is decided on valid kills so far.' })}
            >
              ■ End match
            </Button>
          </>
        )}
        <Button variant="go" size="lg" disabled={busy} onClick={() => setNextMatchOpen(true)}>
          ⏭ Next Match
        </Button>
        {s === 'finished' && (
          <Button variant="primary" size="lg" disabled={busy} onClick={rematch}>
            ↻ Rematch, same teams
          </Button>
        )}
      </div>
      {s === 'finished' && (
        <div className="hud hud-corner p-4 text-center">
          <div className="label text-amber">Match Result</div>
          {board.match.winner === null ? (
            <div className="mt-1 font-display text-2xl uppercase text-muted">No valid scoring events — no winner</div>
          ) : board.match.winner === 'draw' ? (
            <div className="mt-1 font-display text-3xl uppercase text-amber">DRAW</div>
          ) : (
            <div className={`mt-1 font-display text-3xl uppercase ${board.match.winner === 'red' ? 'text-red glow-red' : 'text-blue glow-blue'}`}>
              {board.match.winner} Team Wins
            </div>
          )}
        </div>
      )}
      <ErrorText error={error} />

      {/* Rosters and live feed: three columns on a laptop, two on a tablet, stacked on a phone. */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_minmax(300px,380px)_1fr]">
        <Panel title={<span className="text-red">Red team</span>} accent="red">
          <div className="p-3 space-y-2">
            <TeamRoster board={board} team="red" />
            {running && (
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                {board.players
                  .filter((p) => p.team === 'red')
                  .map((p) => (
                    <Button key={p.matchPlayerId} size="sm" disabled={busy} onClick={() => resetHp(p.matchPlayerId)}>
                      Reset {p.displayName} HP ({p.hp})
                    </Button>
                  ))}
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Kill feed" accent="amber" className="md:col-span-2 md:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1">
          <KillFeed feed={board.feed} onVoid={running ? voidEvent : undefined} />
        </Panel>
        <Panel title={<span className="text-blue">Blue team</span>} accent="blue">
          <div className="p-3 space-y-2">
            <TeamRoster board={board} team="blue" />
            {running && (
              <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                {board.players
                  .filter((p) => p.team === 'blue')
                  .map((p) => (
                    <Button key={p.matchPlayerId} size="sm" disabled={busy} onClick={() => resetHp(p.matchPlayerId)}>
                      Reset {p.displayName} HP ({p.hp})
                    </Button>
                  ))}
              </div>
            )}
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

      {hpHistory.length > 0 && (
        <Panel title="HP Reset History">
          <ul className="divide-y divide-line text-sm">
            {hpHistory.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>
                  <span className="font-bold">{h.playerName ?? 'All players'}</span> (R{h.round}) —{' '}
                  <span className="font-mono text-muted">{h.hpBefore ?? '?'} → {h.hpAfter} HP</span>
                </span>
                <span className="font-mono text-xs text-muted">
                  by {h.resetBy ?? 'Staff'} · {new Date(h.createdAt).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        <p className="text-muted">{confirm?.body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() =>
              confirm?.action === 'delete'
                ? remove()
                : confirm?.action === 'reset'
                  ? resetCurrentMatch()
                  : act(confirm!.action as 'next' | 'end')
            }
          >
            Confirm
          </Button>
        </div>
      </Modal>

      <ManualEvent open={manualOpen} onClose={() => setManualOpen(false)} board={board} />
      <NextMatchModal open={nextMatchOpen} onClose={() => setNextMatchOpen(false)} currentBoard={board} />
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

function NextMatchModal({ open, onClose, currentBoard }: { open: boolean; onClose: () => void; currentBoard: Scoreboard }) {
  const navigate = useNavigate()
  const [players, setPlayers] = useState<Player[]>([])
  const [kits, setKits] = useState<Kit[]>([])
  const [redId, setRedId] = useState<number | ''>('')
  const [blueId, setBlueId] = useState<number | ''>('')
  const [minutes, setMinutes] = useState(Math.floor(currentBoard.timer.roundSeconds / 60))
  const [seconds, setSeconds] = useState(currentBoard.timer.roundSeconds % 60)
  const [rounds, setRounds] = useState(currentBoard.timer.rounds)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    Promise.all([get<{ players: Player[] }>('/api/players'), get<{ kits: Kit[] }>('/api/admin/kits')])
      .then(([p, k]) => {
        setPlayers(p.players)
        setKits(k.kits.filter((x) => x.active))
        const curRed = currentBoard.players.find((x) => x.team === 'red')
        const curBlue = currentBoard.players.find((x) => x.team === 'blue')
        if (curRed && !redId) setRedId(curRed.playerId)
        if (curBlue && !blueId) setBlueId(curBlue.playerId)
      })
      .catch((e) => setError(e.message))
  }, [open, currentBoard.players, redId, blueId])

  async function launch() {
    if (!redId || !blueId || redId === blueId) {
      setError('Select two different players for Red and Blue teams.')
      return
    }
    const redKit = kits.find((k) => k.team === 'red')
    const blueKit = kits.find((k) => k.team === 'blue')
    if (!redKit || !blueKit) {
      setError('Missing active Red or Blue kit.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (['live', 'break', 'paused'].includes(currentBoard.timer.status)) {
        await post(`/api/matches/${currentBoard.match.id}/end`)
      }
      const created = await post<Scoreboard>('/api/matches', {
        rounds,
        roundSeconds: Math.max(10, Math.round(minutes * 60 + seconds)),
        breakSeconds: 0,
        players: [
          { playerId: Number(redId), team: 'red' as Team, kitId: redKit.id },
          { playerId: Number(blueId), team: 'blue' as Team, kitId: blueKit.id },
        ],
      })
      onClose()
      navigate(`/command/matches/${created.match.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Next Match Setup">
      <div className="space-y-4">
        <Select label="Red Team Player" value={redId} onChange={(e) => setRedId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Choose Red player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname || p.name}
            </option>
          ))}
        </Select>
        <Select label="Blue Team Player" value={blueId} onChange={(e) => setBlueId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Choose Blue player…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname || p.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Minutes" type="number" min={0} max={120} value={minutes} onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))} />
          <Field label="Seconds" type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(Math.min(59, Math.max(0, Number(e.target.value) || 0)))} />
          <Field label="Rounds" type="number" min={1} max={10} value={rounds} onChange={(e) => setRounds(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {[1, 2, 3, 4, 5, 6, 10, 15].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMinutes(m)
                setSeconds(0)
              }}
              className={`border px-2 py-0.5 font-mono ${minutes === m && seconds === 0 ? 'border-amber text-amber' : 'border-line-2 text-muted hover:text-text'}`}
            >
              {m}m
            </button>
          ))}
        </div>
        <ErrorText error={error} />
        <Button variant="go" className="w-full" disabled={busy} onClick={launch}>
          {busy ? 'Creating…' : 'Create & Open Next Match'}
        </Button>
      </div>
    </Modal>
  )
}
