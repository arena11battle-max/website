import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Quality } from './data'
import { createStage } from './stage'
import { rng, smokeTexture } from './textures'

// Safety kit in 3D: ARENA11's hit-tracking vest (camo or black), the tactical helmet and the neck scarf.
// Built from primitives in code and modelled on ARENA11's reference photos; they show the kit's shape and features,
// not an exact scan. The viewer orbits by drag, auto-rotates when idle, and lights the kit like a studio product shot.

export type GearId = 'vest' | 'helmet' | 'scarf'
export type VestSkin = 'camo' | 'black'
export type Team = 'red' | 'blue'

const TEAM = { red: '#ff3b2f', blue: '#2f8bff' }

// ---------- textures ----------

function canvas(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, g: c.getContext('2d')! }
}
function tex(c: HTMLCanvasElement, repeat: [number, number] = [1, 1], color = true) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(...repeat)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Woodland camo on woven fabric, like the camo vest. */
function woodlandTexture(seed = 7) {
  const { c, g } = canvas(512)
  const r = rng(seed)
  g.fillStyle = '#9c8f6c'
  g.fillRect(0, 0, 512, 512)
  const cols = ['#3f4b2e', '#584532', '#1f201a', '#55603d', '#6f5d42']
  for (let i = 0; i < 90; i++) {
    g.fillStyle = cols[i % cols.length]
    g.beginPath()
    const x = r() * 512
    const y = r() * 512
    const n = 9
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2
      const rad = 14 + r() * 38
      const px = x + Math.cos(a) * rad * 1.4
      const py = y + Math.sin(a) * rad * 0.7
      if (k === 0) g.moveTo(px, py)
      else g.quadraticCurveTo(x + Math.cos(a - 0.35) * rad * 1.8, y + Math.sin(a - 0.35) * rad, px, py)
    }
    g.fill()
  }
  weave(g, 512, r, 0.08)
  return tex(c, [1.5, 1.5])
}

function solidFabric(base: string, seed = 3) {
  const { c, g } = canvas(256)
  g.fillStyle = base
  g.fillRect(0, 0, 256, 256)
  weave(g, 256, rng(seed), 0.12)
  return tex(c, [3, 3])
}

function weave(g: CanvasRenderingContext2D, s: number, r: () => number, k: number) {
  for (let y = 0; y < s; y += 2) {
    g.fillStyle = `rgba(0,0,0,${k * (0.5 + r() * 0.5)})`
    g.fillRect(0, y, s, 1)
  }
  for (let x = 0; x < s; x += 2) {
    g.fillStyle = `rgba(255,255,255,${k * 0.35 * r()})`
    g.fillRect(x, 0, 1, s)
  }
}

/** Velcro loop panel. */
function velcroTexture() {
  const { c, g } = canvas(128)
  const r = rng(11)
  g.fillStyle = '#1b1c1a'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = r() > 0.5 ? '#2a2b27' : '#121311'
    g.fillRect(r() * 128, r() * 128, 1.5, 1.5)
  }
  return tex(c, [2, 2])
}

/** Shemagh-style check in sand and black for the neck scarf. */
function shemaghTexture() {
  const { c, g } = canvas(512)
  g.fillStyle = '#c9b58a'
  g.fillRect(0, 0, 512, 512)
  g.strokeStyle = '#1c1a16'
  g.lineWidth = 5
  for (let i = -512; i < 1024; i += 32) {
    g.beginPath()
    g.moveTo(i, 0)
    g.lineTo(i + 512, 512)
    g.stroke()
    g.beginPath()
    g.moveTo(i, 512)
    g.lineTo(i + 512, 0)
    g.stroke()
  }
  g.fillStyle = '#1c1a16'
  for (let y = 16; y < 512; y += 32) for (let x = 0; x < 512; x += 32) g.fillRect(x - 3 + ((y / 32) % 2) * 16, y - 3, 6, 6)
  // Border bands.
  g.fillRect(0, 0, 512, 18)
  g.fillRect(0, 30, 512, 6)
  weave(g, 512, rng(4), 0.06)
  return tex(c, [2, 2])
}

