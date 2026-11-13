import { scrollToHash } from './motion'

// Lets any card on the page ("Book this mode", "Book with this loadout") prefill the booking form and jump to it.

export const GAME_MODES = [
  { id: 'tdm', label: 'Team Deathmatch' },
  { id: 'domination', label: 'Domination' },
  { id: 'last_squad', label: 'Last Squad' },
  { id: 'custom', label: 'Custom Match' },
] as const
export type GameModeId = (typeof GAME_MODES)[number]['id']

export interface BookingIntent {
  mode?: GameModeId
  loadout?: string
}

const EVENT = 'arena11:book'

export function requestBooking(intent: BookingIntent) {
  window.dispatchEvent(new CustomEvent<BookingIntent>(EVENT, { detail: intent }))
  scrollToHash('#book')
}

export function onBookingIntent(fn: (i: BookingIntent) => void) {
  const h = (e: Event) => fn((e as CustomEvent<BookingIntent>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
