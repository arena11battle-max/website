import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { TOUR_STOPS as TOUR } from '../../three/data'
import { useReducedMotion, webglAvailable } from '../hooks'
import { playTick } from '../sound'

const BattlefieldStage = lazy(() => import('./BattlefieldStage'))

/** Interactive 3D fly-through of the concept arena, shown full screen from the walkthrough. */
export default function Tour3D({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [chapter, setChapter] = useState({ index: 0, seq: 0 })
  const [playing, setPlaying] = useState(true)
  const [full, setFull] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [live] = useState(() => webglAvailable())
  const use3D = live && !reduced
  const stop = TOUR[index]

  // Stills fallback: step through the rendered stops on a timer.
  useEffect(() => {
    if (use3D || !playing || reduced) return
    const id = setTimeout(() => setIndex((i) => (i + 1) % TOUR.length), 5000)
    return () => clearTimeout(id)
  }, [use3D, playing, reduced, index])

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const go = (i: number) => {
    playTick()
    setIndex(i)
    setChapter({ index: i, seq: Date.now() })
  }
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void frame.current?.requestFullscreen?.()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 p-2 sm:p-4">
          <div ref={frame} className="relative h-full overflow-hidden bg-black">
            {TOUR.map((t, i) => (
              <img
                key={t.id}
                src={`/media/arena-${t.id}.webp`}
                alt={i === index ? `${t.title}, concept render` : ''}
                loading="lazy"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${!use3D && i === index ? 'opacity-100' : 'opacity-0'}`}
              />
            ))}
            {use3D && (
              <Suspense fallback={null}>
                <BattlefieldStage chapter={chapter} playing={playing} onChapter={setIndex} />
              </Suspense>
            )}
            <div className="grade pointer-events-none absolute inset-0 opacity-70" />
            <div className="brackets m-3" />
            <div className="pointer-events-none absolute left-5 top-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
              CAM {String(index + 1).padStart(2, '0')}/{TOUR.length} // {stop.id}
            </div>
            <div className="pointer-events-none absolute right-5 top-4 text-right font-mono text-[9px] uppercase tracking-[0.25em] text-amber/90">
              Concept layout
              <span className="block text-dim">Replaced by the real arena once photos are in</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
              <div aria-live="polite">
                <h3 className="font-display text-2xl uppercase sm:text-4xl">{stop.title}</h3>
                <p className="mt-1 max-w-lg text-sm text-text/80 sm:text-base">{stop.caption}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn-ghost !px-3 !py-2 text-[11px]" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button type="button" className="btn-ghost !px-3 !py-2 text-[11px]" onClick={() => go((index + 1) % TOUR.length)}>
                  Next
                </button>
                <button type="button" className="btn-ghost !px-3 !py-2 text-[11px]" onClick={toggleFull}>
                  {full ? 'Exit full screen' : 'Full screen'}
                </button>
                <button type="button" className="btn-hazard !px-3 !py-2 text-[11px]" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>
          </div>
      </div>
          <ol className="hidden grid-cols-5 gap-1 px-4 pb-3 sm:grid" aria-label="Walkthrough chapters">
            {TOUR.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === index}
                  className={`w-full border-t-2 px-1 py-2 text-left font-display text-[11px] uppercase tracking-[0.12em] transition ${
                    i === index ? 'border-hazard text-text' : 'border-white/10 text-dim hover:text-muted'
                  }`}
                >
                  <span className="font-mono text-hazard/80">{String(i + 1).padStart(2, '0')}</span> {t.title}
                </button>
              </li>
            ))}
          </ol>
    </div>
  )
}
