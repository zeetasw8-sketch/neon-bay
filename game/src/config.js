// Neon Bay — tuning + data misi (v3, ditulis dari nol dari RESUBMIT-SPEC.md).
// Semua angka keseimbangan game tinggal di file ini, bukan tersebar di logika.

export const WORLD = {
  halfCity: 175,          // jalan terluar di x/z = +/-175
  roadWidth: 14,          // lebar tiap jalan
  roadLines: [-175, -105, -35, 35, 105, 175],
  blockCenters: [-140, -70, 0, 70, 140],
  blockSize: 56,
  beachStartZ: 182,       // pasir mulai di selatan kota
  seaStartZ: 208,         // laut mulai setelah pasir
  worldEdge: 400,         // batas bidang tanah/laut yang digambar
};

export const LANDMARKS = {
  garage:      { x: 0,    z: 120,  returnRadius: 24, building: { cx: 0, cz: 106, w: 22, d: 14, h: 9 } },
  bank:        { x: -70,  z: -70,  building: { cx: -70, cz: -70, w: 26, d: 22, h: 16 } },
  bankPickup:  { x: -70,  z: -54,  radius: 8 },   // di depan pintu masuk, di LUAR gedung
  hospital:    { x: 140,  z: 140,  respawn: { x: 140, z: 124 }, building: { cx: 140, cz: 140, w: 24, d: 18, h: 14 } },
  pierPickup:  { x: 150,  z: 196,  radius: 8 },   // di atas dermaga kayu, area terbuka
  buyer:       { x: -28,  z: -150, radius: 8 },   // pembeli di trotoar utara
  docks:       { x: 150,  z: 190 },
};

export const PLAYER = {
  walkSpeed: 4.6,
  sprintSpeed: 8.5,
  radius: 0.7,
  maxHealth: 100,
  punchDamage: 34,
  punchRange: 2.4,
  punchCooldown: 0.45,
  gunDamage: 34,
  gunRange: 60,
  gunCooldown: 0.28,
  deathFine: 150,
};

export const CAR = {
  accel: 13,
  brake: 22,
  reverseTop: 9,
  topSpeed: 32,          // ~72 mph
  turnRate: 1.9,         // radian/detik pada kecepatan penuh (diskalakan)
  grip: 6.5,
  radius: 2.4,
  stealHeat: 1,          // mencuri mobil menaikkan wanted 1
};

export const TRAFFIC = {
  count: 10,
  speedMin: 7,
  speedMax: 12,
  slowAheadDist: 13,
};

export const PEDS = {
  count: 16,
  walkSpeed: 1.4,
  fleeSpeed: 5.5,
  fleeRadius: 11,
};

export const POLICE = {
  chaseSpeed: 26,
  cruiseSpeed: 12,
  arrestDist: 5,         // harus sedekat ini untuk menangkap
  arrestStill: 3,        // pemain harus lebih lambat dari ini (m/s)
  arrestTime: 2,         // detik kontak untuk BUSTED
  ramDamage: 5,          // damage sekali sentuh ke pemain jalan kaki
  ramCooldown: 0.8,
  spawnDist: 45,
  standDownDist: 80,     // lebih jauh dari ini polisi berhenti mengejar
  heatQuietDist: 45,     // tidak ada polisi sedekat ini = panas bisa turun
  heatQuietTime: 20,     // detik tenang untuk turun 1 bintang
};

