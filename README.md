[![Neon Bay on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![Neon Bay rank](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/rank.svg)](https://make.fun/c/gta6-01)
[![Neon Bay reward](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/reward.svg)](https://make.fun/c/gta6-01)

# Neon Bay — open-world crime

A fan-made open-world crime game that runs offline in a desktop browser.
You play Dex Marlowe, a driver back in Neon Bay — a purple-sunset port city
of five-by-five blocks, a beach, and a police force that never sleeps.
Fixer Mara Voss has six jobs for you, from a quiet pickup at the south pier
to a bank heist. Finish them all and the city is yours.

Play it at the bounty page: https://make.fun/c/gta6-01

## What is in the city

- A 3D city built with Three.js (vendored, no network): roads, sidewalks,
  towers with lit windows and neon roof strips, a sandy beach, the sea, a
  wooden pier, and three landmarks — the garage, Meridian Bank, and
  St. Mercy Hospital
- Walk or drive: get into any parked or traffic car with E. Arcade handling
  with a handbrake, traffic cars driving their lanes (10 cars), pedestrians
  on the sidewalks (16) who run away when you speed toward them
- Wanted level 0–5 stars: one Bay PD patrol car per star. They chase, ram,
  and bust you if they catch you standing still. Stay more than 45 m away
  from every patrol car and the heat drops one star every 20 seconds
- Six chained story jobs with timers, a gold beacon marking the target,
  cash rewards ($200–$1,500), and free roam after the finale
- Combat: punch with F, shoot with a mouse click once you have the pistol
- HUD: cash, health bar, wanted stars, mission box with timer, speed,
  crosshair, a circular minimap, damage flash, and toasts
- Sound: everything synthesized in WebAudio — engine, two-tone sirens,
  gunshots, punches, crashes, cash, and a synthwave bass loop (M to mute)
- Menu, pause, WASTED / BUSTED screens with a $150 fine, and progress that
  autosaves to localStorage

## The six jobs

1. **FIRST PICKUP — $200.** Fetch Mara's package from the south pier and
   bring it home to the garage.
2. **HOT DELIVERY — $350.** A 100-second timed delivery to the buyer up north.
3. **BORROWED WHEELS — $400.** Steal any car on the street and bring it to
   the garage.
4. **LOSE THE HEAT — $500.** Shake a 2-star wanted level — stay out of sight
   until the heat dies down. A car helps.
5. **DOCKSIDE TROUBLE — $600.** A pistol fight: 3 of Kessler's boys at the
   docks. Shooting a thug won't bring the cops; shooting a bystander will.
6. **THE BIG ONE — $1,500.** Grab the case at the front door of Meridian
   Bank, lose 3 stars, reach the garage. The score.

## Controls

- **WASD** — walk / drive
- **SHIFT** — sprint on foot
- **E** — enter or exit a car (stealing a car raises your wanted level)
- **F** — punch
- **CLICK** — shoot (only with a pistol)
- **SPACE** — handbrake
- **Drag mouse** — look around · **Wheel** — zoom the camera
- **P / ESC** — pause · **R** — retry a failed job · **M** — mute

## How to run

Open `game/index.html` directly, or serve the repo root:

```
node serve.ts
```

then open http://localhost:8080. No network is needed — every file the game
uses lives under `game/`.

## How it is built

Eleven focused modules under `game/src/`, one job each:

- `main` — orchestrator, camera, player, save/load, and the debug hooks
  used by the test and screenshot tools
- `world` — the city, landmarks, beach, pier, and the gold beacon
- `vehicles` — cars, traffic AI, and the instanced car renderer
- `people` — pedestrians and the dock thugs
- `police` — chase, hold, ram, and bust behaviour
- `missions` — the six-job chain, timers, and rewards
- `combat` — punch and pistol, with one reused tracer line
- `hud` — HUD, circular minimap, toasts, and menus
- `input` — keyboard and mouse, cleared on every state change
- `audio` — synthesized WebAudio, no audio files
- `config` — all tuning numbers and mission data

plus `index.html` and `style.css`. Three.js is vendored under
`game/vendor/`; nothing loads over the network.

## License

MIT — see LICENSE. The city, characters, vehicles, story, art, and sound
are all original work made for this entry. Not affiliated with any
commercial game.
