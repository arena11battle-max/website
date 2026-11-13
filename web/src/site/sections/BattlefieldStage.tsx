import { useEffect, useRef } from 'react'
import { pickQuality } from '../../three/stage'
import { createWalkthrough, type Walkthrough } from '../../three/walkthrough'
import { useVisible } from '../hooks'

export default function BattlefieldStage({ chapter, playing, onChapter }: { chapter: { index: number; seq: number }; playing: boolean; onChapter: (i: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const wt = useRef<Walkthrough | null>(null)
  const clock = useRef(0)
  const visible = useVisible(wrap)
  const visibleRef = useRef(false)
  visibleRef.current = visible
  const chapterCb = useRef(onChapter)
  chapterCb.current = onChapter

  useEffect(() => {
    const c = canvas.current!
    const w = createWalkthrough(c, pickQuality(), { onChapter: (i) => chapterCb.current(i) })
    wt.current = w
    const ro = new ResizeObserver(([e]) => w.resize(Math.max(1, e.contentRect.width), Math.max(1, e.contentRect.height)))
    ro.observe(c)
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!visibleRef.current) return
      clock.current += dt
      w.renderAt(clock.current)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      w.dispose()
      wt.current = null
    }
  }, [])

  useEffect(() => {
    if (chapter.seq > 0) wt.current?.goTo(chapter.index, clock.current)
  }, [chapter])

  useEffect(() => {
    wt.current?.setPlaying(playing, clock.current)
  }, [playing])

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={canvas} className="h-full w-full" aria-label="Animated 3D fly-through of the arena concept layout" />
    </div>
  )
}