export const MISSIONS = [
  {
    id: 0, name: 'FIRST PICKUP', title: 'JOB 1 — FIRST PICKUP', reward: 200,
    intro: "Mara: Dex, welcome back. Fetch my package from the south pier, then bring it home to the garage.",
    stages: [
      { kind: 'go', phase: 'toPier', pos: { x: 150, z: 196 }, radius: 8, text: 'Pick up the package at the south pier', done: 'Package secured.' },
      { kind: 'pickup', phase: 'pickup', pos: { x: 150, z: 196 }, radius: 8, text: 'Grab the package', done: 'Package in hand. Back to the garage.' },
      { kind: 'go', phase: 'toHome', pos: { x: 0, z: 120 }, radius: 24, text: 'Bring the package back to the garage', done: 'Delivered.' },
    ],
  },
  {
    id: 1, name: 'HOT DELIVERY', title: 'JOB 2 — HOT DELIVERY', reward: 350, timeLimit: 100,
    intro: "Mara: 100 seconds. Take this to the buyer up north. Drive fast, don't ask questions.",
    stages: [
      { kind: 'go', phase: 'toBuyer', pos: { x: -28, z: -150 }, radius: 8, text: 'Deliver to the buyer up north — 100 seconds', done: 'Delivered on time.' },
    ],
  },
  {
    id: 2, name: 'BORROWED WHEELS', title: 'JOB 3 — BORROWED WHEELS', reward: 400,
    intro: "Mara: I need wheels. Steal any car on the street and bring it to the garage.",
    stages: [
      { kind: 'steal', phase: 'steal', text: 'Steal any car and bring it to the garage', done: 'Car secured.' },
      { kind: 'go', phase: 'toHome', pos: { x: 0, z: 120 }, radius: 300, text: 'Get the car moving toward the garage', done: 'On the way.' },
      { kind: 'go', phase: 'toHome', pos: { x: 0, z: 120 }, radius: 24, text: 'Bring the car to the garage', done: 'Nice ride.' },
    ],
  },
  {
    id: 3, name: 'LOSE THE HEAT', title: 'JOB 4 — LOSE THE HEAT', reward: 500, forceWanted: 2,
    intro: "Mara: You're hot — 2 stars. Get more than 45 meters from every cop and stay clean until the heat dies down. A car helps; on foot, cut across the blocks.",
    stages: [
      { kind: 'loseheat', phase: 'loseheat', text: 'Lose the heat — stay 45m+ from every cop until wanted is 0', done: 'Clean. They lost you.' },
    ],
  },
  {
    id: 4, name: 'DOCKSIDE TROUBLE', title: 'JOB 5 — DOCKSIDE TROUBLE', reward: 600, giveGun: true,
    intro: "Mara: Kessler's boys are waiting at the docks. Pistol's in your pocket — fists or bullets, your call. Shooting a thug won't bring the cops; shooting a bystander will.",
    stages: [
      { kind: 'thugs', phase: 'fight', count: 3, pos: { x: 150, z: 190 }, text: 'Deal with the 3 thugs at the docks', done: 'Docks are quiet again.' },
    ],
  },
  {
    id: 5, name: 'THE BIG ONE', title: 'JOB 6 — THE BIG ONE', reward: 1500, timeLimit: 240,
    intro: "Mara: The big one. Grab the case at the front door of Meridian Bank, lose the 3 stars, then reach the garage. The score.",
    forceWantedAfterPickup: 3, // wanted naik ke 3 SESUDAH case diambil, bukan sebelumnya
    stages: [
      { kind: 'go', phase: 'toBank', pos: { x: -70, z: -54 }, radius: 8, text: 'Grab the case at the bank front door', done: 'Got the case! Lose the cops…' },
      { kind: 'escape', phase: 'escape', pos: { x: 0, z: 120 }, radius: 24, text: 'Lose the 3 stars, then reach the garage', done: 'The score is ours.' },
    ],
  },
];

export const SAVE_KEY = 'neonbay-save-v3';

export const STARTER_CAR = {
  x: 14, z: 134, heading: Math.PI, color: 0xff5fa2, owned: false,
};

export const COLORS = {
  sky: 0x2a1a4e,        // senja ungu — dipertahankan di rebuild ini
  fog: 0x2a1a4e,
  sun: 0xffb36b,
  ground: 0x3a3f4a,
  road: 0x23242c,
  sidewalk: 0x4a4d58,
  sand: 0xc9a86a,
  sea: 0x1d4e6b,
  buildingGlass: 0x9fd8ff,
};
