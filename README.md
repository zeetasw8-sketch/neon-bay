[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![make.fun](https://make.fun/badge/entry.svg)](https://make.fun/c/gta6-01)
[![make.fun](https://make.fun/badge/open-world.svg)](https://make.fun/c/gta6-01)

# Neon Bay — open-world crime

An open-world crime game that runs in a desktop browser from its own files.
Built for the [make.fun GTA 6 bounty](https://make.fun/c/gta6-01).

You are **Dex Marlowe**, a wheelman with a teal jacket and a pink starter car.
**Mara Voss** has six jobs for you across a sunset city on the bay — from a
first pickup at the south pier to the big bank job. Steal cars, lose the heat,
fight at the docks, and get out clean.

## Play

Open `game/index.html` in desktop Chrome (or serve `game/` with any static
server). No network request is made while playing; every script, sound and
image is a file under `game/` or a `data:` URI.

- **WASD** move / drive · **E** enter & exit a car · **F** punch
- **Mouse click** shoot (once you have the pistol) · **SHIFT** sprint
- **SPACE** handbrake · **P / ESC** pause · **R** retry the job · **M** mute
- **Drag mouse** to look around · **wheel** to zoom

## The city

A 5×5 block grid with roads, sidewalks, lit windows and neon roof strips, a
sandy beach and the sea at the south edge, a wooden pier, and three landmarks:
the **garage** (home base), the **bank**, and the **hospital** (respawn point).
The sky stays a purple dusk with a low sunset over the bay. A gold beam in the
sky marks your objective from anywhere in the city; the round minimap shows
the roads, the sea, your garage, the bank, the hospital, traffic, police and
your objective.

## The six jobs

1. **First Pickup** — take the package at the south pier, return to the garage. $200
2. **Hot Delivery** — drive the package to the buyer in the north in 100 seconds. $350
3. **Borrowed Wheels** — steal any car and bring it to the garage. $400
4. **Lose the Heat** — wanted level 2: get more than 45 m away from every police car and stay clean until the stars fade. $500
5. **Dockside Trouble** — get the pistol and defeat 3 thugs at the pier. $600
6. **The Big One** — rob the bank (pick up the cash in front of the bank entrance), then escape to the garage with wanted level 0 in 240 seconds. $1500

After the sixth job the bay is yours: free roam.

## Wanted

Stealing a car, punching a pedestrian, or hitting one with a car raises your
wanted level. One Bay PD car hunts you per star. Police bust you if one stays
within 5 m while you move slower than 3 m/s for 2 seconds — so keep moving,
or hide behind the buildings until the stars fade (one per 20 seconds with no
police car within 45 m). Getting wasted or busted costs a $150 fine and wakes
you up at the hospital.

## Tech

Three.js (vendored under `game/vendor/`), one animation loop, clamped delta
time, pixel ratio capped at 2, simple Lambert/Basic materials, one sun light
with a 1024 shadow map frozen for statics, a few real point lights, merged
static geometry per city sector, no per-frame allocation in the hot loop, and
all audio synthesized with WebAudio — no audio files. Your cash and job are
saved automatically (localStorage) so CONTINUE resumes them.

A completely original game: its own city, characters, vehicles, names, story,
art, sounds and music. Nothing from any commercial game.
