import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeduper, parseLine } from '../lib.mjs';

test('parses the scoreboard ESP32 text feed', () => {
  assert.deepEqual(parseLine('B2 hit R1 (RIFLE)'), { type: 'hit', shooter: 'B2', victim: 'R1', gun: 1 });
  assert.deepEqual(parseLine('B2 KILLED R1 (AWM)'), { type: 'kill', shooter: 'B2', victim: 'R1', gun: 3 });
  assert.deepEqual(parseLine('r3 hit b4'), { type: 'hit', shooter: 'R3', victim: 'B4' });
  assert.deepEqual(parseLine('R5 hit B1 (SMG)\r'), { type: 'hit', shooter: 'R5', victim: 'B1', gun: 2 });
});

test('parses JSON event lines and ignores noise', () => {
  assert.deepEqual(parseLine('{"type":"hit","victim":"R1","shooter":"B2","gun":1,"hp":75,"seq":12}'), {
    type: 'hit', victim: 'R1', shooter: 'B2', gun: 1, hp: 75, seq: 12,
  });
  assert.equal(parseLine('{"type":"boom","victim":"R1"}'), null);
  assert.equal(parseLine('{broken'), null);
  assert.equal(parseLine('vest peak 4095'), null);
  assert.equal(parseLine('ROUND 2 START'), null);
  assert.equal(parseLine(''), null);
});

test('drops exact repeats inside the window only', () => {
  let t = 0;
  const seen = createDeduper(300, () => t);
  assert.equal(seen('B2 hit R1'), false);
  t = 100;
  assert.equal(seen('B2 hit R1'), true);
  assert.equal(seen('B3 hit R1'), false);
  t = 500;
  assert.equal(seen('B2 hit R1'), false);
});
