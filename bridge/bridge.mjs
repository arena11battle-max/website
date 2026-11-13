#!/usr/bin/env node
// Reads hit events from the scoreboard ESP32 (USB serial) or stdin and sends them, signed, to the dashboard.
//   node bridge.mjs --serial COM5          (Windows)   node bridge.mjs --serial /dev/ttyUSB0   (Linux/Mac)
//   some-command | node bridge.mjs --stdin   (or type lines such as "B2 hit R1 (RIFLE)" by hand)
import readline from 'node:readline';
import { createDeduper, loadConfig, parseLine, signedFetch, syncClock } from './lib.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || (!args.includes('--serial') && !args.includes('--stdin') && process.stdin.isTTY && args.length)) {
  console.log('Usage: node bridge.mjs --serial <COM5|/dev/ttyUSB0> [--baud 115200]\n       node bridge.mjs --stdin');
  process.exit(0);
}
const cfg = loadConfig();
const serialPath = args.includes('--serial') ? args[args.indexOf('--serial') + 1] : null;
const baud = Number(args.includes('--baud') ? args[args.indexOf('--baud') + 1] : 115200);

const queue = [];
let sending = false;
let backoff = 1000;

async function flush() {
  if (sending || queue.length === 0) return;
  sending = true;
  const batch = queue.slice(0, 50);
  try {
    const res = await signedFetch(cfg, 'POST', '/api/device/events', { events: batch });
    queue.splice(0, batch.length);
    (res.results ?? []).forEach((r, i) => {
      const ev = batch[i];
      const what = `${ev.shooter ?? ''} ${ev.type} ${ev.victim}`.trim();
      console.log(r.accepted ? `✓ ${what}  (-${r.damage}, hp ${r.hpAfter})` : `· ${what}  skipped: ${r.reason}`);
    });
    backoff = 1000;
  } catch (err) {
    if (err.status === 400) {
      console.error('Server rejected a batch, dropping it:', err.message);
      queue.splice(0, batch.length);
    } else {
      if (err.status === 401) await syncClock(cfg).catch(() => {});
      console.error(`Send failed (${err.message}); ${queue.length} event(s) waiting, retrying in ${backoff / 1000}s`);
      setTimeout(flush, backoff);
      backoff = Math.min(backoff * 2, 30000);
    }
  } finally {
    sending = false;
    if (queue.length && backoff === 1000) setImmediate(flush);
  }
}

// The hub can print the same radio packet twice; drop exact repeats that arrive within 300 ms.
const isRepeat = createDeduper(300);
let flushTimer = null;

function onLine(line) {
  const ev = parseLine(line);
  if (!ev || isRepeat(line.trim())) return;
  queue.push(ev);
  // Batch events that arrive close together (automatic fire) into one signed request.
  flushTimer ??= setTimeout(() => {
    flushTimer = null;
    flush();
  }, 80);
}

async function openSerial() {
  let SerialPort, ReadlineParser;
  try {
    ({ SerialPort } = await import('serialport'));
    ({ ReadlineParser } = await import('@serialport/parser-readline'));
  } catch {
    console.error('Serial support is not installed. Run: npm install   (inside the bridge folder)');
    process.exit(1);
  }
  const port = new SerialPort({ path: serialPath, baudRate: baud });
  port.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', onLine);
  port.on('open', () => console.log(`Listening on ${serialPath} at ${baud} baud`));
  port.on('error', (e) => {
    console.error('Serial error:', e.message);
    process.exit(1);
  });
}

await syncClock(cfg).catch((e) => console.error('Could not reach the server yet:', e.message));
console.log(`Bridge sending to ${cfg.serverUrl} as device ${cfg.deviceId}`);
if (serialPath) await openSerial();
else readline.createInterface({ input: process.stdin }).on('line', onLine);
