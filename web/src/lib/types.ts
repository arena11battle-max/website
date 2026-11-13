export type Team = 'red' | 'blue'
export type Role = 'admin' | 'operator'
export type MatchStatus = 'setup' | 'live' | 'break' | 'paused' | 'finished'

export interface User {
  id: number
  name: string
  email: string
  role: Role
}

export interface Player {
  id: number
  name: string
  nickname: string | null
  phone: string | null
  archived: boolean
  createdAt: string
  matches?: number
  kills?: number
}

export interface Kit {
  id: number
  label: string
  team: Team
  gun: number
  active: boolean
}

// Kit gun slots 0-3 (same order as server GUNS).
export const GUN_NAMES = ['UMP45', 'AR15', 'Vector', 'Tactical M4']
export const GUN_DAMAGE = [15, 25, 15, 25]

export interface Timer {
  status: MatchStatus
  pausedFrom: MatchStatus | null
  round: number
  rounds: number
  roundSeconds: number
  breakSeconds: number
  phaseEndsAt: string | null
  remainingMs: number
  serverNow: string
}

export interface PlayerLine {
  matchPlayerId: number
  playerId: number
  name: string
  nickname: string | null
  displayName: string
  team: Team
  kit: string
  gun: number
  gunName: string
  kills: number
  deaths: number
  hits: number
  damageDealt: number
  damageTaken: number
  hp: number
  alive: boolean
  respawnAt: string | null
}

export interface TeamTotals {
  score: number
  kills: number
  deaths: number
  hits: number
  damage: number
  alive: number
  players: number
}

export interface FeedItem {
  id: number
  type: 'hit' | 'kill'
  round: number
  gunName: string | null
  damage: number
  victimHpAfter: number
  source: 'device' | 'manual' | 'simulator' | 'vest'
  at: string
  shooter: string | null
  shooterTeam: Team | null
  victim: string
  victimTeam: Team
}

export interface Scoreboard {
  match: {
    id: number
    name: string
    status: MatchStatus
    winner: Team | 'draw' | null
    startedAt: string | null
    finishedAt: string | null
    createdAt: string
  }
  timer: Timer
  teams: { red: TeamTotals; blue: TeamTotals }
  players: PlayerLine[]
  rounds: { round: number; red: number; blue: number; redDamage: number; blueDamage: number }[]
  feed: FeedItem[]
  mvp: { matchPlayerId: number; displayName: string; team: Team; kills: number; damageDealt: number } | null
}

export interface MatchSummary {
  id: number
  name: string
  status: MatchStatus
  rounds: number
  roundSeconds: number
  breakSeconds: number
  currentRound: number
  winner: Team | 'draw' | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  players: number
  redScore: number
  blueScore: number
}
