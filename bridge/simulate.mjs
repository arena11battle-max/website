#!/usr/bin/env node
// Plays a fake match against the running one so the dashboard can be tested without any hardware.
//   node simulate.mjs            (one event about every 1.5 s)
//   node simulate.mjs --fast     (several a second)
import { loadConfig, signedFetch, syncClock } from './lib.mjs';

const cfg = loadConfig();
const fast = process.argv.includes('--fast');
const DAMAGE = [20, 25, 15, 70];
const hp = new Map();
const deadUntil = new Map();
let seq = 1;
let lastRound = null;

await syncClock(cfg);
console.log(`Simulating hits against ${cfg.serverUrl}. Start a match in the dashboard. Ctrl+C to stop.`);

async function step() {
  const state = await signedFetch(cfg, 'GET', '/api/device/state');
  if (!state.match || state.match.status !== 'live') return;
  if (state.match.round !== lastRound) {
    lastRound = state.match.round;
    hp.clear();
    deadUntil.clear();
  }
  const now = Date.now();
  const alive = state.kits.filter((k) => (deadUntil.get(k.label) ?? 0) < now);
  const red = alive.filter((k) => k.team === 'red');
  const blue = alive.filter((k) => k.team === 'blue');
  if (!red.length || !blue.length) return;
  const redShoots = Math.random() < 0.5;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shooter = pick(redShoots ? red : blue);
  const victim = pick(redShoots ? blue : red);
  const before = hp.get(victim.label) ?? 100;
  const after = Math.max(0, before - DAMAGE[shooter.gun]);
  const ev = { type: after === 0 ? 'kill' : 'hit', victim: victim.label, shooter: shooter.label, gun: shooter.gun, hp: after, seq: seq++ };
  if (after === 0) {
    hp.delete(victim.label);
    deadUntil.set(victim.label, now + 8000);
    setTimeout(() => signedFetch(cfg, 'POST', '/api/device/events', { type: 'respawn', victim: victim.label, seq: seq++, simulated: true }).catch(() => {}), 8000);
  } else hp.set(victim.label, after);
  const res = await signedFetch(cfg, 'POST', '/api/device/events', { ...ev, simulated: true });
  const r = res.results[0];
  console.log(`${shooter.label} (${shooter.player}) ${ev.type} ${victim.label} (${victim.player}) → ${r.accepted ? `-${r.damage}` : r.reason}`);
}

(async function loop() {
  try {
    await step();
  } catch (e) {
    console.error(e.message);
  }
  setTimeout(loop, fast ? 150 + Math.random() * 300 : 700 + Math.random() * 1600);
})();
