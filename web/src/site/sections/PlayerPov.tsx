import { useEffect, useRef, useState } from 'react'
import { gsap, useGsap } from '../motion'
import { SplitWords } from '../SplitWords'
import { useNearView, useReducedMotion, useVisible } from '../hooks'

// Player POV: ARENA11's own head-camera clip (watermark cropped, audio removed), shown in a phone frame.
const BEATS = [
  { t: '00:00', h: 'Arrive', d: 'Pull up at the gate. Your squad checks in at the counter.' },
  { t: '00:09', h: 'Step out', d: 'Doors open, blaster out. A marshal checks every kit at the gate.' },
  { t: '00:13', h: 'Deploy', d: 'Blaster in hand, walk out to your base and wait for the call.' },
]

export default function PlayerPov() {
  const root = useNearView<HTMLElement>('600px')
  const video = useRef<HTMLVideoElement>(null)
  const visible = useVisible(video)
  const reduced = useReducedMotion()
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)

  // Autoplay only when motion is allowed and the clip is on screen; otherwise it waits for the play button.
  useEffect(() => {
    const v = video.current
    if (!v || !root.near) return
    if (visible && !reduced) v.play().catch(() => setPlaying(false))
    else v.pause()
  }, [visible, reduced, root.near])

  useGsap(root.ref, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.pov-phone'), { y: 120, rotate: -6, opacity: 0, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: q('.pov-phone')[0], start: 'top 85%' } })
    gsap.from(q('.pov-beat'), { x: 40, opacity: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: q('.pov-beats')[0], start: 'top 85%' } })
  })

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) v.play().catch(() => undefined)
    else v.pause()
  }

  const active = BEATS.reduce((a, b, i) => (time >= toSec(b.t) ? i : a), 0)

  return (
    <section ref={root.ref} id="pov" className="site-section relative overflow-hidden" aria-labelledby="pov-title">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <img src="/media/real/pov-poster.webp" alt="" className="h-full w-full scale-110 object-cover blur-3xl" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#060606] via-[#060606]/70 to-[#060606]" />
      </div>
      <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 lg:grid-cols-[auto_1fr] lg:gap-20">
        <div className="pov-phone relative mx-auto w-[min(78vw,330px)]">
          <div className="relative overflow-hidden rounded-[38px] border-[10px] border-[#151515] bg-black shadow-[0_40px_120px_-20px_rgb(255_90_31/0.35)] ring-1 ring-white/10">
            <div className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <video
              ref={video}
              className="block aspect-[464/672] w-full object-cover"
              poster="/media/real/pov-poster.webp"
              muted
              loop
              playsInline
              preload={root.near ? 'metadata' : 'none'}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              aria-label="Player point-of-view clip filmed at ARENA11"
            >
              {root.near && <source src="/media/real/pov.webm" type="video/webm" />}
              {root.near && <source src="/media/real/pov.mp4" type="video/mp4" />}
            </video>
            <div className="pointer-events-none absolute inset-0 z-10 bg-[repeating-linear-gradient(0deg,rgb(0_0_0/0.18)_0_1px,transparent_1px_3px)] mix-blend-multiply" aria-hidden />
            <div className="pointer-events-none absolute left-4 right-4 top-9 z-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.25em] text-bone/90">
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full bg-[#ff3b2f] ${playing ? 'animate-pulse' : 'opacity-40'}`} />
                {playing ? 'Rec' : 'Paused'}
              </span>
              <span className="tabular-nums">00:{String(Math.floor(time)).padStart(2, '0')}</span>
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 z-10 bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.25em] text-hazard">
              POV // {BEATS[active].h}
            </div>
            <button
              type="button"
              onClick={toggle}
              className="absolute inset-0 z-10 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-hazard"
              aria-label={playing ? 'Pause the clip' : 'Play the clip'}
            >
              {!playing && (
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-hazard bg-black/60 backdrop-blur">
                  <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-hazard" aria-hidden>
                    <path d="M7 4v16l13-8Z" />
                  </svg>
                </span>
              )}
            </button>
          </div>
          <p className="mt-4 text-center font-mono text-[9px] uppercase tracking-[0.25em] text-bone/40">Filmed by ARENA11 · player head camera</p>
        </div>

        <div>
          <p className="kicker">06 // Player POV</p>
          <SplitWords as="h2" id="pov-title" className="headline mt-4 text-bone" parts={['Arrive.', 'Gear up.', { t: 'Deploy.', className: 'text-hazard' }]} />
          <p className="reveal mt-6 max-w-lg text-smoke">See the day through a player's eyes, from the car park to the field.</p>
          <ol className="pov-beats mt-10 space-y-3">
            {BEATS.map((b, i) => (
              <li key={b.h} className={`pov-beat flex gap-5 border-l-2 py-3 pl-5 transition-colors duration-500 ${i === active && playing ? 'border-hazard bg-hazard/5' : 'border-white/10'}`}>
                <span className="font-mono text-xs tabular-nums text-hazard">{b.t}</span>
                <span>
                  <span className="block font-display text-xl uppercase text-bone">{b.h}</span>
                  <span className="mt-1 block text-sm text-smoke">{b.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function toSec(t: string) {
  const [m, s] = t.split(':').map(Number)
  return m * 60 + s
}
