import { useEffect, useState } from 'react'
import type { Scoreboard } from '../lib/types'
import { bluetoothSupported, connectVest, disconnectVest, retryVest, setVestKit, setVestMatch, useVests, type Vest } from '../lib/vests'
import { Button, ErrorText, Panel } from './ui'

const STATUS: Record<Vest['status'], { text: string; dot: string }> = {
  connecting: { text: 'Connecting…', dot: 'bg-amber' },
  connected: { text: 'Connected', dot: 'bg-lime' },
  reconnecting: { text: 'Signal lost, reconnecting…', dot: 'bg-amber' },
  lost: { text: 'Disconnected', dot: 'bg-red' },
}

/** Live match screen: pair Bluetooth vests so their real hits score in this match. */
export default function VestPanel({ board }: { board: Scoreboard }) {
  const vests = useVests()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const supported = bluetoothSupported()

  useEffect(() => {
    setVestMatch(board.match.id)
    return () => setVestMatch(null)
  }, [board.match.id])

  async function add() {
    setError(null)
    setBusy(true)
    try {
      await connectVest()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title="Vests · Bluetooth"
      action={
        supported ? (
          <Button size="sm" variant="primary" disabled={busy} onClick={add}>
            {busy ? 'Choose a vest…' : '+ Connect vest'}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3 p-4">
        {!supported && (
          <p className="text-sm text-muted">
            This browser can't reach Bluetooth vests. Open the console in <b className="text-text">Chrome or Edge on a PC or Android phone</b>{' '}
            (iPhone browsers don't allow it). The site must be on https or localhost.
          </p>
        )}
        {supported && vests.length === 0 && (
          <p className="text-sm text-muted">
            No vest connected. Switch a vest on, press <b className="text-text">Connect vest</b> and pick it (named like SG-VEST-B1). Its hits then lower that
            player's health here and count in the score.
          </p>
        )}
        <ErrorText error={error} />
        <ul className="space-y-2">
          {vests.map((v) => {
            const st = STATUS[v.status]
            const player = board.players.find((p) => p.kit.toUpperCase() === v.kit)
            return (
              <li key={v.id} className="border border-line bg-ink/40 p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} aria-hidden />
                  <span className="font-display uppercase">{v.name}</span>
                  <span className="text-xs text-muted">{st.text}</span>
                  <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                    Kit
                    <select
                      className="field w-auto py-1 text-sm"
                      value={v.kit ?? ''}
                      onChange={(e) => setVestKit(v.id, e.target.value || null)}
                      aria-label={`Kit for ${v.name}`}
                    >
                      <option value="">Pick…</option>
                      {board.players.map((p) => (
                        <option key={p.matchPlayerId} value={p.kit.toUpperCase()}>
                          {p.kit} · {p.nickname || p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {v.status === 'lost' && (
                    <Button size="sm" onClick={() => retryVest(v.id)}>
                      Retry
                    </Button>
                  )}
                  <Button size="sm" onClick={() => disconnectVest(v.id)}>
                    Disconnect
                  </Button>
                </div>
                <div className="mt-2 grid gap-1 font-mono text-xs text-muted sm:grid-cols-3">
                  <span>
                    {player ? `Player: ${player.nickname || player.name}` : v.kit ? <span className="text-amber">Kit {v.kit} is not in this match</span> : 'Pick a kit'}
                  </span>
                  <span>Vest reports: {v.vestHp != null ? `${v.vestHp} HP${v.vestAlive === false ? ', down' : ''}` : 'waiting…'}</span>
                  <span>{v.events} events recorded</span>
                </div>
                {(v.lastLine || v.lastResult) && (
                  <p className="mt-1 font-mono text-xs">
                    {v.lastLine && <span className="text-dim">{v.lastLine} → </span>}
                    <span className={v.lastResult?.startsWith('Not') ? 'text-amber' : 'text-text'}>{v.lastResult ?? '…'}</span>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        {vests.length > 0 && (
          <p className="text-xs text-dim">
            Body hits take 25 HP and helmet hits 50, the same as the vest. Guns that don't send a player ID yet: the kill goes to the other team's score but to
            no single player.
          </p>
        )}
      </div>
    </Panel>
  )
}
