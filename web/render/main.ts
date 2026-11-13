// Dev-only page used by scripts/render-media.mjs to render the hero film, posters and fallback stills
// from the same 3D scenes the site uses. Not part of the production build.
import '@fontsource/black-ops-one/400.css'
import { TOUR } from '../src/three/arena'
import type { GunId } from '../src/three/guns'
import { createShowcase } from '../src/three/showcase'
import { createHeroArena, createWalkthrough } from '../src/three/walkthrough'

const canvas = document.getElementById('c') as HTMLCanvasElement
const params = new URLSearchParams(location.search)
const scene = params.get('scene') ?? 'hero-advance'
const w = window.innerWidth
const h = window.innerHeight

let render: (t: number) => void

await document.fonts.load('40px "Black Ops One"')

if (scene.startsWith('hero-')) {
  const hero = createHeroArena(canvas)
  hero.resize(w, h)
  render = (t) => hero.renderShot(scene.slice(5), t)
} else if (scene.startsWith('gun-')) {
  const sc = createShowcase(canvas, 'high', { preserve: true })
  sc.resize(w, h)
  sc.setGun(scene.slice(4) as GunId, 0)
  render = (t) => sc.renderAt(t)
} else {
  const wt = createWalkthrough(canvas, 'high', { preserve: true })
  wt.resize(w, h)
  const idx = TOUR.findIndex((s) => s.id === scene.slice(5))
  wt.goTo(idx, -10)
  wt.setPlaying(false, 0)
  render = (t) => wt.renderAt(t)
}

;(window as unknown as { __frame: (t: number) => string }).__frame = (t: number) => {
  render(t)
  return canvas.toDataURL('image/jpeg', 0.94)
}
;(window as unknown as { __ready: boolean }).__ready = true
