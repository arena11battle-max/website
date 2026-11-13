import * as THREE from 'three'

// Every surface in the 3D scenes is painted here on a canvas at load time, so the site ships no texture files.
// A seeded random generator keeps renders identical between runs (the hero video is rendered from these scenes).

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  return { c, g }
}

function toTexture(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], color = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  t.anisotropy = 4
  if (color) t.colorSpace = THREE.SRGBColorSpace
  return t
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, colors: string[], size: [number, number]) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)]
    g.globalAlpha = 0.25 + r() * 0.6
    const s = size[0] + r() * (size[1] - size[0])
    g.fillRect(r() * w, r() * h, s, s * (0.6 + r() * 0.8))
  }
  g.globalAlpha = 1
}

function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, colors: string[], radius: [number, number], alpha = 0.35) {
  for (let i = 0; i < n; i++) {
    const x = r() * w
    const y = r() * h
    const rad = radius[0] + r() * (radius[1] - radius[0])
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    const col = colors[Math.floor(r() * colors.length)]
    grad.addColorStop(0, col)
    grad.addColorStop(1, 'transparent')
    g.globalAlpha = alpha * (0.4 + r() * 0.6)
    g.fillStyle = grad
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  g.globalAlpha = 1
}

/** Packed dirt with gravel, puddle stains and boot scuffs. */
export function groundTexture() {
  const { c, g } = canvas(1024)
  const r = rng(11)
  g.fillStyle = '#2b2a20'
  g.fillRect(0, 0, 1024, 1024)
  blotches(g, 1024, 1024, r, 90, ['#3a3726', '#1d1c14', '#33301f', '#45402a'], [40, 180], 0.5)
  blotches(g, 1024, 1024, r, 30, ['#14140f'], [30, 90], 0.45)
  speckle(g, 1024, 1024, r, 9000, ['#5a5440', '#16150f', '#6d6650', '#3d3a2b'], [1, 3.5])
  // Faint tyre and boot tracks.
  g.strokeStyle = '#1a1912'
  g.globalAlpha = 0.25
  for (let i = 0; i < 6; i++) {
    g.lineWidth = 10 + r() * 14
    g.beginPath()
    const y = r() * 1024
    g.moveTo(0, y)
    g.bezierCurveTo(300, y + (r() - 0.5) * 300, 700, y + (r() - 0.5) * 300, 1024, y + (r() - 0.5) * 100)
    g.stroke()
  }
  g.globalAlpha = 1
  return toTexture(c, [10, 8])
}

/** Woven hessian for sandbags. */
export function burlapTexture() {
  const { c, g } = canvas(256)
  const r = rng(21)
  g.fillStyle = '#6b5f41'
  g.fillRect(0, 0, 256, 256)
  for (let y = 0; y < 256; y += 3) {
    g.fillStyle = r() > 0.5 ? 'rgba(40,32,18,0.35)' : 'rgba(150,135,95,0.2)'
    g.fillRect(0, y, 256, 1)
  }
  for (let x = 0; x < 256; x += 3) {
    g.fillStyle = r() > 0.5 ? 'rgba(40,32,18,0.3)' : 'rgba(150,135,95,0.15)'
    g.fillRect(x, 0, 1, 256)
  }
  blotches(g, 256, 256, r, 20, ['#3b3322', '#2a2418', '#7c6f4c'], [10, 50], 0.5)
  return toTexture(c, [2, 1])
}

/** Corrugated shipping-container steel with rust runs and a stencilled code. */
export function containerTexture(base: string, code: string, seed: number) {
  const { c, g } = canvas(1024, 512)
  const r = rng(seed)
  g.fillStyle = base
  g.fillRect(0, 0, 1024, 512)
  for (let x = 0; x < 1024; x += 32) {
    const grad = g.createLinearGradient(x, 0, x + 32, 0)
    grad.addColorStop(0, 'rgba(0,0,0,0.35)')
    grad.addColorStop(0.3, 'rgba(255,255,255,0.08)')
    grad.addColorStop(0.55, 'rgba(255,255,255,0.02)')
    grad.addColorStop(1, 'rgba(0,0,0,0.4)')
    g.fillStyle = grad
    g.fillRect(x, 0, 32, 512)
  }
  // Rust streaks from the top rail.
  for (let i = 0; i < 40; i++) {
    const x = r() * 1024
    const len = 40 + r() * 260
    const grad = g.createLinearGradient(0, 0, 0, len)
    grad.addColorStop(0, 'rgba(120,52,20,0.75)')
    grad.addColorStop(1, 'rgba(120,52,20,0)')
    g.fillStyle = grad
    g.fillRect(x, 0, 2 + r() * 8, len)
  }
  blotches(g, 1024, 512, r, 40, ['#5a2a12', '#1a1410', '#8a4a20'], [10, 70], 0.45)
  speckle(g, 1024, 512, r, 3000, ['#20140c', '#a0603a', '#ddd'], [1, 3])
  g.font = 'bold 54px "Black Ops One", Impact, sans-serif'
  g.fillStyle = 'rgba(230,225,205,0.75)'
  g.fillText(code, 60, 110)
  g.font = 'bold 26px monospace'
  g.fillText('MAX GROSS 30480 KG', 60, 150)
  return toTexture(c)
}

/** Weathered plywood / pallet planks. */
export function woodTexture() {
  const { c, g } = canvas(512)
  const r = rng(31)
  g.fillStyle = '#4a3a24'
  g.fillRect(0, 0, 512, 512)
  for (let y = 0; y < 512; y += 64) {
    g.fillStyle = `hsl(32, ${20 + r() * 15}%, ${16 + r() * 10}%)`
    g.fillRect(0, y + 2, 512, 60)
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = `rgba(20,12,4,${0.15 + r() * 0.25})`
      g.lineWidth = 1
      g.beginPath()
      const yy = y + 4 + r() * 56
      g.moveTo(0, yy)
      g.bezierCurveTo(170, yy + (r() - 0.5) * 8, 340, yy + (r() - 0.5) * 8, 512, yy)
      g.stroke()
    }
    g.fillStyle = '#120c06'
    g.fillRect(0, y, 512, 3)
  }
  blotches(g, 512, 512, r, 20, ['#1a140c', '#6a5a3a'], [10, 60], 0.35)
  return toTexture(c)
}

