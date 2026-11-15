import { EventEmitter } from 'node:events';
import type pg from 'pg';
import { GUNS, MAX_HP } from './config.js';
import { tx, type Db, type Queryable } from './db.js';

export type MatchStatus = 'setup' | 'live' | 'break' | 'paused' | 'finished';
export type Team = 'red' | 'blue';
export type EventType = 'hit' | 'kill' | 'respawn';

export interface MatchRow {
  id: number;
  name: string;
  status: MatchStatus;
  rounds: number;
  round_seconds: number;
  break_seconds: number;
  current_round: number;
  phase_ends_at: Date | null;
  paused_status: MatchStatus | null;
  paused_remaining_ms: number | null;
  winner: string | null;
  created_by: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
}

export class GameError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/** Fires with a match id whenever anything on that match's scoreboard may have changed. */
export const matchBus = new EventEmitter();
matchBus.setMaxListeners(50);
const changed = (id: number) => matchBus.emit('change', id);

export const RUNNING: MatchStatus[] = ['live', 'break', 'paused'];

/** Damage a vest hit does when the gun sent no player ID (matches the vest firmware: body 25, helmet 50). */
export const VEST_DAMAGE = { body: 25, head: 50 } as const;

export interface GameOptions {
  respawnSeconds: number;
}

