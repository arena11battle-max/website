import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { WEAPONS, type GunId } from '../../three/data'
import { requestBooking } from '../bookingIntent'
import { useReducedMotion, webglAvailable } from '../hooks'
import { gsap, useGsap } from '../motion'
import { playShot, playTick } from '../sound'
import { SplitWords } from '../SplitWords'
import type { StageCommand } from './ArsenalStage'

const ArsenalStage = lazy(() => import('./ArsenalStage'))
const MAX_DAMAGE = Math.max(...WEAPONS.map((w) => w.damage))

type Weapon = (typeof WEAPONS)[number]

function Spec({ label, value, unit, fill }: { label: string; value: number | string; unit?: string; fill?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-mono text-[10px] uppercase tracking-[0.25em] text-smoke">{label}</dt>
        <dd className="score text-3xl leading-none text-bone">
          {typeof value === 'number' ? <span data-count={value}>{value}</span> : <span className="font-display text-base uppercase">{value}</span>}
          {unit && <span className="ml-1 text-base text-smoke">{unit}</span>}
        </dd>
      </div>
      {fill !== undefined && (
        <div className="mt-2 h-[3px] bg-white/10" aria-hidden>
          <div className="spec-bar h-full origin-left bg-hazard" style={{ transform: `scaleX(${fill})` }} data-fill={fill} />
        </div>
      )}
    </div>
  )
}

function GearCard({ w, i, onInspect, can3D }: { w: Weapon; i: number; onInspect: () => void; can3D: boolean }) {
  const card = useRef<HTMLElement>(null)

  // Pointer tilt and a moving glare, desktop pointers only.
  useGsap(card, (el) => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return
    gsap.set(el, { transformPerspective: 900 })
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3' })
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3' })
    const glare = el.querySelector<HTMLElement>('.gear-glare')!
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      rx(-y * 6)
      ry(x * 8)
      glare.style.background = `radial-gradient(500px circle at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgb(255 236 210 / 0.10), transparent 45%)`
    }
    const leave = () => {
      rx(0)
      ry(0)
      glare.style.background = 'transparent'
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  })

  return (
    <article
      ref={card}
      className="gear-card group relative flex flex-col border border-white/10 bg-gradient-to-b from-[#141414] to-[#0a0a0a] transition-colors duration-500 [transform-style:preserve-3d] hover:border-hazard/60"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-black" data-clip>
        <img
          src={w.image}
          alt={w.supplied ? `${w.name} gel blaster` : `${w.name} gel blaster, concept render`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.07]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
        <span className="gear-scan pointer-events-none absolute inset-x-0 top-0 h-px bg-hazard/70 opacity-0 group-hover:opacity-100" aria-hidden />
        <span className="absolute left-4 top-4 font-mono text-[10px] uppercase tracking-[0.3em] text-bone/70">0{i + 1} // {w.role}</span>
        <span className="absolute right-4 top-4 border border-bone/25 bg-black/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-bone/60">Gel blaster</span>
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="font-display text-2xl uppercase tracking-[0.04em] text-bone sm:text-3xl">{w.name}</h3>
        <p className="mt-2 text-smoke">{w.blurb}</p>
        <dl className="mt-6 space-y-4">
          <Spec label="Damage per hit" value={w.damage} unit="HP" fill={w.damage / MAX_DAMAGE} />
          <Spec label="Hits to eliminate" value={w.shotsToKill} fill={1 / w.shotsToKill} />
          <Spec label="Fire mode" value={w.fireMode} />
        </dl>
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          <button type="button" className="btn-hazard flex-1 !px-4 !py-3 text-xs" onClick={() => requestBooking({ loadout: w.name })}>
            Book with this loadout
          </button>
          {can3D && (
            <button type="button" className="btn-ghost !px-4 !py-3 text-xs" onClick={onInspect}>
              Inspect 3D
            </button>
          )}
        </div>
      </div>
      <div className="gear-glare pointer-events-none absolute inset-0" aria-hidden />
    </article>
  )
}

