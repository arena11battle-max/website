import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ARENA_SCENES } from '../../three/data'
import { useReducedMotion, webglAvailable } from '../hooks'
import { gsap, ScrollTrigger, scrollToY, useGsap } from '../motion'
import { playTick } from '../sound'
import { SplitWords } from '../SplitWords'

const Tour3D = lazy(() => import('./Tour3D'))

// Pinned, full-screen walk through the arena. Each scene wipes in over the last while the camera keeps drifting,
// driven by scroll. Images are concept renders until real footage of the ARENA11 arena is supplied.

function Scene({ id, i }: { id: string; i: number }) {
  return (
    <div className="wt-layer absolute inset-0 overflow-hidden" style={{ zIndex: i + 1 }} data-i={i}>
      <picture>
        <source media="(max-width: 799px)" srcSet={`/media/scene-${id}-sm.webp`} />
        <img
          src={`/media/scene-${id}.webp`}
          alt=""
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          className="wt-img absolute inset-0 h-full w-full object-cover will-change-transform"
        />
      </picture>
    </div>
  )
}

export default function ArenaWalkthrough() {
  const root = useRef<HTMLElement>(null)
  const st = useRef<ScrollTrigger | null>(null)
  const [active, setActive] = useState(0)
  const [tour, setTour] = useState(false)
  const [can3D] = useState(() => webglAvailable())
  const reduced = useReducedMotion()
  const dialog = useRef<HTMLDialogElement>(null)
  const n = ARENA_SCENES.length

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    const layers = q('.wt-layer')
    const imgs = q('.wt-img')
    gsap.set(layers.slice(1), { clipPath: 'inset(0% 0% 0% 100%)' })
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: el,
        start: 'top top',
        end: () => `+=${window.innerHeight * (n - 1) * 0.9}`,
        scrub: 0.7,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => setActive(Math.min(n - 1, Math.round(self.progress * (n - 1)))),
      },
    })
    st.current = tl.scrollTrigger ?? null
    // A slow push-in on every image for the whole pin, so the frame never stops moving.
    imgs.forEach((img, i) => tl.fromTo(img, { scale: 1.22, xPercent: i % 2 ? 3 : -3 }, { scale: 1.02, xPercent: 0, duration: 1.4 }, Math.max(0, i - 0.7)))
    for (let i = 1; i < n; i++) {
      // Alternate the wipe direction for a cut-to-cut feel.
      const from = i % 2 ? 'inset(0% 0% 0% 100%)' : 'inset(100% 0% 0% 0%)'
      tl.fromTo(layers[i], { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.55, ease: 'power2.inOut' }, i - 0.6)
      tl.to(imgs[i - 1], { filter: 'brightness(0.35)', duration: 0.55 }, i - 0.6)
    }
    tl.to({}, { duration: 0.3 })
    return () => {
      st.current = null
    }
  })

  // Animate the caption for the active scene.
  const caption = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (reduced || !caption.current) return
    gsap.fromTo(caption.current.querySelectorAll('.cap-in'), { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.08, ease: 'power3.out' })
  }, [active, reduced])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (tour && !d.open) d.showModal()
    if (!tour && d.open) d.close()
  }, [tour])

  const jump = (i: number) => {
    playTick()
    const t = st.current
    if (!t) return setActive(i)
    scrollToY(t.start + ((t.end - t.start) * i) / (n - 1) + 2)
  }

  const scene = ARENA_SCENES[active]

  // Without motion the walkthrough is a simple list of scenes.
  if (reduced)
    return (
      <section id="battlefield" className="site-section" aria-labelledby="bf-title">
        <div className="mx-auto max-w-[1440px]">
          <p className="kicker">02 // Recon</p>
          <h2 id="bf-title" className="headline mt-4">
            Enter the <span className="text-hazard">battlefield</span>
          </h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {ARENA_SCENES.map((s) => (
              <li key={s.id} className="plate overflow-hidden">
                <img src={`/media/scene-${s.id}-sm.webp`} alt={`${s.title}, concept render`} loading="lazy" className="aspect-video w-full object-cover" />
                <div className="p-5">
                  <h3 className="font-display text-xl uppercase">{s.title}</h3>
                  <p className="mt-1 text-smoke">{s.caption}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-bone/40">Concept renders · replaced by the real arena once footage is in</p>
        </div>
      </section>
    )

  return (
    <section ref={root} id="battlefield" className="relative h-[100svh] overflow-hidden bg-black" aria-labelledby="bf-title">
      <div className="absolute inset-0">
        {ARENA_SCENES.map((s, i) => (
          <Scene key={s.id} id={s.id} i={i} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black via-black/10 to-black/70" />
      <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/0.7)_100%)]" />

      <div className="absolute inset-x-0 top-0 z-30 px-[var(--edge)] pt-20 sm:pt-24">
        <div className="mx-auto flex max-w-[1440px] items-start justify-between gap-6">
          <div>
            <p className="kicker">02 // Recon</p>
            <SplitWords as="h2" id="bf-title" className="headline-sm mt-3 text-bone" parts={['Enter the', { t: 'battlefield', className: 'text-hazard' }]} />
          </div>
          <div className="hidden text-right font-mono text-[10px] uppercase tracking-[0.3em] text-bone/50 sm:block">
            Cam {String(active + 1).padStart(2, '0')}/{String(n).padStart(2, '0')}
            <span className="mt-1 block text-[9px] text-amber/80">Concept render · real arena footage coming</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 px-[var(--edge)] pb-8 sm:pb-12">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div ref={caption} aria-live="polite" className="max-w-xl">
            <p className="cap-in font-mono text-xs uppercase tracking-[0.35em] text-hazard">
              {String(active + 1).padStart(2, '0')} // {scene.code}
            </p>
            <h3 className="cap-in mt-3 font-display text-[clamp(2rem,6vw,4.4rem)] uppercase leading-none text-bone">{scene.title}</h3>
            <p className="cap-in mt-3 text-base text-bone/75 sm:text-lg">{scene.caption}</p>
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            <ol className="flex gap-1.5" aria-label="Arena scenes">
              {ARENA_SCENES.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jump(i)}
                    aria-label={s.title}
                    aria-current={i === active}
                    className="group flex h-8 items-center"
                  >
                    <span className={`block h-[3px] transition-all duration-500 ${i === active ? 'w-12 bg-hazard' : 'w-6 bg-bone/25 group-hover:bg-bone/60'}`} />
                  </button>
                </li>
              ))}
            </ol>
            {can3D && (
              <button type="button" className="btn-ghost self-start !px-4 !py-2.5 text-xs lg:self-end" onClick={() => setTour(true)}>
                Explore in 3D · full screen
              </button>
            )}
          </div>
        </div>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setTour(false)}
        aria-label="3D arena walkthrough"
        className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-black p-0 text-bone backdrop:bg-black"
      >
        {tour && (
          <Suspense fallback={<div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-smoke">Loading arena…</div>}>
            <Tour3D onClose={() => setTour(false)} />
          </Suspense>
        )}
      </dialog>
    </section>
  )
}
