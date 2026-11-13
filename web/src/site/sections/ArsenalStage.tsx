import { useEffect, useRef } from 'react'
import type { GunId } from '../../three/data'
import { createShowcase, type Showcase } from '../../three/showcase'
import { pickQuality } from '../../three/stage'
import { useVisible } from '../hooks'

export type StageCommand = { kind: 'fire' | 'detail' | 'free'; seq: number; index?: number }

// Live WebGL turntable for the arsenal. Loaded on demand, so three.js never blocks the first paint.
export default function ArsenalStage({
  gun,
  command,
  onDetail,
  onShot,
}: {
  gun: GunId
  command: StageCommand | null
  onDetail: (label: string | null) => void
  onShot: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const sc = useRef<Showcase | null>(null)
  const clock = useRef(0)
  const visible = useVisible(wrap)
  const visibleRef = useRef(false)
  visibleRef.current = visible
  const shotRef = useRef(onShot)
  shotRef.current = onShot

  useEffect(() => {
    const c = canvas.current!
    const s = createShowcase(c, pickQuality(), { interactive: true })
    s.onShot = () => shotRef.current()
    sc.current = s
    const ro = new ResizeObserver(([e]) => s.resize(Math.max(1, e.contentRect.width), Math.max(1, e.contentRect.height)))
    ro.observe(c)
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!visibleRef.current) return
      clock.current += dt
      s.renderAt(clock.current)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      s.dispose()
      sc.current = null
    }
  }, [])

  useEffect(() => {
    sc.current?.setGun(gun, clock.current)
    onDetail(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gun])

  useEffect(() => {
    const s = sc.current
    if (!s || !command) return
    if (command.kind === 'fire') s.fire(clock.current)
    if (command.kind === 'free') {
      s.freeRotate(clock.current)
      onDetail(null)
    }
    if (command.kind === 'detail') onDetail(s.showDetail(command.index ?? 0, clock.current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command])

  return (
    <div ref={wrap} className="absolute inset-0">
      <canvas ref={canvas} className="h-full w-full cursor-grab touch-pan-y active:cursor-grabbing" aria-label="Interactive 3D view of the selected gel blaster. Drag to rotate." />
    </div>
  )
}
