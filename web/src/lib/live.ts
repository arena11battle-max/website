import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Scoreboard, Timer } from './types'

let socket: Socket | null = null
function getSocket() {
  socket ??= io({ transports: ['websocket', 'polling'] })
  return socket
}

/**
 * Live scoreboard for one match, or for whatever the arena TV should show (`'display'`).
 * Re-subscribes after reconnects so a dropped Wi-Fi link heals by itself.
 */
export function useLiveScoreboard(target: number | 'display' | null, initial?: Scoreboard | null) {
  const [data, setData] = useState<Scoreboard | null>(initial ?? null)
  const [none, setNone] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (target == null) return
    const s = getSocket()
    const subscribe = () => {
      if (target === 'display') s.emit('display')
      else s.emit('watch', target)
    }
    const onBoard = (b: Scoreboard) => {
      if (target === 'display' || b.match.id === target) {
        setData(b)
        setNone(false)
      }
    }
    const onNone = () => setNone(true)
    const onConnect = () => {
      setConnected(true)
      subscribe()
    }
    const onDisconnect = () => setConnected(false)
    s.on('scoreboard', onBoard)
    s.on('scoreboard:none', onNone)
    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    if (s.connected) onConnect()
    return () => {
      s.off('scoreboard', onBoard)
      s.off('scoreboard:none', onNone)
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
    }
  }, [target])

  return { data, setData, none, connected }
}

/** Counts down locally from the server's clock, correcting for any difference between the two clocks. */
export function useCountdown(timer: Timer | undefined) {
  const [now, setNow] = useState(() => Date.now())
  const offset = useRef(0)

  useEffect(() => {
    if (timer) offset.current = new Date(timer.serverNow).getTime() - Date.now()
  }, [timer])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [])

  if (!timer) return 0
  if (timer.phaseEndsAt) return Math.max(0, new Date(timer.phaseEndsAt).getTime() - (now + offset.current))
  return timer.remainingMs
}

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Short beeps for the final seconds and a horn when the clock hits zero. Needs one user tap to unlock audio. */
export function useArenaSounds(enabled: boolean, remainingMs: number, phaseKey: string) {
  const ctx = useRef<AudioContext | null>(null)
  const lastSecond = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    ctx.current ??= new AudioContext()
    if (ctx.current.state === 'suspended') ctx.current.resume()
  }, [enabled])

  useEffect(() => {
    lastSecond.current = null
  }, [phaseKey])

  useEffect(() => {
    const ac = ctx.current
    if (!enabled || !ac) return
    const sec = Math.ceil(remainingMs / 1000)
    if (sec === lastSecond.current) return
    const prev = lastSecond.current
    lastSecond.current = sec
    if (prev == null) return
    const tone = (freq: number, dur: number, type: OscillatorType = 'square') => {
      const o = ac.createOscillator()
      const g = ac.createGain()
      o.type = type
      o.frequency.value = freq
      g.gain.setValueAtTime(0.12, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur)
      o.connect(g).connect(ac.destination)
      o.start()
      o.stop(ac.currentTime + dur)
    }
    if (sec <= 10 && sec >= 1) tone(sec <= 3 ? 1320 : 880, 0.12)
    if (sec === 0 && prev > 0) tone(180, 1.2, 'sawtooth')
  }, [enabled, remainingMs])
}