/** Cast concrete for jersey barriers and bunkers. */
export function concreteTexture() {
  const { c, g } = canvas(512)
  const r = rng(41)
  g.fillStyle = '#6d6b62'
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, r, 60, ['#55534b', '#82807a', '#3e3d38'], [20, 90], 0.45)
  speckle(g, 512, 512, r, 6000, ['#45443e', '#93918a', '#2c2b27'], [1, 2.5])
  // Hazard stripes on the top edge.
  for (let x = -60; x < 560; x += 60) {
    g.fillStyle = '#d4512a'
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + 30, 0)
    g.lineTo(x + 10, 50)
    g.lineTo(x - 20, 50)
    g.fill()
  }
  g.fillStyle = 'rgba(30,25,20,0.35)'
  g.fillRect(0, 0, 512, 50)
  return toTexture(c)
}

/** Woodland camouflage for nets, tents and the backdrop. */
export function camoTexture(seed = 51) {
  const { c, g } = canvas(512)
  const r = rng(seed)
  g.fillStyle = '#3b4527'
  g.fillRect(0, 0, 512, 512)
  const cols = ['#262c18', '#55603a', '#5c4b30', '#16190f']
  for (let i = 0; i < 70; i++) {
    g.fillStyle = cols[i % cols.length]
    g.beginPath()
    const x = r() * 512
    const y = r() * 512
    const n = 7
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2
      const rad = 20 + r() * 40
      const px = x + Math.cos(a) * rad
      const py = y + Math.sin(a) * rad * 0.6
      if (k === 0) g.moveTo(px, py)
      else g.quadraticCurveTo(x + Math.cos(a - 0.4) * rad * 1.3, y + Math.sin(a - 0.4) * rad * 0.8, px, py)
    }
    g.fill()
  }
  return toTexture(c, [2, 2])
}

/** Painted metal with chips and wear for gun bodies. */
export function gunmetalTexture(seed = 61) {
  const { c, g } = canvas(512)
  const r = rng(seed)
  g.fillStyle = '#808080'
  g.fillRect(0, 0, 512, 512)
  blotches(g, 512, 512, r, 50, ['#9a9a9a', '#5c5c5c'], [10, 50], 0.4)
  speckle(g, 512, 512, r, 4000, ['#c0c0c0', '#404040'], [0.5, 2])
  for (let i = 0; i < 200; i++) {
    g.strokeStyle = `rgba(255,255,255,${r() * 0.15})`
    g.lineWidth = 0.6
    g.beginPath()
    const x = r() * 512
    const y = r() * 512
    g.moveTo(x, y)
    g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 6)
    g.stroke()
  }
  return toTexture(c, [1, 1], false)
}

