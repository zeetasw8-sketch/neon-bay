// Neon Bay — shared tuning constants and mission data (v5 rebuild).
// Every number below comes from the prose spec and the Chrome-review fix
// notes: the city grid, the landmark positions, the D1-D8 fixes and the
// arrow rules. Nothing here is copied from an earlier build.

export const NB_CONFIG = {
  maxHealth: 100,
  maxWanted: 5,
  fine: 150,

  // --- player on foot ---
  walkSpeed: 4.6,
  sprintSpeed: 8.5,
  playerRadius: 0.6,

  // --- cars (arcade) ---
  carTopSpeed: 32, // m/s, about 72 mph on the HUD
  carAccel: 12,
  carBrake: 22,
  carReverseTop: 8,
  carTurn: 1.9, // rad/s at full steer
  enterRadius: 8, // E works from this far (D7)

  // --- world ---
  worldHalf: 226, // minimap maps -226..226 onto the R=84 circle
  roadHalf: 7, // roads are 14 m wide
  roadLines: [-175, -105, -35, 35, 105, 175],
  blockPitch: 70,
  blockHalf: 28, // blocks are 56 m across
  shoreZ: 206, // invisible wall: the sea starts here (D2)
  pierCorridor: { x0: 143, x1: 157, zMax: 209 }, // the pier stays walkable

  // --- landmarks ---
  garage: { x: 0, z: 120, r: 24 }, // home base, finish radius > half width
  garageSpawn: { x: 0, z: 120 },
  bank: { x: -70, z: -70, w: 26, d: 22 },
  bankPickup: { x: -70, z: -54, r: 8 }, // OUTSIDE the bank, in front of it
  pierPickup: { x: 150, z: 196, r: 8 },
  buyer: { x: 35, z: -175, r: 24 }, // far north end of the avenue
  hospital: { x: 140, z: 140 },
  docks: { x: 150, z: 190 }, // where the JOB 5 thugs wait
  starterCar: { x: 18, z: 142 }, // pink starter car, by the garage

  // --- police ---
  policeSpawnDist: 70, // far enough that a bust takes >8 s to land
  policeTopSpeed: 11,
  policeBustDist: 5,
  policeBustSpeed: 3, // player must be slower than this to be busted
  policeBustTime: 2,
  policeContactDps: 10, // low enough that BUSTED lands before death
  policeLoseDist: 45, // farther than this, heat starts to fade
  wantedDecaySeconds: 20, // one star per 20 s while clean and far

  // --- combat ---
  thugHp: 3,
  thugCount: 3,
  punchDamage: 2,
  punchRange: 2.6,
  pistolDamage: 3,
  thugPunchDamage: 5,
  thugChaseDist: 35,
  thugSpeed: 3.4,

  // --- traffic / pedestrians (counts stay as specced) ---
  trafficCount: 10,
  pedCount: 16,

  // --- camera ---
  camDistDefault: 9,
  camDistMin: 5,
  camDistMax: 16,
  camPitchDefault: 0.32,
  camPitchMin: 0.08,
  camPitchMax: 1.1,
  camSmoothK: 7, // exponential smoothing rate for the camera yaw
  camPosK: 10, // exponential smoothing rate for the camera position
  dragSensitivity: 0.015, // rad per pixel of mouse drag

  // --- beacon (D1) ---
  beaconHeight: 260,
  beaconRadiusTop: 7,
  beaconRadiusBottom: 9,
  beaconColor: 0xffb300, // saturated deep gold, NormalBlending
  beaconOpacity: 0.85,
  beaconFadeNear: 12, // camera closer than this: fully faded
  beaconFadeFar: 47, // camera farther than this: full strength

  // --- lighting (D6: dusk that stays readable) ---
  skyColor: 0x2b1748, // static purple dusk, no day/night cycle
  hemiIntensity: 1.05,
  sunIntensity: 1.9,
  fogColor: 0x2b1748,

  // --- missions ---
  missions: [
    {
      title: 'JOB 1 — FIRST PICKUP',
      reward: 200,
      intro: 'Mara: "Dex. First job. A package is waiting on the south pier. Bring it back to the garage — no questions, no cops."',
      stages: [
        { phase: 'toPier', text: 'Pick up the package at the south pier. Follow the gold beacon.', x: 150, z: 196, r: 8 },
        { phase: 'toHome', text: 'Package secured. Back to the garage.', x: 0, z: 120, r: 24 },
      ],
    },
    {
      title: 'JOB 2 — HOT DELIVERY',
      reward: 350,
      timer: 100, // the text must say 100 s, never 90
      intro: 'Mara: "Hot delivery, Dex. A buyer is waiting at the far north end of the avenue. 100 seconds — drive, don\'t walk."',
      stages: [
        { phase: 'toBuyer', text: 'Deliver the package to the buyer at the far north end. 100 seconds!', x: 35, z: -175, r: 24 },
      ],
    },
    {
      title: 'JOB 3 — BORROWED WHEELS',
      reward: 400,
      intro: 'Mara: "We need wheels. Any car will do — take one and bring it to the garage."',
      stages: [
        { phase: 'steal', text: 'Steal any car. If you are already driving one, it counts.' },
        { phase: 'toHome', text: 'Bring the car to the garage.', x: 0, z: 120, r: 24, needCar: true },
      ],
    },
    {
      title: 'JOB 4 — LOSE THE HEAT',
      reward: 500,
      forceWanted: 2,
      intro: 'Mara: "Two stars, Dex. Lose them. Get more than 45 metres from every cop car and stay clean — a star fades every 20 seconds."',
      stages: [
        { phase: 'loseheat', text: 'Lose the heat: stay over 45 m from all police and stay clean. Stars fade one per 20 s.' },
      ],
    },
    {
      title: 'JOB 5 — DOCKSIDE TROUBLE',
      reward: 600,
      giveGun: true,
      thugs: 3,
      intro: 'Mara: "Three punks are shaking down the docks. Here — take the pistol. CLICK to shoot, F to punch."',
      stages: [
        { phase: 'fight', text: 'Deal with the 3 thugs at the docks. Pistol or fists.', x: 150, z: 190, r: 30 },
      ],
    },
    {
      title: 'JOB 6 — THE BIG ONE',
      reward: 1500,
      timer: 240,
      forceWantedAfterPickup: 3,
      intro: 'Mara: "The big one, Dex. Grab the case at Meridian Bank — the pickup is right outside the front door — then lose the heat and get home. 240 seconds."',
      stages: [
        { phase: 'toBank', text: 'Grab the case at Meridian Bank. The pickup is outside the front door.', x: -70, z: -54, r: 8 },
        { phase: 'escape', text: 'Case grabbed! Lose the 3 stars, then reach the garage. The job only counts when you are home AND clean.', x: 0, z: 120, r: 24, needClean: true },
      ],
    },
  ],
};

// Tiny deterministic RNG so the city layout is identical every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist2d(x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  return Math.sqrt(dx * dx + dz * dz);
}
