import * as THREE from 'three'
import { dotTexture, smokeTexture } from './textures'

// Safe, simulated firing effect for a gel blaster: a glowing gel bead with a short trail,
// a small air puff at the muzzle and a brief orange glint. Driven by absolute time so renders are repeatable.

export interface FireFX {
  fire: (origin: THREE.Vector3, dir: THREE.Vector3, t: number) => void
  update: (t: number) => void
  dispose: () => void
}

interface Shot {
  origin: THREE.Vector3
  dir: THREE.Vector3
  t0: number
}

export function createFireFX(parent: THREE.Object3D, scale = 1): FireFX {
  const shots: Shot[] = []
  const beadGeo = new THREE.SphereGeometry(0.006 * scale, 16, 12)
  const beadMat = new THREE.MeshBasicMaterial({ color: '#ffb070' })
  const glowTex = dotTexture()
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffb27a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  const trailMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ff5a1f', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
  const puffTex = smokeTexture()
  const puffMat = new THREE.SpriteMaterial({ map: puffTex, color: '#cfc8b8', transparent: true, depthWrite: false })
  const POOL = 4
  const pool = Array.from({ length: POOL }, () => {
    const bead = new THREE.Mesh(beadGeo, beadMat)
    const glow = new THREE.Sprite(glowMat.clone())
    glow.scale.setScalar(0.022 * scale)
    const trail = Array.from({ length: 6 }, () => new THREE.Sprite(trailMat.clone()))
    const puff = new THREE.Sprite(puffMat.clone())
    const light = new THREE.PointLight('#ff7a2a', 0, 1.5 * scale, 2)
    const g = new THREE.Group()
    g.add(bead, glow, puff, light, ...trail)
    g.visible = false
    parent.add(g)
    return { g, bead, glow, trail, puff, light }
  })

  return {
    fire(origin, dir, t) {
      shots.push({ origin: origin.clone(), dir: dir.clone().normalize(), t0: t })
      if (shots.length > POOL) shots.shift()
    },
    update(t) {
      pool.forEach((p, i) => {
        const s = shots[i]
        if (!s || t < s.t0 || t - s.t0 > 1.4) {
          p.g.visible = false
          return
        }
        p.g.visible = true
        const dt = t - s.t0
        const speed = 3.2 * scale
        const pos = s.origin.clone().addScaledVector(s.dir, dt * speed)
        pos.y -= 0.05 * scale * dt * dt
        p.bead.position.copy(pos)
        p.glow.position.copy(pos)
        p.trail.forEach((tr, k) => {
          const back = Math.max(0, dt - (k + 1) * 0.018)
          tr.position.copy(s.origin).addScaledVector(s.dir, back * speed)
          tr.scale.setScalar((0.03 - k * 0.004) * scale)
          ;(tr.material as THREE.SpriteMaterial).opacity = 0.45 * (1 - k / 6) * (dt > 0.02 ? 1 : 0)
        })
        const puffAge = Math.min(1, dt / 0.6)
        p.puff.position.copy(s.origin).addScaledVector(s.dir, 0.03 * scale + puffAge * 0.05 * scale)
        p.puff.scale.setScalar((0.03 + puffAge * 0.14) * scale)
        ;(p.puff.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - puffAge)
        p.light.position.copy(s.origin)
        p.light.intensity = dt < 0.06 ? 1.2 * (1 - dt / 0.06) : 0
      })
    },
    dispose() {
      for (const p of pool) parent.remove(p.g)
      beadGeo.dispose()
      beadMat.dispose()
      glowTex.dispose()
      puffTex.dispose()
    },
  }
}
