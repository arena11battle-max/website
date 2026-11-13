# ARENA11 — Real-life tactical gaming

**SQUAD UP. ENTER. DOMINATE.**

One app for the ARENA11 venue: the public website, the staff console that runs matches, and the TV scoreboard. Red Wolves vs Blue Falcons, 2 to 8 players, gel blasters with coded IR, ESP32 vests and a server that keeps the score.

| Address | What it is | Who |
| --- | --- | --- |
| `/` | Public website: aerial hero, arsenal, battlefield tour, missions, safety kit (3D), player POV clip, how it works, live intel, leaderboard, gallery, booking enquiry | Everyone |
| `/safety`, `/terms`, `/privacy` | Legal and safety pages | Everyone |
| `/display` | Full-screen TV scoreboard (no sign-in) | Arena TV |
| `/command` | Staff console: players, matches, live control, bookings, history, leaderboard, settings | Admin and operators |

> **Status of visuals:** the logo is ARENA11's own banner (`web/public/brand/`, shown as supplied), the hero is ARENA11's real aerial photo of the arena, the player POV clip and vest photos are ARENA11's own, and the walkthrough scenes and game-mode previews are concept renders made from code, while the briefing, booking and final-call backgrounds and the first gallery items are crops of the real aerial photo (the four blaster images were supplied by ARENA11), labelled as such on the site. Swap them for real material when it exists. See [Replacing placeholder media](#replacing-placeholder-media).
>
> **Status of hardware:** the bridge and device API are built and tested against the simulator and the text the current `scoreboard.ino` prints. They have **not** been tested with the physical ESP32 kits yet. The site's "System status" line is set by staff under Settings → Website, so it never claims more than you set.

## Contents