function logoPatch(): THREE.Texture {
  const t = new THREE.TextureLoader().load('/brand/arena11-patch-600.webp')
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ---------- shared parts ----------

const fabric = (map: THREE.Texture, rough = 0.92) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 })
const plastic = (color: string, rough = 0.55) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.15 })
const metal = (color = '#8b8d90') => new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.9 })

/** Bends geometry around the Y axis so flat panels wrap a torso of radius `radius`. */
function wrap(geo: THREE.BufferGeometry, radius: number) {
  const p = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const a = x / radius
    p.setXYZ(i, Math.sin(a) * (radius + z), p.getY(i), Math.cos(a) * (radius + z) - radius)
  }
  geo.computeVertexNormals()
  return geo
}

function box(w: number, h: number, d: number, mat: THREE.Material, r = 0.01, seg = 3) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)), mat)
  m.castShadow = m.receiveShadow = true
  return m
}

// Matte display form so the kit reads as worn.
const formMat = () => new THREE.MeshStandardMaterial({ color: '#1a1a1b', roughness: 0.75, metalness: 0.05 })
function head(y: number) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 48, 32), formMat())
  m.scale.set(0.88, 1.12, 1.0)
  m.position.y = y
  m.castShadow = m.receiveShadow = true
  return m
}

// ---------- vest ----------

function vestShape() {
  const s = new THREE.Shape()
  // Front plate carrier: neck scoop, shoulder tabs, arm cut-outs, square bottom. Units: metres.
  s.moveTo(-0.2, -0.27)
  s.lineTo(0.2, -0.27)
  s.lineTo(0.21, 0.05)
  s.quadraticCurveTo(0.21, 0.13, 0.16, 0.16)
  s.lineTo(0.15, 0.3)
  s.lineTo(0.09, 0.3)
  s.quadraticCurveTo(0.075, 0.2, 0, 0.19)
  s.quadraticCurveTo(-0.075, 0.2, -0.09, 0.3)
  s.lineTo(-0.15, 0.3)
  s.lineTo(-0.16, 0.16)
  s.quadraticCurveTo(-0.21, 0.13, -0.21, 0.05)
  s.closePath()
  return s
}

