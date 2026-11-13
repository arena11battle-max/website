import { useSyncExternalStore } from 'react'

// All site audio is synthesised with Web Audio (no audio files): a low wind-and-rumble bed, and a short
// pneumatic "thup" for gel blaster shots. Off until the visitor turns it on.

let enabled = false
let ctx: AudioContext | null = null
let ambience: { stop: () => void } | null = null
const listeners = new Set<() => void>()

function noiseBuffer(ac: AudioContext, seconds: number, brown = false) {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate)
  const d = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1
    if (brown) {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    } else d[i] = w
  }
  return buf
}

function startAmbience(ac: AudioContext) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, 6, true)
  src.loop = true
  const lp = ac.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 420
  const gain = ac.createGain()
  gain.gain.value = 0
  gain.gain.linearRampToValueAtTime(0.32, ac.currentTime + 2.5)
  // Slow swell, like wind over an open yard.
  const lfo = ac.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = ac.createGain()
  lfoGain.gain.value = 180
  lfo.connect(lfoGain).connect(lp.frequency)
  src.connect(lp).connect(gain).connect(ac.destination)
  src.start()
  lfo.start()
  return {
    stop() {
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6)
      setTimeout(() => {
        src.stop()
        lfo.stop()
      }, 700)
    },
  }
}

export function setSound(on: boolean) {
  enabled = on
  if (on) {
    ctx ??= new AudioContext()
    void ctx.resume()
    ambience ??= startAmbience(ctx)
  } else {
    ambience?.stop()
    ambience = null
  }
  listeners.forEach((l) => l())
}

export function useSound() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => enabled,
    () => false,
  )
}

/** Gel blaster shot: air burst plus a soft mechanical thump. Heavier for the AWM. */
export function playShot(heavy = false) {
  if (!enabled || !ctx) return
  const ac = ctx
  const t = ac.currentTime
  const n = ac.createBufferSource()
  n.buffer = noiseBuffer(ac, 0.3)
  const bp = ac.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = heavy ? 900 : 1600
  bp.Q.value = 0.8
  const g = ac.createGain()
  g.gain.setValueAtTime(heavy ? 0.7 : 0.5, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.28 : 0.14))
  n.connect(bp).connect(g).connect(ac.destination)
  n.start(t)
  const o = ac.createOscillator()
  o.type = 'sine'
  o.frequency.setValueAtTime(heavy ? 120 : 180, t)
  o.frequency.exponentialRampToValueAtTime(40, t + 0.15)
  const og = ac.createGain()
  og.gain.setValueAtTime(heavy ? 0.6 : 0.35, t)
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  o.connect(og).connect(ac.destination)
  o.start(t)
  o.stop(t + 0.2)
}

/** Soft UI tick for switching weapons or chapters. */
export function playTick() {
  if (!enabled || !ctx) return
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'square'
  o.frequency.value = 1800
  g.gain.setValueAtTime(0.05, ctx.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
  o.connect(g).connect(ctx.destination)
  o.start()
  o.stop(ctx.currentTime + 0.06)
}