1. [What is in it](#what-is-in-it)
2. [Run it](#run-it)
3. [Environment settings](#environment-settings)
4. [Database](#database)
5. [Simulator](#simulator)
6. [Hardware](#hardware) (full guide: [docs/HARDWARE.md](docs/HARDWARE.md))
7. [Tests](#tests)
8. [Deployment, backup and restore](#deployment) (full guide: [docs/DEPLOY.md](docs/DEPLOY.md))

## What is in it

```
 gun ─coded IR─▶ vest ─ESP-NOW─▶ ESP32 hub ─USB─▶ bridge ─signed HTTPS─▶ API ─▶ PostgreSQL
                                                                         │
                         website · staff console · TV  ◀──Socket.IO──────┘
```

| Folder | Tech |
| --- | --- |
| `web/` | React 19, TypeScript, Vite, Tailwind CSS 4, GSAP + ScrollTrigger, Lenis, three.js (lazy-loaded), Socket.IO client, installable PWA |
| `server/` | Node 22, Fastify 5, PostgreSQL 16 (`pg`), Zod, Socket.IO, Argon2id |
| `bridge/` | Node program: ESP32 USB serial (or stdin) → signed API calls, plus a match simulator |
| `e2e/` | Playwright smoke run across four screen sizes |
| `web/scripts`, `web/render` | Dev-only tools that render the concept films and stills |

**The server is the referee.** Damage, health, kills, respawns, the round clock and the result are all decided on the server. A device reports *who hit whom*; damage comes from the shooter's kit gun (rifles: AR15 and Tactical M4, 25 HP; SMGs: Vector and UMP45, 15 HP; kit slots 1, 3, 2 and 0). When health hits 0 the server records the kill.

**Public website** (cinematic, GSAP + ScrollTrigger, Lenis smooth scrolling)
- Hero: the original concept-render arena film (hero-1600/960) under "This is not just a game. This is ARENA11.", red and blue gel tracers, drifting smoke, dust and embers on a small canvas, light shafts, letterbox intro, logo scan-line reveal, animated ENTER THE ARENA heading, BOOK YOUR MATCH. The hero pins and dissolves into the next scene as you scroll.
- Briefing: pinned manifesto that lights up word by word over a parallax arena shot, with counting stats.
- Arena walkthrough: pinned full-screen scenes (main gate, sandbag nests, tyres and drums, pallets and camo, watchtower, team bases) that wipe into each other with a constant camera push. "Explore in 3D" opens the interactive three.js tour full screen.
- Arsenal: four gel-blaster cards with image wipes, pointer tilt and glare, animated damage and hits-to-eliminate bars, "Inspect 3D" (rotate, details, test fire) and "Book with this loadout". Copy states these are gel blasters, not firearms.
- Game modes: Team Deathmatch, Domination, Last Squad, Custom Match with looping video previews (hover on desktop, centred card on phones), briefings and "Book/Request this mode". Domination and Last Squad are labelled marshal-run until their scoring is built.
- How it works (4 steps) and the "Every hit counts" signal diagram.
- Live arena: the real running match over Socket.IO with scores that roll and flash on change, the clock, and every operator's health, kills and deaths. Otherwise "NO ACTIVE MISSION / Awaiting deployment."
- Leaderboard: Today / 7 days / 30 days / All time, with MVP counts. Only nicknames and stats are public.
- Safety kit: rotatable 3D vest (camo or black, red or blue light strip), helmet with ARENA11 patch and neck scarf, built in code (`web/src/three/gear.ts`) from ARENA11's reference photos, plus the rules of engagement. Falls back to the vest photo without WebGL.
- Player POV: ARENA11's head-camera clip (`web/public/media/real/pov.*`, watermark cropped, no audio) in a phone frame. Autoplays muted only on screen and not with reduced motion.
- Gallery: photos staff upload, plus clearly labelled concept renders.
- Booking: animated enquiry form with game mode and loadout picks (prefilled from the cards), focus lines, a sending state and a "request logged" confirmation with the reference. It is an enquiry: staff confirm it in the console, where the mode and loadout show on the card.
- Contact, WhatsApp, Instagram, map link and hours come from Settings → Website. Blank fields are hidden, never faked.
- **Reduced motion:** with the system setting on, there is no smooth scrolling, pinning, video or particles; the walkthrough becomes a plain list of scenes.
- **Mobile:** smaller film (960 px, 0.6 MB), half-size scene stills, preview clips load only when played, particle counts and pixel ratio are capped, and touch keeps native scrolling.

**Staff console** (`/command`)
- Players, match setup (2 to 8 players, kits R1–R5 / B1–B5, rounds/length/breaks), live control (start, pause, resume, end round, end match, rematch), manual hit/kill with weapon, void wrong events.
- Bookings: new → contacted → confirmed / declined / cancelled, with staff notes.
- Settings: staff and roles, kits, hub devices, website details, gallery uploads, sessions ("sign out everywhere"), activity log.

## Run it

### With Docker (venue laptop or server)

```bash
cp .env.example .env     # set DB_PASSWORD and APP_SECRET (see below)
docker compose up -d --build
```

Open `http://localhost:8080`. Other devices on the same Wi-Fi use `http://<laptop-IP>:8080`.

1. Go to `/command`. The first visit creates the **owner (admin)** account.
2. Settings → Website: fill in phone, WhatsApp, email, address, hours, Instagram and the system status line.
3. Settings → Kits: check the 10 kits and their guns match what is flashed into the ESP32s.
4. Settings → Hub devices: register the scoreboard hub and copy its ID and secret (shown once).
5. On the arena TV open `/display` and press **Full screen**.

### For development

Needs Node 22 and PostgreSQL 16.

```bash
# PostgreSQL: user arena / password arena, databases arena and arena_test
createdb -U arena arena && createdb -U arena arena_test

cd server && npm install && npm run dev    # API on :8080, runs migrations on start
cd web && npm install && npm run dev       # site on :5173, proxies /api and /socket.io to :8080
cd bridge && npm install                   # only needed for real serial hardware
```

Production build without Docker:

```bash
cd web && npm ci && npm run build          # → web/dist
cd server && npm ci && npm run build       # → server/dist
NODE_ENV=production APP_SECRET=... DATABASE_URL=... node server/dist/server.js
```

The server serves `web/dist` itself (`WEB_DIST`, default `../web/dist`), so one process on one port runs everything.

## Environment settings

All settings are environment variables, checked by `server/src/config.ts`. `.env.example` has every one with a comment.

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://arena:arena@localhost:5432/arena` | Docker builds this from `DB_PASSWORD` |
| `APP_SECRET` | dev-only value | **Required in production**: 32+ random characters. Signs logins and encrypts hub secrets. Production refuses weak or placeholder values. |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `TIME_ZONE` | `Asia/Kolkata` | Venue time zone, used for "Today" and booking dates |
| `MIN_PLAYERS` / `MAX_PLAYERS` | `2` / `8` | |
| `RESPAWN_SECONDS` | `8` | |
| `CORS_ORIGINS` | empty | Only if another site must call the API |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | |
| `SERVER_URL`, `DEVICE_ID`, `DEVICE_SECRET` | | Read by the bridge (or put them in `bridge/config.json`) |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## Database

PostgreSQL 16. Migrations are plain SQL in `server/src/migrations` (`001_init.sql`, `002_website.sql`, `003_booking_mode.sql`) and run automatically when the server starts. To run them by hand: `cd server && npm run migrate`.

Main tables: `staff_users`, `refresh_tokens`, `players`, `kits`, `devices`, `matches`, `match_players`, `events`, `bookings`, `site_settings`, `gallery_media`, `audit_log`. Gallery images are stored in the database, so a database backup covers them.

## Simulator

No hardware needed. Register a hub device (Settings → Hub devices), put its ID and secret in `bridge/config.json` (copy `config.example.json`) or in `DEVICE_ID` / `DEVICE_SECRET`, start a match in the console, then:

```bash
cd bridge
node simulate.mjs          # one event about every 1.5 s
node simulate.mjs --fast   # several a second
```

It sends signed hit events for the kits in the running match, exactly as the hub would. The console, TV and website update live. You can also type hub lines by hand: `node bridge.mjs --stdin`, then `B2 hit R1 (RIFLE)`.

## Hardware

Short version (details, wiring of the data flow and the JSON line format are in [docs/HARDWARE.md](docs/HARDWARE.md)):

```bash
cd bridge && npm install && cp config.example.json config.json   # paste device ID and secret
node bridge.mjs --serial COM5            # Windows
node bridge.mjs --serial /dev/ttyUSB0    # Linux / Mac
```

The bridge reads what the current scoreboard firmware prints (`B2 hit R1 (RIFLE)`, `B2 KILLED R1 (AWM)`), so no firmware change is needed. It batches events every 80 ms, drops radio repeats within 300 ms, and holds events while the network is down. Kit labels must match the firmware: R1 = `TEAM 0, PLAYER_ID 1`, B1 = `TEAM 1, PLAYER_ID 1`.

## Tests

```bash
cd server && npm test                 # 16 API tests (needs database arena_test)
cd bridge && npm test                 # 3 bridge tests
cd web && npx tsc -b && npm run build # type check and production build
node e2e/smoke.cjs http://localhost:8080 screenshots   # browser run, needs a fresh database
```

The browser run checks the site at 390×844, 820×1180, 1440×900 and 1920×1080, plus a reduced-motion pass. It books through the game-mode and loadout cards, sends a booking enquiry, creates the owner, adds 8 players, runs a 4v4 match with the simulator, checks the live sections and the TV, pauses and resumes the clock, ends the match, checks the leaderboard and confirms the booking. It fails on any browser console error or horizontal overflow, and saves screenshots to the folder you name.

Last results: server 16/16, bridge 3/3, type check and build clean, browser run passed with no console errors.

## Deployment

See [docs/DEPLOY.md](docs/DEPLOY.md) for a public server with HTTPS, backups and restore. In short: Docker Compose behind Caddy or nginx with a certificate, `COOKIE_SECURE=true`, a strong `APP_SECRET`, and a nightly `pg_dump`.

## Security

- Argon2id passwords. 15-minute access token kept in memory; refresh token in an httpOnly, SameSite=Strict cookie, rotated on every use. Reusing an old refresh token signs that user out everywhere.
- Roles: **admin** (staff, kits, devices, website, gallery, activity log) and **operator** (players, matches, bookings).
- Zod validation on every input, 256 KB body limit (6 MB for gallery uploads, checked by file signature), rate limits on the API, login and booking form, CSP and security headers, CORS closed by default.
- Hub devices sign every request with HMAC-SHA256 and a timestamp; secrets are encrypted at rest.
- Public endpoints carry nicknames and stats only. Phone numbers and booking details need a staff sign-in. Errors never include stack traces.
- The service worker caches only the app shell and media, never `/api` or `/socket.io`.

## Replacing placeholder media

- **Logo:** ARENA11's banner lives in `web/public/brand/arena11-logo-{320,600,1200,2400}.webp` (resized from the supplied 3388×952 PNG; see `LOGO` in `web/src/brand.tsx`). App icons and favicons in `web/public/` are square crops of the logo's "A" with the soldier.
- **Hero photo:** replace `web/public/media/real/arena-aerial-1086.webp` / `-640.webp` (portrait). If the framing changes, update `PHOTO`, `LAMPS` and `TARGETS` (photo pixel coordinates) in `web/src/site/sections/Hero.tsx`.
- **POV clip:** replace `web/public/media/real/pov.mp4`, `pov.webm` and `pov-poster.webp`, and the beat times in `PlayerPov.tsx`.
- **Real photos:** upload them under Settings → Gallery. They show before the concept renders.
- **Arena walkthrough:** replace `web/public/media/scene-<id>.webp` (1600×900) and `scene-<id>-sm.webp` (800×450) for gate, sandbags, tyres, pallets, tower and bases with real photos or video frames, and edit the captions in `ARENA_SCENES` (`web/src/three/data.ts`).
- **Game-mode previews:** replace `mode-<tdm|dom|last|custom>.mp4/.webm` (640×360, a few seconds, silent) and the matching `.webp` poster.
- **Gel blaster photos:** card images are set per gun in `WEAPONS` (`web/src/three/data.ts`): `gun-rifle.webp` (AR15), `gun-m4-tactical.webp` (Tactical M4), `gun-smg.webp` (Vector), `gun-ump.webp` (UMP45). 1280×720 on a dark background; set `supplied: true` once the image is real.
- Then remove the "Concept render" labels in the matching section under `web/src/site/sections/`.
- To re-render the concept media: `cd web && RENDER=1 npx vite --port 5174` then `DEV_URL=http://localhost:5174 node scripts/render-media.mjs hero modes scenes` (also `guns`, `tour`). Needs ffmpeg. Restart the render server after editing a 3D file: it does not reload.
