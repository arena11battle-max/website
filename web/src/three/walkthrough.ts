import * as THREE from 'three'
import { buildArena, TOUR, type Quality } from './arena'
import { clamp01, createStage, ease } from './stage'

// Drone-style tour of the concept arena. The camera glides between the TOUR stops and drifts gently while holding.

export interface Walkthrough {
  renderAt: (t: number) => void
  goTo: (index: number, t: number) => void
  setPlaying: (playing: boolean, t: number) => void
  current: () => number
  resize: (w: number, h: number) => void
  dispose: () => void
}

const MOVE = 3.2

export function createWalkthrough(canvas: HTMLCanvasElement, quality: Quality, opts: { preserve?: boolean; onChapter?: (i: number) => void } = {}): Walkthrough {
  const stage = createStage(canvas, { quality, bloom: quality === 'high' ? 0.7 : 0, preserve: opts.preserve })
  const { camera } = stage
  camera.fov = 50
  const arena = buildArena(stage.scene, quality)

  let index = 0
  let playing = true
  let arrivedAt = 0
  const from = { pos: TOUR[0].pos.clone(), look: TOUR[0].look.clone() }
  const look = new THREE.Vector3()
  let moveStart = -MOVE

  function goTo(i: number, t: number) {
    from.pos.copy(camera.position)
    from.look.copy(look)
    index = (i + TOUR.length) % TOUR.length
    moveStart = t
    arrivedAt = t + MOVE
    opts.onChapter?.(index)
  }

  camera.position.copy(TOUR[0].pos)
  look.copy(TOUR[0].look)

  return {
    renderAt(t) {
      const stop = TOUR[index]
      const k = ease(clamp01((t - moveStart) / MOVE))
      const drift = new THREE.Vector3(Math.sin(t * 0.31) * 0.25, Math.sin(t * 0.47) * 0.12, Math.cos(t * 0.27) * 0.25)
      // Arc the path upward a little between stops so it feels like a drone, not a dolly.
      const lift = Math.sin(k * Math.PI) * Math.min(6, from.pos.distanceTo(stop.pos) * 0.15)
      camera.position.lerpVectors(from.pos, stop.pos, k).add(drift.multiplyScalar(k)).setY(camera.position.y + lift)
      look.lerpVectors(from.look, stop.look, k)
      camera.lookAt(look)
      if (playing && t > arrivedAt + stop.hold) goTo(index + 1, t)
      arena.update(t)
      stage.render()
    },
    goTo,
    setPlaying(p, t) {
      playing = p
      if (p) arrivedAt = Math.max(arrivedAt, t - TOUR[index].hold + 1)
    },
    current: () => index,
    resize: stage.resize,
    dispose() {
      arena.dispose()
      stage.dispose()
    },
  }
}

type V3 = [number, number, number]
interface Shot {
  dur: number
  from: V3
  to: V3
  lookFrom: V3
  lookTo?: V3
  fov?: number
  /** Seconds of fade from black at the start and to black at the end. */
  fadeIn?: number
  fadeOut?: number
  /** Hand-held sway amount. */
  sway?: number
}

/**
 * Cinematic camera moves over the concept arena. Rendered offline into the hero film, the game-mode previews
 * and the walkthrough stills (scripts/render-media.mjs), so visitors download video and images, not the 3D engine.
 */
export const SHOTS: Record<string, Shot> = {
  // Hero film: rise up to the entrance board, push through the gate, then a wide establishing move.
  gate: { dur: 6, from: [0, 0.9, 36], to: [0, 2.4, 25], lookFrom: [0, 2.0, 16], lookTo: [0, 3.3, 16], fov: 40, fadeIn: 2.2, sway: 0.6 },
  advance: { dur: 6, from: [1.2, 1.4, 21], to: [1.2, 1.55, 8.2], lookFrom: [0.4, 1.6, -6], lookTo: [0, 1.5, -6], sway: 1 },
  wide: { dur: 7, from: [-28, 5.5, 22], to: [-22, 15, 29], lookFrom: [2, 0, -3], fadeOut: 2 },
  // Game-mode previews.
  'mode-tdm': { dur: 5, from: [-14, 1.6, 2.5], to: [-6, 1.8, 0.5], lookFrom: [8, 1.4, -1], lookTo: [19, 1.4, 0], fov: 46, sway: 0.8 },
  'mode-dom': { dur: 5, from: [-9, 7, 9], to: [7, 7.5, 10], lookFrom: [0, 1.5, -1.6], fov: 44 },
  'mode-last': { dur: 5, from: [-13.2, 0.9, 7.6], to: [-12.4, 1.45, 6.8], lookFrom: [0, 1.6, 0], lookTo: [2, 1.4, -2], fov: 40, sway: 1.2 },
  'mode-custom': { dur: 5, from: [-6, 34, 20], to: [8, 32, 22], lookFrom: [0, 0, -1], fov: 40 },
  // Walkthrough stills.
  'scene-gate': { dur: 1, from: [-1.2, 1.7, 31], to: [-1.2, 1.7, 31], lookFrom: [0, 4.2, 16], fov: 44 },
  'scene-sandbags': { dur: 1, from: [-7.5, 1.1, 8.6], to: [-7.5, 1.1, 8.6], lookFrom: [-11, 0.6, 4], fov: 48 },
  'scene-tyres': { dur: 1, from: [-3.2, 1.3, 4.4], to: [-3.2, 1.3, 4.4], lookFrom: [-6, 0.6, 2], fov: 46 },
  'scene-pallets': { dur: 1, from: [-1, 1.5, 27.5], to: [-1, 1.5, 27.5], lookFrom: [8, 1.1, 20.5], fov: 50 },
  'scene-camo': { dur: 1, from: [-1.5, 1.9, -6], to: [-1.5, 1.9, -6], lookFrom: [-6, 1.6, -11], fov: 50 },
  'scene-tower': { dur: 1, from: [6, 2.2, -3], to: [6, 2.2, -3], lookFrom: [13, 4.8, -11], fov: 50 },
  'scene-bases': { dur: 1, from: [-10, 3.4, 9], to: [-10, 3.4, 9], lookFrom: [-19, 1, 0], fov: 50 },
}

/** Renders any shot from SHOTS at time t. */
export function createHeroArena(canvas: HTMLCanvasElement) {
  const stage = createStage(canvas, { quality: 'high', bloom: 0.8, preserve: true })
  const { camera, renderer } = stage
  const arena = buildArena(stage.scene, 'high')
  const from = new THREE.Vector3()
  const to = new THREE.Vector3()
  const look = new THREE.Vector3()
  const look2 = new THREE.Vector3()

  return {
    resize: stage.resize,
    renderShot(name: string, t: number) {
      const s = SHOTS[name]
      const k = ease(clamp01(t / s.dur))
      camera.fov = s.fov ?? 42
      camera.updateProjectionMatrix()
      camera.position.lerpVectors(from.set(...s.from), to.set(...s.to), k)
      const sway = s.sway ?? 0
      camera.position.x += Math.sin(t * 2.1) * 0.025 * sway
      camera.position.y += Math.sin(t * 4.3) * 0.012 * sway
      look.set(...s.lookFrom)
      if (s.lookTo) look.lerp(look2.set(...s.lookTo), k)
      camera.lookAt(look)
      let exposure = 1.15
      if (s.fadeIn) exposure *= ease(clamp01(t / s.fadeIn))
      if (s.fadeOut) exposure *= 1 - ease(clamp01((t - (s.dur - s.fadeOut)) / s.fadeOut))
      renderer.toneMappingExposure = exposure
      arena.update(t + name.length * 3)
      stage.render()
    },
  }
}
