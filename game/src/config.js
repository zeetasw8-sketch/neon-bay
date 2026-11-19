// Neon Bay — shared tuning and mission data.
// One place for every number the rest of the game reads: the city grid,
// the landmarks, the mission chain, the police and the combat balance.
// Nothing here imports anything else; every other module reads this.

export const WORLD = {
  // Streets run north-south and east-west at these coordinates.
  // Six streets make five blocks in each direction (5x5 city grid).
  streets: [-125, -75, -25, 25, 75, 125],
  streetHalf: 7,
  // The built city ends here; south of it is sand, then sea.
  edge: 132,
  sandTo: 152,
  seaAt: 152,
  // The wooden pier sticks out over the sea on this corridor.
  pierHalf: 8,
  pierEnd: 172,
  // Landmark centres.
  garage: { x: -100, z: -100 },
  bank: { x: 100, z: -100 },
  hospital: { x: -100, z: 100 },
  pier: { x: 0, z: 164 },
  buyer: { x: 50, z: -125 },
  // The bank pickup stands OUTSIDE the bank, in front of its south door,
  // so a player on foot or in a car can always reach it.
  bankPickup: { x: 100, z: -78 },
  bankPickupRadius: 10,
  // The garage yard counts as "home" from any side.
  garageRadius: 20,
  // Generic objective trigger radius.
  objectiveRadius: 7,
};

export const PLAYER = {
  walkSpeed: 6,
  sprintSpeed: 10,
  radius: 0.9,
  maxHealth: 100,
};

export const CAR = {
  maxSpeed: 30, // ~67 mph
  accel: 14,
  brake: 26,
  reverseMax: 9,
  turnRate: 1.9,
  drag: 0.55,
  handbrakeDrag: 3.2,
};

export const TRAFFIC = {
  cars: 10,
  cruiseMin: 7,
  cruiseMax: 12,
};

export const CROWD = {
  pedestrians: 16,
  walkMin: 1.1,
  walkMax: 2.0,
  fleeSpeed: 4.2,
};

export const POLICE = {
  topSpeed: 28,
  accel: 16,
  arrestDist: 5,
  arrestSeconds: 2,
  slowSpeed: 3,
  contactDamage: 15, // hp per second while touching the player
  spawnMin: 45,
  spawnMax: 70,
};

export const WANTED = {
  max: 5,
  decaySeconds: 20, // one star fades per 20 s without a fresh crime
  fine: 150,
};

export const COMBAT = {
  thugHp: 4, // v7 balance: tougher thugs
  punchDamage: 2, // two punches per thug
  pistolDamage: 4, // one shot kills one thug
  punchRange: 2.6,
  punchArc: 1.1, // radians of aim tolerance
  shootRange: 60,
  thugDamage: 8, // hp a thug hit deals
  thugHitCooldown: 1.1, // seconds between thug hits
  thugSpread: 5.0, // metres between thugs in the dock arc
  thugSpeed: 3.2,
};

export const LIGHT = {
  // Warm golden-hour dusk (v7 warm-up, parent approved).
  skyTop: 0x3a2350,
  skyBottom: 0xc97a3e,
  fog: 0x8a5a44,
  hemiSky: 0xffd9a0,
  hemiGround: 0x4a2e1e,
  hemiIntensity: 1.2,
  sunColor: 0xffc46b,
  sunIntensity: 2.1,
  beaconColor: 0xffb300,
  beaconOpacity: 0.85,
};

// The six jobs, in order. Mara Voss hands them out one after another.
// reward is paid when the job finishes; timer is 0 when there is none.
export const MISSIONS = [
  {
    id: 0,
    key: "pickup",
    title: "JOB 1 — FIRST PICKUP",
    name: "FIRST PICKUP",
    reward: 200,
    timer: 0,
    intro:
      "Dex. Mara here. A package is waiting at the end of the pier. " +
      "Pick it up and bring it home to the garage. No rush. No heat.",
    target: { x: WORLD.pier.x, z: WORLD.pier.z },
    targetName: "the pier",
    objective: "Pick up the package at the pier",
    deliver: "Bring the package home to the garage",
  },
  {
    id: 1,
    key: "delivery",
    title: "JOB 2 — HOT DELIVERY",
    name: "HOT DELIVERY",
    reward: 350,
    timer: 100,
    intro:
      "Good. Now take that package north to the buyer. One hundred " +
      "seconds, Dex. The buyer does not wait, and neither do I.",
    target: { x: WORLD.buyer.x, z: WORLD.buyer.z },
    targetName: "the buyer, north",
    objective: "Deliver the package to the buyer up north",
    deliver: "",
  },
  {
    id: 2,
    key: "steal",
    title: "JOB 3 — BORROWED WHEELS",
    name: "BORROWED WHEELS",
    reward: 400,
    timer: 0,
    intro:
      "I need a car, and I need it clean. Take any car you like and " +
      "bring it to the garage. Try not to make a scene.",
    target: { x: WORLD.garage.x, z: WORLD.garage.z },
    targetName: "the garage",
    objective: "Steal any car and bring it to the garage",
    deliver: "",
  },
  {
    id: 3,
    key: "escape",
    title: "JOB 4 — LOSE THE HEAT",
    name: "LOSE THE HEAT",
    reward: 500,
    timer: 0,
    startWanted: 2,
    intro:
      "The cops are on you, Dex. Two stars. Lose them. Stay out of " +
      "sight, keep moving, and do nothing stupid for a while.",
    target: { x: WORLD.garage.x, z: WORLD.garage.z },
    targetName: "the garage",
    objective: "Lose the heat — get your wanted level to zero",
    deliver: "",
  },
  {
    id: 4,
    key: "fight",
    title: "JOB 5 — DOCKSIDE TROUBLE",
    name: "DOCKSIDE TROUBLE",
    reward: 600,
    timer: 0,
    intro:
      "Three thugs are holding the docks. I left a pistol for you at " +
      "the pier. Take them down, all three, and the docks are ours.",
    target: { x: WORLD.pier.x, z: 145 },
    targetName: "the docks",
    objective: "Take down all three thugs at the docks",
    deliver: "",
  },
  {
    id: 5,
    key: "bank",
    title: "JOB 6 — THE BIG ONE",
    name: "THE BIG ONE",
    reward: 1500,
    timer: 240,
    intro:
      "This is it, Dex. The bank. Grab the case from the front steps, " +
      "then lose three stars of heat and get home. Four minutes. Go.",
    target: { x: WORLD.bankPickup.x, z: WORLD.bankPickup.z },
    targetName: "the bank",
    objective: "Grab the case at the bank, then lose the heat and get home",
    deliver: "Lose the heat, then reach the garage",
  },
];

export const SAVE_KEY = "neonbay-save-v1";

export const SHOT_LABELS = {
  chase: "3★ WANTED — BANK HEIST — POLICE CHASE — JOB 6: THE BIG ONE",
  mission: "PISTOL FIGHT — 3 THUGS — JOB 5: DOCKSIDE TROUBLE",
  drive: "TIMED DELIVERY — 100s — JOB 2: HOT DELIVERY",
  escape: "2★ WANTED — LOSE THE HEAT — JOB 4",
};
