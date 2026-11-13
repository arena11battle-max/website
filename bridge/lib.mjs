// Shared helpers for the bridge and the simulator: config, clock sync and signed requests.
import crypto from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

export function loadConfig() {
  const file = new URL('./config.json', import.meta.url);
  const fromFile = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const cfg = {
    serverUrl: process.env.SERVER_URL ?? fromFile.serverUrl ?? 'http://localhost:8080',
    deviceId: process.env.DEVICE_ID ?? fromFile.deviceId,
    deviceSecret: process.env.DEVICE_SECRET ?? fromFile.deviceSecret,
  };
  if (!cfg.deviceId || !cfg.deviceSecret) {
    console.error('Missing device ID or secret. Register a device under Settings > Hub devices, then put them in bridge/config.json.');
    process.exit(1);
  }
  cfg.serverUrl = cfg.serverUrl.replace(/\/$/, '');
  return cfg;
}

let clockOffset = 0;

/** The ESP32 and some laptops have drifting clocks; sign with the server's time instead. */
export async function syncClock(cfg) {
  const t0 = Date.now();
  const res = await fetch(`${cfg.serverUrl}/api/device/time`);
  const { now } = await res.json();
  clockOffset = now - Math.round((t0 + Date.now()) / 2);
}

export async function signedFetch(cfg, method, path, body) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const ts = String(Date.now() + clockOffset);
  const signature = crypto.createHmac('sha256', cfg.deviceSecret).update(`${ts}.${raw}`).digest('hex');
  const res = await fetch(`${cfg.serverUrl}${path}`, {
    method,
    headers: {
      ...(raw ? { 'content-type': 'application/json' } : {}),
      'x-device-id': String(cfg.deviceId),
      'x-timestamp': ts,
      'x-signature': signature,
    },
    body: raw || undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const GUNS = { PISTOL: 0, RIFLE: 1, SMG: 2, AWM: 3, SNIPER: 3 };

/**
 * Turns one line from the scoreboard ESP32's USB serial into an event, or null if it isn't one.
 * Accepts JSON lines ({"type":"hit","victim":"R1","shooter":"B2","gun":1,"hp":75,"seq":3})
 * and the feed lines the current scoreboard.ino already prints ("B2 hit R1 (RIFLE)", "B2 KILLED R1 (AWM)").
 */
export function parseLine(line) {
  const text = line.trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const ev = JSON.parse(text);
      if (['hit', 'kill', 'respawn'].includes(ev.type) && ev.victim) return ev;
    } catch {}
    return null;
  }
  const m = text.match(/^([RB]\d{1,2})\s+(hit|KILLED)\s+([RB]\d{1,2})(?:\s+\((\w+)\))?/i);
  if (!m) return null;
  const ev = { type: m[2].toLowerCase() === 'killed' ? 'kill' : 'hit', shooter: m[1].toUpperCase(), victim: m[3].toUpperCase() };
  const gun = m[4] ? GUNS[m[4].toUpperCase()] : undefined;
  if (gun !== undefined) ev.gun = gun;
  return ev;
}

/** Returns a function that is true for a key seen within the last `ms` milliseconds. */
export function createDeduper(ms, now = () => Date.now()) {
  const seen = new Map();
  return (key) => {
    const t = now();
    for (const [k, at] of seen) if (t - at > ms) seen.delete(k);
    if (seen.has(key)) return true;
    seen.set(key, t);
    return false;
  };
}