/** Soft, lumpy puff for smoke and dust sprites. */
export function smokeTexture() {
  const { c, g } = canvas(256)
  const r = rng(71)
  for (let i = 0; i < 40; i++) {
    const x = 128 + (r() - 0.5) * 110
    const y = 128 + (r() - 0.5) * 110
    const rad = 30 + r() * 70
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, 'rgba(255,255,255,0.22)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
  }
  // Fade the edges so the square never shows.
  g.globalCompositeOperation = 'destination-in'
  const mask = g.createRadialGradient(128, 128, 40, 128, 128, 128)
  mask.addColorStop(0, 'rgba(0,0,0,1)')
  mask.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = mask
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function dotTexture() {
  const { c, g } = canvas(64)
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

/** Stencilled floor or wall signage on a transparent background. */
export function stencilTexture(text: string, color: string, w = 1024, h = 256) {
  const { c, g } = canvas(w, h)
  g.fillStyle = color
  g.font = `${Math.round(h * 0.62)}px "Black Ops One", Impact, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, w / 2, h / 2)
  // Spray-paint wear.
  g.globalCompositeOperation = 'destination-out'
  const r = rng(text.length * 97)
  speckle(g, w, h, r, 1800, ['#000'], [1, 4])
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The ARENA11 entrance board: weathered steel panel, stencil lettering, hazard trim. Concept artwork until the real logo arrives. */
export function boardTexture(w = 2048, h = 512) {
  const { c, g } = canvas(w, h)
  const r = rng(1111)
  g.fillStyle = '#1d1e1b'
  g.fillRect(0, 0, w, h)
  speckle(g, w, h, r, 9000, ['#2a2b27', '#141512', '#3a2a1e'], [1, 6])
  // Rust streaks from the bolts.
  for (let i = 0; i < 26; i++) {
    const x = r() * w
    const grd = g.createLinearGradient(x, 0, x, h)
    grd.addColorStop(0, 'rgba(120,60,25,0.35)')
    grd.addColorStop(1, 'rgba(120,60,25,0)')
    g.fillStyle = grd
    g.globalAlpha = 0.6
    g.fillRect(x, 0, 2 + r() * 6, h * (0.3 + r() * 0.6))
  }
  g.globalAlpha = 1
  // Hazard trim top and bottom.
  for (const y of [0, h - 26]) {
    g.save()
    g.beginPath()
    g.rect(0, y, w, 26)
    g.clip()
    for (let x = -60; x < w + 60; x += 60) {
      g.fillStyle = '#e0571f'
      g.beginPath()
      g.moveTo(x, y + 26)
      g.lineTo(x + 30, y)
      g.lineTo(x + 60, y)
      g.lineTo(x + 30, y + 26)
      g.fill()
    }
    g.restore()
  }
  g.textBaseline = 'middle'
  g.font = `${Math.round(h * 0.5)}px "Black Ops One", Impact, sans-serif`
  const a = 'ARENA'
  const b = '11'
  const wa = g.measureText(a).width
  const wb = g.measureText(b).width
  const x0 = (w - wa - wb - 20) / 2
  g.fillStyle = '#e9e4d8'
  g.fillText(a, x0, h * 0.44)
  g.fillStyle = '#ff5a1f'
  g.fillText(b, x0 + wa + 20, h * 0.44)
  g.font = `${Math.round(h * 0.085)}px "Black Ops One", Impact, sans-serif`
  g.fillStyle = '#b9b3a4'
  g.textAlign = 'center'
  g.fillText('REAL-LIFE  TACTICAL  GAMING', w / 2, h * 0.8)
  // Wear on the paint.
  g.globalCompositeOperation = 'destination-out'
  speckle(g, w, h, r, 2600, ['#000'], [1, 5])
  g.globalCompositeOperation = 'destination-over'
  g.fillStyle = '#1d1e1b'
  g.fillRect(0, 0, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}
