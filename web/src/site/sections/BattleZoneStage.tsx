import { useEffect, useRef } from 'react'
import { createBattleZone } from '../../three/battlezone'
import { pickQuality } from '../../three/stage'
import { useVisible } from '../hooks'

// WebGL canvas for the battle zone. Loaded on demand; pauses when off screen.
export default function BattleZoneStage({ progress }: { progress: React.RefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const visible = useVisible(canvas)
  const visibleRef = useRef(false)
  visibleRef.current = visible

  useEffect(() => {
    const c = canvas.current!
    const bz = createBattleZone(c, pickQuality())
    const ro = new ResizeObserver(([e]) => bz.resize(Math.max(1, e.contentRect.width), Math.max(1, e.contentRect.height)))
    ro.observe(c)
    const onMove = (e: PointerEvent) => bz.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1))
    addEventListener('pointermove', onMove, { passive: true })
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      bz.setProgress(progress.current ?? 0)
      if (visibleRef.current && !document.hidden) bz.frame(dt)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onMove)
      ro.disconnect()
      bz.dispose()
    }
  }, [progress])

  return <canvas ref={canvas} className="block h-full w-full" aria-hidden />
}
