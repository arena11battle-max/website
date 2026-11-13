import * as THREE from 'three'
import { gunmetalTexture } from './textures'

// Stylised gel-blaster props for the arsenal showcase, modelled from simple extruded profiles.
// They are recreational blasters: every model carries the orange safety tip and a gel-ball magazine.

import type { GunId } from './data'
export type { GunId } from './data'

export interface GunModel {
  group: THREE.Group
  /** Muzzle position in the gun's local space (gun points along +X). */
  muzzle: THREE.Vector3
  /** Macro close-up stops: camera offset and look target, in local space. */
  details: { label: string; cam: THREE.Vector3; look: THREE.Vector3 }[]
  length: number
  dispose: () => void
}

type Pt = [number, number]

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function shape(points: Pt[]) {
  const s = new THREE.Shape()
  s.moveTo(...points[0])
  for (const p of points.slice(1)) s.lineTo(...p)
  s.closePath()
  return s
}

export function buildGun(id: GunId): GunModel {
  const group = new THREE.Group()
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)
  const wear = track(gunmetalTexture(id.length * 13))

  const polymer = track(new THREE.MeshPhysicalMaterial({ color: '#1b1d1a', roughness: 0.62, roughnessMap: wear, clearcoat: 0.2, clearcoatRoughness: 0.6 }))
  const metal = track(new THREE.MeshPhysicalMaterial({ color: '#2c2f31', metalness: 0.92, roughness: 0.32, roughnessMap: wear, clearcoat: 0.4 }))
  const darkMetal = track(new THREE.MeshStandardMaterial({ color: '#141516', metalness: 0.85, roughness: 0.45 }))
  const furniture = track(
    new THREE.MeshPhysicalMaterial({
      color: id === 'awm' ? '#353b24' : id === 'rifle' ? '#3a3328' : '#1e211c',
      roughness: 0.7,
      roughnessMap: wear,
      clearcoat: 0.1,
    }),
  )
  const orange = track(new THREE.MeshStandardMaterial({ color: '#ff5a1f', emissive: '#7a1f00', emissiveIntensity: 0.4, roughness: 0.5 }))
  const glass = track(
    new THREE.MeshPhysicalMaterial({ color: '#7fd0ff', metalness: 0, roughness: 0.05, transmission: 0.6, thickness: 0.01, transparent: true, opacity: 0.55 }),
  )
  const gel = track(
    new THREE.MeshPhysicalMaterial({ color: '#ff8a3a', roughness: 0.15, transmission: 0.5, thickness: 0.02, transparent: true, opacity: 0.8, emissive: '#4a1500', emissiveIntensity: 0.3 }),
  )

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, rot?: [number, number, number]) => {
    track(geo)
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    if (rot) m.rotation.set(...rot)
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
    return m
  }
  const extrude = (pts: Pt[], depth: number, mat: THREE.Material, z = 0, bevel = 0.003) => {
    const geo = new THREE.ExtrudeGeometry(shape(pts), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 })
    geo.translate(0, 0, -depth / 2 + z)
    return add(geo, mat, v(0, 0, 0))
  }
  const box = (w: number, h: number, d: number, mat: THREE.Material, pos: THREE.Vector3, rz = 0) => add(new THREE.BoxGeometry(w, h, d), mat, pos, [0, 0, rz])
  const tube = (rad: number, len: number, mat: THREE.Material, pos: THREE.Vector3, seg = 24, rad2 = rad) =>
    add(new THREE.CylinderGeometry(rad2, rad, len, seg), mat, pos, [0, 0, -Math.PI / 2])
  const rail = (from: number, to: number, y: number, w = 0.022) => {
    box(to - from, 0.008, w, darkMetal, v((from + to) / 2, y, 0))
    for (let x = from + 0.005; x < to; x += 0.01) box(0.005, 0.006, w + 0.004, darkMetal, v(x, y + 0.007, 0))
  }
  const gelMag = (x: number, y: number, h: number, w: number, tilt: number) => {
    box(w, h, 0.03, polymer, v(x, y, 0), tilt)
    // Window showing the gel balls.
    const win = box(w * 0.5, h * 0.7, 0.032, glass, v(x, y, 0), tilt)
    win.castShadow = false
    for (let i = 0; i < 6; i++) {
      const off = -h * 0.3 + (i / 5) * h * 0.6
      add(new THREE.SphereGeometry(0.0045, 10, 8), gel, v(x - Math.sin(tilt) * off, y + Math.cos(tilt) * off, 0.016))
    }
  }
  const scope = (x: number, y: number, len: number, rad: number) => {
    tube(rad, len, darkMetal, v(x, y, 0), 28)
    tube(rad * 1.45, len * 0.18, darkMetal, v(x + len * 0.45, y, 0), 28, rad)
    tube(rad * 1.25, len * 0.14, darkMetal, v(x - len * 0.46, y, 0), 28, rad * 1.1)
    const lens = add(new THREE.CircleGeometry(rad * 1.3, 28), glass, v(x + len * 0.54, y, 0), [0, Math.PI / 2, 0])
    lens.castShadow = false
    add(new THREE.CylinderGeometry(rad * 0.45, rad * 0.45, rad * 1.1, 16), metal, v(x, y + rad * 1.2, 0))
    add(new THREE.CylinderGeometry(rad * 0.45, rad * 0.45, rad * 1.1, 16), metal, v(x, y, rad * 1.2), [Math.PI / 2, 0, 0])
    box(0.02, rad * 1.4, 0.03, darkMetal, v(x - len * 0.25, y - rad * 1.1, 0))
    box(0.02, rad * 1.4, 0.03, darkMetal, v(x + len * 0.25, y - rad * 1.1, 0))
  }

  let muzzle = v(0, 0, 0)
  let details: GunModel['details'] = []

  if (id === 'pistol') {
    extrude([[-0.1, 0.03], [0.095, 0.03], [0.098, 0.062], [-0.098, 0.066], [-0.104, 0.05]], 0.028, metal)
    for (let i = 0; i < 7; i++) box(0.003, 0.028, 0.03, darkMetal, v(-0.09 + i * 0.006, 0.048, 0))
    extrude([[-0.085, 0.03], [0.09, 0.03], [0.09, 0.014], [0.02, 0.012], [0.012, -0.012], [-0.03, -0.012], [-0.04, 0.012], [-0.07, 0.012]], 0.026, polymer)
    // Trigger guard and trigger
    const guard = add(new THREE.TorusGeometry(0.02, 0.0035, 8, 24, Math.PI), polymer, v(-0.01, 0.012, 0), [0, 0, Math.PI])
    guard.scale.set(1.2, 1, 1)
    box(0.004, 0.018, 0.006, darkMetal, v(-0.016, 0.004, 0), 0.25)
    // Grip
    extrude([[-0.088, 0.03], [-0.04, 0.012], [-0.06, -0.09], [-0.108, -0.092], [-0.104, 0.02]], 0.03, furniture, 0, 0.004)
    for (let i = 0; i < 8; i++) box(0.04, 0.002, 0.032, polymer, v(-0.079 + i * -0.0005, -0.07 + i * 0.01, 0), 0.32)
    gelMag(-0.083, -0.1, 0.02, 0.04, 0.32)
    tube(0.007, 0.012, orange, v(0.103, 0.047, 0))
    box(0.008, 0.008, 0.006, darkMetal, v(0.085, 0.069, 0))
    box(0.01, 0.008, 0.018, darkMetal, v(-0.09, 0.07, 0))
    muzzle = v(0.11, 0.047, 0)
    details = [
      { label: 'Slide serrations', cam: v(-0.12, 0.09, 0.12), look: v(-0.08, 0.05, 0) },
      { label: 'Orange safety muzzle', cam: v(0.18, 0.06, 0.08), look: v(0.1, 0.047, 0) },
      { label: 'Gel magazine window', cam: v(-0.05, -0.08, 0.14), look: v(-0.08, -0.06, 0) },
    ]
  }

  if (id === 'rifle') {
    // Upper and lower receiver
    extrude([[-0.13, 0.05], [0.12, 0.05], [0.12, 0.1], [-0.13, 0.1]], 0.05, metal)
    extrude([[-0.14, 0.05], [0.1, 0.05], [0.1, 0.03], [0.02, 0.0], [-0.07, 0.0], [-0.1, 0.03], [-0.14, 0.03]], 0.044, metal)
    box(0.04, 0.01, 0.052, darkMetal, v(0.03, 0.075, 0))
    // Pistol grip
    extrude([[-0.08, 0.03], [-0.045, 0.03], [-0.07, -0.08], [-0.105, -0.075]], 0.032, polymer, 0, 0.005)
    // Trigger guard
    box(0.07, 0.006, 0.02, metal, v(-0.01, -0.005, 0))
    box(0.005, 0.03, 0.006, darkMetal, v(-0.025, 0.012, 0), 0.2)
    // Buffer tube and stock
    tube(0.017, 0.2, darkMetal, v(-0.24, 0.075, 0))
    extrude([[-0.43, 0.105], [-0.28, 0.1], [-0.27, 0.05], [-0.33, 0.035], [-0.43, -0.02], [-0.45, -0.02], [-0.45, 0.105]], 0.042, furniture, 0, 0.006)
    box(0.012, 0.13, 0.05, polymer, v(-0.452, 0.04, 0))
    // Handguard (octagonal) with slots
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), furniture, v(0.27, 0.075, 0), [0, 0, -Math.PI / 2]).rotation.x = Math.PI / 8
    for (let i = 0; i < 6; i++) box(0.03, 0.008, 0.064, darkMetal, v(0.16 + i * 0.045, 0.075, 0))
    rail(-0.12, 0.42, 0.105)
    // Barrel and flash hider with orange tip
    tube(0.011, 0.16, metal, v(0.5, 0.075, 0))
    tube(0.016, 0.05, darkMetal, v(0.6, 0.075, 0), 6)
    tube(0.017, 0.015, orange, v(0.632, 0.075, 0))
    // Front sight post
    extrude([[0.38, 0.11], [0.4, 0.11], [0.395, 0.15], [0.385, 0.15]], 0.01, darkMetal)
    // Curved magazine with gel window
    const mag = extrude([[0.0, 0.03], [0.065, 0.03], [0.09, -0.08], [0.08, -0.16], [0.02, -0.16], [0.025, -0.08]], 0.03, polymer, 0, 0.003)
    mag.position.x = -0.005
    const win = box(0.025, 0.11, 0.032, glass, v(0.05, -0.06, 0), 0.12)
    win.castShadow = false
    for (let i = 0; i < 8; i++) add(new THREE.SphereGeometry(0.005, 10, 8), gel, v(0.042 + i * 0.002, -0.11 + i * 0.014, 0.016))
    // Red-dot sight
    box(0.06, 0.014, 0.03, darkMetal, v(0.0, 0.118, 0))
    tube(0.02, 0.06, darkMetal, v(0.0, 0.148, 0), 24)
    add(new THREE.CircleGeometry(0.017, 24), glass, v(0.031, 0.148, 0), [0, Math.PI / 2, 0]).castShadow = false
    // Charging handle
    box(0.03, 0.01, 0.06, darkMetal, v(-0.12, 0.1, 0))
    muzzle = v(0.64, 0.075, 0)
    details = [
      { label: 'Muzzle and orange tip', cam: v(0.72, 0.13, 0.14), look: v(0.6, 0.075, 0) },
      { label: 'Gel magazine window', cam: v(0.1, -0.06, 0.22), look: v(0.05, -0.06, 0) },
      { label: 'Optic and top rail', cam: v(-0.06, 0.22, 0.18), look: v(0.0, 0.14, 0) },
      { label: 'Receiver finish', cam: v(-0.08, 0.06, 0.2), look: v(-0.04, 0.06, 0) },
    ]
  }

  if (id === 'smg') {
    extrude([[-0.12, 0.03], [0.14, 0.03], [0.15, 0.1], [-0.12, 0.105]], 0.05, polymer, 0, 0.006)
    box(0.24, 0.012, 0.054, darkMetal, v(0.01, 0.065, 0))
    extrude([[-0.06, 0.03], [-0.025, 0.03], [-0.05, -0.075], [-0.085, -0.07]], 0.032, polymer, 0, 0.005)
    box(0.06, 0.006, 0.02, polymer, v(0.005, 0.0, 0))
    box(0.005, 0.026, 0.006, darkMetal, v(-0.008, 0.014, 0), 0.2)
    // Straight magazine
    gelMag(0.06, -0.05, 0.16, 0.035, 0.05)
    // Shrouded barrel
    tube(0.026, 0.13, darkMetal, v(0.22, 0.068, 0), 20)
    for (let i = 0; i < 5; i++) box(0.012, 0.054, 0.054, metal, v(0.17 + i * 0.025, 0.068, 0))
    tube(0.012, 0.03, orange, v(0.298, 0.068, 0))
    // Vertical fore grip
    tube(0.015, 0.08, furniture, v(0.13, -0.005, 0)).rotation.set(0, 0, 0)
    // Folding wire stock
    tube(0.007, 0.18, darkMetal, v(-0.21, 0.09, 0.02))
    tube(0.007, 0.18, darkMetal, v(-0.21, 0.09, -0.02))
    box(0.014, 0.11, 0.05, polymer, v(-0.3, 0.05, 0))
    rail(-0.1, 0.13, 0.105)
    box(0.03, 0.03, 0.03, darkMetal, v(0.03, 0.13, 0))
    add(new THREE.CircleGeometry(0.011, 20), glass, v(0.046, 0.132, 0), [0, Math.PI / 2, 0]).castShadow = false
    muzzle = v(0.31, 0.068, 0)
    details = [
      { label: 'Ventilated barrel shroud', cam: v(0.3, 0.12, 0.16), look: v(0.21, 0.068, 0) },
      { label: 'Straight gel magazine', cam: v(0.14, -0.08, 0.17), look: v(0.06, -0.06, 0) },
      { label: 'Folding stock', cam: v(-0.24, 0.13, 0.16), look: v(-0.22, 0.08, 0) },
    ]
  }

  if (id === 'awm') {
    // Thumbhole stock in olive drab
    extrude(
      [
        [-0.62, 0.11], [-0.42, 0.1], [-0.3, 0.06], [-0.2, 0.07], [0.3, 0.07], [0.3, 0.02], [-0.05, 0.02], [-0.12, -0.02],
        [-0.2, -0.02], [-0.22, -0.09], [-0.27, -0.09], [-0.28, -0.02], [-0.42, -0.02], [-0.62, -0.06],
      ],
      0.05,
      furniture,
      0,
      0.008,
    )
    // Thumbhole cut-out illusion and butt pad
    box(0.08, 0.04, 0.052, polymer, v(-0.33, 0.035, 0))
    box(0.02, 0.18, 0.056, polymer, v(-0.63, 0.025, 0))
    // Action and bolt
    tube(0.022, 0.26, metal, v(-0.06, 0.095, 0), 24)
    tube(0.006, 0.05, metal, v(-0.12, 0.095, 0.04)).rotation.set(Math.PI / 2, 0, 0)
    add(new THREE.SphereGeometry(0.011, 16, 12), darkMetal, v(-0.12, 0.095, 0.067))
    // Long fluted barrel + brake + orange tip
    tube(0.012, 0.56, metal, v(0.53, 0.095, 0), 12)
    tube(0.02, 0.07, darkMetal, v(0.84, 0.095, 0), 8)
    for (let i = 0; i < 3; i++) box(0.006, 0.042, 0.042, polymer, v(0.82 + i * 0.018, 0.095, 0))
    tube(0.021, 0.014, orange, v(0.882, 0.095, 0), 8)
    // Box magazine with gel window
    gelMag(-0.02, -0.01, 0.07, 0.06, 0)
    box(0.05, 0.006, 0.02, metal, v(-0.14, -0.035, 0))
    box(0.005, 0.025, 0.006, darkMetal, v(-0.15, -0.02, 0), 0.2)
    // Scope
    rail(-0.2, 0.12, 0.12, 0.024)
    scope(-0.04, 0.175, 0.36, 0.024)
    // Bipod
    for (const z of [-0.025, 0.025]) {
      const leg = tube(0.006, 0.2, darkMetal, v(0.24, -0.04, z))
      leg.rotation.set(z * 8, 0, 0.15)
    }
    muzzle = v(0.89, 0.095, 0)
    details = [
      { label: 'Long-range optic', cam: v(0.06, 0.26, 0.2), look: v(-0.04, 0.175, 0) },
      { label: 'Muzzle brake and orange tip', cam: v(0.95, 0.14, 0.15), look: v(0.85, 0.095, 0) },
      { label: 'Bolt action', cam: v(-0.08, 0.15, 0.2), look: v(-0.12, 0.095, 0.04) },
      { label: 'Thumbhole stock', cam: v(-0.4, 0.1, 0.3), look: v(-0.4, 0.04, 0) },
    ]
  }

  // Centre the model on its bounding box so the turntable spins around its middle.
  const box3 = new THREE.Box3().setFromObject(group)
  const centre = box3.getCenter(new THREE.Vector3())
  for (const c of group.children) c.position.sub(centre)
  muzzle.sub(centre)
  for (const d of details) {
    d.cam.sub(centre)
    d.look.sub(centre)
  }

  return {
    group,
    muzzle,
    details,
    length: Math.max(box3.max.x - box3.min.x, (box3.max.y - box3.min.y) * 2.4),
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}

export { WEAPONS } from './data'
