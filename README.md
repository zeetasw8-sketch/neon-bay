# NEON BAY — open-world crime

An original open-world crime game that runs offline in a desktop browser.
You are Dex Marlowe, back in the sunset city of Neon Bay with nothing but a
phone number. Fixer Mara Voss has six jobs for you — from a quiet pickup at
the south pier to a bank heist — and the Bay PD is always one bad decision
away.

## What's in the city

- A 5×5-block 3D city (Three.js, vendored) with roads, sidewalks, lit
  towers, a beach, sea and pier, plus garage, bank and hospital landmarks
- Walk or drive: take any parked or traffic car, arcade handling with
  handbrake, traffic AI on the road lanes, pedestrians who flee
- Wanted system (0–5 stars): one police car per star, chase and ram, bust
  if they catch you slow; heat decays when you stay out of sight
- Six chained story missions with timers, a gold beacon, rewards and
  free roam after the finale
- Combat: punch (F) and pistol (click, after the pistol job)
- HUD: cash, health, wanted stars, mission box + timer, speed, crosshair,
  circular minimap; damage flash and toasts
- Sound: everything synthesized in WebAudio — engine, sirens, gunshots,
  crashes, cash and a synthwave loop (M to mute)
- Start / continue / pause screens; progress autosaves to localStorage

## Controls

WASD move / drive · SHIFT sprint · E enter or exit car · F punch ·
CLICK shoot · SPACE handbrake · M mute · ESC pause · R retry mission ·
drag mouse to look, wheel to zoom

## How to run

Open `game/index.html` directly, or serve the repo root:

```
node serve.ts
```

then open http://localhost:8080. No network needed — every file the game
uses lives under `game/`.

## License

MIT — see LICENSE. All city, characters, vehicles, story, art and sound
are original work made for this entry.
