[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![rank](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/reward.svg)](https://make.fun/competitions/gta6-01)

# Neon Bay — open-world crime

An open-world crime game set in Neon Bay, a neon-lit city at **sunset**. You are Dex Marlowe, a driver fresh out of luck. Your fixer Mara Voss has six jobs for you — a pickup, a hot delivery, a stolen car, a heat problem, a dock fight, and the big one at Meridian Bank. Do them clean, get paid, and maybe the city lets you keep the money.

## Jobs

| # | Job | Reward |
|---|-----|--------|
| 1 | FIRST PICKUP — fetch a package from the south pier, bring it home | $200 |
| 2 | HOT DELIVERY — a buyer waits at the far north end, 100 seconds | $350 |
| 3 | BORROWED WHEELS — steal any car, bring it to the garage | $400 |
| 4 | LOSE THE HEAT — shake a 2-star wanted level | $500 |
| 5 | DOCKSIDE TROUBLE — pistol fight with 3 thugs at the docks | $600 |
| 6 | THE BIG ONE — grab the case at Meridian Bank, lose 3 stars, get home | $1,500 |

Finish all six to become a **Neon Bay Legend**, then free-roam the city.

## Controls

- **WASD** — move / drive
- **SHIFT** — sprint
- **E** — enter / exit car
- **F** — punch
- **CLICK** — shoot (once you have the pistol)
- **SPACE** — handbrake
- **R** — retry mission
- **ESC / P** — pause
- **M** — mute
- **Drag mouse** — look around · **Wheel** — zoom

## The city

A 5×5-block city with 10 traffic cars and 16 pedestrians, a beach and a wooden pier along the south edge, the Meridian Bank, a hospital (where you wake up after getting wasted or busted), and your garage — home base. A tall gold beacon marks your objective from anywhere in the city; the arrow and distance at the top of the screen point the way.

**Wanted:** stealing a car, punching or shooting a bystander raises your heat. Police chase you; if one stays close while you are slow for 2 seconds, you are BUSTED. Get more than 45 m from every cop car and stay clean — a star fades every 20 seconds.

## Tech

- Three.js (vendored, `game/vendor/three.min.js`), plain static files, no network requests at runtime.
- All sound is synthesized with WebAudio — engine hum, two-tone sirens, gunshots, and a quiet synthwave bass loop. No audio files.
- Progress autosaves to `localStorage` (money, job, pistol).

## Structure

- `game/index.html` — the page, menus and HUD
- `game/style.css` — HUD and menu styling
- `game/src/config.js` — tuning constants and the six mission definitions
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — synthesized sound
- `game/src/world.js` — the city, the beach, the pier, the gold beacon
- `game/src/vehicles.js` — traffic, parked cars, the player car
- `game/src/people.js` — pedestrians and the dock thugs
- `game/src/police.js` — the chase, the bust, the heat decay
- `game/src/combat.js` — punching and the pistol
- `game/src/missions.js` — the six jobs, timers, rewards, restart
- `game/src/hud.js` — mission box, arrow, minimap, toasts, banners
- `game/src/main.js` — the game loop, the camera, save/load

## Screenshots

1. `1-chase.jpg` — JOB 6 bank-heist chase, 3★ wanted
2. `2-mission.jpg` — JOB 5 pistol fight at the docks
3. `3-drive.jpg` — JOB 2 timed delivery
4. `4-escape.jpg` — JOB 4 on-foot escape, 2★ wanted

Built for the [gta6-01 competition on make.fun](https://make.fun/competitions/gta6-01).
