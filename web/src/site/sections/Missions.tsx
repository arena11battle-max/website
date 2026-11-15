import { useEffect, useRef, useState } from 'react'
import { requestBooking, type GameModeId } from '../bookingIntent'
import { useReducedMotion } from '../hooks'
import { gsap, useGsap } from '../motion'
import { SplitWords } from '../SplitWords'

// Game modes. Previews are short silent loops rendered from the concept arena (mode-*.mp4/webm); they play on hover
// with a mouse, or while the card is centred on a touch screen.

interface Mode {
  id: GameModeId
  file: string
  code: string
  name: string
  sub: string
  blurb: string
  players: string
  duration: string
  /** live: fully scored by the system. request: set up by marshals. preview: rules ready, electronic scoring not built yet. */
  status: 'live' | 'request' | 'preview'
  rules: string[]
}

const MODES: Mode[] = [
  {
    id: 'tdm',
    file: 'tdm',
    code: 'OP-01',
    name: 'Team Deathmatch',
    sub: 'Red Wolves vs Blue Falcons',
    blurb: 'Two opposing players (1 vs 1 · ₹300) live now — 2 vs 2 (₹500) launching soon. Every elimination scores live on the big screen.',
    players: '1v1 (2v2 soon)',
    duration: '30–40 min',
    status: 'live',
    rules: [
      'Currently active: Team Deathmatch 1 vs 1 (₹300). 2 vs 2 (₹500) is launching soon.',
      'Each session runs for 30–40 minutes.',
      'Every player starts each round with 100 HP. Rifles (AR15, Tactical M4) do 25 damage per hit, SMGs (Vector, UMP45) do 15.',
      'Eliminated players respawn after 8 seconds. No friendly fire.',
      'Most kills across all rounds wins. MVP goes to the most kills, then most damage, then fewest deaths.',
    ],
  },
  {
    id: 'domination',
    file: 'dom',
    code: 'OP-02',
    name: 'Domination',
    sub: 'Take and hold',
    blurb: 'Capture the contested centre and hold it. The squad that controls the ground controls the score.',
    players: '4–8',
    duration: '3 × 8 min',
    status: 'preview',
    rules: [
      'Control zones are marked in the arena. Stand in a zone with no enemy inside to hold it.',
      'Holding a zone earns your team time; eliminations still count toward MVP.',
      'Respawn at your base after 8 seconds.',
      'Electronic zone scoring is in development. Until it is live, marshals keep zone time.',
    ],
  },
  {
    id: 'last_squad',
    file: 'last',
    code: 'OP-03',
    name: 'Last Squad',
    sub: 'No respawns',
    blurb: 'One life per round. Move together, cover each other, and be the last squad standing.',
    players: '4–8',
    duration: 'Best of 5 rounds',
    status: 'preview',
    rules: [
      'One life per round: once you are eliminated you leave the field until the next round.',
      'The round ends when one squad has no players left, or when the clock runs out.',
      'Best of five rounds wins.',
      'Hits are tracked electronically. The no-respawn rule is run by marshals until it is built into the scoreboard.',
    ],
  },
  {
    id: 'custom',
    file: 'custom',
    code: 'OP-04',
    name: 'Custom Match',
    sub: 'Your rules',
    blurb: 'Uneven squads, more rounds, shorter rounds, longer breaks. Tell us the mission and our marshals set it up.',
    players: '2–8',
    duration: '1–10 rounds',
    status: 'request',
    rules: [
      'Choose who plays on which team, including uneven squads such as 3 vs 5.',
      'Choose the number of rounds (1 to 10), the round length and the break length.',
      'Mention your setup in the booking form. Marshals configure it before you arrive.',
      'Health, damage, respawn and scoring work the same as Team Deathmatch.',
    ],
  },
]

const STATUS = {
  live: { label: 'Live scoring', className: 'border-bone/40 text-bone' },
  request: { label: 'Set up on request', className: 'border-hazard/60 text-hazard' },
  preview: { label: 'Marshal-run · scoring in development', className: 'border-amber/50 text-amber' },
}

