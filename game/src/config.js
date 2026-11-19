// Neon Bay — tuning and mission data.
// This file is pure data plus two tiny lookups. Nothing here runs the game:
// it is read by the world, vehicle, police, mission and HUD modules.

// missionById returns the definition for one of the six jobs (0-based).
function missionById(id) {
  return NBConfig.missions[id];
}

// missionReward returns the dollar reward of one job (0-based).
function missionReward(id) {
  return NBConfig.missions[id].reward;
}

var NBConfig = {

  // ---- city geometry (metres; x east, z south) ----
  cityHalf: 200,
  blocks: 5,          // 5x5 blocks
  blockSize: 70,      // block pitch
  roadWidth: 14,
  roadAt: [-175, -105, -35, 35, 105, 175],
  garage: { x: 0, z: 120, w: 34, d: 20 },
  bank: { x: -70, z: -70, w: 26, d: 22 },
  hospital: { x: 140, z: -92 },
  pier: { x: 150, z: 196 },     // south pier pickup, ~168 m from spawn
  seaWallZ: 206,                // water begins beyond this z
  pierMinX: 143, pierMaxX: 157, // pier corridor may run to z 209
  pierTipZ: 209,
  spawn: { x: 0, z: 108 },
  respawn: { x: 140, z: -92 },  // hospital door

  // ---- player ----
  walkSpeed: 6,            // m/s on foot
  runSpeed: 9,             // m/s while Shift held
  playerHealth: 100,
  maxHealth: 100,
  punchRange: 3,           // metres
  punchDamage: 2,          // 2 punches down a thug (HP 4)
  pistolDamage: 4,         // 1 shot down a thug (HP 4)
  punchCooldown: 0.42,     // seconds
  shootCooldown: 0.38,     // seconds
  gunRange: 60,
  bulletSpread: 0.012,

  // ---- cars ----
  carMaxSpeed: 38,         // m/s, ~85 mph
  carAccel: 16,
  carReverseMax: 10,
  carSteer: 1.9,
  carGrip: 0.86,
  carRadius: 2.3,
  carEnterRange: 4,
  trafficCount: 10,
  carCost: 800,

  // ---- pedestrians / thugs ----
  pedCount: 16,
  pedSpeed: 1.4,
  thugHealth: 4,
  thugDamage: 5,           // per hit
  thugCooldown: 1.4,       // seconds between hits
  thugChaseRange: 35,      // metres; only then do they approach
  thugSpread: 5.0,         // min distance thugs keep from each other (wide arc)

  // ---- police ----
  copWalkSpeed: 11,        // m/s on foot — faster than a walking player
  copCarSpeed: 18,         // m/s in a cruiser
  copGiveUpFoot: 80,       // metres: give up on foot beyond this
  copGiveUpCar: 180,       // metres: give up in a car beyond this
  copSpawnFoot: 70,        // metres away on foot
  copSpawnCar: 140,        // metres away in a car
  bustRange: 5,            // metres
  bustStill: 3,            // player speed under this counts as still
  bustHold: 2,             // seconds inside range while still = BUSTED
  contactDamage: 8,        // hp per second a cop stays in contact
  heatDecay: 22,           // clean seconds (no cop within 45 m) per -1 star
  heatCheckRange: 45,
  maxWanted: 3,
  fine: 150,               // paid on WASTED and on BUSTED

  // ---- money ----
  startCash: 0,

  // ---- missions (title, Mara's line, reward) ----
  missions: [
    {
      id: 0, title: 'FIRST PICKUP', reward: 200,
      intro: "Mara: Dex, pick up my package at the south pier. Follow the gold beacon.",
      start: 'Pick up the package at the south pier',
      complete: 'Package secured. Back to the garage.',
      pickup: { x: 150, z: 196, r: 8 },
      drop: { x: 0, z: 120, r: 22 },
      target: null
    },
    {
      id: 1, title: 'HOT DELIVERY', reward: 350, timer: 100,
      intro: 'Mara: Hot cargo, Dex. 100 seconds to the drop. Drive like you mean it.',
      start: 'Pick up the hot cargo at the garage',
      complete: 'Deliver it to the drop-off — 100 seconds!',
      pickup: { x: 0, z: 120, r: 12 },
      drop: { x: 35, z: -160, r: 12 },
      target: { x: 35, z: -160, label: 'DROP-OFF' }
    },
    {
      id: 2, title: 'BORROWED WHEELS', reward: 400,
      intro: 'Mara: I need wheels, Dex. Borrow any car on the street and bring it home.',
      start: 'Steal any car and bring it to the garage',
      complete: 'The car is ours. Back to the garage.',
      pickup: null, drop: { x: 0, z: 120, r: 22 },
      target: null
    },
    {
      id: 3, title: 'LOSE THE HEAT', reward: 500, timer: 150, forceWanted: 2,
      intro: 'Mara: Two stars, Dex. Get more than 45 metres from every cop and stay clean.',
      start: 'Lose the cops — stay clean until the heat dies',
      complete: 'Heat is gone. Back to the garage.',
      pickup: null, drop: { x: 0, z: 120, r: 22 },
      target: null
    },
    {
      id: 4, title: 'DOCKSIDE TROUBLE', reward: 600,
      intro: 'Mara: Three thugs are shaking down my pier crew. Sort them out, Dex.',
      start: 'Deal with the three thugs at the docks',
      complete: 'Docks are clear. Back to the garage.',
      pickup: null, drop: { x: 0, z: 120, r: 22 },
      target: { x: 150, z: 178, label: 'DOCKS' },
      thugs: [
        { x: 140, z: 180 }, { x: 155, z: 185 }, { x: 150, z: 170 }
      ]
    },
    {
      id: 5, title: 'THE BIG ONE', reward: 1500, timer: 240,
      intro: 'Mara: The big one, Dex. Grab the case at the bank, then get home CLEAN.',
      start: 'Grab the case at the bank',
      complete: 'Case secured. Get home with NO wanted stars.',
      pickup: { x: -70, z: -54, r: 8 },  // in front of the bank entrance
      drop: { x: 0, z: 120, r: 22 },
      target: { x: -70, z: -54, label: 'BANK' }
    }
  ],

  // ---- screenshot labels (exact wording, one honest label per shot) ----
  shotLabels: {
    chase: '3★ WANTED — BANK HEIST — POLICE CHASE — JOB 6: THE BIG ONE',
    mission: 'PISTOL FIGHT — 3 THUGS — JOB 5: DOCKSIDE TROUBLE',
    drive: 'TIMED DELIVERY — 100s — JOB 2: HOT DELIVERY',
    escape: '2★ WANTED — LOSE THE HEAT — JOB 4'
  },

  // ---- dusk look (static warm golden-hour sunset, no day/night cycle) ----
  // v6 warm-up (parent decision): golden, sun-soaked, still dusk.
  sky: 0x4a2438,
  fog: 0x4a2438,
  hemiSky: 0xd8b48a, hemiGround: 0x3a2620, hemiIntensity: 1.2,
  sunColor: 0xffc46b, sunIntensity: 2.1,
  sunPos: { x: 60, y: 40, z: -80 }
};

window.NBConfig = NBConfig;
window.NB_CONFIG = NBConfig;
