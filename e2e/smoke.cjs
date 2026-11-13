// End-to-end smoke test: drives the real ARENA11 site and console in Chromium against a running server.
//   node e2e/smoke.cjs http://localhost:8080 ./screenshots
// Needs a fresh database (first-run setup is part of the flow). Fails on any browser console error.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] ?? 'http://localhost:8080';
const OUT = process.argv[3] ?? 'screenshots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const VIEWPORTS = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, laptop: { width: 1440, height: 900 }, tv: { width: 1920, height: 1080 } };

function watch(page, label) {
  // Software WebGL is slow on CI machines; give screenshots of 3D pages room.
  page.setDefaultTimeout(90000);
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${e.message}`));
}

async function noOverflow(page, label) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (extra > 0) errors.push(`${label}: horizontal overflow of ${extra}px`);
}

function check(cond, msg) {
  if (!cond) throw new Error(`Check failed: ${msg}`);
  console.log(`✓ ${msg}`);
}

(async () => {
  // SwiftShader gives headless Chromium WebGL, so the 3D sections really run.
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });

  // ---------- Public website ----------
  const site = await browser.newContext({ viewport: VIEWPORTS.laptop });
  const web = await site.newPage();
  watch(web, 'site');
  await web.goto(BASE);
  await web.getByRole('heading', { level: 1, name: /This is ARENA11/i }).waitFor();
  await sleep(5000);
  await web.screenshot({ path: `${OUT}/01-site-hero-laptop.png` });
  for (const id of ['briefing', 'battlefield', 'arsenal', 'missions', 'live', 'leaderboard', 'book']) {
    await web.evaluate((id) => document.getElementById(id).scrollIntoView(), id);
    await sleep(2500);
    await web.screenshot({ path: `${OUT}/02-site-${id}-laptop.png` });
  }
  check(await web.getByText('No active mission').isVisible(), 'live section shows "No active mission" with no match running');

  // Cards preselect the booking form: a game mode, then a loadout.
  await web.evaluate(() => document.getElementById('missions').scrollIntoView())
  await sleep(1500);
  await web.locator('.mode-card', { hasText: 'Domination' }).getByRole('button', { name: 'Request this mode' }).click();
  await sleep(2000);
  await web.evaluate(() => document.getElementById('arsenal').scrollIntoView())
  await sleep(1500);
  await web.locator('.gear-card', { hasText: 'Tactical M4' }).getByRole('button', { name: 'Book with this loadout' }).click();
  await sleep(2000);
  check(
    (await web.locator('input[name=mode][value=domination]').isChecked()) && (await web.locator('input[name=loadout][value="Tactical M4"]').isChecked()),
    'game mode and loadout cards preselect the booking form',
  );

  // Booking enquiry through the form.
  const date = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  await web.getByLabel('Name').fill('Asha Varma');
  await web.getByLabel('Contact number').fill('+91 98765 43210');
  await web.getByLabel('Number of players').selectOption('6');
  await web.getByLabel('Preferred date').fill(date);
  await web.getByLabel('Preferred time').fill('18:30');
  await web.getByLabel('Special requests').fill('Birthday squad');
  await web.getByRole('button', { name: 'Send enquiry' }).click();
  await web.getByText('Request logged').waitFor();
  await sleep(3000);
  await web.screenshot({ path: `${OUT}/02-site-booking-confirmed.png` });
  const ref = (await web.locator('[role=status] .digits').textContent()).trim();
  check(/^A11-/.test(ref), `booking enquiry stored with reference ${ref}`);

  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    await web.setViewportSize(vp);
    await web.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);
    await web.screenshot({ path: `${OUT}/03-site-${name}.png` });
    await noOverflow(web, `site ${name}`);
  }

  // Reduced motion: no pins or smooth scroll, every section still readable.
  const calm = await browser.newContext({ viewport: VIEWPORTS.phone, reducedMotion: 'reduce' });
  const calmPage = await calm.newPage();
  watch(calmPage, 'site reduced motion');
  await calmPage.goto(BASE);
  await calmPage.getByRole('heading', { level: 1, name: /This is ARENA11/i }).waitFor();
  await calmPage.evaluate(() => document.getElementById('battlefield').scrollIntoView());
  await sleep(1000);
  check(await calmPage.getByRole('heading', { name: 'The main gate' }).isVisible(), 'reduced motion shows the arena scenes as a plain list');
  await calmPage.screenshot({ path: `${OUT}/04-site-reduced-motion.png` });
  await noOverflow(calmPage, 'site reduced motion');
  await calm.close();

  // ---------- Command console ----------
  const laptop = await browser.newContext({ viewport: VIEWPORTS.laptop });
  const page = await laptop.newPage();
  watch(page, 'console');
  await page.goto(`${BASE}/command`);
  await page.getByLabel('Your name').fill('Jose');
  await page.getByLabel('Email').fill('jose@arena.local');
  await page.getByLabel('Password').fill('arena-owner-1');
  await page.screenshot({ path: `${OUT}/04-setup.png` });
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByText('No match running').waitFor();
  check(true, 'first-run owner account created');

  // Sign out and back in.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.getByRole('button', { name: 'Sign in' }).waitFor();
  await page.getByLabel('Email').fill('jose@arena.local');
  await page.getByLabel('Password').fill('arena-owner-1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('No match running').waitFor();
  check(true, 'login works');

  // Players.
  await page.getByRole('link', { name: 'Players' }).first().click();
  const roster = [['Arjun', 'Viper'], ['Bhavya', 'Ghost'], ['Charan', 'Hawk'], ['Divya', 'Storm'], ['Eshan', 'Blaze'], ['Farah', 'Nova'], ['Gopi', 'Rex'], ['Hema', 'Echo']];
  for (const [name, nick] of roster) {
    await page.getByRole('button', { name: '+ Add player' }).click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Nickname (shown on scoreboard)').fill(nick);
    await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  }
  await page.getByText('Echo').waitFor();
  check(true, '8 players created');
  await page.screenshot({ path: `${OUT}/05-players-laptop.png` });

  // Match: 4 v 4.
  await page.getByRole('link', { name: 'New match' }).first().click();
  await page.getByLabel('Match name (optional)').fill('Saturday 7 PM');
  for (const [i, [, nick]] of roster.entries()) {
    const row = page.locator('li', { hasText: nick }).first();
    await row.getByRole('button', { name: i % 2 === 0 ? 'Red' : 'Blue' }).click();
  }
  await page.screenshot({ path: `${OUT}/06-new-match-laptop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create match' }).click();
  await page.getByRole('button', { name: '▶ Start match' }).click();
  await page.getByText('Round 1 of 3').first().waitFor();
  check(true, 'match created and started');

  // Hardware-free simulator through a registered hub device.
  const token = await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'jose@arena.local', password: 'arena-owner-1' }) })).json();
  const dev = await (await fetch(`${BASE}/api/admin/devices`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token.accessToken}` }, body: JSON.stringify({ name: 'Simulator' }) })).json();
  const sim = spawn('node', [path.join(__dirname, '../bridge/simulate.mjs'), '--fast'], {
    env: { ...process.env, SERVER_URL: BASE, DEVICE_ID: String(dev.device.id), DEVICE_SECRET: dev.secret },
  });
  let simOut = '';
  sim.stdout.on('data', (d) => (simOut += d));
  sim.stderr.on('data', (d) => (simOut += d));
  await sleep(12000);

  let board = await (await fetch(`${BASE}/api/public/live`)).json();
  check(board.feed.length > 0, `live scores update from the simulator (${board.feed.length} feed events, red ${board.teams.red.score} : blue ${board.teams.blue.score})`);
  check(!JSON.stringify(board).includes('"phone"'), 'public live API carries no phone numbers');
  await page.screenshot({ path: `${OUT}/07-console-laptop.png`, fullPage: true });
  for (const name of ['tablet', 'phone']) {
    await page.setViewportSize(VIEWPORTS[name]);
    await sleep(800);
    await page.screenshot({ path: `${OUT}/07-console-${name}.png` });
    await noOverflow(page, `console ${name}`);
  }
  await page.setViewportSize(VIEWPORTS.laptop);

  // Public TV board, no sign-in, and the public site's live section.
  const tv = await browser.newContext({ viewport: VIEWPORTS.tv });
  const tvPage = await tv.newPage();
  watch(tvPage, 'tv');
  await tvPage.goto(`${BASE}/display`);
  await tvPage.getByText('Round 1 of 3').first().waitFor();
  await sleep(3000);
  await tvPage.screenshot({ path: `${OUT}/08-tv-live.png` });
  check(!(await tvPage.content()).includes('+ Add player'), 'TV board has no admin controls');
  await web.setViewportSize(VIEWPORTS.laptop);
  await web.evaluate(() => document.getElementById('live').scrollIntoView());
  await web.getByText('RED WOLVES').first().waitFor();
  await sleep(1500);
  await web.screenshot({ path: `${OUT}/09-site-live-section.png` });
  check(true, 'website live section shows the running match');

  // Pause freezes the clock; resume continues it.
  await page.getByRole('button', { name: '❚❚ Pause' }).click();
  await page.getByText('Paused · round 1').first().waitFor();
  const frozen = (await (await fetch(`${BASE}/api/public/live`)).json()).timer.remainingMs;
  await sleep(2000);
  const still = (await (await fetch(`${BASE}/api/public/live`)).json()).timer.remainingMs;
  check(frozen === still, `pause preserves remaining time (${frozen} ms)`);
  await page.screenshot({ path: `${OUT}/10-paused.png` });
  await page.getByRole('button', { name: '▶ Resume' }).click();
  await page.getByText('Round 1 of 3').first().waitFor();
  check(true, 'resume restores the live round');
  sim.kill();

  await page.getByRole('button', { name: '■ End match' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await page.getByText(/Final ·/).first().waitFor();
  await sleep(800);
  await page.screenshot({ path: `${OUT}/11-final-laptop.png`, fullPage: true });
  await tvPage.waitForTimeout(1500);
  await tvPage.screenshot({ path: `${OUT}/12-tv-final.png` });
  board = await (await fetch(`${BASE}/api/public/live`)).json();
  check(board.match.status === 'finished', `match finished, winner ${board.match.winner}, MVP ${board.mvp?.displayName ?? 'none'}`);

  await page.getByRole('link', { name: 'Leaders' }).first().click();
  await page.getByRole('columnheader', { name: 'Rank' }).waitFor();
  await page.screenshot({ path: `${OUT}/13-leaderboard-console.png` });
  const lb = await (await fetch(`${BASE}/api/leaderboard?period=today`)).json();
  check(lb.leaderboard.length === 8 && lb.leaderboard.every((r) => r.name === undefined), 'public leaderboard lists all 8 players by nickname only');

  // Booking review.
  await page.getByRole('link', { name: 'Bookings' }).first().click();
  await page.getByText('Asha Varma').waitFor();
  check(await page.getByText('Loadout: Tactical M4').isVisible(), 'staff see the requested game mode and loadout');
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await page.getByRole('button', { name: /^Confirmed/ }).click();
  await page.getByText('Asha Varma').waitFor();
  await page.screenshot({ path: `${OUT}/14-bookings.png` });
  check(true, 'booking enquiry reviewed and confirmed by staff');

  // Public leaderboard section after the match.
  await web.reload();
  await web.evaluate(() => document.getElementById('leaderboard').scrollIntoView());
  await web.getByRole('tab', { name: 'Today' }).click();
  await web.locator('#leaderboard tbody tr').first().waitFor();
  await sleep(1200);
  await web.screenshot({ path: `${OUT}/15-site-leaderboard.png` });
  await web.setViewportSize(VIEWPORTS.phone);
  await sleep(800);
  await web.screenshot({ path: `${OUT}/15-site-leaderboard-phone.png` });
  await noOverflow(web, 'site leaderboard phone');

  console.log('Simulator log (last lines):\n' + simOut.trim().split('\n').slice(-4).join('\n'));
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'No browser console errors');
  // Closing a browser with live WebGL canvases can stall; do not let that hold the run.
  await Promise.race([browser.close(), sleep(5000)]);
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : '');
  process.exit(1);
});
