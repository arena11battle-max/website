import { useRef } from 'react'
import { gsap, useGsap } from '../motion'

// Pinned manifesto: the statement lights up word by word as you scroll, over a slow parallax of the arena.

const LINE = 'A real arena. Real cover. Real squads. Every hit tracked electronically, every score live on the big screen.'
const HOT = new Set(['arena.', 'cover.', 'squads.', 'tracked', 'live'])

const STATS = [
  { v: 8, prefix: '2–', suffix: '', l: 'Players per mission' },
  { v: 3, prefix: '', suffix: '×8', l: 'Minute rounds' },
  { v: 100, prefix: '', suffix: '', l: 'HP per operator' },
  { v: 10, prefix: '', suffix: '', l: 'Tracked kits' },
]

export default function Briefing() {
  const root = useRef<HTMLElement>(null)

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: '+=120%', scrub: 0.5, pin: true, anticipatePin: 1 } })
    tl.fromTo(q('.bf-bg'), { scale: 1.25, yPercent: -4 }, { scale: 1.05, yPercent: 4, ease: 'none', duration: 1 }, 0)
      .fromTo(q('.mf-word'), { opacity: 0.12 }, { opacity: 1, ease: 'none', stagger: 0.05, duration: 0.2 }, 0.05)
      .from(q('.mf-stat'), { y: 40, opacity: 0, stagger: 0.06, duration: 0.2 }, 0.72)
  })

  return (
    <section ref={root} id="briefing" className="relative flex min-h-[100svh] items-center overflow-hidden bg-black px-[var(--edge)] py-24" aria-label="Briefing">
      <div className="bf-bg absolute inset-0" aria-hidden>
        <img src="/media/real/arena-field.webp" alt="" loading="lazy" className="h-full w-full object-cover opacity-40" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black via-black/40 to-black" aria-hidden />
      <div className="relative mx-auto w-full max-w-[1300px]">
        <p className="kicker">01 // Briefing</p>
        <p className="mt-8 font-display text-[clamp(1.8rem,5.2vw,4.6rem)] uppercase leading-[1.02] text-bone">
          {LINE.split(' ').map((w, i) => (
            <span key={i} className={`mf-word ${HOT.has(w) ? 'text-hazard' : ''}`}>
              {w}{' '}
            </span>
          ))}
        </p>
        <dl className="mt-14 grid grid-cols-2 gap-px border border-white/10 bg-white/10 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.l} className="mf-stat flex flex-col-reverse bg-black/80 p-5 backdrop-blur-sm sm:p-7">
              <dt className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-smoke">{s.l}</dt>
              <dd className="score text-5xl text-bone sm:text-6xl">
                {s.prefix}
                <span data-count={s.v}>{s.v}</span>
                {s.suffix}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
