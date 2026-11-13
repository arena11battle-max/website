import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Quality } from './arena'
import { createFireFX } from './fx'
import { buildGun, type GunId, type GunModel } from './guns'
import { clamp01, createStage, ease } from './stage'
import { dotTexture, rng, smokeTexture } from './textures'

// Dark studio for one blaster at a time: a narrow beam reveals it, the camera circles, pushes in on details,
// pulls out to a three-quarter view and fires a gel bead. After the intro the viewer can drag to rotate.

export type ShowcaseMode = 'intro' | 'free' | 'detail'

export interface Showcase {
  setGun: (id: GunId, t: number) => void
  fire: (t: number) => void
  showDetail: (index: number, t: number) => string | null
  freeRotate: (t: number) => void
  renderAt: (t: number) => void
  resize: (w: number, h: number) => void
  onShot?: () => void
  mode: () => ShowcaseMode
  detailCount: () => number
  dispose: () => void
}

const SIZE = 1.6
const INTRO = 10

export function createShowcase(canvas: HTMLCanvasElement, quality: Quality, opts: { preserve?: boolean; interactive?: boolean } = {}): Showcase {
  const stage = createStage(canvas, { quality, bloom: quality === 'high' ? 0.55 : 0, env: true, preserve: opts.preserve })
  const { scene, camera } = stage
  scene.background = new THREE.Color('#040404')
  scene.fog = new THREE.Fog('#040404', 4, 11)
  camera.fov = 32
  camera.near = 0.01

  const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshStandardMaterial({ color: '#090a08', roughness: 0.55, metalness: 0.3 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.55
  floor.receiveShadow = true
  scene.add(floor)

  const key = new THREE.SpotLight('#fff1dc', 0, 9, 0.34, 0.7, 1.2)
  key.position.set(-0.2, 3.4, 0.9)
  key.castShadow = quality === 'high'
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0002
  scene.add(key, key.target)
  const rimA = new THREE.SpotLight('#ff4d1a', 0, 8, 0.5, 0.8, 1.2)
  rimA.position.set(1.2, 2.4, -2.6)
  const rimB = new THREE.SpotLight('#ff7a2a', 0, 8, 0.5, 0.8, 1.2)
  rimB.position.set(-1.0, 2.2, -2.8)
  const fill = new THREE.DirectionalLight('#5d7aa0', 0)
  fill.position.set(1, 0.5, 3)
  scene.add(rimA, rimB, fill)

  // Visible beam of the key light.
  const beamLen = 4.4
  const beamGeo = new THREE.ConeGeometry(1.25, beamLen, 40, 1, true)
  beamGeo.translate(0, -beamLen / 2, 0)
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { strength: { value: 0 }, len: { value: beamLen } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ vY = position.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float strength; uniform float len; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float fall = pow(1. + vY/len, 1.3); float rim = pow(abs(dot(vN, vV)), 2.0); gl_FragColor = vec4(vec3(1.,.93,.82), fall*rim*0.22*strength); }`,
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  scene.add(beam)

  // Smoke behind the gun and motes in the beam.
  const r = rng(5)
  const smokeTex = smokeTexture()
  const smokes = Array.from({ length: quality === 'high' ? 10 : 5 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: i % 3 ? '#4a4038' : '#5a2a18', transparent: true, opacity: 0.25, depthWrite: false }))
    s.scale.set(3 + r() * 2.5, 1.6 + r(), 1)
    s.position.set((r() - 0.5) * 5, -0.2 + r() * 1.2, -1.5 - r() * 2)
    scene.add(s)
    return { s, x: s.position.x, phase: r() * 6 }
  })
  const moteCount = 220
  const moteGeo = new THREE.BufferGeometry()
  const motePos = new Float32Array(moteCount * 3)
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (r() - 0.5) * 2
    motePos[i * 3 + 1] = r() * 3 - 0.5
    motePos[i * 3 + 2] = (r() - 0.5) * 2
  }
  const moteBase = motePos.slice()
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({ size: 0.012, map: dotTexture(), color: '#ffe8c8', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }),
  )
  scene.add(motes)

  const pivot = new THREE.Group()
  scene.add(pivot)
  const fx = createFireFX(scene, SIZE)

  let gun: GunModel | null = null
  let gunId: GunId = 'rifle'
  let t0 = 0
  let mode: ShowcaseMode = 'intro'
  let lastShot = -10
  let detailIdx = 0
  const camFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
  const camTo = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
  let tweenStart = 0
  const look = new THREE.Vector3()
  const scale = () => (gun ? SIZE / gun.length : 1)
  const local = (p: THREE.Vector3) => pivot.localToWorld(p.clone())

  const controls = opts.interactive ? new OrbitControls(camera, canvas) : null
  if (controls) {
    controls.enabled = false
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 0.6
    controls.maxDistance = 4
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6
    controls.addEventListener('start', () => {
      controls.autoRotate = false
    })
  }

  const orbitPose = (azimuth: number, elev: number, dist: number) =>
    new THREE.Vector3(Math.sin(azimuth) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(azimuth) * Math.cos(elev) * dist)

  function startTween(t: number, pos: THREE.Vector3, lookAt: THREE.Vector3) {
    camFrom.pos.copy(camera.position)
    camFrom.look.copy(look)
    camTo.pos.copy(pos)
    camTo.look.copy(lookAt)
    tweenStart = t
  }

  function fireAt(t: number) {
    if (!gun || t - lastShot < 0.35) return
    lastShot = t
    pivot.updateMatrixWorld()
    const origin = local(gun.muzzle)
    const dir = new THREE.Vector3(1, 0, 0).applyQuaternion(pivot.quaternion)
    fx.fire(origin, dir, t)
    api.onShot?.()
  }

  const api: Showcase = {
    setGun(id, t) {
      if (gun) {
        pivot.remove(gun.group)
        gun.dispose()
      }
      gunId = id
      gun = buildGun(id)
      gun.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true
      })
      pivot.add(gun.group)
      pivot.scale.setScalar(scale())
      pivot.rotation.set(0, 0, 0)
      t0 = t
      mode = 'intro'
      if (controls) controls.enabled = false
    },
    fire: fireAt,
    showDetail(index, t) {
      if (!gun || !gun.details.length) return null
      detailIdx = ((index % gun.details.length) + gun.details.length) % gun.details.length
      const d = gun.details[detailIdx]
      mode = 'detail'
      if (controls) controls.enabled = false
      pivot.rotation.set(0, 0, 0)
      pivot.updateMatrixWorld()
      startTween(t, local(d.cam), local(d.look))
      return d.label
    },
    freeRotate(t) {
      mode = 'free'
      startTween(t, orbitPose(-0.7, 0.18, 2.6), new THREE.Vector3(0, 0, 0))
      if (controls) {
        controls.target.set(0, 0, 0)
        controls.autoRotate = true
      }
    },
    renderAt(t) {
      const s = t - t0
      // Lights fade in with the beam sweep.
      const lightIn = ease(clamp01(s / 1.4))
      key.intensity = 24 * lightIn
      beamMat.uniforms.strength.value = lightIn
      rimA.intensity = 14 * ease(clamp01((s - 0.8) / 1))
      rimB.intensity = 6 * ease(clamp01((s - 1.2) / 1))
      fill.intensity = 0.9 * ease(clamp01((s - 1.6) / 1))
      const sweep = 1 - ease(clamp01(s / 1.6))
      key.target.position.set(-1.6 * sweep, 0, 0)
      beam.position.copy(key.position)
      beam.lookAt(key.target.position)
      beam.rotateX(Math.PI / 2)

      if (mode === 'intro') {
        if (s < 4.5) {
          // Orbit around the gun.
          const k = ease(clamp01(s / 4.5))
          camera.position.copy(orbitPose(-1.1 + k * 1.6, 0.25 - k * 0.12, 3.2 - k * 0.8))
          look.set(0, 0, 0)
        } else if (s < 7.5 && gun && gun.details.length) {
          // Macro close-ups on two details.
          const idx = s < 6 ? 0 : 1
          const d = gun.details[Math.min(idx, gun.details.length - 1)]
          const k = ease(clamp01(((s - 4.5) % 1.5) / 1.5))
          const cam = local(d.cam)
          const lk = local(d.look)
          camera.position.lerpVectors(cam.clone().multiplyScalar(1.12), cam, k)
          look.copy(lk)
        } else {
          // Wide three-quarter view and a controlled shot.
          const k = ease(clamp01((s - 7.5) / 2))
          camera.position.copy(orbitPose(0.95 - k * 0.25, 0.12, 2.9 - k * 0.2))
          look.set(0.15, 0, 0)
          if (s > 8.3 && lastShot < t0 + 8.3) fireAt(t0 + 8.3)
          if (s > INTRO && opts.interactive) api.freeRotate(t)
        }
      } else {
        const k = ease(clamp01((t - tweenStart) / 1.2))
        if (mode === 'free' && k >= 1 && controls) {
          controls.enabled = true
          controls.update()
          look.copy(controls.target)
        } else {
          camera.position.lerpVectors(camFrom.pos, camTo.pos, k)
          look.lerpVectors(camFrom.look, camTo.look, k)
          if (controls) controls.target.copy(look)
        }
      }
      camera.lookAt(look)

      // Recoil: quick kick back and up, then settle.
      const since = t - lastShot
      const kick = since >= 0 && since < 0.5 ? Math.exp(-since * 14) * Math.sin(Math.min(1, since * 40) * Math.PI * 0.5) : 0
      pivot.position.set(-kick * 0.06, kick * 0.01, 0)
      pivot.rotation.z = kick * (gunId === 'awm' ? 0.08 : 0.05)

      fx.update(t)
      smokes.forEach((sm) => {
        sm.s.position.x = sm.x + Math.sin(t * 0.08 + sm.phase) * 0.6
        sm.s.material.rotation = t * 0.03 + sm.phase
      })
      for (let i = 0; i < moteCount; i++) {
        motePos[i * 3 + 1] = moteBase[i * 3 + 1] + Math.sin(t * 0.3 + i) * 0.08
        motePos[i * 3] = moteBase[i * 3] + Math.cos(t * 0.2 + i) * 0.05 - 0.6 * sweep
      }
      moteGeo.attributes.position.needsUpdate = true
      stage.render()
    },
    resize: stage.resize,
    mode: () => mode,
    detailCount: () => gun?.details.length ?? 0,
    dispose() {
      controls?.dispose()
      gun?.dispose()
      fx.dispose()
      smokeTex.dispose()
      stage.dispose()
    },
  }
  void detailIdx
  return api
}