function buildVest(skin: VestSkin, team: Team) {
  const g = new THREE.Group()
  const shell = skin === 'camo' ? fabric(woodlandTexture()) : fabric(solidFabric('#1a1b1a'), 0.95)
  const trim = fabric(solidFabric(skin === 'camo' ? '#2a2a22' : '#0f100f'))
  const webbing = fabric(solidFabric('#121312'), 0.85)
  const R = 0.32

  const panelGeo = (depth: number) => {
    const geo = new THREE.ExtrudeGeometry(vestShape(), { depth, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 16, steps: 1 })
    geo.translate(0, 0, -depth / 2)
    // Map UVs from position so the camo is continuous.
    const p = geo.attributes.position as THREE.BufferAttribute
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      uv[i * 2] = p.getX(i) * 2.2
      uv[i * 2 + 1] = p.getY(i) * 2.2
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    return wrap(geo, R)
  }
  const front = new THREE.Mesh(panelGeo(0.035), shell)
  front.position.z = 0.11
  front.castShadow = front.receiveShadow = true
  const back = new THREE.Mesh(panelGeo(0.035), shell)
  back.rotation.y = Math.PI
  back.position.z = -0.11
  back.castShadow = true
  g.add(front, back)

  // Shoulder straps over the top.
  for (const x of [-0.12, 0.12]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.29, 0.1), new THREE.Vector3(x, 0.36, 0.03), new THREE.Vector3(x, 0.36, -0.05), new THREE.Vector3(x, 0.29, -0.1)])
    const strap = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.028, 4, false), trim)
    strap.scale.set(1, 1, 1)
    strap.castShadow = true
    g.add(strap)
    const buckle = box(0.05, 0.022, 0.012, plastic('#111'), 0.004)
    buckle.position.set(x, 0.275, 0.135)
    g.add(buckle)
  }

  // Front layout: admin pouch with velcro ID panel, two magazine pouches, horizontal webbing, D-ring, loops.
  const fz = 0.11 + 0.03
  const onFront = (m: THREE.Object3D, x: number, y: number, dz = 0) => {
    const a = x / R
    m.position.set(Math.sin(a) * (R + fz - 0.11 + dz) , y, Math.cos(a) * (R + fz - 0.11 + dz) - R + 0.11)
    m.rotation.y = a
    g.add(m)
    return m
  }
  const admin = box(0.13, 0.11, 0.035, shell, 0.012)
  onFront(admin, -0.01, 0.07, 0.008)
  const flap = box(0.135, 0.04, 0.04, shell, 0.012)
  onFront(flap, -0.01, 0.115, 0.01)
  const velcro = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.035), new THREE.MeshStandardMaterial({ map: velcroTexture(), roughness: 1 }))
  onFront(velcro, -0.01, 0.065, 0.027)
  for (const [x, w] of [[-0.135, 0.085], [0.135, 0.085]] as const) {
    const pouch = box(w, 0.15, 0.05, shell, 0.012)
    onFront(pouch, x, -0.16, 0.015)
    const pflap = box(w + 0.005, 0.035, 0.055, shell, 0.01)
    onFront(pflap, x, -0.088, 0.017)
  }
  for (const y of [-0.13, -0.2]) {
    const band = box(0.19, 0.022, 0.006, webbing, 0.002)
    onFront(band, 0, y, 0.004)
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 8, 24), metal())
  onFront(ring, 0.1, 0.08, 0.006)
  const loop = box(0.022, 0.07, 0.006, webbing, 0.002)
  onFront(loop, -0.12, 0.08, 0.004)
  onFront(loop.clone(), 0.1, 0.12, 0.004)

  // Side buckles and hanging straps.
  for (const side of [-1, 1]) {
    for (const y of [-0.08, -0.17]) {
      const b = box(0.012, 0.03, 0.05, plastic('#121212'), 0.004)
      b.position.set(side * 0.215, y, 0.0)
      g.add(b)
    }
    const hang = box(0.006, 0.16, 0.022, webbing, 0.002)
    hang.position.set(side * 0.225, -0.28, 0.02)
    hang.rotation.z = side * 0.06
    g.add(hang)
  }

  // ARENA11 hit-tracking: sensor pods with a team-colour LED strip across the chest.
  const ledMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: TEAM[team], emissiveIntensity: 2.2, roughness: 0.4 })
  const led = box(0.2, 0.012, 0.01, ledMat, 0.004)
  onFront(led, 0, 0.165, 0.008)
  const pods: THREE.Mesh[] = []
  for (const [x, y] of [[-0.16, 0.0], [0.16, 0.0], [0.0, -0.245]] as const) {
    const pod = box(0.035, 0.035, 0.012, plastic('#0d0d0d', 0.4), 0.008)
    onFront(pod, x, y, 0.012)
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 16), ledMat)
    dot.position.z = 0.0065
    pod.add(dot)
    pods.push(pod)
  }
  g.userData.led = ledMat
  g.position.y = 0.0
  g.userData.base = 0.74
  return g
}

// ---------- helmet ----------

