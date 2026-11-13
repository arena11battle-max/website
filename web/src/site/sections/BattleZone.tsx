import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useNearView, useReducedMotion, webglAvailable } from '../hooks'

const BattleZoneStage = lazy(() => import('./BattleZoneStage'))

// Scroll-driven 3D battle zone built from ARENA11's own images: the real arena photo as the map,
// the four supplied blaster images and the kit helmet. Static layout when WebGL or motion is off.
const CHAPTERS = [
  { k: '01 // The field', h: 'Real arena.', s: 'Towers, sandbags, pallets and barrels. Red base on one side, blue on the other.' },
  { k: '02 // The arsenal', h: 'Four blasters.', s: 'AR15 and Tactical M4 rifles, Vector and UMP45 SMGs. Gel blasters, not firearms.' },
  { k: '03 // The kit', h: 'Gear up.', s: 'Helmet, hit-tracking vest and neck scarf for every player, checked by a marshal.' },
]
const GUN_IMAGES = ['/media/gun-rifle.webp', '/media/gun-m4-tactical.webp', '/media/gun-smg.webp', '/media/gun-ump.webp']

export default function BattleZone() {
  const root = useNearView<HTMLElement>('800px')
  const progress = useRef(0)
  const [chapter, setChapter] = useState(0)
  const reduced = useReducedMotion()
  const [can3D] = useState(() => webglAvailable())
  const live = can3D && !reduced

  useEffect(() => {
    if (!live) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = root.ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const span = r.height - innerHeight
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0
      progress.current = p
      const ch = p < 0.33 ? 0 : p < 0.66 ? 1 : 2
      setChapter((c) => (c === ch ? c : ch))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [live, root.ref])

  if (!live)
    return (
      <section ref={root.ref} id="battle-zone" className="site-section relative overflow-hidden" aria-labelledby="bz-title">
        <div className="mx-auto max-w-[1440px]">
          <p className="kicker">Battle zone</p>
          <h2 id="bz-title" className="headline mt-4 text-bone">
            Real arena. <span className="text-hazard">Four blasters.</span> Full kit.
          </h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <img src="/media/real/arena-field.webp" alt="The ARENA11 arena field" loading="lazy" className="w-full border border-white/10 object-cover" />
            <img src="/media/real/helmet.webp" alt="ARENA11 tactical helmet" loading="lazy" className="w-full object-contain" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            {GUN_IMAGES.map((g) => (
              <img key={g} src={g} alt="" loading="lazy" className="w-full border border-white/10" />
            ))}
          </div>
        </div>
      </section>
    )

  const c = CHAPTERS[chapter]
  return (
    <section ref={root.ref} id="battle-zone" className="relative h-[320svh] bg-[#060606]" aria-labelledby="bz-title">
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {root.near && (
          <Suspense fallback={null}>
            <BattleZoneStage progress={progress} />
          </Suspense>
        )}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/0.75))]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#070707] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#070707] to-transparent" />

        <div className="pointer-events-none absolute left-[var(--edge)] top-24 max-w-md sm:top-28">
          <p className="kicker">Battle zone // 3D</p>
          <h2 id="bz-title" className="sr-only">
            Battle zone: the real arena, four blasters and the full kit
          </h2>
          <div key={chapter} className="bz-chapter mt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-hazard">{c.k}</p>
            <p aria-hidden className="mt-2 font-display text-[clamp(2.4rem,7vw,5.5rem)] uppercase leading-[0.95] text-bone">{c.h}</p>
            <p className="mt-4 max-w-sm text-sm text-bone/80 sm:text-base">{c.s}</p>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-6 left-[var(--edge)] right-[var(--edge)] flex items-end justify-between gap-4">
          <div className="flex gap-2" aria-hidden>
            {CHAPTERS.map((_, i) => (
              <span key={i} className={`h-1 w-10 transition-colors duration-500 ${i <= chapter ? 'bg-hazard' : 'bg-white/15'}`} />
            ))}
          </div>
          <p className="max-w-[15rem] text-right font-mono text-[9px] uppercase leading-relaxed tracking-[0.2em] text-bone/40">
            3D scene built from ARENA11's arena photo, blaster images and helmet design
          </p>
        </div>
      </div>
    </section>
  )
}