export async function getMatch(db: Queryable, id: number): Promise<MatchRow | null> {
  const { rows } = await db.query<MatchRow>('SELECT * FROM matches WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getRunningMatch(db: Queryable): Promise<MatchRow | null> {
  const { rows } = await db.query<MatchRow>(
    "SELECT * FROM matches WHERE status IN ('live','break','paused') ORDER BY id DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export function timerState(m: MatchRow, now = Date.now()) {
  let remainingMs = 0;
  if (m.status === 'paused') remainingMs = m.paused_remaining_ms ?? 0;
  else if ((m.status === 'live' || m.status === 'break') && m.phase_ends_at)
    remainingMs = Math.max(0, m.phase_ends_at.getTime() - now);
  else if (m.status === 'setup') remainingMs = m.round_seconds * 1000;
  return {
    status: m.status,
    pausedFrom: m.status === 'paused' ? m.paused_status : null,
    round: m.current_round,
    rounds: m.rounds,
    roundSeconds: m.round_seconds,
    breakSeconds: m.break_seconds,
    phaseEndsAt: m.status === 'live' || m.status === 'break' ? (m.phase_ends_at?.toISOString() ?? null) : null,
    remainingMs,
    serverNow: new Date(now).toISOString(),
  };
}

async function lockMatch(c: pg.PoolClient, id: number) {
  const { rows } = await c.query<MatchRow>('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new GameError(404, 'Match not found');
  return rows[0];
}

async function finish(c: pg.PoolClient, id: number) {
  const { rows } = await c.query<{ team: Team; kills: number }>(
    `SELECT mp.team, count(*)::int AS kills FROM events e
       JOIN match_players mp ON mp.id = e.shooter_mp_id
      WHERE e.match_id = $1 AND e.type = 'kill' AND NOT e.voided
      GROUP BY mp.team`,
    [id],
  );
  const { rows: openRows } = await c.query<{ team: Team; kills: number }>(
    `SELECT CASE vp.team WHEN 'red' THEN 'blue' ELSE 'red' END AS team, count(*)::int AS kills
       FROM events e JOIN match_players vp ON vp.id = e.victim_mp_id
      WHERE e.match_id = $1 AND e.type = 'kill' AND NOT e.voided AND e.shooter_mp_id IS NULL
      GROUP BY 1`,
    [id],
  );
  const { rows: evCount } = await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE match_id = $1 AND NOT voided AND type IN ('hit', 'kill')`,
    [id],
  );
  const red = (rows.find((r) => r.team === 'red')?.kills ?? 0) + (openRows.find((r) => r.team === 'red')?.kills ?? 0);
  const blue = (rows.find((r) => r.team === 'blue')?.kills ?? 0) + (openRows.find((r) => r.team === 'blue')?.kills ?? 0);
  const hasScoringEvents = (evCount[0]?.n ?? 0) > 0;
  // Do not invent a winner if the match ended with no valid scoring events.
  const winner = !hasScoringEvents && red === 0 && blue === 0 ? null : red === blue ? 'draw' : red > blue ? 'red' : 'blue';
  await c.query(
    `UPDATE matches SET status = 'finished', winner = $2, finished_at = now(), phase_ends_at = NULL,
            paused_status = NULL, paused_remaining_ms = NULL WHERE id = $1`,
    [id, winner],
  );
}

/** Moves a live round to the break (or the end), or a break to the next round. */
async function advance(c: pg.PoolClient, m: MatchRow) {
  if (m.status === 'live') {
    if (m.current_round >= m.rounds) return finish(c, m.id);
    if (m.break_seconds === 0) return startRound(c, m.id, m.current_round + 1, m.round_seconds);
    await c.query(
      `UPDATE matches SET status = 'break', phase_ends_at = now() + make_interval(secs => $2) WHERE id = $1`,
      [m.id, m.break_seconds],
    );
  } else if (m.status === 'break') {
    await startRound(c, m.id, m.current_round + 1, m.round_seconds);
  }
}

async function startRound(c: pg.PoolClient, id: number, round: number, seconds: number) {
  await c.query(
    `UPDATE matches SET status = 'live', current_round = $2, phase_ends_at = now() + make_interval(secs => $3),
            started_at = COALESCE(started_at, now()) WHERE id = $1`,
    [id, round, seconds],
  );
}

export type Control = 'start' | 'pause' | 'resume' | 'next' | 'end';

export async function control(db: Db, id: number, action: Control): Promise<MatchRow> {
  await tx(db, async (c) => {
    const m = await lockMatch(c, id);
    switch (action) {
      case 'start': {
        if (m.status !== 'setup') throw new GameError(409, 'Match has already started');
        const other = await c.query(
          "SELECT id, name FROM matches WHERE status IN ('live','break','paused') AND id <> $1",
          [id],
        );
        if (other.rows[0]) throw new GameError(409, `Finish "${other.rows[0].name}" before starting another match`);
        const { rows } = await c.query('SELECT team, count(*)::int AS n FROM match_players WHERE match_id = $1 GROUP BY team', [id]);
        if (rows.length < 2) throw new GameError(409, 'Both teams need at least one player');
        await startRound(c, id, 1, m.round_seconds);
        break;
      }
      case 'pause': {
        if (m.status !== 'live' && m.status !== 'break') throw new GameError(409, 'Only a running round or break can be paused');
        const remaining = Math.max(0, (m.phase_ends_at?.getTime() ?? Date.now()) - Date.now());
        await c.query(
          `UPDATE matches SET status = 'paused', paused_status = $2, paused_remaining_ms = $3, phase_ends_at = NULL WHERE id = $1`,
          [id, m.status, remaining],
        );
        break;
      }
      case 'resume': {
        if (m.status !== 'paused') throw new GameError(409, 'Match is not paused');
        await c.query(
          `UPDATE matches SET status = $2, phase_ends_at = now() + make_interval(secs => $3::double precision / 1000),
                  paused_status = NULL, paused_remaining_ms = NULL WHERE id = $1`,
          [id, m.paused_status, m.paused_remaining_ms ?? 0],
        );
        break;
      }
      case 'next': {
        if (m.status !== 'live' && m.status !== 'break') throw new GameError(409, 'Resume the match first');
        await advance(c, m);
        break;
      }
      case 'end': {
        if (m.status === 'finished') throw new GameError(409, 'Match is already finished');
        if (m.status === 'setup') throw new GameError(409, 'Match has not started; delete it instead');
        await finish(c, id);
        break;
      }
    }
  });
  changed(id);
  return (await getMatch(db, id))!;
}

/** Called every second: moves rounds and breaks whose time is up. */
export async function tick(db: Db): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>(
    "SELECT id FROM matches WHERE status IN ('live','break') AND phase_ends_at <= now()",
  );
  const moved: number[] = [];
  for (const { id } of rows) {
    await tx(db, async (c) => {
      const m = await lockMatch(c, id);
      if ((m.status === 'live' || m.status === 'break') && m.phase_ends_at && m.phase_ends_at.getTime() <= Date.now()) {
        await advance(c, m);
        moved.push(id);
      }
    });
  }
  moved.forEach(changed);
  return moved;
}

interface VictimState {
  hp: number;
  alive: boolean;
  respawnAt: string | null;
}

/** Current health of a player in the current round, from their latest event as a victim. */
function stateFrom(last: { type: EventType; victim_hp_after: number; created_at: Date } | undefined, respawnSeconds: number, now = Date.now()): VictimState {
  if (!last || last.type === 'respawn') return { hp: MAX_HP, alive: true, respawnAt: null };
  if (last.type === 'kill') {
    const respawnAt = last.created_at.getTime() + respawnSeconds * 1000;
    if (respawnAt <= now) return { hp: MAX_HP, alive: true, respawnAt: null };
    return { hp: 0, alive: false, respawnAt: new Date(respawnAt).toISOString() };
  }
  return { hp: last.victim_hp_after, alive: last.victim_hp_after > 0, respawnAt: null };
}

async function victimState(c: Queryable, matchId: number, round: number, mpId: number, respawnSeconds: number) {
  const { rows } = await c.query(
    `SELECT type, victim_hp_after, created_at FROM events
      WHERE match_id = $1 AND round = $2 AND victim_mp_id = $3 AND NOT voided
      ORDER BY id DESC LIMIT 1`,
    [matchId, round, mpId],
  );
  return stateFrom(rows[0], respawnSeconds);
}

export interface EventInput {
  type: EventType;
  victimMpId: number;
  shooterMpId?: number | null;
  gun?: number | null;
  /** Victim health reported by the vest. Logged by the bridge for diagnostics; the server computes health itself. */
  hp?: number | null;
  /** Staff-entered damage for a manual hit (defaults to the gun's damage). Ignored for device events. */
  damage?: number | null;
  source: 'device' | 'manual' | 'simulator' | 'vest';
  /** Where a vest hit landed (vest events only); sets the damage when the shooter is unknown. */
  zone?: 'body' | 'head' | null;
  deviceId?: number | null;
  seq?: number | null;
}

export type EventResult =
  | { accepted: true; eventId: number; type: EventType; damage: number; hpAfter: number }
  | { accepted: false; reason: string };

export async function recordEvent(db: Db, matchId: number, input: EventInput, opts: GameOptions): Promise<EventResult> {
  const result = await tx(db, async (c): Promise<EventResult> => {
    // Lock the match row so events for the same match are scored one at a time.
    const m = await lockMatch(c, matchId);
    const manual = input.source === 'manual';
    if (m.status === 'setup') return { accepted: false, reason: 'match_not_started' };
    if (!manual && m.status !== 'live') return { accepted: false, reason: `match_${m.status}` };

    const { rows: mps } = await c.query<{ id: number; team: Team; gun: number }>(
      `SELECT mp.id, mp.team, k.gun FROM match_players mp JOIN kits k ON k.id = mp.kit_id
        WHERE mp.match_id = $1 AND mp.id = ANY($2::int[])`,
      [matchId, [input.victimMpId, input.shooterMpId].filter((v): v is number => v != null)],
    );
    const victim = mps.find((p) => p.id === input.victimMpId);
    if (!victim) return { accepted: false, reason: 'unknown_victim' };
    let shooter = null as (typeof mps)[number] | null;
    // A vest whose gun sends no player ID still reports real hits: in a 1v1 (single opponent),
    // attribute the hit to that sole opponent while keeping zone-based vest damage/gunName.
    const vest = input.source === 'vest';
    let unattributedVest = false;
    if (input.type !== 'respawn') {
      shooter = mps.find((p) => p.id === input.shooterMpId) ?? null;
      if (!shooter && vest && input.shooterMpId == null) {
        unattributedVest = true;
        const { rows: opp } = await c.query<{ id: number; team: Team; gun: number }>(
          `SELECT mp.id, mp.team, k.gun FROM match_players mp JOIN kits k ON k.id = mp.kit_id
            WHERE mp.match_id = $1 AND mp.team <> $2`,
          [matchId, victim.team],
        );
        if (opp.length === 1) shooter = opp[0];
      }
      if (!shooter && !unattributedVest) return { accepted: false, reason: 'unknown_shooter' };
      if (shooter && shooter.team === victim.team) return { accepted: false, reason: 'friendly_fire' };
    }

    if (input.deviceId != null && input.seq != null) {
      const dup = await c.query(
        `SELECT 1 FROM events WHERE match_id = $1 AND victim_mp_id = $2 AND device_seq = $3
            AND created_at > now() - interval '2 minutes' LIMIT 1`,
        [matchId, victim.id, input.seq],
      );
      if (dup.rowCount) return { accepted: false, reason: 'duplicate' };
    }

    const round = m.current_round;
    const before = await victimState(c, matchId, round, victim.id, opts.respawnSeconds);
    let type = input.type;
    let damage = 0;
    let hpAfter = MAX_HP;
    // The server is the authority on damage: device hits score the weapon configured on the shooter's kit,
    // whatever gun type or health the hardware reports. Only staff can enter a custom gun or damage.
    const gun = manual ? (input.gun ?? shooter?.gun ?? null) : unattributedVest ? null : (shooter?.gun ?? null);
    const zoneDamage = input.zone === 'head' ? VEST_DAMAGE.head : VEST_DAMAGE.body;
    const gunDamage = (manual ? input.damage : null) ?? (unattributedVest ? zoneDamage : null) ?? GUNS[gun ?? 1]?.damage ?? 25;

    if (type === 'respawn') {
      hpAfter = MAX_HP;
    } else {
      if (!before.alive && !manual) return { accepted: false, reason: 'victim_dead' };
      const prev = before.alive ? before.hp : MAX_HP;
      if (type === 'kill') {
        hpAfter = 0;
        damage = prev;
      } else {
        hpAfter = Math.max(0, prev - gunDamage);
        damage = prev - hpAfter;
        if (hpAfter === 0) type = 'kill';
      }
    }

    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO events (match_id, round, type, shooter_mp_id, victim_mp_id, gun, damage, victim_hp_after, source, device_id, device_seq, zone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [matchId, round, type, shooter?.id ?? null, victim.id, gun, damage, hpAfter, input.source, input.deviceId ?? null, input.seq ?? null, input.zone ?? null],
    );
    return { accepted: true, eventId: rows[0].id, type, damage, hpAfter };
  });
  if (result.accepted) changed(matchId);
  return result;
}

export async function voidEvent(db: Db, eventId: number) {
  const { rows } = await db.query<{ match_id: number }>(
    'UPDATE events SET voided = true WHERE id = $1 AND NOT voided RETURNING match_id',
    [eventId],
  );
  if (!rows[0]) throw new GameError(404, 'Event not found');
  changed(rows[0].match_id);
}

/** Reset HP to MAX_HP for one player or all players in a running match, recording every reset in hp_history. */
export async function resetMatchHp(
  db: Db,
  matchId: number,
  userId: number,
  opts: { matchPlayerId?: number; respawnSeconds: number; reason?: string },
) {
  const resets = await tx(db, async (c) => {
    const m = await lockMatch(c, matchId);
    if (m.status === 'setup' || m.status === 'finished') {
      throw new GameError(409, 'HP can only be reset during an active or paused match');
    }
    const { rows: mps } = await c.query<{ id: number }>(
      opts.matchPlayerId
        ? 'SELECT id FROM match_players WHERE match_id = $1 AND id = $2'
        : 'SELECT id FROM match_players WHERE match_id = $1 ORDER BY id',
      opts.matchPlayerId ? [matchId, opts.matchPlayerId] : [matchId],
    );
    if (!mps.length) throw new GameError(404, 'Player not found in this match');

    const round = Math.max(1, m.current_round);
    const out: { matchPlayerId: number; hpBefore: number; hpAfter: number }[] = [];
    for (const mp of mps) {
      const before = await victimState(c, matchId, round, mp.id, opts.respawnSeconds);
      await c.query(
        `INSERT INTO events (match_id, round, type, shooter_mp_id, victim_mp_id, gun, damage, victim_hp_after, source)
         VALUES ($1, $2, 'respawn', NULL, $3, NULL, 0, $4, 'manual')`,
        [matchId, round, mp.id, MAX_HP],
      );
      await c.query(
        `INSERT INTO hp_history (match_id, round, match_player_id, scope, hp_before, hp_after, reset_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [matchId, round, mp.id, opts.matchPlayerId ? 'player' : 'all', before.hp, MAX_HP, userId, opts.reason ?? null],
      );
      out.push({ matchPlayerId: mp.id, hpBefore: before.hp, hpAfter: MAX_HP });
    }
    return out;
  });
  changed(matchId);
  return resets;
}

