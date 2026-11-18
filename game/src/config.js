// NEON BAY — configuration, city layout, story and mission definitions.
// Everything here is original: own city, names, characters and story.
'use strict';
const NB_CONFIG = {
  title: 'NEON BAY',
  cityName: 'Neon Bay',
  // City grid: roads every BLOCK+ROAD metres, blocks hold buildings.
  blockSize: 56, roadWidth: 14, blocks: 5, // city spans about -190..190
  worldBound: 205,
  seaZ: 218,            // beach + sea on the south edge
  playerStart: { x: 0, z: 120 },
  garage: { x: 0, z: 120 },       // Mara's garage / mission home base
  hospital: { x: -140, z: -140 },
  maxHealth: 100,
  saveKey: 'neonbay-save-v1',
  // Wanted tuning
  wantedDecaySeconds: 26,
  policeTopSpeed: [0, 26, 30, 34, 38, 42],
  // Traffic / pedestrians
  trafficCount: 10,
  pedCount: 16,
  // Colours
  carColors: [0xd23b3b, 0x3b7dd2, 0x3bd27a, 0xd2b13b, 0x8a3bd2, 0xd2d2d2, 0x222222, 0xd2691e, 0x2ec4b6, 0xe364a5],
};

// Seeded RNG so the city is identical every run (stable screenshots, fair play).
function NB_RNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Mission chain — six jobs from fixer Mara Voss.
const NB_MISSIONS = [
  {
    id: 'm1', title: 'JOB 1 — FIRST PICKUP',
    desc: 'Mara left a package at the pier. Walk to the gold beacon and pick it up, then bring it back to the garage.',
    target: { x: 150, z: 196, r: 6, label: 'Pier pickup' },
    home: true, reward: 200, timeLimit: 0,
    intro: 'MARA: "Dex. Package at the south pier. Don\'t open it, don\'t drop it, don\'t get cute."',
  },
  {
    id: 'm2', title: 'JOB 2 — HOT DELIVERY',
    desc: 'Deliver the package to the north-side buyer before the timer runs out. Drive — walking is too slow.',
    target: { x: -150, z: -150, r: 7, label: 'Buyer' },
    home: false, reward: 350, timeLimit: 100,
    intro: 'MARA: "Buyer\'s waiting up north. Ninety seconds of grace, then the price drops. Move."',
  },
  {
    id: 'm3', title: 'JOB 3 — BORROWED WHEELS',
    desc: 'Mara needs a clean car. Walk up to any parked or traffic car, press E to take it, and bring it to the garage.',
    target: null, home: true, reward: 400, timeLimit: 150, stealCar: true,
    intro: 'MARA: "I need wheels, no questions. Any car. Bring it to the garage and the keys are yours to keep."',
  },
  {
    id: 'm4', title: 'JOB 4 — LOSE THE HEAT',
    desc: 'The Bay PD is on you — 2 stars. Break line of sight and stay clean until your wanted level hits zero.',
    target: null, home: false, reward: 500, timeLimit: 150, forceWanted: 2,
    intro: 'MARA: "You tripped a camera, Dex. Two stars and counting. Lose them. Do NOT lead them to my garage."',
  },
  {
    id: 'm5', title: 'JOB 5 — DOCKSIDE TROUBLE',
    desc: 'Three of Kessler\'s boys are shaking down the docks. Deal with them — fists or the pistol. Watch your health.',
    target: { x: 150, z: 196, r: 14, label: 'Docks' },
    home: false, reward: 600, timeLimit: 0, thugs: 3, giveGun: true,
    intro: 'MARA: "Kessler\'s crew is taxing my docks. Take the pistol from the garage stash and sort it out."',
  },
  {
    id: 'm6', title: 'JOB 6 — THE BIG ONE',
    desc: 'Grab the case at the Meridian Bank, then lose a 3-star wanted level and reach the garage. This is the score.',
    target: { x: -70, z: -70, r: 7, label: 'Meridian Bank' },
    home: true, reward: 1500, timeLimit: 240, forceWantedAfterPickup: 3,
    intro: 'MARA: "The case. The bank. One run, no backup. Pull this off and you\'re a Neon Bay legend."',
  },
];
