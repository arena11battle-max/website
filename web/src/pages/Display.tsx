import { useEffect, useRef, useState } from 'react'
import { KillFeed, ScoreHeader, TeamRoster } from '../components/game'
import { BRAND, BrandLogo } from '../brand'
import { useArenaSounds, useCountdown, useLiveScoreboard } from '../lib/live'
import type { FeedItem } from '../lib/types'

/** Full-screen arena TV. Public and read-only: no sign-in, no controls, no contact details. */
export default function Display() {
  const { data: board, none, connected } = useLiveScoreboard('display')
  const remaining = useCountdown(board?.timer)
  const [sound, setSound] = useState(false)
  const [banner, setBanner] = useState<FeedItem | null>(null)
  const lastKill = useRef<number | null>(null)

  useArenaSounds(sound, remaining, `${board?.match.id}-${board?.timer.status}-${board?.timer.round}`)

  // Flash a banner for each new kill.
  useEffect(() => {
    const kill = board?.feed.find((f) => f.type === 'kill')
    if (!kill) return
    if (lastKill.current !== null && kill.id > lastKill.current) {
      setBanner(kill)
      const t = setTimeout(() => setBanner(null), 2500)
      lastKill.current = kill.id
      return () => clearTimeout(t)
    }
    lastKill.current = kill.id
  }, [board?.feed])

  const fullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {})

  return (
    <div className="flex min-h-dvh flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      <header className="flex items-center justify-between">
        <BrandLogo size="md" showTagline={false} />
        <div className="flex items-center gap-3">
          {!connected && <span className="label text-amber">Reconnecting…</span>}
          <button onClick={() => setSound((s) => !s)} className="label border border-line-2 px-3 py-1.5 hover:text-text">
            Sound {sound ? 'on' : 'off'}
          </button>
          <button onClick={fullscreen} className="label border border-line-2 px-3 py-1.5 hover:text-text">
            Full screen
          </button>
        </div>
      </header>

      {!board || none ? (
        <div className="hud flex flex-1 flex-col items-center justify-center gap-8 p-10 text-center">
          <BrandLogo size="lg" />
          <div className="radar h-[min(40vw,320px)] w-[min(40vw,320px)]">
            <span className="radar-blip bg-red" style={{ top: '30%', left: '28%' }} />
            <span className="radar-blip bg-blue" style={{ top: '62%', left: '70%', animationDelay: '1.4s' }} />
            <span className="radar-blip bg-red" style={{ top: '70%', left: '36%', animationDelay: '2.2s' }} />
          </div>
          <div className="font-display text-[min(6vw,4.5rem)] leading-none tracking-wider">
            <span className="text-red glow-red">{BRAND.red}</span> <span className="text-dim">VS</span> <span className="text-blue glow-blue">{BRAND.blue}</span>
          </div>
          <p className="label text-base text-lime glow-lime sm:text-xl">Awaiting deployment</p>
        </div>
      ) : (
        <>
          <ScoreHeader board={board} remaining={remaining} size="tv" />
          <div className="grid flex-1 gap-3 sm:gap-4 lg:grid-cols-[1fr_minmax(320px,0.8fr)_1fr]">
            <div className="hud p-3">
              <TeamRoster board={board} team="red" />
            </div>
            <div className="hud order-last lg:order-none">
              <div className="label border-b border-line px-4 py-3">Kill feed</div>
              <KillFeed feed={board.feed} limit={10} />
            </div>
            <div className="hud p-3">
              <TeamRoster board={board} team="blue" />
            </div>
          </div>
          {board.match.status === 'finished' && board.mvp && (
            <div className="hud hud-corner p-4 text-center">
              <span className="label text-amber">Most valuable soldier</span>
              <div className={`font-display text-4xl ${board.mvp.team === 'red' ? 'text-red glow-red' : 'text-blue glow-blue'}`}>
                {board.mvp.displayName}
              </div>
              <div className="text-muted">
                {board.mvp.kills} kills · {board.mvp.damageDealt} damage
              </div>
            </div>
          )}
        </>
      )}

      {banner && (
        <div key={banner.id} className="pointer-events-none fixed inset-x-0 top-1/3 z-50 flex justify-center px-4" role="status">
          <div className="banner-in hud w-full max-w-4xl text-center">
            <div className="hazard h-3" />
            <div className="bg-black/60 px-8 py-5">
              <div className="font-display text-lg tracking-[0.4em] text-amber uppercase glow-amber sm:text-2xl">Enemy down</div>
              <div className="mt-1 font-display text-[min(7vw,4rem)] leading-tight uppercase">
                <span className={banner.shooterTeam === 'red' ? 'text-red glow-red' : 'text-blue glow-blue'}>{banner.shooter ?? `${banner.shooterTeam === 'red' ? 'Red' : 'Blue'} team`}</span>
                <span className="mx-4 text-amber">✕</span>
                <span className={banner.victimTeam === 'red' ? 'text-red glow-red' : 'text-blue glow-blue'}>{banner.victim}</span>
              </div>
              {banner.gunName && <div className="label mt-1">Weapon · {banner.gunName}</div>}
            </div>
            <div className="hazard h-3" />
          </div>
        </div>
      )}
    </div>
  )
}