/** Reset a match back to setup, voiding recorded events and clearing the clock so it can be restarted cleanly. */
export async function resetMatch(db: Db, matchId: number): Promise<MatchRow> {
  await tx(db, async (c) => {
    await lockMatch(c, matchId);
    await c.query('UPDATE events SET voided = true WHERE match_id = $1 AND NOT voided', [matchId]);
    await c.query(
      `UPDATE matches
          SET status = 'setup', current_round = 0, phase_ends_at = NULL,
              paused_status = NULL, paused_remaining_ms = NULL,
              winner = NULL, started_at = NULL, finished_at = NULL
        WHERE id = $1`,
      [matchId],
    );
  });
  changed(matchId);
  return (await getMatch(db, matchId))!;
}

export interface PlayerLine {
  matchPlayerId: number;
  playerId: number;
  name: string;
  nickname: string | null;
  displayName: string;
  team: Team;
  kit: string;
  gun: number;
  gunName: string;
  kills: number;
  deaths: number;
  hits: number;
  damageDealt: number;
  damageTaken: number;
  hp: number;
  alive: boolean;
  respawnAt: string | null;
}

/** Everything a scoreboard screen needs for one match. Contains no contact details, so it is safe to show publicly. */
export async function scoreboard(db: Queryable, matchId: number, opts: GameOptions) {
  const m = await getMatch(db, matchId);
  if (!m) throw new GameError(404, 'Match not found');

  const { rows: lines } = await db.query(
    `SELECT mp.id AS mp_id, mp.team, p.id AS player_id, p.name, p.nickname, k.label AS kit, k.gun,
            count(e.id) FILTER (WHERE e.type = 'kill' AND e.shooter_mp_id = mp.id)::int AS kills,
            count(e.id) FILTER (WHERE e.type = 'kill' AND e.victim_mp_id = mp.id)::int AS deaths,
            count(e.id) FILTER (WHERE e.type IN ('hit','kill') AND e.shooter_mp_id = mp.id)::int AS hits,
            COALESCE(sum(e.damage) FILTER (WHERE e.shooter_mp_id = mp.id), 0)::int AS damage_dealt,
            COALESCE(sum(e.damage) FILTER (WHERE e.victim_mp_id = mp.id), 0)::int AS damage_taken
       FROM match_players mp
       JOIN players p ON p.id = mp.player_id
       JOIN kits k ON k.id = mp.kit_id
       LEFT JOIN events e ON e.match_id = mp.match_id AND NOT e.voided
                         AND (e.shooter_mp_id = mp.id OR e.victim_mp_id = mp.id)
      WHERE mp.match_id = $1
      GROUP BY mp.id, p.id, k.id
      ORDER BY mp.team DESC, k.label`,
    [matchId],
  );

  const { rows: lastVictim } = await db.query(
    `SELECT DISTINCT ON (victim_mp_id) victim_mp_id, type, victim_hp_after, created_at
       FROM events WHERE match_id = $1 AND round = $2 AND NOT voided
      ORDER BY victim_mp_id, id DESC`,
    [matchId, m.current_round],
  );
  const lastByMp = new Map(lastVictim.map((r) => [r.victim_mp_id as number, r]));
  const live = RUNNING.includes(m.status);

  const players: PlayerLine[] = lines.map((r) => {
    const s = live ? stateFrom(lastByMp.get(r.mp_id), opts.respawnSeconds) : { hp: MAX_HP, alive: true, respawnAt: null };
    return {
      matchPlayerId: r.mp_id,
      playerId: r.player_id,
      name: r.name,
      nickname: r.nickname,
      displayName: r.nickname || r.name,
      team: r.team,
      kit: r.kit,
      gun: r.gun,
      gunName: GUNS[r.gun]?.name ?? '?',
      kills: r.kills,
      deaths: r.deaths,
      hits: r.hits,
      damageDealt: r.damage_dealt,
      damageTaken: r.damage_taken,
      ...s,
    };
  });

  // Kills reported by a vest whose gun sent no player ID: nobody gets the kill, but the other team scores it.
  const { rows: openRows } = await db.query<{ round: number; team: Team; kills: number; hits: number; damage: number }>(
    `SELECT e.round, CASE vp.team WHEN 'red' THEN 'blue' ELSE 'red' END AS team,
            count(*) FILTER (WHERE e.type = 'kill')::int AS kills, count(*)::int AS hits, COALESCE(sum(e.damage), 0)::int AS damage
       FROM events e JOIN match_players vp ON vp.id = e.victim_mp_id
      WHERE e.match_id = $1 AND NOT e.voided AND e.shooter_mp_id IS NULL AND e.type IN ('hit', 'kill')
      GROUP BY e.round, 2`,
    [matchId],
  );
  const open = (team: Team, round?: number) =>
    openRows.filter((r) => r.team === team && (round == null || r.round === round)).reduce((a, r) => ({ kills: a.kills + r.kills, hits: a.hits + r.hits, damage: a.damage + r.damage }), { kills: 0, hits: 0, damage: 0 });

  const teamTotals = (team: Team) => {
    const ps = players.filter((p) => p.team === team);
    return {
      score: ps.reduce((a, p) => a + p.kills, 0) + open(team).kills,
      kills: ps.reduce((a, p) => a + p.kills, 0),
      deaths: ps.reduce((a, p) => a + p.deaths, 0),
      hits: ps.reduce((a, p) => a + p.hits, 0) + open(team).hits,
      damage: ps.reduce((a, p) => a + p.damageDealt, 0) + open(team).damage,
      alive: ps.filter((p) => p.alive).length,
      players: ps.length,
    };
  };

  const { rows: roundRows } = await db.query<{ round: number; team: Team; kills: number; damage: number }>(
    `SELECT e.round, mp.team, count(*) FILTER (WHERE e.type = 'kill')::int AS kills, COALESCE(sum(e.damage), 0)::int AS damage
       FROM events e JOIN match_players mp ON mp.id = e.shooter_mp_id
      WHERE e.match_id = $1 AND NOT e.voided
      GROUP BY e.round, mp.team`,
    [matchId],
  );
  const rounds = Array.from({ length: m.rounds }, (_, i) => {
    const n = i + 1;
    const r = roundRows.find((x) => x.round === n && x.team === 'red');
    const b = roundRows.find((x) => x.round === n && x.team === 'blue');
    const or = open('red', n);
    const ob = open('blue', n);
    return { round: n, red: (r?.kills ?? 0) + or.kills, blue: (b?.kills ?? 0) + ob.kills, redDamage: (r?.damage ?? 0) + or.damage, blueDamage: (b?.damage ?? 0) + ob.damage };
  });

  const { rows: feedRows } = await db.query(
    `SELECT e.id, e.type, e.round, e.gun, e.zone, e.damage, e.victim_hp_after, e.source, e.created_at,
            sp.team AS shooter_team, COALESCE(NULLIF(spl.nickname, ''), spl.name) AS shooter,
            vp.team AS victim_team, COALESCE(NULLIF(vpl.nickname, ''), vpl.name) AS victim
       FROM events e
       LEFT JOIN match_players sp ON sp.id = e.shooter_mp_id
       LEFT JOIN players spl ON spl.id = sp.player_id
       JOIN match_players vp ON vp.id = e.victim_mp_id
       JOIN players vpl ON vpl.id = vp.player_id
      WHERE e.match_id = $1 AND NOT e.voided AND e.type <> 'respawn'
      ORDER BY e.id DESC LIMIT 25`,
    [matchId],
  );
  const feed = feedRows.map((r) => ({
    id: r.id,
    type: r.type as EventType,
    round: r.round,
    gunName: r.gun != null ? (GUNS[r.gun]?.name ?? '?') : r.zone === 'head' ? 'Head' : r.zone === 'body' ? 'Body' : null,
    damage: r.damage,
    victimHpAfter: r.victim_hp_after,
    source: r.source,
    at: r.created_at.toISOString(),
    shooter: r.shooter,
    // A vest hit with no player ID came from the other team, so the feed can still colour it.
    shooterTeam: r.shooter_team ?? (r.source === 'vest' ? (r.victim_team === 'red' ? 'blue' : 'red') : null),
    victim: r.victim,
    victimTeam: r.victim_team,
  }));

  const mvp =
    players.length && players.some((p) => p.kills || p.damageDealt)
      ? [...players].sort((a, b) => b.kills - a.kills || b.damageDealt - a.damageDealt || a.deaths - b.deaths)[0]
      : null;

  return {
    match: {
      id: m.id,
      name: m.name,
      status: m.status,
      winner: m.winner,
      startedAt: m.started_at?.toISOString() ?? null,
      finishedAt: m.finished_at?.toISOString() ?? null,
      createdAt: m.created_at.toISOString(),
    },
    timer: timerState(m),
    teams: { red: teamTotals('red'), blue: teamTotals('blue') },
    players,
    rounds,
    feed,
    mvp: mvp ? { matchPlayerId: mvp.matchPlayerId, displayName: mvp.displayName, team: mvp.team, kills: mvp.kills, damageDealt: mvp.damageDealt } : null,
  };
}

export type Scoreboard = Awaited<ReturnType<typeof scoreboard>>;
