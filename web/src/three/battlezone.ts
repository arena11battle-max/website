import * as THREE from 'three'
import type { Quality } from './data'
import { createStage, clamp01, ease } from './stage'
import { dotTexture, smokeTexture } from './textures'

// Home-page battle zone: ARENA11's real arena photo laid out as a 3D map, with red and blue bases,
// gel tracers flying between them, the four supplied blaster images floating as holo cards, and the
// helmet image rising in the middle. Scroll progress (0..1) drives the camera; the pointer adds parallax.

export interface BattleZone {
  setProgress: (p: number) => void
  setPointer: (x: number, y: number) => void
  resize: (w: number, h: number) => void
  frame: (dt: number) => void
  dispose: () => void
}

const GUNS = [
  { src: '/media/gun-rifle.webp', x: -4.6 },
  { src: '/media/gun-m4-tactical.webp', x: -1.6 },
  { src: '/media/gun-smg.webp', x: 1.6 },
  { src: '/media/gun-ump.webp', x: 4.6 },
]
const RED = new THREE.Color('#ff3b2f')
const BLUE = new THREE.Color('#2f8bff')
const HAZARD = new THREE.Color('#ff5a1f')

function radialAlpha(size = 256, inner = 0.42) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2)
  grd.addColorStop(0, '#fff')
  grd.addColorStop(inner, '#fff')
  grd.addColorStop(1, '#000')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(c)
}

function ringTexture(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineWidth = size * 0.035
  g.beginPath()
  g.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = size * 0.012
  g.setLineDash([size * 0.04, size * 0.03])
  g.beginPath()
  g.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2)
  g.stroke()
  return new THREE.CanvasTexture(c)
}

