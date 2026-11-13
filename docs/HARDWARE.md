# Connecting the ESP32 hardware

> Status: the bridge and device API are tested against the simulator and against the exact text the current `scoreboard.ino` prints. They have **not** yet been tested with the physical kits. Run the checks at the end of this page at the venue before the first paid session.

## The path of one hit

1. A gun fires a **coded IR** shot carrying the shooter's team and player ID.
2. The victim's vest decodes it and sends it over **ESP-NOW** to the scoreboard hub ESP32.
3. The hub prints one line per event on its **USB serial** port.
4. `bridge/bridge.mjs` on the venue laptop reads those lines, signs them and posts them to `POST /api/device/events`.
5. The server checks the match is live, applies damage from the **shooter's kit gun**, and records a kill when health reaches 0. The vest's own HP and gun values are ignored, so a faulty vest cannot change the score.
6. Every screen gets the new scoreboard over Socket.IO within about 150 ms.

## Kits

The console ships with 10 kits: **R1–R5** (Red Wolves) and **B1–B5** (Blue Falcons). A kit label must match the firmware:

| Kit | Firmware |
| --- | --- |
| R1 … R5 | `TEAM 0`, `PLAYER_ID 1 … 5` |
| B1 … B5 | `TEAM 1`, `PLAYER_ID 1 … 5` |

Under **Command → Settings → Kits** set each kit's gun: Pistol 20, Rifle 25, SMG 15 or AWM 70 HP damage. A kit can only be put on its own team. Disable a kit there if it is broken.

## Set up the bridge

1. **Command → Settings → Hub devices → Add.** Copy the device ID and secret. The secret is shown only once.
2. On the laptop the hub is plugged into (Node 22 installed):

   ```bash
   cd bridge
   npm install
   cp config.example.json config.json   # paste serverUrl, deviceId, deviceSecret
   node bridge.mjs --serial COM5            # Windows: check Device Manager → Ports
   node bridge.mjs --serial /dev/ttyUSB0    # Linux;  Mac: /dev/tty.usbserial-*
   ```

   Options: `--baud 115200` (default), `--stdin` to read lines from the keyboard or a pipe, `--help`. `SERVER_URL`, `DEVICE_ID` and `DEVICE_SECRET` environment variables override `config.json`.

3. Keep it running for the session. If the network drops, events are held and resent in order.

## Lines the bridge understands

The current firmware's feed lines work unchanged:

```
B2 hit R1 (RIFLE)
B2 KILLED R1 (AWM)
```

For exact sequencing, the hub can also print one JSON line per event:

```json
{"type":"hit","victim":"R1","shooter":"B2","gun":1,"seq":12}
```

- `type`: `hit`, `kill` or `respawn`
- `gun`: 0 Pistol, 1 Rifle, 2 SMG, 3 AWM (informational; the server uses the shooter kit's gun)
- `seq`: increasing number per hub; repeats of the same `seq` are counted once
- `hp` may be sent but is ignored

Other lines (boot messages, debug) are skipped. The bridge also drops an identical event repeated within 300 ms (ESP-NOW retries) and sends in batches every 80 ms.

## Connect vests over Bluetooth (no bridge needed)

The vest firmware (`vest_B1`, `vest_B1_ir`, `player_kit`) advertises as `SG-VEST-B1` / `SG-B1` and sends text lines
on one Bluetooth LE notify characteristic (service `6e5a0001-5347-4b31-9a7e-0e5d2c1a0b01`, events `6e5a0002-…`).
The live match screen in the staff console can connect to those vests directly:

1. Open the console in **Chrome or Edge on a PC or an Android phone** near the arena. iPhone browsers do not allow
   Bluetooth for websites. The page must be served over https, or from `localhost` on the same PC.
2. Create and start the match. Give each player the kit that matches their vest (B1 vest → kit B1).
3. Under **Vests · Bluetooth**, press **Connect vest** and pick the vest. The kit is read from the vest name; change it
   in the Kit box if needed. Repeat for each vest (Chrome keeps several connected at once).
4. Hit the vest. The panel shows the line the vest sent and what the server recorded; the player's health, deaths and
   the team score update for everyone (TV display and public site too).

What the server does with each line:

| Vest sends        | Recorded as                                                                     |
|-------------------|---------------------------------------------------------------------------------|
| `H,GEL,9,75`      | Body hit, 25 damage, no shooter                                                 |
| `H,HEAD,9,25`     | Helmet hit, 50 damage, no shooter                                               |
| `K,GEL,9,0`       | Down (health to 0, death counted). No shooter: the kill scores for the other team |
| `H,R2,1,75`       | Hit by kit R2 (when guns send a player ID): R2's gun damage, R2 gets the credit  |
| `P,100`           | Respawned at full health                                                        |
| `S,1,75,1,1`      | Status: only shown in the panel                                                 |

Staff stay in control: pause, end round, void an event (✕ in the kill feed) and Add hit / kill all still work.
Hits while the match is paused or in a break are shown as "Not counted". If the vest drops out of range the console
retries for about 15 seconds, then shows Retry.

## Device API (for a hub that posts over Wi-Fi later)

| | |
| --- | --- |
| `GET /api/device/time` | Server time in ms, unsigned, for clock sync |
| `GET /api/device/state` | Running match, round, time left, kits in play |
| `POST /api/device/events` | One event or `{ "events": [...] }` (up to 50) |

Signed requests send `X-Device-Id`, `X-Timestamp` (unix ms) and `X-Signature` = hex `HMAC-SHA256(secret, "<timestamp>.<raw body>")`. Requests more than 5 minutes from server time, from a disabled device, or with a bad signature are rejected.

## Checks before going live

1. Start a match with two kits. Fire R1 at B1 once: the console shows one hit and B1 loses that gun's damage.
2. Fire until B1 reaches 0: one kill, B1 shows KIA and comes back after the respawn time.
3. Unplug the laptop's network for 20 seconds while firing, then reconnect: the held hits appear, none twice.
4. Fire during a pause or break: nothing is counted.
5. Then set **Settings → Website → System status** to say the kits are in service. Until then the public site says what you set there.

## No hardware?

`node simulate.mjs` (or `--fast`) plays signed hits for the kits in the running match. See the README.
