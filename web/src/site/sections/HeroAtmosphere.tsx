import { useEffect, useRef } from 'react'

// Drifting smoke and lit dust over the hero film, drawn on one small 2D canvas.
// Pauses when off screen or when the tab is hidden; fewer particles on small screens.

interface P {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  a: number
  life: number
  kind: 'smoke' | 'dust' | 'ember'
}

function sprite(color: string, size: number, soft: number) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, color)
  grd.addColorStop(soft, color.replace(/[\d.]+\)$/, '0.25)'))
  grd.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'))
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  return c
}

export default function HeroAtmosphere() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = canvas.current!
    const g = c.getContext('2d')!
    const smoke = sprite('rgba(150,140,125,0.55)', 256, 0.35)
    const dust = sprite('rgba(255,226,180,1)', 32, 0.2)
    const ember = sprite('rgba(255,130,60,1)', 32, 0.15)
    const small = innerWidth < 700
    const ps: P[] = []
    let w = 0
    let h = 0
    let dpr = 1

    const spawn = (kind: P['kind'], anywhere: boolean): P => {
      if (kind === 'smoke')
        return {
          kind,
          x: Math.random() * w * 1.2 - w * 0.1,
          y: h * (0.55 + Math.random() * 0.5),
          vx: 6 + Math.random() * 10,
          vy: -2 - Math.random() * 3,
          r: (small ? 160 : 260) + Math.random() * 220,
          a: 0.05 + Math.random() * 0.08,
          life: anywhere ? Math.random() : 0,
        }
      return {
        kind,
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 10,
        vx: (Math.random() - 0.3) * (kind === 'ember' ? 24 : 10),
        vy: -(kind === 'ember' ? 30 + Math.random() * 40 : 4 + Math.random() * 10),
        r: kind === 'ember' ? 2 + Math.random() * 2.5 : 1 + Math.random() * 2,
        a: kind === 'ember' ? 0.9 : 0.25 + Math.random() * 0.5,
        life: anywhere ? Math.random() : 0,
      }
    }

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, small ? 1 : 1.5)
      w = c.clientWidth
      h = c.clientHeight
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    resize()
    const counts = { smoke: small ? 7 : 12, dust: small ? 40 : 90, ember: small ? 8 : 16 }
    for (const k of ['smoke', 'dust', 'ember'] as const) for (let i = 0; i < counts[k]; i++) ps.push(spawn(k, true))

    // Gel tracers: short team-coloured streaks fired from the edges, with a flash where they start
    // and a small burst where they land. A few at a time, never a constant barrage.
    type Tracer = { x: number; y: number; tx: number; ty: number; t: number; dur: number; col: string; hit: boolean }
    const tracers: Tracer[] = []
    const flash = sprite('rgba(255,200,120,1)', 64, 0.1)
    let nextShot = 1.2
    const fire = () => {
      const red = Math.random() < 0.5
      const fromLeft = red
      const y = h * (0.35 + Math.random() * 0.45)
      const burst = 1 + Math.floor(Math.random() * 3)
      for (let b = 0; b < burst; b++)
        tracers.push({
          x: fromLeft ? -20 : w + 20,
          y: y + (Math.random() - 0.5) * 14,
          tx: w * (fromLeft ? 0.45 + Math.random() * 0.45 : 0.1 + Math.random() * 0.45),
          ty: y + (Math.random() - 0.5) * h * 0.2,
          t: -b * 0.09,
          dur: 0.35 + Math.random() * 0.2,
          col: red ? '255,70,50' : '60,150,255',
          hit: false,
        })
    }
    const drawTracers = (dt: number) => {
      nextShot -= dt
      if (nextShot <= 0) {
        fire()
        nextShot = 1.6 + Math.random() * 3.2
      }
      g.globalCompositeOperation = 'lighter'
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i]
        tr.t += dt
        if (tr.t < 0) continue
        const k = tr.t / tr.dur
        if (k > 1.6) {
          tracers.splice(i, 1)
          continue
        }
        const head = Math.min(1, k)
        const tail = Math.max(0, Math.min(1, k - 0.25))
        const hx = tr.x + (tr.tx - tr.x) * head
        const hy = tr.y + (tr.ty - tr.y) * head
        const sx = tr.x + (tr.tx - tr.x) * tail
        const sy = tr.y + (tr.ty - tr.y) * tail
        if (k < 1.05) {
          const grd = g.createLinearGradient(sx, sy, hx, hy)
          grd.addColorStop(0, `rgba(${tr.col},0)`)
          grd.addColorStop(1, `rgba(${tr.col},0.95)`)
          g.strokeStyle = grd
          g.lineWidth = small ? 1.5 : 2.2
          g.lineCap = 'round'
          g.globalAlpha = 1
          g.beginPath()
          g.moveTo(sx, sy)
          g.lineTo(hx, hy)
          g.stroke()
          g.globalAlpha = 0.9
          g.drawImage(dust, hx - 6, hy - 6, 12, 12)
        }
        if (k < 0.18) {
          g.globalAlpha = 1 - k / 0.18
          g.drawImage(flash, tr.x - 40, tr.y - 40, 80, 80)
        }
        if (k >= 1) {
          const f = (k - 1) / 0.6
          g.globalAlpha = Math.max(0, 1 - f)
          const r = 6 + f * 26
          g.drawImage(flash, tr.tx - r, tr.ty - r, r * 2, r * 2)
        }
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
    }

    let raf = 0
    let last = performance.now()
    let visible = true
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(c)
    const ro = new ResizeObserver(resize)
    ro.observe(c)

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!visible || document.hidden) return
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        p.life += dt / (p.kind === 'smoke' ? 26 : p.kind === 'ember' ? 5 : 14)
        p.x += p.vx * dt
        p.y += p.vy * dt
        if (p.kind !== 'smoke') p.x += Math.sin(now / 900 + i) * 0.2
        if (p.life >= 1 || p.x > w + 400 || p.y < -50) {
          ps[i] = spawn(p.kind, false)
          continue
        }
        const fade = Math.sin(Math.PI * p.life)
        g.globalAlpha = p.a * fade
        if (p.kind === 'smoke') {
          g.globalCompositeOperation = 'source-over'
          g.drawImage(smoke, p.x - p.r, p.y - p.r * 0.6, p.r * 2, p.r * 1.2)
        } else {
          g.globalCompositeOperation = 'lighter'
          const s = p.r * 4
          g.drawImage(p.kind === 'ember' ? ember : dust, p.x - s / 2, p.y - s / 2, s, s)
        }
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      drawTracers(dt)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
}