export function createBattleZone(canvas: HTMLCanvasElement, quality: Quality): BattleZone {
  const stage = createStage(canvas, { quality, bloom: quality === 'high' ? 0.9 : 0 })
  const { scene, camera, renderer } = stage
  renderer.shadowMap.enabled = false
  scene.background = new THREE.Color('#060606')
  scene.fog = new THREE.Fog('#060606', 10, 26)
  const loader = new THREE.TextureLoader()
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o)

  // Lights
  scene.add(new THREE.HemisphereLight('#c8b9a0', '#0a0806', 1.1))
  const key = new THREE.DirectionalLight('#ffd9b0', 1.6)
  key.position.set(-4, 8, 5)
  scene.add(key)

  // The real arena as a 3D map
  const mapTex = track(loader.load('/media/real/arena-field.webp'))
  mapTex.colorSpace = THREE.SRGBColorSpace
  mapTex.anisotropy = 4
  const MAP_W = 10
  const MAP_D = MAP_W / (850 / 540)
  const map = new THREE.Mesh(
    track(new THREE.PlaneGeometry(MAP_W, MAP_D)),
    track(new THREE.MeshStandardMaterial({ map: mapTex, emissiveMap: mapTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45, roughness: 1 })),
  )
  map.rotation.x = -Math.PI / 2
  scene.add(map)
  // A dark apron around the map and a glowing frame
  const apron = new THREE.Mesh(track(new THREE.PlaneGeometry(60, 60)), track(new THREE.MeshBasicMaterial({ color: '#070707' })))
  apron.rotation.x = -Math.PI / 2
  apron.position.y = -0.01
  scene.add(apron)
  const frameMat = track(new THREE.LineBasicMaterial({ color: HAZARD, transparent: true, opacity: 0.55 }))
  const frameGeo = track(new THREE.EdgesGeometry(new THREE.PlaneGeometry(MAP_W + 0.12, MAP_D + 0.12)))
  const frame = new THREE.LineSegments(frameGeo, frameMat)
  frame.rotation.x = -Math.PI / 2
  frame.position.y = 0.01
  scene.add(frame)

  // Scanner sweep across the map
  const sweepMat = track(new THREE.MeshBasicMaterial({ color: HAZARD, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
  const sweep = new THREE.Mesh(track(new THREE.PlaneGeometry(0.08, MAP_D)), sweepMat)
  sweep.rotation.x = -Math.PI / 2
  sweep.position.y = 0.02
  scene.add(sweep)

  // Team bases: light pillars with rings
  const glow = track(dotTexture())
  const ringTex = track(ringTexture())
  const bases = [
    { color: RED, pos: new THREE.Vector3(-3.3, 0, 1.1) },
    { color: BLUE, pos: new THREE.Vector3(3.3, 0, -0.9) },
  ].map(({ color, pos }) => {
    const g = new THREE.Group()
    g.position.copy(pos)
    const beam = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.03, 0.1, 3.2, 16, 1, true)),
      track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })),
    )
    beam.position.y = 1.6
    const ring = new THREE.Mesh(track(new THREE.PlaneGeometry(1.4, 1.4)), track(new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    const light = new THREE.PointLight(color, 3, 4, 2)
    light.position.y = 0.6
    g.add(beam, ring, light)
    scene.add(g)
    return { g, beam, ring, color, pos }
  })

  // Gel tracers between the bases
  type Tracer = { mesh: THREE.Mesh; head: THREE.Sprite; flash: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number }
  const tracerGeo = track(new THREE.BoxGeometry(1, 0.025, 0.025))
  const tracers: Tracer[] = []
  const TR = quality === 'high' ? 10 : 6
  for (let i = 0; i < TR; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    track(mat)
    const mesh = new THREE.Mesh(tracerGeo, mat)
    const head = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
    head.scale.setScalar(0.18)
    const flash = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glow, color: '#ffc58a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })))
    scene.add(mesh, head, flash)
    tracers.push({ mesh, head, flash, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: -10, dur: 0.6 })
  }
  let clock = 0
  let nextShot = 0.4
  const fire = () => {
    const tr = tracers.find((t) => clock - t.t0 > t.dur + 0.5)
    if (!tr) return
    const redShoots = Math.random() < 0.5
    const a = bases[redShoots ? 0 : 1]
    const b = bases[redShoots ? 1 : 0]
    tr.from.copy(a.pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 1.6))
    tr.to.copy(b.pos).add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 2.4))
    tr.t0 = clock
    tr.dur = 0.45 + Math.random() * 0.25
    const c = redShoots ? RED : BLUE
    ;(tr.mesh.material as THREE.MeshBasicMaterial).color.copy(c).lerp(new THREE.Color('#ffffff'), 0.25)
    ;(tr.head.material as THREE.SpriteMaterial).color.copy(c).lerp(new THREE.Color('#ffffff'), 0.5)
  }
  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()
  const updateTracers = () => {
    for (const tr of tracers) {
      const k = (clock - tr.t0) / tr.dur
      const live = k >= 0 && k <= 1
      tr.mesh.visible = tr.head.visible = live
      const fk = (clock - tr.t0 - tr.dur) / 0.35
      tr.flash.visible = fk >= 0 && fk <= 1
      if (tr.flash.visible) {
        tr.flash.position.copy(tr.to)
        tr.flash.scale.setScalar(0.3 + fk * 1.2)
        ;(tr.flash.material as THREE.SpriteMaterial).opacity = 1 - fk
      }
      if (!live) continue
      const arc = (t: number, out: THREE.Vector3) => out.lerpVectors(tr.from, tr.to, t).setY(out.y + Math.sin(Math.PI * t) * 0.6)
      const headT = k
      const tailT = Math.max(0, k - 0.18)
      arc(headT, tmp)
      arc(tailT, tmp2)
      tr.head.position.copy(tmp)
      tr.mesh.position.lerpVectors(tmp, tmp2, 0.5)
      const len = tmp.distanceTo(tmp2)
      tr.mesh.scale.set(Math.max(0.01, len), 1, 1)
      tr.mesh.lookAt(tmp)
      tr.mesh.rotateY(Math.PI / 2)
    }
  }

  // Blaster holo cards (ARENA11's supplied images)
  const cardAlpha = track(radialAlpha(256, 0.45))
  const cards = GUNS.map((gdef, i) => {
    const tex = track(loader.load(gdef.src))
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = track(new THREE.MeshBasicMaterial({ map: tex, alphaMap: cardAlpha, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    const card = new THREE.Mesh(track(new THREE.PlaneGeometry(2.6, 1.46)), mat)
    const pad = new THREE.Mesh(track(new THREE.PlaneGeometry(1.6, 1.6)), track(new THREE.MeshBasicMaterial({ map: ringTex, color: HAZARD, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })))
    pad.rotation.x = -Math.PI / 2
    const g = new THREE.Group()
    g.add(card, pad)
    card.position.y = 1.0
    g.position.set(gdef.x, 0.9, -2.4 + Math.abs(gdef.x) * 0.18)
    scene.add(g)
    return { g, card, pad, i }
  })

  // Helmet (ARENA11 kit design image, ARENA11 patch)
  const helmetTex = track(loader.load('/media/real/helmet.webp'))
  helmetTex.colorSpace = THREE.SRGBColorSpace
  const helmet = new THREE.Mesh(
    track(new THREE.PlaneGeometry(3.2, 3.2 * (790 / 910))),
    track(new THREE.MeshBasicMaterial({ map: helmetTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })),
  )
  const helmetGroup = new THREE.Group()
  const helmetPad = new THREE.Mesh(track(new THREE.PlaneGeometry(2.6, 2.6)), track(new THREE.MeshBasicMaterial({ map: ringTex, color: HAZARD, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })))
  helmetPad.rotation.x = -Math.PI / 2
  helmet.position.y = 2.6
  helmetGroup.add(helmet, helmetPad)
  helmetGroup.position.set(0, 0.05, 0.9)
  scene.add(helmetGroup)

  // Drifting smoke and embers
  const smokeTex = track(smokeTexture())
  const smokes = Array.from({ length: quality === 'high' ? 14 : 7 }, (_, i) => {
    const s = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: smokeTex, color: '#8f8475', transparent: true, opacity: 0.14, depthWrite: false })))
    s.position.set((Math.random() - 0.5) * 14, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 8)
    s.scale.setScalar(3 + Math.random() * 3)
    s.userData.v = 0.15 + Math.random() * 0.2
    s.userData.i = i
    scene.add(s)
    return s
  })
  const EMB = quality === 'high' ? 160 : 70
  const embGeo = track(new THREE.BufferGeometry())
  const embPos = new Float32Array(EMB * 3)
  for (let i = 0; i < EMB; i++) {
    embPos[i * 3] = (Math.random() - 0.5) * 14
    embPos[i * 3 + 1] = Math.random() * 6
    embPos[i * 3 + 2] = (Math.random() - 0.5) * 9
  }
  embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3))
  const embers = new THREE.Points(embGeo, track(new THREE.PointsMaterial({ map: glow, color: '#ff9a4a', size: 0.09, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })))
  scene.add(embers)

  // Camera path, driven by scroll progress
  const camA = { pos: new THREE.Vector3(0, 12.5, 1.2), look: new THREE.Vector3(0, 0, 0) }
  const camB = { pos: new THREE.Vector3(0, 4.8, 9.5), look: new THREE.Vector3(0, 1.4, -0.6) }
  const camC = { pos: new THREE.Vector3(4.2, 1.7, 6.8), look: new THREE.Vector3(0, 2.3, 0.4) }
  let target = 0
  let far = 1
  let progress = 0
  const pointer = new THREE.Vector2()
  const pointerS = new THREE.Vector2()
  const look = new THREE.Vector3()

  const placeCamera = (p: number) => {
    const a = ease(clamp01(p / 0.45))
    const b = ease(clamp01((p - 0.55) / 0.45))
    camera.position.lerpVectors(camA.pos, camB.pos, a).lerp(camC.pos, b)
    look.lerpVectors(camA.look, camB.look, a).lerp(camC.look, b)
    // Portrait screens: pull the camera back so all four blasters stay in frame
    camera.position.sub(look).multiplyScalar(far).add(look)
    camera.position.x += pointerS.x * 0.6
    camera.position.y += pointerS.y * 0.3
    camera.lookAt(look)
  }

  return {
    setProgress(p) {
      target = clamp01(p)
    },
    setPointer(x, y) {
      pointer.set(x, y)
    },
    resize(w, h) {
      stage.resize(w, h)
      camera.fov = w / h < 0.8 ? 58 : 40
      const portrait = w / h < 0.8
      far = portrait ? 1.3 : w / h < 1.3 ? 1.2 : 1
      // Portrait: bring the blasters in and stagger them in two heights so they fit side by side
      cards.forEach((c, i) => {
        const x = GUNS[i].x
        c.g.position.set(portrait ? x * 0.42 : x, portrait ? (i % 2 ? 2.3 : 0.9) : 0.9, portrait ? -2.2 : -2.4 + Math.abs(x) * 0.18)
      })
      camera.updateProjectionMatrix()
    },
    frame(dt) {
      clock += dt
      progress += (target - progress) * Math.min(1, dt * 4)
      pointerS.lerp(pointer, Math.min(1, dt * 3))
      placeCamera(progress)

      sweep.position.x = ((clock * 0.25) % 1.2 - 0.6) * (MAP_W + 1)
      sweepMat.opacity = Math.abs(sweep.position.x) < MAP_W / 2 ? 0.35 : 0

      for (const b of bases) {
        const pulse = 0.5 + 0.5 * Math.sin(clock * 3 + b.pos.x)
        ;(b.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + pulse * 0.18
        b.ring.rotation.z += dt * 0.6
        b.ring.scale.setScalar(1 + pulse * 0.15)
      }

      nextShot -= dt
      if (nextShot <= 0) {
        fire()
        if (Math.random() < 0.4) fire()
        nextShot = 0.25 + Math.random() * 0.6
      }
      updateTracers()

      // Guns rise in from 25% to 55% of the scroll; the helmet from 50% to 80%
      const gunIn = ease(clamp01((progress - 0.22) / 0.3))
      cards.forEach((c) => {
        const stagger = ease(clamp01(gunIn * 1.6 - c.i * 0.2))
        c.g.scale.setScalar(Math.max(0.0001, stagger))
        c.card.position.y = 1.0 + Math.sin(clock * 1.4 + c.i) * 0.08
        c.card.rotation.y = Math.sin(clock * 0.6 + c.i * 1.3) * 0.45 + (1 - stagger) * Math.PI
        c.pad.rotation.z += dt * 0.5
        ;(c.card.material as THREE.MeshBasicMaterial).opacity = stagger
      })
      const helmIn = ease(clamp01((progress - 0.5) / 0.3))
      helmetGroup.scale.setScalar(Math.max(0.0001, helmIn))
      helmet.position.y = 2.6 + Math.sin(clock * 1.1) * 0.07
      helmet.rotation.y = Math.sin(clock * 0.5) * 0.3
      helmetPad.rotation.z -= dt * 0.4
      ;(helmet.material as THREE.MeshBasicMaterial).opacity = helmIn

      for (const s of smokes) {
        s.position.x += s.userData.v * dt
        if (s.position.x > 8) s.position.x = -8
      }
      const pos = embGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < EMB; i++) {
        let y = pos.getY(i) + dt * (0.3 + (i % 5) * 0.08)
        if (y > 6) y = 0
        pos.setY(i, y)
        pos.setX(i, pos.getX(i) + Math.sin(clock + i) * dt * 0.05)
      }
      pos.needsUpdate = true

      stage.render()
    },
    dispose() {
      for (const d of disposables) d.dispose()
      stage.dispose()
    },
  }
}