function buildHelmet(team: Team) {
  const g = new THREE.Group()
  const shellMat = new THREE.MeshStandardMaterial({ color: '#25272a', roughness: 0.48, metalness: 0.35 })
  const cover = fabric(solidFabric('#4b4a3a'))
  const vel = new THREE.MeshStandardMaterial({ map: velcroTexture(), roughness: 1 })

  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.16, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.52), shellMat)
  shell.scale.set(1, 0.86, 1.14)
  shell.castShadow = shell.receiveShadow = true
  g.add(shell)
  // Hard-hat brim all round, wider at the front.
  const brimPts = [new THREE.Vector2(0.158, 0.0), new THREE.Vector2(0.185, -0.01), new THREE.Vector2(0.188, -0.018), new THREE.Vector2(0.16, -0.012)]
  const brim = new THREE.Mesh(new THREE.LatheGeometry(brimPts, 64), shellMat)
  brim.scale.set(1, 1, 1.18)
  brim.position.y = -0.008
  brim.castShadow = true
  g.add(brim)
  // Raised centre ridge, like the reference helmet.
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.008, 8, 48, Math.PI), shellMat)
  ridge.rotation.y = Math.PI / 2
  ridge.scale.set(1, 0.86, 1.14)
  ridge.position.y = 0.0
  g.add(ridge)

  // Fabric cover panels on the sides and back, velcro strips on top.
  const panel = (phiStart: number, phiLen: number, thStart: number, thLen: number, mat: THREE.Material, grow = 1.012) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 * grow, 32, 16, phiStart, phiLen, thStart, thLen), mat)
    m.scale.set(1, 0.86, 1.14)
    m.castShadow = true
    g.add(m)
    return m
  }
  panel(Math.PI * 0.15, Math.PI * 0.55, Math.PI * 0.12, Math.PI * 0.36, cover)
  panel(Math.PI * 1.3, Math.PI * 0.55, Math.PI * 0.12, Math.PI * 0.36, cover)
  panel(Math.PI * 0.85, Math.PI * 0.3, Math.PI * 0.18, Math.PI * 0.3, vel, 1.016)
  panel(-0.12, 0.24, Math.PI * 0.02, Math.PI * 0.3, vel, 1.018)

  // ARENA11 patch on the left side.
  const patchMat = new THREE.MeshStandardMaterial({ map: logoPatch(), roughness: 0.85 })
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(0.115, 0.115 / 3.56), patchMat)
  const backing = box(0.125, 0.125 / 3.56 + 0.012, 0.004, new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.7 }), 0.003)
  const patchPivot = new THREE.Group()
  patchPivot.add(backing)
  patch.position.z = 0.0025
  backing.add(patch)
  // Sit the patch on the shell surface, facing out along the ellipsoid normal.
  const pp = new THREE.Vector3(0.139, 0.072, -0.01)
  const n = new THREE.Vector3(pp.x / 0.16 ** 2, pp.y / (0.16 * 0.86) ** 2, pp.z / (0.16 * 1.14) ** 2).normalize()
  patchPivot.position.copy(pp).addScaledVector(n, 0.004)
  patchPivot.lookAt(pp.clone().add(n))
  g.add(patchPivot)

  // Dummy front mount (decorative, NVG-style shroud).
  const mount = new THREE.Group()
  const plate = box(0.07, 0.06, 0.014, plastic('#1b1c1e', 0.5), 0.006)
  const window = box(0.03, 0.028, 0.018, plastic('#0b0b0b', 0.7), 0.003)
  window.position.z = 0.003
  mount.add(plate, window)
  mount.position.set(0, 0.07, 0.175)
  mount.rotation.x = -0.32
  g.add(mount)

  // Side accessory rails with a light module on the right.
  for (const side of [-1, 1]) {
    const rail = box(0.012, 0.02, 0.13, plastic('#151617', 0.45), 0.003)
    rail.position.set(side * 0.17, 0.02, 0.01)
    g.add(rail)
    for (let i = 0; i < 4; i++) {
      const tooth = box(0.014, 0.006, 0.012, plastic('#0f0f10'), 0.002)
      tooth.position.set(side * 0.171, 0.033, -0.04 + i * 0.033)
      g.add(tooth)
    }
  }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 24), plastic('#111', 0.4))
  lamp.rotation.x = Math.PI / 2
  lamp.position.set(-0.19, 0.02, 0.02)
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.003, 8, 24), new THREE.MeshStandardMaterial({ color: '#ff5a1f', roughness: 0.4, metalness: 0.4 }))
  bezel.position.set(-0.19, 0.02, 0.05)
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.011, 24), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff1d6', emissiveIntensity: 1.4 }))
  lens.position.set(-0.19, 0.02, 0.0505)
  g.add(lamp, bezel, lens)

  // Hit sensors around the crown, glowing in the team colour.
  const ledMat = new THREE.MeshStandardMaterial({ color: '#111', emissive: TEAM[team], emissiveIntensity: 2.2 })
  for (const a of [0.4, Math.PI - 0.4, Math.PI + 0.9, -0.9]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), ledMat)
    s.position.set(Math.sin(a) * 0.12, 0.105, Math.cos(a) * 0.14)
    g.add(s)
  }
  g.userData.led = ledMat

  // Chin strap with padded cup and buckle.
  const strapMat = fabric(solidFabric('#121212'), 0.9)
  for (const side of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(side * 0.15, -0.01, 0.03), new THREE.Vector3(side * 0.13, -0.13, 0.06), new THREE.Vector3(side * 0.05, -0.2, 0.09)])
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.006, 4), strapMat))
  }
  const cup = box(0.1, 0.03, 0.03, plastic('#151515', 0.85), 0.012)
  cup.position.set(0, -0.205, 0.095)
  const buckle = box(0.024, 0.03, 0.01, plastic('#0d0d0d'), 0.004)
  buckle.position.set(0.075, -0.19, 0.088)
  g.add(cup, buckle)

  g.add(head(-0.035))
  const neckForm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 32), formMat())
  neckForm.position.y = -0.2
  g.add(neckForm)
  g.position.y = 0.06
  g.userData.base = 1.15
  return g
}

