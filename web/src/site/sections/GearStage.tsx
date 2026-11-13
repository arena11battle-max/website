import { useEffect, useRef } from 'react'
import { createGearViewer, type GearId, type GearViewer, type Team, type VestSkin } from '../../three/gear'
import { pickQuality } from '../../three/stage'
import { useVisible } from '../hooks'

// Live WebGL viewer for the safety kit. Loaded on demand so three.js never blocks the first paint.
export default function GearStage({ item, skin, team }: { item: GearId; skin: VestSkin; team: Team }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const viewer = useRef<GearViewer | null>(null)
  const visible = useVisible(canvas)
  const visibleRef = useRef(false)
  visibleRef.current = visible

  useEffect(() => {
    const c = canvas.current!
    const v = createGearViewer(c, pickQuality())
    viewer.current = v
    const ro = new ResizeObserver(([e]) => v.resize(Math.max(1, e.contentRect.width), Math.max(1, e.contentRect.height)))
    ro.observe(c)
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (visibleRef.current && !document.hidden) v.frame(dt)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      v.dispose()
      viewer.current = null
    }
  }, [])

  useEffect(() => viewer.current?.show(item), [item])
  useEffect(() => viewer.current?.setSkin(skin), [skin])
  useEffect(() => viewer.current?.setTeam(team), [team])

  return <canvas ref={canvas} className="block h-full w-full cursor-grab touch-pan-y active:cursor-grabbing" aria-label="3D model, drag to rotate" />
}
