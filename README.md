[![Neon Bay — gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Neon Bay rank](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Neon Bay reward](https://make.fun/badge/gta6-01/zeetasw8-sketch/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Bay

Six jobs. One city. Three stars of heat. Steal the case, lose the cops, get home.

Neon Bay is an open-world crime game: drive and walk a 5×5-block city at sunset, take six jobs from your fixer Mara Voss, and outrun the police. The city is a 400×400 m grid of streets, towers, neon signs and a south pier over dark water, lit by a warm golden-hour dusk that never changes. You start on foot at your garage with $0 and no car — everything after that you earn, borrow or steal.

Built for the [gta6-01 bounty on make.fun](https://make.fun/bounty/gta6-01).

## How to play

Open `game/index.html` in a desktop browser (or serve the `game/` folder with any static file server). Click **START** for a new game or **CONTINUE** to pick up your save.

| Key | Action |
| --- | --- |
| WASD / arrows | Move (on foot) or drive (in a car) |
| SHIFT | Run |
| E | Enter / exit a car |
| F or CLICK | Punch (CLICK shoots once you have the pistol) |
| DRAG | Look around (orbit camera) |
| WHEEL | Zoom the camera |
| M | Mute |

Follow the gold beacon and the ⬆ arrow at the top of the screen — it always points at your current objective, with the distance in metres. The minimap (top-right) shows you as a white arrow, the objective as a gold ring, police as red dots and thugs as orange dots. Lose the cops by getting more than 45 m from every cop and staying clean: the heat drops one star every 22 seconds. Get caught standing still within 5 m of a cop for 2 seconds and you are BUSTED; run out of health and you are WASTED. Either way you lose $150 and wake up at the hospital — Continue always respawns you at full health, never half-dead.

## Jobs — six jobs, $3,550 total

1. **FIRST PICKUP — $200.** Pick up Mara's package at the south pier (follow the gold beacon, ~168 m from the garage) and bring it home.
2. **HOT DELIVERY — $350, 100 s.** A hot cargo run to the north drop-off. Drive like you mean it.
3. **BORROWED WHEELS — $400.** Steal any car on the street and bring it to the garage. (Stealing a car raises your wanted level by one star.)
4. **LOSE THE HEAT — $500, 150 s.** Two stars and the whole force on you. Get clean and stay clean until the heat dies.
5. **DOCKSIDE TROUBLE — $600.** Three thugs are shaking down Mara's pier crew. Mara hands you a pistol — sort them out, then come home.
6. **THE BIG ONE — $1,500, 240 s.** Grab the case at the bank (the alarm trips three stars the moment you take it), then get home with NO wanted stars.

## Systems

- **Driving** — arcade car physics (accelerate, brake/reverse, handbrake, steering that flips in reverse), traffic that follows its lane and stops at red lights, and parked cars to steal.
- **Police** — one cop per wanted star (on foot at 1★, cruisers with flashing light bars at 2–3★). They chase, give up beyond 80 m on foot / 180 m in a car, deal contact damage, and bust you if you stand still near them.
- **Combat** — fists (3 punches drop a thug) and a pistol (2 shots). Shooting a pedestrian raises your wanted level; missing, or hitting a thug, does not.
- **City** — 5×5 blocks, a bank, a hospital (your respawn), your garage, a pier, neon signs, street lamps, palms and a sea wall. The gold beacon marks the objective; the minimap tracks everything.
- **Sound** — everything is synthesised live with WebAudio: engine, siren, gunshots, punches, crashes, cash and a synthwave bass loop. No audio files.
- **Save** — progress (cash, jobs done, the pistol) is saved to localStorage on every payout and after every fine. The fine is always taken before the save is written.

## Screenshots

- **1-chase — the cover.** Job 6 at 3★ wanted: three police cruisers closing in a V formation, the gold beacon over the bank case, the minimap with its objective ring, the mission box and the speedometer, all in one frame.
- **2-mission.** Job 5 at the docks: Dex on foot with the pistol out and the crosshair up, the three thugs spread in an arc around him instead of piling on top of him.
- **3-drive.** Job 2 mid-delivery: the car accelerating with the speedometer climbing and the 100-second timer running in the mission box.
- **4-escape.** Job 4 on foot at 2★ wanted: Dex running with a police cruiser in frame and the gold beacon kept small in the shot.

## Tech

- Three.js (UMD build, vendored) + plain classic scripts, no build step, no dependencies to install.
- `game/src/` holds one module per system: config, input, audio, world, vehicles, people, police, combat, missions, hud, main.
- `main.ts` copies `game/` and `screenshots/` into the output directory and writes `dossier.json`.