function Inspector({ gun, onClose }: { gun: GunId; onClose: () => void }) {
  const [command, setCommand] = useState<StageCommand | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const seq = useRef(0)
  const detailIdx = useRef(0)
  const w = WEAPONS.find((x) => x.id === gun)!
  const send = (kind: StageCommand['kind'], index?: number) => setCommand({ kind, seq: ++seq.current, index })
  return (
    <div className="relative h-full">
      <Suspense fallback={<div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-smoke">Loading model…</div>}>
        <ArsenalStage gun={w.model} command={command} onDetail={setDetail} onShot={() => playShot(false)} />
      </Suspense>
      <div className="pointer-events-none absolute left-5 top-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-hazard">{detail ? `Macro // ${detail}` : 'Drag to rotate'}</p>
        <p className="mt-2 font-display text-3xl uppercase text-bone sm:text-5xl">{w.name}</p>
      </div>
      <div className="absolute inset-x-3 bottom-4 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-ghost !px-3 !py-2 text-[11px]" onClick={() => send('free')}>
          Rotate view
        </button>
        <button
          type="button"
          className="btn-ghost !px-3 !py-2 text-[11px]"
          onClick={() => {
            send('detail', detailIdx.current)
            detailIdx.current++
          }}
        >
          Explore details
        </button>
        <button type="button" className="btn-ghost !px-3 !py-2 text-[11px]" onClick={() => send('fire')}>
          Test fire
        </button>
        <button type="button" className="btn-hazard !px-3 !py-2 text-[11px]" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="pointer-events-none absolute right-5 top-5 max-w-[14rem] text-right font-mono text-[9px] uppercase leading-relaxed tracking-[0.2em] text-bone/40">
        Recreational gel blaster prop. Not a firearm. Generic concept model, not the exact blaster.
      </p>
    </div>
  )
}

export default function Arsenal() {
  const root = useRef<HTMLElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [inspect, setInspect] = useState<GunId | null>(null)
  const reduced = useReducedMotion()
  const [webgl] = useState(() => webglAvailable())

  useGsap(root, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.gear-card'), { y: 80, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.12, scrollTrigger: { trigger: q('.gear-grid')[0], start: 'top 80%' } })
    for (const bar of q('.spec-bar') as HTMLElement[])
      gsap.fromTo(bar, { scaleX: 0 }, { scaleX: Number(bar.dataset.fill), duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: bar, start: 'top 92%' } })
  })

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (inspect && !d.open) d.showModal()
    if (!inspect && d.open) d.close()
  }, [inspect])

  return (
    <section ref={root} id="arsenal" className="site-section bg-[#070707]" aria-labelledby="arsenal-title">
      <div className="mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="kicker">03 // The arsenal</p>
            <SplitWords as="h2" id="arsenal-title" className="headline mt-4 text-bone" parts={['Choose your', { t: 'weapon', className: 'text-hazard' }]} />
          </div>
          <p className="reveal max-w-md text-smoke">
            Two assault rifles and two SMGs, each class with its own damage profile. Every blaster is a recreational prop, issued and checked by marshals and
            fired only inside the supervised arena. Eye protection is issued with every kit.
          </p>
        </div>
        <div className="gear-grid mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {WEAPONS.map((w, i) => (
            <GearCard
              key={w.id}
              w={w}
              i={i}
              can3D={webgl && !reduced}
              onInspect={() => {
                playTick()
                setInspect(w.id)
              }}
            />
          ))}
        </div>
        <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-bone/40">Blaster images supplied by ARENA11. Gel blasters, not firearms. Not for sale.</p>
      </div>
      <dialog
        ref={dialog}
        onClose={() => setInspect(null)}
        aria-label="Inspect gel blaster in 3D"
        className="m-0 h-[100dvh] max-h-none w-screen max-w-none bg-black p-0 text-bone backdrop:bg-black"
      >
        {inspect && <Inspector gun={inspect} onClose={() => setInspect(null)} />}
      </dialog>
    </section>
  )
}