function ModeCard({ m, i, onBrief }: { m: Mode; i: number; onBrief: () => void }) {
  const card = useRef<HTMLElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const reduced = useReducedMotion()
  const [loaded, setLoaded] = useState(false)

  const play = () => {
    const v = video.current
    if (!v || reduced) return
    if (!loaded) setLoaded(true)
    v.play().catch(() => {})
  }
  const stop = () => video.current?.pause()

  // On touch screens, play while the card sits in the middle of the viewport.
  useEffect(() => {
    if (reduced || matchMedia('(hover: hover)').matches) return
    const el = card.current!
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : stop()), { rootMargin: '-35% 0px -35% 0px' })
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced])

  const s = STATUS[m.status]
  return (
    <article
      ref={card}
      onPointerEnter={(e) => e.pointerType === 'mouse' && play()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && stop()}
      className="mode-card group relative flex min-h-[460px] flex-col justify-end overflow-hidden border border-white/10 bg-black sm:min-h-[520px]"
    >
      <div className="absolute inset-0" data-clip>
        <video
          ref={video}
          muted
          loop
          playsInline
          preload="none"
          poster={`/media/mode-${m.file}.webp`}
          aria-hidden
          className="h-full w-full object-cover opacity-70 transition duration-700 group-hover:opacity-100"
        >
          {loaded && <source src={`/media/mode-${m.file}.webm`} type="video/webm" />}
          {loaded && <source src={`/media/mode-${m.file}.mp4`} type="video/mp4" />}
        </video>
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/0" />
      <div className="absolute inset-x-0 top-0 h-[2px] origin-left scale-x-0 bg-hazard transition-transform duration-700 group-hover:scale-x-100" aria-hidden />
      <span className="absolute right-5 top-5 font-display text-6xl text-bone/10 transition-colors duration-500 group-hover:text-hazard/30">0{i + 1}</span>
      <div className="relative p-6 sm:p-7">
        <span className={`chip ${s.className}`}>{s.label}</span>
        <p className="mt-5 font-mono text-[11px] tracking-[0.3em] text-hazard">{m.code}</p>
        <h3 className="mt-2 font-display text-3xl uppercase leading-none text-bone sm:text-4xl">{m.name}</h3>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">{m.sub}</p>
        <p className="mt-4 text-bone/80">{m.blurb}</p>
        <dl className="mt-5 flex gap-8 border-t border-white/10 pt-4">
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-smoke">Squad</dt>
            <dd className="mt-1 font-display text-lg text-bone">{m.players}</dd>
          </div>
          <div>
            <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-smoke">Duration</dt>
            <dd className="mt-1 font-display text-lg text-bone">{m.duration}</dd>
          </div>
        </dl>
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-hazard flex-1 !px-4 !py-3 text-xs" onClick={() => requestBooking({ mode: m.id })}>
            {m.status === 'live' ? 'Book this mode' : 'Request this mode'}
          </button>
          <button type="button" className="btn-ghost !px-4 !py-3 text-xs" onClick={onBrief}>
            Briefing
          </button>
        </div>
      </div>
    </article>
  )
}

export default function Missions() {
  const root = useRef<HTMLElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const m = MODES.find((x) => x.id === open)

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.mode-card'), { y: 90, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12, scrollTrigger: { trigger: q('.mode-grid')[0], start: 'top 80%' } })
  })

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (m && !d.open) d.showModal()
    if (!m && d.open) d.close()
  }, [m])

  return (
    <section ref={root} id="missions" className="site-section bg-black" aria-labelledby="missions-title">
      <div className="mx-auto max-w-[1440px]">
        <div className="text-center">
          <p className="kicker">04 // Game modes</p>
          <SplitWords as="h2" id="missions-title" className="headline mt-4 text-bone" parts={['Choose your', { t: 'mission', className: 'text-hazard' }]} />
        </div>
        <div className="mode-grid mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {MODES.map((x, i) => (
            <ModeCard key={x.id} m={x} i={i} onBrief={() => setOpen(x.id)} />
          ))}
        </div>
        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-bone/40">Previews are concept renders of the arena</p>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === dialog.current && setOpen(null)}
        className="m-auto w-[min(640px,calc(100vw-32px))] bg-transparent p-0 text-bone backdrop:bg-black/85 backdrop:backdrop-blur-sm"
      >
        {m && (
          <div className="plate p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs tracking-[0.3em] text-hazard">{m.code} // Mission briefing</span>
                <h3 className="mt-2 font-display text-3xl uppercase">{m.name}</h3>
              </div>
              <button type="button" onClick={() => setOpen(null)} className="p-2 text-smoke hover:text-bone" aria-label="Close briefing">
                ✕
              </button>
            </div>
            <ol className="mt-6 space-y-3">
              {m.rules.map((r, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-mono text-hazard">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-bone/85">{r}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => {
                setOpen(null)
                requestBooking({ mode: m.id })
              }}
              className="btn-hazard mt-8 w-full text-sm"
            >
              {m.status === 'live' ? 'Book this mode' : 'Request this mode'}
            </button>
          </div>
        )}
      </dialog>
    </section>
  )
}
