# Neon Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Six jobs. One city. Three stars of heat. Steal the case, lose the cops, get home.

Neon Bay is an open-world crime game: drive and walk a 5×5-block city at sunset, take six jobs from your fixer Mara Voss, and outrun the police. You are Dex Marlowe, a driver fresh out of luck. Finish all six to become a **Neon Bay Legend**, then free-roam the city.

Built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01).

## Jobs — six jobs, $3,550 total

| # | Job | What to do | Reward |
|---|---|---|---|
| 1 | FIRST PICKUP | Pick up the package at the end of the pier, bring it home to the garage | $200 |
| 2 | HOT DELIVERY | Deliver the package to the buyer up north in 100 seconds | $350 |
| 3 | BORROWED WHEELS | Steal any car and bring it to the garage | $400 |
| 4 | LOSE THE HEAT | Two stars on you — lose the heat until wanted is zero | $500 |
| 5 | DOCKSIDE TROUBLE | Take down three thugs at the docks (a pistol waits for you at the pier) | $600 |
| 6 | THE BIG ONE | Grab the case at the bank, lose three stars of heat, get home in 240 seconds | $1,500 |

## Systems

- **Open world** — a 5×5-block city with streets, sidewalks, lit towers with neon roofs, a beach and the sea to the south, a wooden pier, and three landmarks: the garage (your HQ), the bank, and the hospital (respawn).
- **Driving and walking** — steal any car with E (your own car by the garage is free), arcade handling with a handbrake, sprint on foot with SHIFT, orbit camera with the mouse.
- **Wanted** — 0 to 5 stars. Stealing, hitting pedestrians and shooting innocents raise the heat; a missed shot raises nothing. One police car chases per star. Stay slow and close to a police car for 2 seconds and you get busted; lay low and the heat fades one star at a time.
- **Combat** — punch with F (knockback), shoot with the mouse once you have the pistol. Thugs take two punches or one shot.
- **HUD** — money, health, wanted stars, the mission box with its timer, speed, crosshair, a gold objective beacon, an on-screen arrow (⬆) with the distance, and a round minimap with a legend.
- **Sound** — everything synthesised in WebAudio: engine hum, a two-tone siren, gunshots, punches, crashes, cash, and a synthwave bass loop. M to mute.
- **Save** — the game saves automatically (money and job progress). Continue from the menu picks up where you left off.

## Screenshots

1. `1-chase.jpg` — JOB 6 bank-heist chase, 3★ wanted, police chase, the ⬆ arrow and distance to the garage, the gold objective ring on the minimap, the mission box and timer.
2. `2-mission.jpg` — JOB 5 pistol fight at the docks, 3 thugs in an arc, the player with pistol and crosshair, the gold beacon.
3. `3-drive.jpg` — JOB 2 timed delivery, the car accelerating through traffic, the gold beacon, 100-second timer, 1★ wanted (an honest stolen car).
4. `4-escape.jpg` — JOB 4 on-foot escape, 2★ wanted, the player running, police cars in pursuit, the ⬆ arrow pointing at the garage (the beacon is hidden while escaping the heat).

## Controls

| Key | Action |
|---|---|
| WASD / arrows | Move / drive |
| SHIFT | Sprint on foot |
| Mouse drag | Orbit camera, wheel zooms |
| E | Enter / exit a car |
| F | Punch |
| Click | Shoot (with pistol) |
| SPACE | Handbrake |
| R | Restart the current job |
| P / ESC | Pause |
| M | Mute |

## Structure

- `game/index.html` — the page and the HUD
- `game/style.css` — all styling
- `game/src/config.js` — tuning, landmarks and the six jobs
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised WebAudio sound
- `game/src/world.js` — the city, sea, pier, landmarks and beacon
- `game/src/vehicles.js` — traffic, parked cars and the player's car
- `game/src/people.js` — pedestrians
- `game/src/police.js` — the chase, the ram and the arrest
- `game/src/combat.js` — punching, shooting, damage and WASTED
- `game/src/missions.js` — the six-job chain
- `game/src/hud.js` — HUD, objective arrow and minimap
- `game/src/main.js` — the game core and loop
- `main.ts` — the entrypoint that builds the dossier

## Run it

Serve `game/` with any static server and open `game/index.html` in desktop Chrome. No network is needed: every script, image and sound is a file under `game/` or synthesised at runtime. Traffic: 10 cars. Pedestrians: 16.
