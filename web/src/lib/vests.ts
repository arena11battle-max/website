import { useSyncExternalStore } from 'react'
import { post } from './api'

// Vests that talk Bluetooth LE straight to this browser (Chrome or Edge on a PC or Android phone).
// The vest firmware sends short text lines on one notify characteristic:
//   H,<from>,<gun>,<hp>  hit        K,<from>,<gun>,0  down        P,<hp>  respawned
//   S,<alive>,<hp>,<live>,<round>   status, once a second
// Hits, downs and respawns go to the server, which keeps the score. Status lines only update the panel.
// Connections live outside React so they survive moving between pages of the console.

export const VEST_SERVICE = '6e5a0001-5347-4b31-9a7e-0e5d2c1a0b01'
export const VEST_EVENTS = '6e5a0002-5347-4b31-9a7e-0e5d2c1a0b01'

export type VestStatus = 'connecting' | 'connected' | 'reconnecting' | 'lost'

export interface Vest {
  id: string
  name: string
  kit: string | null
  status: VestStatus
  /** Health and life the vest itself reports in its status line. */
  vestHp: number | null
  vestAlive: boolean | null
  lastLine: string | null
  lastResult: string | null
  lastAt: number | null
  events: number
}

/* Minimal Web Bluetooth types (not in TypeScript's DOM lib). */
interface Characteristic extends EventTarget {
  value: DataView | null
  startNotifications(): Promise<Characteristic>
}
interface GattServer {
  connected: boolean
  connect(): Promise<GattServer>
  disconnect(): void
  getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<Characteristic> }>
}
interface BtDevice extends EventTarget {
  id: string
  name?: string
  gatt?: GattServer
}
interface Bluetooth {
  requestDevice(options: { filters: object[]; optionalServices?: string[] }): Promise<BtDevice>
}

const bluetooth = (): Bluetooth | undefined => (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth

export const bluetoothSupported = () => typeof navigator !== 'undefined' && !!bluetooth() && window.isSecureContext

/** SG-VEST-B1, SG-B1 → B1 */
export function kitFromName(name: string | undefined): string | null {
  const m = name?.toUpperCase().match(/^SG-(?:VEST-)?([RB]\d{1,2})$/)
  return m ? m[1] : null
}

type Listener = () => void
const listeners = new Set<Listener>()
let vests: Vest[] = []
let matchId: number | null = null
const devices = new Map<string, BtDevice>()
const queues = new Map<string, Promise<void>>()
const userClosed = new Set<string>()

function emit() {
  listeners.forEach((l) => l())
}
function update(id: string, patch: Partial<Vest>) {
  vests = vests.map((v) => (v.id === id ? { ...v, ...patch } : v))
  emit()
}
const find = (id: string) => vests.find((v) => v.id === id)

/** The console tells the store which match vest hits belong to. */
export function setVestMatch(id: number | null) {
  matchId = id
}

export function setVestKit(id: string, kit: string | null) {
  update(id, { kit })
}

const REASONS: Record<string, string> = {
  victim_dead: 'already down',
  match_not_started: 'match not started',
  match_paused: 'match paused',
  match_break: 'break between rounds',
  match_finished: 'match over',
  friendly_fire: 'same team',
  duplicate: 'repeat',
}

async function forward(id: string, line: string) {
  const v = find(id)
  if (!v) return
  if (!v.kit) return update(id, { lastResult: 'Pick the kit this vest belongs to' })
  if (matchId == null) return update(id, { lastResult: 'Open a match to record hits' })
  try {
    const res = await post<{ accepted: boolean; reason?: string; type?: string; damage?: number; hpAfter?: number }>(
      `/api/matches/${matchId}/vest-events`,
      { kit: v.kit, line },
    )
    const result = res.accepted
      ? res.type === 'respawn'
        ? 'Back in, 100 HP'
        : `${res.type === 'kill' ? 'Down' : 'Hit'} −${res.damage}, ${res.hpAfter} HP`
      : `Not counted: ${REASONS[res.reason ?? ''] ?? (res.reason ?? '').replace(/_/g, ' ')}`
    update(id, { lastResult: result, events: (find(id)?.events ?? 0) + (res.accepted ? 1 : 0) })
  } catch (e) {
    update(id, { lastResult: `Not sent: ${(e as Error).message}` })
  }
}

function onLine(id: string, raw: string) {
  const line = raw.trim()
  if (!line) return
  const kind = line[0]?.toUpperCase()
  if (kind === 'S') {
    const [, alive, hp] = line.split(',')
    update(id, { vestAlive: alive === '1', vestHp: Number.isFinite(Number(hp)) ? Number(hp) : null, lastAt: Date.now() })
    return
  }
  update(id, { lastLine: line, lastAt: Date.now() })
  if (kind === 'H' || kind === 'K' || kind === 'P') {
    // One request at a time per vest so hits are scored in the order they happened.
    const next = (queues.get(id) ?? Promise.resolve()).then(() => forward(id, line))
    queues.set(id, next)
  }
}

async function attach(device: BtDevice) {
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(VEST_SERVICE)
  const ch = await service.getCharacteristic(VEST_EVENTS)
  ch.addEventListener('characteristicvaluechanged', () => {
    if (ch.value) onLine(device.id, new TextDecoder().decode(ch.value))
  })
  await ch.startNotifications()
  update(device.id, { status: 'connected' })
}

async function reconnect(device: BtDevice) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (userClosed.has(device.id) || !find(device.id)) return
    update(device.id, { status: 'reconnecting' })
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    try {
      await attach(device)
      return
    } catch {
      /* try again */
    }
  }
  update(device.id, { status: 'lost' })
}

/** Opens the browser's Bluetooth picker. Must be called from a click. */
export async function connectVest(): Promise<void> {
  const bt = bluetooth()
  if (!bt) throw new Error('This browser has no Bluetooth for websites. Use Chrome or Edge on a PC or Android phone.')
  let device: BtDevice
  try {
    device = await bt.requestDevice({ filters: [{ services: [VEST_SERVICE] }, { namePrefix: 'SG-' }], optionalServices: [VEST_SERVICE] })
  } catch (e) {
    if ((e as Error).name === 'NotFoundError') return // picker closed
    throw e
  }
  userClosed.delete(device.id)
  if (!find(device.id)) {
    vests = [
      ...vests,
      {
        id: device.id,
        name: device.name ?? 'Vest',
        kit: kitFromName(device.name),
        status: 'connecting',
        vestHp: null,
        vestAlive: null,
        lastLine: null,
        lastResult: null,
        lastAt: null,
        events: 0,
      },
    ]
    emit()
    device.addEventListener('gattserverdisconnected', () => reconnect(device))
  } else {
    update(device.id, { status: 'connecting' })
  }
  devices.set(device.id, device)
  try {
    await attach(device)
  } catch (e) {
    update(device.id, { status: 'lost' })
    throw new Error(`Could not open the vest's hit channel: ${(e as Error).message}`)
  }
}

export function disconnectVest(id: string) {
  userClosed.add(id)
  devices.get(id)?.gatt?.disconnect()
  devices.delete(id)
  queues.delete(id)
  vests = vests.filter((v) => v.id !== id)
  emit()
}

export async function retryVest(id: string) {
  const d = devices.get(id)
  if (!d) return
  userClosed.delete(id)
  update(id, { status: 'connecting' })
  try {
    await attach(d)
  } catch {
    update(id, { status: 'lost' })
  }
}

function subscribe(l: Listener) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useVests(): Vest[] {
  return useSyncExternalStore(subscribe, () => vests)
}