// ---------- neck scarf ----------

function buildScarf() {
  const g = new THREE.Group()
  const t = shemaghTexture()
  const mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.96, side: THREE.DoubleSide })
  // Rolled loop around the neck: a fat torus with bunched folds.
  const loop = new THREE.TorusGeometry(0.085, 0.032, 24, 96)
  const p = loop.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const a = Math.atan2(y, x)
    const k = 1 + 0.07 * Math.sin(a * 11) + 0.04 * Math.sin(a * 27 + z * 40)
    p.setXYZ(i, x * (1 + (k - 1) * 0.4), y * (1 + (k - 1) * 0.4), z * k)
  }
  loop.computeVertexNormals()
  const neck = new THREE.Mesh(loop, mat)
  neck.rotation.x = Math.PI / 2 - 0.25
  neck.castShadow = true
  g.add(neck)
  // Knot at the front.
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), mat)
  knot.scale.set(1.25, 0.9, 0.85)
  knot.position.set(0, -0.025, 0.105)
  g.add(knot)
  // Two tails hanging from the knot, with ripples and a fringe.
  const tail = (side: number) => {
    const geo = new THREE.PlaneGeometry(0.05, 0.17, 8, 24)
    const q = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i)
      const y = q.getY(i)
      const v = (0.085 - y) / 0.17
      q.setXYZ(i, x * (1 + v * 0.5) + side * v * 0.035, y, 0.012 * Math.sin(x * 90 + v * 7) + v * v * 0.03)
    }
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, mat)
    m.position.set(side * 0.015, -0.12, 0.112)
    m.rotation.z = side * 0.12
    m.castShadow = true
    g.add(m)
    const fringe = new THREE.MeshStandardMaterial({ color: '#1c1a16', roughness: 1 })
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.001, 0.025, 4), fringe)
      f.position.set(side * 0.015 + side * 0.035 + (i / 6 - 0.5) * 0.07 + Math.sin(side * 0.12) * 0.0, -0.215, 0.142)
      g.add(f)
    }
  }
  tail(-1)
  tail(1)
  // Display form: neck, head and shoulders.
  const neckForm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.26, 32), formMat())
  neckForm.position.y = 0.02
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.22, 48, 24), formMat())
  shoulders.scale.set(1, 0.34, 0.5)
  shoulders.position.y = -0.13
  const h = head(0.24)
  for (const m of [neckForm, shoulders]) m.castShadow = m.receiveShadow = true
  g.add(neckForm, shoulders, h)
  g.position.y = -0.03
  g.userData.base = 1.0
  return g
}

// ---------- viewer ----------

export interface GearViewer {
  show: (id: GearId) => void
  setSkin: (skin: VestSkin) => void
  setTeam: (team: Team) => void
  resize: (w: number, h: number) => void
  frame: (dt: number) => void
  dispose: () => void
}

