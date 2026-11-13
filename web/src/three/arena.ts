import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  burlapTexture,
  camoTexture,
  concreteTexture,
  containerTexture,
  dotTexture,
  groundTexture,
  rng,
  smokeTexture,
  stencilTexture,
  boardTexture,
  woodTexture,
} from './textures'

// A CONCEPT layout of the ARENA11 training ground, built from simple shapes.
// It is not a survey of the real arena. When real photos or a floor plan arrive, move the pieces in LAYOUT to match.

import { LAYOUT, TOUR_STOPS, type Quality } from './data'
export { LAYOUT, type Quality } from './data'


export interface Arena {
  group: THREE.Group
  update: (t: number) => void
  dispose: () => void
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function buildArena(scene: THREE.Scene, quality: Quality = 'high'): Arena {
  const group = new THREE.Group()
  scene.add(group)
  const r = rng(7)
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)
  const shadows = quality === 'high'

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, rotY = 0, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.copy(pos)
    m.rotation.y = rotY
    m.castShadow = shadows
    m.receiveShadow = shadows
    parent.add(m)
    return m
  }

  // ---------- materials ----------
  const groundMat = track(new THREE.MeshStandardMaterial({ map: track(groundTexture()), roughness: 0.97, color: '#9a9278' }))
  const sandMat = track(new THREE.MeshStandardMaterial({ map: track(burlapTexture()), roughness: 1, color: '#b8a985' }))
  const woodMat = track(new THREE.MeshStandardMaterial({ map: track(woodTexture()), roughness: 0.9 }))
  const concreteMat = track(new THREE.MeshStandardMaterial({ map: track(concreteTexture()), roughness: 0.95 }))
  const camoMat = track(new THREE.MeshStandardMaterial({ map: track(camoTexture()), roughness: 1, side: THREE.DoubleSide }))
  const steelMat = track(new THREE.MeshStandardMaterial({ color: '#3a3d38', metalness: 0.75, roughness: 0.55 }))
  const tyreMat = track(new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9 }))
  const containerMats = [
    ['#4c5a2f', 'A11U 204718'],
    ['#6b2a1c', 'RWLF 880213'],
    ['#2e3e4a', 'BFLC 551904'],
    ['#5a4a2a', 'A11U 309122'],
  ].map(([col, code], i) => track(new THREE.MeshStandardMaterial({ map: track(containerTexture(col, code, 100 + i)), metalness: 0.45, roughness: 0.7 })))
  const drumMats = ['#7a2a18', '#3b4a26', '#2b2f2c'].map((c) => track(new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.6 })))
  const wallMat = track(
    new THREE.MeshStandardMaterial({ map: track(containerTexture('#2a2d26', '', 140)), metalness: 0.5, roughness: 0.75, side: THREE.DoubleSide }),
  )

  // ---------- ground ----------
  const ground = mesh(track(new THREE.PlaneGeometry(140, 110)), groundMat, v(0, 0, 0))
  ground.rotation.x = -Math.PI / 2
  ground.castShadow = false

  // Team base floor paint and stencils.
  const paint = (text: string, color: string, x: number, z: number, rot: number) => {
    const zone = mesh(
      track(new THREE.PlaneGeometry(7, 12)),
      track(new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.18, roughness: 1, depthWrite: false })),
      v(x, 0.02, z),
    )
    zone.rotation.x = -Math.PI / 2
    const label = mesh(
      track(new THREE.PlaneGeometry(9, 2.2)),
      track(new THREE.MeshStandardMaterial({ map: track(stencilTexture(text, color)), transparent: true, depthWrite: false, roughness: 1 })),
      v(x, 0.03, z),
    )
    label.rotation.x = -Math.PI / 2
    label.rotation.z = rot
  }
  paint('RED BASE', '#ff3d2e', LAYOUT.redBase.x, LAYOUT.redBase.z, -Math.PI / 2)
  paint('BLUE BASE', '#3f9bff', LAYOUT.blueBase.x, LAYOUT.blueBase.z, Math.PI / 2)

  // ---------- perimeter wall (corrugated sheets, gap for the entrance) ----------
  const { x: SX, z: SZ } = LAYOUT.size
  const wallH = 3.2
  const wallSeg = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1)
    const geo = track(new THREE.PlaneGeometry(len, wallH))
    const m = mesh(geo, wallMat, v((x1 + x2) / 2, wallH / 2, (z1 + z2) / 2), -Math.atan2(z2 - z1, x2 - x1))
    m.castShadow = false
    // Posts
    for (let i = 0; i <= Math.floor(len / 4); i++) {
      const t = i / Math.floor(len / 4)
      mesh(track(new THREE.BoxGeometry(0.15, wallH + 0.3, 0.15)), steelMat, v(x1 + (x2 - x1) * t, (wallH + 0.3) / 2, z1 + (z2 - z1) * t))
    }
  }
  wallSeg(-SX / 2, -SZ / 2, SX / 2, -SZ / 2)
  wallSeg(-SX / 2, -SZ / 2, -SX / 2, SZ / 2)
  wallSeg(SX / 2, -SZ / 2, SX / 2, SZ / 2)
  wallSeg(-SX / 2, SZ / 2, -3, SZ / 2)
  wallSeg(3, SZ / 2, SX / 2, SZ / 2)


  // ---------- containers ----------
  const containerGeo = track(new THREE.BoxGeometry(6.06, 2.6, 2.44))
  const containers: [number, number, number, number, number][] = [
    // x, z, y-level, rotY, material
    [0, -1.6, 0, 0.05, 0],
    [0.4, -1.6, 1, -0.08, 1],
    [-8, -7, 0, Math.PI / 2, 2],
    [8.5, 6.5, 0, Math.PI / 2 + 0.1, 3],
    [-3, 9.5, 0, 0.3, 1],
    [5, -9.5, 0, -0.2, 0],
  ]
  for (const [x, z, lvl, rot, mi] of containers) {
    mesh(containerGeo, containerMats[mi], v(x, 1.3 + lvl * 2.6, z), rot)
  }

  // ---------- sandbag walls ----------
  const bagGeo = track(new RoundedBoxGeometry(0.62, 0.2, 0.36, 3, 0.09))
  const bagsPerArc: { x: number; z: number; radius: number; from: number; to: number; rows: number }[] = [
    { x: -11, z: 4, radius: 2.4, from: -0.6, to: 1.6, rows: 5 },
    { x: 11, z: -4, radius: 2.4, from: 2.5, to: 4.7, rows: 5 },
    { x: -4, z: 5, radius: 3, from: 4, to: 5.4, rows: 4 },
    { x: 4, z: -5.5, radius: 3, from: 0.9, to: 2.3, rows: 4 },
    { x: -17, z: -6, radius: 2, from: -0.2, to: 1.6, rows: 4 },
    { x: 17, z: 6, radius: 2, from: 2.9, to: 4.7, rows: 4 },
    { x: LAYOUT.watchtower.x - 3, z: LAYOUT.watchtower.z + 3, radius: 1.8, from: 0, to: 2.2, rows: 3 },
    { x: LAYOUT.entrance.x - 5.2, z: LAYOUT.entrance.z + 3.4, radius: 1.9, from: 0.2, to: 2.4, rows: 4 },
    { x: LAYOUT.entrance.x + 5.2, z: LAYOUT.entrance.z + 3.4, radius: 1.9, from: 0.7, to: 2.9, rows: 4 },
  ]
  let bagCount = 0
  for (const a of bagsPerArc) bagCount += Math.ceil(((a.to - a.from) * a.radius) / 0.58) * a.rows
  const bags = new THREE.InstancedMesh(bagGeo, sandMat, bagCount)
  bags.castShadow = shadows
  bags.receiveShadow = shadows
  const dummy = new THREE.Object3D()
  let bi = 0
  for (const a of bagsPerArc) {
    const n = Math.ceil(((a.to - a.from) * a.radius) / 0.58)
    for (let row = 0; row < a.rows; row++) {
      for (let i = 0; i < n; i++) {
        const ang = a.from + ((i + (row % 2) * 0.5) / n) * (a.to - a.from)
        dummy.position.set(a.x + Math.cos(ang) * a.radius, 0.1 + row * 0.19, a.z + Math.sin(ang) * a.radius)
        dummy.rotation.set((r() - 0.5) * 0.08, -ang + Math.PI / 2 + (r() - 0.5) * 0.15, (r() - 0.5) * 0.08)
        dummy.scale.set(1 + (r() - 0.5) * 0.12, 1 + (r() - 0.5) * 0.2, 1)
        dummy.updateMatrix()
        bags.setMatrixAt(bi++, dummy.matrix)
      }
    }
  }
  bags.count = bi
  group.add(bags)

  // ---------- jersey barriers ----------
  const jersey = new THREE.Shape()
  jersey.moveTo(-0.3, 0)
  jersey.lineTo(0.3, 0)
  jersey.lineTo(0.22, 0.25)
  jersey.lineTo(0.1, 0.85)
  jersey.lineTo(-0.1, 0.85)
  jersey.lineTo(-0.22, 0.25)
  jersey.closePath()
  const jerseyGeo = track(new THREE.ExtrudeGeometry(jersey, { depth: 3, bevelEnabled: false }))
  jerseyGeo.translate(0, 0, -1.5)
  for (const [x, z, rot] of [
    [-13, -2, 0.1],
    [-13, 1.2, -0.1],
    [13, 2, -0.1],
    [13, -1.2, 0.1],
    [-6, -12, Math.PI / 2],
    [6, 12, Math.PI / 2],
    [-1, 13, Math.PI / 2],
  ] as const) {
    mesh(jerseyGeo, concreteMat, v(x, 0, z), rot)
  }

  // ---------- pallet barricades ----------
  const palletGeo = track(new THREE.BoxGeometry(1.2, 1.6, 0.14))
  for (let i = 0; i < 14; i++) {
    const x = (r() - 0.5) * 30
    const z = (r() - 0.5) * 22
    if (Math.abs(x) < 4 && Math.abs(z) < 4) continue
    const p = mesh(palletGeo, woodMat, v(x, 0.78, z), r() * Math.PI)
    p.rotation.z = (r() - 0.5) * 0.15
  }

  // ---------- tyre stacks and drums ----------
  const tyreGeo = track(new THREE.TorusGeometry(0.42, 0.17, 10, 24))
  const drumGeo = track(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 20))
  const stacks: [number, number][] = [
    [-6, 2],
    [6.5, -2],
    [-15, 9],
    [15, -9],
    [2.5, 10.5],
    [-9, -12],
  ]
  for (const [x, z] of stacks) {
    const h = 2 + Math.floor(r() * 3)
    for (let i = 0; i < h; i++) {
      const t = mesh(tyreGeo, tyreMat, v(x + (r() - 0.5) * 0.08, 0.17 + i * 0.32, z + (r() - 0.5) * 0.08))
      t.rotation.x = Math.PI / 2
    }
    for (let i = 0; i < 2; i++) mesh(drumGeo, drumMats[Math.floor(r() * 3)], v(x + 1 + i * 0.65, 0.45, z + 0.5 + (r() - 0.5) * 0.4))
  }

  // ---------- camo-net shelter ----------
  const net = new THREE.Group()
  net.position.set(-6, 0, -11)
  group.add(net)
  for (const [px, pz] of [
    [-2.5, -1.5],
    [2.5, -1.5],
    [-2.5, 1.5],
    [2.5, 1.5],
  ])
    mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 2.6)), woodMat, v(px, 1.3, pz), 0, net)
  const netGeo = track(new THREE.PlaneGeometry(6.4, 4.2, 16, 12))
  const pos = netGeo.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 1.3) * 0.15 + Math.cos(pos.getY(i) * 1.7) * 0.12)
  netGeo.computeVertexNormals()
  const netMesh = mesh(netGeo, camoMat, v(0, 2.6, 0), 0, net)
  netMesh.rotation.x = -Math.PI / 2

  // ---------- watchtowers (one overwatch post, two flanking the entrance gate) ----------
  const buildTower = (x: number, z: number, scale: number, rotY: number, flood = true) => {
  const tower = new THREE.Group()
  tower.position.set(x, 0, z)
  tower.scale.setScalar(scale)
  tower.rotation.y = rotY
  group.add(tower)
  const legGeo = track(new THREE.BoxGeometry(0.22, 5.2, 0.22))
  for (const [lx, lz] of [
    [-1.3, -1.3],
    [1.3, -1.3],
    [-1.3, 1.3],
    [1.3, 1.3],
  ]) {
    const leg = mesh(legGeo, woodMat, v(lx * 1.05, 2.6, lz * 1.05), 0, tower)
    leg.rotation.z = lx * 0.02
    leg.rotation.x = -lz * 0.02
  }
  // Cross bracing
  for (const side of [-1, 1]) {
    for (const axis of ['x', 'z'] as const) {
      const b = mesh(track(new THREE.BoxGeometry(0.1, 3.9, 0.1)), woodMat, v(axis === 'x' ? 0 : side * 1.36, 2.2, axis === 'x' ? side * 1.36 : 0), axis === 'x' ? 0 : Math.PI / 2, tower)
      b.rotation.z = 0.72
    }
  }
  mesh(track(new THREE.BoxGeometry(3.4, 0.2, 3.4)), woodMat, v(0, 5.2, 0), 0, tower)
  for (const [wx, wz, rot] of [
    [0, -1.65, 0],
    [0, 1.65, 0],
    [-1.65, 0, Math.PI / 2],
    [1.65, 0, Math.PI / 2],
  ] as const)
    mesh(track(new THREE.BoxGeometry(3.4, 1.1, 0.08)), woodMat, v(wx, 5.85, wz), rot, tower)
  for (const [px, pz] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ])
    mesh(track(new THREE.BoxGeometry(0.12, 2.4, 0.12)), woodMat, v(px, 6.4, pz), 0, tower)
  const roof = mesh(track(new THREE.ConeGeometry(2.9, 1.1, 4)), steelMat, v(0, 8.1, 0), Math.PI / 4, tower)
  roof.castShadow = shadows
  // Ladder
  for (let i = 0; i < 2; i++) mesh(track(new THREE.BoxGeometry(0.08, 5.6, 0.08)), steelMat, v(-0.35 + i * 0.7, 2.7, 1.9), 0, tower).rotation.x = -0.18
  for (let i = 0; i < 12; i++) mesh(track(new THREE.BoxGeometry(0.7, 0.05, 0.05)), steelMat, v(0, 0.3 + i * 0.45, 1.98 - i * 0.08), 0, tower)
  // Floodlight head
  if (flood) {
  const lamp = mesh(
    track(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 16)),
    track(new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ffe2b0', emissiveIntensity: 2.5 })),
    v(-1.2, 7.2, 1.2),
    0,
    tower,
  )
  lamp.rotation.x = 0.9
  }
  return tower
  }
  buildTower(LAYOUT.watchtower.x, LAYOUT.watchtower.z, 1, 0)

  // ---------- entrance gate: ARENA11 board between two towers ----------
  const { x: GX, z: GZ } = LAYOUT.entrance
  buildTower(GX - 4.7, GZ + 0.4, 0.86, Math.PI, false)
  buildTower(GX + 4.7, GZ + 0.4, 0.86, Math.PI, false)
  const hazardMat = track(new THREE.MeshStandardMaterial({ color: '#c8401e', roughness: 0.6 }))
  mesh(track(new THREE.BoxGeometry(7.6, 0.32, 0.3)), hazardMat, v(GX, 4.55, GZ + 0.4))
  const boardTex = track(boardTexture())
  const board = mesh(
    track(new THREE.BoxGeometry(7.2, 1.9, 0.22)),
    track(new THREE.MeshStandardMaterial({ color: '#1b1c1a', metalness: 0.6, roughness: 0.7 })),
    v(GX, 5.75, GZ + 0.4),
  )
  board.castShadow = shadows
  // Unlit face so the sign stays readable under bloom; small lamps above sell the lighting.
  const face = mesh(
    track(new THREE.PlaneGeometry(7.0, 1.75)),
    track(new THREE.MeshBasicMaterial({ map: boardTex, color: '#c2bdb0', fog: true })),
    v(GX, 5.75, GZ + 0.52),
  )
  face.castShadow = false
  const boardLampMat = track(new THREE.MeshStandardMaterial({ color: '#222', emissive: '#ffd9a0', emissiveIntensity: 1.1 }))
  for (const side of [-1, 1]) {
    const arm = mesh(track(new THREE.BoxGeometry(0.06, 0.06, 0.9)), steelMat, v(GX + side * 2.2, 6.85, GZ + 0.85))
    arm.castShadow = false
    mesh(track(new THREE.CylinderGeometry(0.1, 0.14, 0.16, 12)), boardLampMat, v(GX + side * 2.2, 6.8, GZ + 1.3)).castShadow = false
  }
  const gateLight = new THREE.PointLight('#ffcf94', 22, 12, 1.8)
  gateLight.position.set(GX, 3.2, GZ + 3)
  group.add(gateLight)
  // Approach outside the gate: tyre walls, drums, leaning pallets and a camo-net post.
  for (const [x, z, n] of [
    [GX - 7.5, GZ + 4.5, 4],
    [GX + 7.8, GZ + 5.5, 3],
    [GX - 9.8, GZ + 6.5, 2],
  ] as const)
    for (let i = 0; i < n; i++) {
      const t = mesh(tyreGeo, tyreMat, v(x + (r() - 0.5) * 0.1, 0.17 + i * 0.32, z))
      t.rotation.x = Math.PI / 2
    }
  for (const [x, z, mi] of [
    [GX - 6.2, GZ + 5.2, 0],
    [GX - 5.6, GZ + 5.8, 2],
    [GX + 6.6, GZ + 4.6, 1],
    [GX + 7.2, GZ + 4.0, 0],
    [GX + 9.0, GZ + 6.4, 2],
  ] as const)
    mesh(drumGeo, drumMats[mi], v(x, 0.45, z), r() * Math.PI)
  for (const [x, z, rot] of [
    [GX - 4.4, GZ + 7.2, 0.35],
    [GX - 3.6, GZ + 7.5, 0.1],
    [GX + 4.6, GZ + 7.6, -0.3],
  ] as const) {
    const pl = mesh(palletGeo, woodMat, v(x, 0.76, z), rot)
    pl.rotation.x = -0.18
  }
  const net2 = new THREE.Group()
  net2.position.set(GX + 10.5, 0, GZ + 3.6)
  net2.rotation.y = 0.35
  group.add(net2)
  for (const [px, pz] of [
    [-2.5, -1.5],
    [2.5, -1.5],
    [-2.5, 1.5],
    [2.5, 1.5],
  ])
    mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 2.6)), woodMat, v(px, 1.3, pz), 0, net2)
  mesh(netGeo, camoMat, v(0, 2.6, 0), 0, net2).rotation.x = -Math.PI / 2

  // ---------- prep area (tent, table, gun racks) ----------
  const prep = new THREE.Group()
  prep.position.set(LAYOUT.prepArea.x, 0, LAYOUT.prepArea.z)
  prep.rotation.y = 0.2
  group.add(prep)
  const tentShape = new THREE.Shape()
  tentShape.moveTo(-2.4, 0)
  tentShape.lineTo(0, 2.6)
  tentShape.lineTo(2.4, 0)
  tentShape.lineTo(2.25, 0)
  tentShape.lineTo(0, 2.45)
  tentShape.lineTo(-2.25, 0)
  tentShape.closePath()
  const tentGeo = track(new THREE.ExtrudeGeometry(tentShape, { depth: 5, bevelEnabled: false }))
  tentGeo.translate(0, 0, -2.5)
  mesh(tentGeo, camoMat, v(0, 0, 0), Math.PI / 2, prep)
  mesh(track(new THREE.BoxGeometry(3, 0.08, 1)), woodMat, v(0, 0.85, 0), 0, prep)
  for (const [tx, tz] of [
    [-1.4, -0.4],
    [1.4, -0.4],
    [-1.4, 0.4],
    [1.4, 0.4],
  ])
    mesh(track(new THREE.BoxGeometry(0.06, 0.85, 0.06)), steelMat, v(tx, 0.42, tz), 0, prep)
  // Gun silhouettes on the rack (simple bars; the detailed models live in guns.ts).
  for (let i = 0; i < 5; i++) mesh(track(new THREE.BoxGeometry(0.08, 0.9, 0.18)), steelMat, v(-1.2 + i * 0.6, 1.4, -1), 0.0, prep).rotation.z = 0.15
  const prepSign = mesh(
    track(new THREE.PlaneGeometry(2.4, 0.6)),
    track(new THREE.MeshBasicMaterial({ map: track(stencilTexture('GEAR UP', '#f5b62a', 512, 128)), transparent: true })),
    v(0, 2.3, -1.2),
    0,
    prep,
  )
  prepSign.castShadow = false

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight('#8a9bb0', '#2e2a1c', 1.1)
  group.add(hemi)
  const moon = new THREE.DirectionalLight('#a9bdd6', 2.4)
  moon.position.set(-20, 30, 12)
  moon.castShadow = shadows
  moon.shadow.mapSize.set(2048, 2048)
  moon.shadow.camera.left = -30
  moon.shadow.camera.right = 30
  moon.shadow.camera.top = 24
  moon.shadow.camera.bottom = -24
  moon.shadow.bias = -0.0005
  group.add(moon)

  const flood = new THREE.SpotLight('#ffe2b0', 900, 50, 0.5, 0.5, 1.6)
  flood.position.set(LAYOUT.watchtower.x - 1.2, 7.2, LAYOUT.watchtower.z + 1.2)
  flood.target.position.set(0, 0, 2)
  flood.castShadow = shadows
  group.add(flood, flood.target)

  // Visible light cone (cheap volumetric look).
  const coneLen = 18
  const coneGeo = track(new THREE.ConeGeometry(5.5, coneLen, 32, 1, true))
  coneGeo.translate(0, -coneLen / 2, 0)
  const coneMat = track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color('#ffd9a0') }, len: { value: coneLen } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ vY = position.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 color; uniform float len; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float fall = pow(1. + vY/len, 1.6); float rim = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(color, fall*rim*0.16); }`,
    }),
  )
  const cone = new THREE.Mesh(coneGeo, coneMat)
  cone.position.copy(flood.position)
  cone.lookAt(flood.target.position)
  cone.rotateX(Math.PI / 2)
  group.add(cone)

  // Team base lights and spinning hazard beacons.
  const baseLight = (color: string, x: number) => {
    const l = new THREE.PointLight(color, 45, 16, 1.6)
    l.position.set(x, 3.2, 0)
    group.add(l)
    const pole = mesh(track(new THREE.CylinderGeometry(0.06, 0.06, 4.5)), steelMat, v(x, 2.25, -4.5))
    pole.castShadow = false
    const flag = mesh(
      track(new THREE.PlaneGeometry(1.4, 0.9, 8, 4)),
      track(new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8, emissive: color, emissiveIntensity: 0.25 })),
      v(x + 0.72, 3.9, -4.5),
    )
    return { light: l, flag }
  }
  const red = baseLight('#ff3d2e', LAYOUT.redBase.x)
  const blue = baseLight('#3f9bff', LAYOUT.blueBase.x)

  const beacons: { light: THREE.SpotLight; head: THREE.Mesh }[] = []
  for (const [x, z] of [
    [-SX / 2 + 0.6, -SZ / 2 + 0.6],
    [SX / 2 - 0.6, -SZ / 2 + 0.6],
    [-8, SZ / 2 - 0.4],
    [8, SZ / 2 - 0.4],
  ]) {
    const head = mesh(
      track(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
      track(new THREE.MeshStandardMaterial({ color: '#ff5a1f', emissive: '#ff4a10', emissiveIntensity: 3 })),
      v(x, wallH + 0.35, z),
    )
    head.castShadow = false
    const light = new THREE.SpotLight('#ff5520', 60, 22, 0.5, 0.6, 1.5)
    light.position.set(x, wallH + 0.5, z)
    group.add(light, light.target)
    beacons.push({ light, head })
  }

  // Caged work lamps on the perimeter posts.
  if (quality === 'high') {
    const lampMat = track(new THREE.MeshStandardMaterial({ color: '#332', emissive: '#ffb066', emissiveIntensity: 4 }))
    for (const [x, z] of [
      [-SX / 4, -SZ / 2 + 0.3],
      [SX / 4, -SZ / 2 + 0.3],
      [-SX / 2 + 0.3, -SZ / 6],
      [SX / 2 - 0.3, SZ / 6],
      [-SX / 4, SZ / 2 - 0.3],
      [SX / 4, SZ / 2 - 0.3],
    ]) {
      mesh(track(new THREE.BoxGeometry(0.3, 0.2, 0.2)), lampMat, v(x, wallH - 0.2, z)).castShadow = false
      const l = new THREE.PointLight('#ffa860', 70, 14, 1.8)
      l.position.set(x, wallH - 0.5, z)
      group.add(l)
    }
  }

  // ---------- atmosphere ----------
  const dotTex = track(dotTexture())
  const dustCount = quality === 'high' ? 1400 : 500
  const dustGeo = track(new THREE.BufferGeometry())
  const dustPos = new Float32Array(dustCount * 3)
  const dustSeed = new Float32Array(dustCount)
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (r() - 0.5) * 50
    dustPos[i * 3 + 1] = r() * 8
    dustPos[i * 3 + 2] = (r() - 0.5) * 36
    dustSeed[i] = r() * 100
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(
    dustGeo,
    track(
      new THREE.PointsMaterial({
        size: 0.07,
        map: dotTex,
        color: '#e8d2a8',
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  )
  group.add(dust)
  const dustBase = dustPos.slice()

  const smokeTex = track(smokeTexture())
  const smokes: { s: THREE.Sprite; x: number; z: number; speed: number; phase: number }[] = []
  const smokeCount = quality === 'high' ? 34 : 14
  for (let i = 0; i < smokeCount; i++) {
    const mat = track(
      new THREE.SpriteMaterial({
        map: smokeTex,
        color: i % 5 === 0 ? '#6a4a36' : '#8a877a',
        transparent: true,
        opacity: 0.05 + r() * 0.08,
        depthWrite: false,
        fog: true,
      }),
    )
    const s = new THREE.Sprite(mat)
    const scale = 7 + r() * 10
    s.scale.set(scale, scale * 0.55, 1)
    const x = (r() - 0.5) * 48
    const z = (r() - 0.5) * 34
    s.position.set(x, 0.6 + r() * 1.6, z)
    group.add(s)
    smokes.push({ s, x, z, speed: 0.15 + r() * 0.25, phase: r() * 10 })
  }

  scene.fog = new THREE.FogExp2('#12140f', 0.013)
  scene.background = new THREE.Color('#0b0d10')

  return {
    group,
    update(t) {
      for (let i = 0; i < dustCount; i++) {
        const s = dustSeed[i]
        dustPos[i * 3] = dustBase[i * 3] + Math.sin(t * 0.21 + s) * 0.8 + t * 0.12
        dustPos[i * 3 + 1] = dustBase[i * 3 + 1] + Math.sin(t * 0.37 + s * 2) * 0.35
        dustPos[i * 3 + 2] = dustBase[i * 3 + 2] + Math.cos(t * 0.17 + s) * 0.6
        if (dustPos[i * 3] > 25) dustPos[i * 3] -= 50
      }
      dustGeo.attributes.position.needsUpdate = true
      for (const sm of smokes) {
        sm.s.position.x = sm.x + Math.sin(t * 0.05 * sm.speed + sm.phase) * 3 + t * sm.speed * 0.3
        sm.s.position.z = sm.z + Math.cos(t * 0.07 + sm.phase) * 1.5
        if (sm.s.position.x > 30) sm.s.position.x -= 60
        sm.s.material.rotation = t * 0.02 * sm.speed + sm.phase
      }
      beacons.forEach((b, i) => {
        const a = t * 3 + i * 1.7
        b.light.target.position.set(b.light.position.x + Math.cos(a) * 6, 0, b.light.position.z + Math.sin(a) * 6)
        b.light.intensity = 40 + Math.max(0, Math.sin(a * 2)) * 60
        ;(b.head.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.max(0, Math.sin(a * 2)) * 3
      })
      red.light.intensity = 38 + Math.sin(t * 1.7) * 6
      blue.light.intensity = 38 + Math.cos(t * 1.5) * 6
      for (const f of [red.flag, blue.flag]) {
        const p = (f.geometry as THREE.BufferGeometry).attributes.position
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i) + 0.7
          p.setZ(i, Math.sin(x * 4 - t * 5) * 0.08 * x)
        }
        p.needsUpdate = true
      }
    },
    dispose() {
      scene.remove(group)
      for (const d of disposables) d.dispose()
      bags.dispose()
    },
  }
}

/** Named camera stops for the walkthrough, in order. */
export const TOUR = TOUR_STOPS.map((s) => ({ ...s, pos: new THREE.Vector3(...s.pos), look: new THREE.Vector3(...s.look) }))
