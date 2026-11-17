import { lazy, Suspense, useState } from 'react'
import type { GearId, Team, VestSkin } from '../../three/gear'
import { gsap, useGsap } from '../motion'
import { playTick } from '../sound'
import { SplitWords } from '../SplitWords'
import { useNearView, webglAvailable } from '../hooks'

const GearStage = lazy(() => import('./GearStage'))

// Safety kit: every player is issued a hit-tracking vest, a helmet and a neck scarf, plus eye protection.
// The 3D models are built in code from ARENA11's reference photos; the vest photos are ARENA11's own.

const GEAR: { id: GearId; code: string; name: string; blurb: string; points: string[] }[] = [
  {
    id: 'vest',
    code: 'KIT-01',
    name: 'Hit-tracking vest',
    blurb: "A padded plate-carrier style vest in camo or black. Fitted with hit sensors for ARENA11's electronic scoring.",
    points: ['Hit sensors front and back', 'Team-colour light strip: red or blue', 'Adjustable shoulder and side buckles', 'Admin pouch, magazine pouches, D-ring'],
  },
  {
    id: 'helmet',
    code: 'KIT-02',
    name: 'Tactical helmet',
    blurb: 'A hard shell with a full brim and a padded chin strap. Fitted with its own hit sensors.',
    points: ['Hard shell with brim all round', 'Adjustable padded chin strap', 'Fabric cover with velcro panels and ARENA11 patch', 'Side rails and a decorative front mount'],
  },
]

const RULES = [
  'Eye protection stays on from the gate to the exit. No exceptions.',
  'Every kit is checked by a marshal before you enter.',
  'Blasters point down outside the field. Fire only inside the arena.',
  'No close-range shots: step back before you fire.',
  'Raise your hand and shout "Marshal" to stop play at any time.',
]

export default function Safety() {
  const root = useNearView<HTMLElement>('500px')
  const [item, setItem] = useState<GearId>('vest')
  const [skin, setSkin] = useState<VestSkin>('camo')
  const [team, setTeam] = useState<Team>('red')
  const [can3D] = useState(() => webglAvailable())
  const g = GEAR.find((x) => x.id === item)!

  useGsap(root.ref, (el) => {
    const q = gsap.utils.selector(el)
    gsap.from(q('.safety-stage'), { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.4, ease: 'expo.inOut', scrollTrigger: { trigger: q('.safety-stage')[0], start: 'top 80%' } })
    gsap.from(q('.safety-rule'), { x: -30, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: q('.safety-rules')[0], start: 'top 85%' } })
  })

  const pick = (id: GearId) => {
    playTick()
    setItem(id)
  }

  return (
    <section ref={root.ref} id="safety" className="site-section relative overflow-hidden bg-[#060606]" aria-labelledby="safety-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_30%_40%,rgb(255_90_31/0.08),transparent_70%)]" />
      <div className="relative mx-auto max-w-[1440px]">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="kicker">05 // Safety kit</p>
            <SplitWords as="h2" id="safety-title" className="headline mt-4 text-bone" parts={['Gear up.', { t: 'Stay safe.', className: 'text-hazard' }]} />
          </div>
          <p className="reveal max-w-md text-smoke">
            Every player is issued the full kit before the gate opens. Drag the model to turn it, or switch between the vest and helmet.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div className="safety-stage relative aspect-[4/5] overflow-hidden border border-white/10 bg-black sm:aspect-[16/11]">
            {can3D && root.near ? (
              <Suspense fallback={<div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-smoke">Loading kit…</div>}>
                <GearStage item={item} skin={skin} team={team} />
              </Suspense>
            ) : (
              <img src={`/media/real/vest-${skin}.webp`} alt={`ARENA11 ${skin} vest`} className="h-full w-full object-contain" loading="lazy" />
            )}
            <div className="pointer-events-none absolute left-4 top-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-hazard">{g.code} // Drag to rotate</p>
              <p className="mt-1 font-display text-2xl uppercase text-bone sm:text-4xl">{g.name}</p>
            </div>
            <p className="pointer-events-none absolute bottom-3 right-4 hidden max-w-[16rem] sm:block text-right font-mono text-[9px] uppercase leading-relaxed tracking-[0.2em] text-bone/40">
              3D model built from ARENA11's kit photos
            </p>
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
              {item === 'vest' &&
                (['camo', 'black'] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setSkin(s)} aria-pressed={skin === s} className={`choice !px-3 !py-1.5 text-[10px] ${skin === s ? 'is-on' : ''}`}>
                    {s}
                  </button>
                ))}
              {item !== 'scarf' &&
                (['red', 'blue'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTeam(t)}
                    aria-pressed={team === t}
                    className={`choice !px-3 !py-1.5 text-[10px] ${team === t ? 'is-on' : ''}`}
                  >
                    <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${t === 'red' ? 'bg-[#ff3b2f]' : 'bg-[#2f8bff]'}`} />
                    {t === 'red' ? 'Red Wolves' : 'Blue Falcons'}
                  </button>
                ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div role="tablist" aria-label="Safety kit" className="grid grid-cols-3 gap-2">
              {GEAR.map((x) => (
                <button
                  key={x.id}
                  role="tab"
                  type="button"
                  aria-selected={item === x.id}
                  onClick={() => pick(x.id)}
                  className={`border px-3 py-3 text-left transition-colors ${item === x.id ? 'border-hazard bg-hazard/10' : 'border-white/10 hover:border-white/30'}`}
                >
                  <span className="block font-mono text-[9px] tracking-[0.25em] text-hazard">{x.code}</span>
                  <span className="mt-1 block font-display text-sm uppercase leading-tight text-bone sm:text-base">{x.name}</span>
                </button>
              ))}
            </div>
            <div className="plate p-5 sm:p-6" aria-live="polite">
              <p className="text-bone/85">{g.blurb}</p>
              <ul className="mt-4 space-y-2">
                {g.points.map((p) => (
                  <li key={p} className="flex gap-3 text-sm text-smoke">
                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 bg-hazard" />
                    {p}
                  </li>
                ))}
              </ul>
              {item === 'vest' && (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {(['camo', 'black'] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setSkin(s)} className={`overflow-hidden border ${skin === s ? 'border-hazard' : 'border-white/10'}`} aria-label={`Show the ${s} vest`}>
                      <img src={`/media/real/vest-${s}.webp`} alt="" loading="lazy" className="aspect-[4/3] w-full bg-white object-cover object-top" />
                      <span className="block bg-black/80 py-1 font-mono text-[9px] uppercase tracking-[0.25em] text-bone/70">{s} vest</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="safety-rules plate p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-hazard">Rules of engagement</p>
              <ol className="mt-4 space-y-3">
                {RULES.map((r, i) => (
                  <li key={r} className="safety-rule flex gap-4">
                    <span className="font-mono text-hazard">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-sm text-bone/85">{r}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