export function createGearViewer(canvasEl: HTMLCanvasElement, quality: Quality): GearViewer {
  const stage = createStage(canvasEl, { quality, bloom: quality === 'high' ? 0.45 : 0, env: true })
  const { scene, camera, renderer } = stage
  scene.background = new THREE.Color('#050505')
  scene.fog = new THREE.Fog('#050505', 2.2, 6)
  camera.fov = 30
  camera.position.set(0.62, 0.28, 1.55)

  const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: '#0b0b0a', roughness: 0.6, metalness: 0.25 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.33
  floor.receiveShadow = true
  scene.add(floor)
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.425, 96), new THREE.MeshBasicMaterial({ color: '#ff5a1f', transparent: true, opacity: 0.55 }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = -0.329
  scene.add(ring)

  const key = new THREE.SpotLight('#fff1dc', 9, 6, 0.5, 0.6, 1.2)
  key.position.set(0.8, 1.8, 1.2)
  key.castShadow = quality === 'high'
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.bias = -0.0002
  const rim = new THREE.SpotLight('#ff5a1f', 7, 6, 0.6, 0.7, 1.2)
  rim.position.set(-1.0, 1.0, -1.3)
  const fill = new THREE.DirectionalLight('#6d86a8', 0.6)
  fill.position.set(-1.2, 0.4, 1.0)
  scene.add(key, rim, fill, new THREE.HemisphereLight('#3a332a', '#050505', 0.5))

  // Slow smoke behind the kit.
  const smokeTex = smokeTexture()
  const smokes = Array.from({ length: quality === 'high' ? 8 : 4 }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: i % 2 ? '#3d3530' : '#5a2a18', transparent: true, opacity: 0.22, depthWrite: false }))
    s.scale.setScalar(1.2 + (i % 3) * 0.4)
    s.position.set(-1 + i * 0.3, -0.05 + (i % 3) * 0.12, -1.2 - (i % 2) * 0.4)
    scene.add(s)
    return s
  })

  const controls = new OrbitControls(camera, canvasEl)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minDistance = 0.55
  controls.maxDistance = 2.4
  controls.minPolarAngle = 0.35
  controls.maxPolarAngle = Math.PI * 0.62
  controls.autoRotate = true
  controls.autoRotateSpeed = 1.6
  controls.target.set(0, 0.02, 0)
  let idle = 0
  controls.addEventListener('start', () => {
    controls.autoRotate = false
    idle = 0
  })
  controls.addEventListener('end', () => (idle = 0.0001))

  let skin: VestSkin = 'camo'
  let team: Team = 'red'
  let current: GearId = 'vest'
  let model: THREE.Group | null = null
  let reveal = 1
  const build = () => {
    if (model) {
      scene.remove(model)
      model.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
    }
    model = current === 'vest' ? buildVest(skin, team) : current === 'helmet' ? buildHelmet(team) : buildScarf()
    scene.add(model)
    reveal = 0
  }
  build()

  let time = 0
  return {
    show(id) {
      if (id === current) return
      current = id
      build()
    },
    setSkin(s) {
      skin = s
      if (current === 'vest') build()
    },
    setTeam(t) {
      team = t
      if (current !== 'scarf') build()
    },
    resize: stage.resize,
    frame(dt) {
      time += dt
      if (idle > 0) {
        idle += dt
        if (idle > 2.5) {
          controls.autoRotate = true
          idle = 0
        }
      }
      if (model) {
        reveal = Math.min(1, reveal + dt * 1.6)
        const e = 1 - Math.pow(1 - reveal, 3)
        model.scale.setScalar(((model.userData.base as number) ?? 1) * (0.6 + 0.4 * e))
        model.rotation.y = (1 - e) * -1.2
        const led = model.userData.led as THREE.MeshStandardMaterial | undefined
        if (led) led.emissiveIntensity = 1.4 + Math.sin(time * 3) * 0.9
      }
      ring.material.opacity = 0.35 + Math.sin(time * 1.5) * 0.15
      smokes.forEach((s, i) => {
        s.position.x += Math.sin(time * 0.2 + i) * 0.0008
        s.material.rotation += 0.0006 * (i % 2 ? 1 : -1)
      })
      controls.update()
      stage.render()
    },
    dispose() {
      controls.dispose()
      stage.dispose()
      renderer.forceContextLoss()
    },
  }
}
