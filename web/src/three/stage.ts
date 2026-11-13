import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { Quality } from './data'

export interface Stage {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  render: () => void
  resize: (w: number, h: number) => void
  dispose: () => void
}

export function pickQuality(): Quality {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4
  return small || weak ? 'low' : 'high'
}


export function createStage(canvas: HTMLCanvasElement, opts: { quality: Quality; bloom?: number; env?: boolean; preserve?: boolean }): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.quality === 'high',
    powerPreference: 'high-performance',
    preserveDrawingBuffer: !!opts.preserve,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === 'high' ? 1.75 : 1))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = opts.quality === 'high'
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 300)

  let pmrem: THREE.PMREMGenerator | null = null
  if (opts.env) {
    pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environmentIntensity = 0.35
  }

  let composer: EffectComposer | null = null
  if (opts.bloom) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), opts.bloom, 0.5, 0.9))
    composer.addPass(new OutputPass())
  }

  return {
    renderer,
    scene,
    camera,
    render: () => (composer ? composer.render() : renderer.render(scene, camera)),
    resize(w, h) {
      renderer.setSize(w, h, false)
      composer?.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      composer?.dispose()
      pmrem?.dispose()
      scene.environment?.dispose()
      renderer.dispose()
    },
  }
}

export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
