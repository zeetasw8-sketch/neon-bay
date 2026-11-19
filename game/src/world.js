// Neon Bay — the 3D city (v5 rebuild).
// A 5x5-block city on a 70 m grid, roads at -175/-105/-35/35/105/175,
// a beach and sea along the south edge, a wooden pier, and three landmarks:
// the open garage carport (home base), Meridian Bank, and the hospital.
// Dusk is static purple (no day/night cycle); the gold beacon marks the
// active objective and renders through buildings.

import { NB_CONFIG as C, mulberry32, clamp, dist2d } from './config.js';

function makeWindowTexture(seed) {
  const rnd = mulberry32(seed);
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#232733';
  g.fillRect(0, 0, 128, 256);
  // Facade panel lines.
  g.fillStyle = '#1b1e28';
  for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 128, 2);
  // Window grid: some lit warm, some lit cool, most dark.
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const x = 8 + col * 20, y = 8 + row * 20;
      const r = rnd();
      if (r < 0.42) g.fillStyle = '#ffd76a'; // warm lit
      else if (r < 0.58) g.fillStyle = '#7ab8ff'; // cool lit
      else g.fillStyle = '#10121a'; // dark
      g.fillRect(x, y, 12, 12);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture() {
  const S = 1024, half = 210;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const px = (m) => ((m + half) / (half * 2)) * S;
  // Block interiors.
  g.fillStyle = '#171a21';
  g.fillRect(0, 0, S, S);
  // Sidewalks (a pale border around every road).
  g.fillStyle = '#2c2f38';
  for (const L of C.roadLines) {
    g.fillRect(px(L - 10.5), 0, px(L + 10.5) - px(L - 10.5), S);
    g.fillRect(0, px(L - 10.5), S, px(L + 10.5) - px(L - 10.5));
  }
  // Roads.
  g.fillStyle = '#0e0f13';
  for (const L of C.roadLines) {
    g.fillRect(px(L - 7), 0, px(L + 7) - px(L - 7), S);
    g.fillRect(0, px(L - 7), S, px(L + 7) - px(L - 7));
  }
  // Dashed centre lines.
  g.fillStyle = '#c8a84a';
  for (const L of C.roadLines) {
    for (let m = -200; m < 210; m += 16) {
      g.fillRect(px(L) - 1, px(m), 2, px(m + 8) - px(m));
      g.fillRect(px(m), px(L) - 1, px(m + 8) - px(m), 2);
    }
  }
  // Beach sand along the south edge (z 175..210).
  g.fillStyle = '#8a6f4d';
  g.fillRect(0, px(175), S, S - px(175));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createWorld() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(C.skyColor);
  scene.fog = new THREE.Fog(C.fogColor, 120, 520);

  const hemi = new THREE.HemisphereLight(0x8a7bd8, 0x3a3f4a, C.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, C.sunIntensity);
  sun.position.set(-120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x40355e, 0.55));

  // --- shared materials / geometries ---
  const winTex = [makeWindowTexture(11), makeWindowTexture(23), makeWindowTexture(37)];
  const facadePalette = [0x8a7f8d, 0x6b7a8d, 0x7d6b5a, 0x5a6b7d, 0x8d6b7a, 0x707a6b];
  const neonPalette = [0x00e5ff, 0xff2ea6, 0xffa726, 0x7CFC00, 0xff5252];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const colliders = []; // {x0,z0,x1,z1}

  function addCollider(x, z, w, d) {
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
  }

  // --- ground, beach, sea, pier ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(460, 90),
    new THREE.MeshLambertMaterial({ color: 0x0d3b5c, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, 251);
  scene.add(sea);

  // Wooden pier: planks + posts, x 143..157, z 192..209.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const pierDeck = new THREE.Mesh(boxGeo, pierMat);
  pierDeck.scale.set(14, 0.6, 18);
  pierDeck.position.set(150, 0.35, 200);
  scene.add(pierDeck);
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 2.4, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x4a3220 });
  for (const px of [145, 155]) {
    for (const pz of [194, 200, 206]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, 0.4, pz);
      scene.add(post);
    }
  }

  // --- buildings ---
  const rnd = mulberry32(20261119);
  const blockCenters = [];
  for (const bx of [-140, -70, 0, 70, 140]) {
    for (const bz of [-140, -70, 0, 70, 140]) blockCenters.push([bx, bz]);
  }
  let tallest = null;

  function addBuilding(x, z, w, d, h, texIdx, tint, opts = {}) {
    const mat = new THREE.MeshLambertMaterial({
      map: winTex[texIdx % 3],
      emissiveMap: winTex[texIdx % 3],
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55,
      color: tint,
    });
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, h / 2, z);
    scene.add(m);
    addCollider(x, z, w, d);
    // Neon roof strip on some roofs.
    if (opts.neon) {
      const strip = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({ color: neonPalette[Math.floor(rnd() * neonPalette.length)] }),
      );
      strip.scale.set(w * 0.9, 0.35, 0.5);
      strip.position.set(x, h + 0.2, z - d / 2 + 0.4);
      scene.add(strip);
    }
    // Inset rooftop box on tall towers.
    if (h >= 18) {
      const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2a2e38 }));
      roof.scale.set(w * 0.4, 2.2, d * 0.4);
      roof.position.set(x, h + 1.1, z);
      scene.add(roof);
    }
    if (!tallest || h > tallest.h) tallest = { x, z, h };
    return m;
  }

  for (const [bx, bz] of blockCenters) {
    // Landmark blocks get only their landmark.
    if (bx === 0 && bz === 140) continue; // garage block
    if (bx === -70 && bz === -70) continue; // bank block
    if (bx === 140 && bz === 140) continue; // hospital block
    const two = rnd() < 0.4;
    if (two) {
      addBuilding(bx - 12, bz - 9, 13 + rnd() * 5, 13 + rnd() * 5, 8 + rnd() * 16,
        Math.floor(rnd() * 3), facadePalette[Math.floor(rnd() * facadePalette.length)],
        { neon: rnd() < 0.4 });
      addBuilding(bx + 12, bz + 9, 13 + rnd() * 5, 13 + rnd() * 5, 8 + rnd() * 16,
        Math.floor(rnd() * 3), facadePalette[Math.floor(rnd() * facadePalette.length)],
        { neon: rnd() < 0.4 });
    } else {
      addBuilding(bx + (rnd() - 0.5) * 10, bz + (rnd() - 0.5) * 10,
        16 + rnd() * 9, 16 + rnd() * 9, 8 + rnd() * 20,
        Math.floor(rnd() * 3), facadePalette[Math.floor(rnd() * facadePalette.length)],
        { neon: rnd() < 0.45 });
    }
  }

  // Antenna on the tallest tower.
  if (tallest) {
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 9, 5),
      new THREE.MeshBasicMaterial({ color: 0xff5252 }),
    );
    ant.position.set(tallest.x, tallest.h + 4.5, tallest.z);
    scene.add(ant);
  }

  // --- garage: an open carport (no collision — the player stands inside it) ---
  const garageMat = new THREE.MeshLambertMaterial({ color: 0x3a4a5a });
  const garageRoof = new THREE.Mesh(boxGeo, garageMat);
  garageRoof.scale.set(34, 1.2, 20);
  garageRoof.position.set(0, 7.5, 120);
  scene.add(garageRoof);
  const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 7.5, 8);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x55606e });
  for (const [px, pz] of [[-15, 112], [15, 112], [-15, 128], [15, 128]]) {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(px, 3.75, pz);
    scene.add(p);
  }
  const garageSign = new THREE.Mesh(
    boxGeo, new THREE.MeshBasicMaterial({ color: 0x00e5ff }),
  );
  garageSign.scale.set(10, 1.6, 0.4);
  garageSign.position.set(0, 8.6, 110.2);
  scene.add(garageSign);
  // A low pad marking the home base.
  const pad = new THREE.Mesh(
    boxGeo, new THREE.MeshLambertMaterial({ color: 0x2e4a3a }),
  );
  pad.scale.set(34, 0.15, 20);
  pad.position.set(0, 0.08, 120);
  scene.add(pad);

  // --- Meridian Bank (26 x 22) ---
  addBuilding(C.bank.x, C.bank.z, C.bank.w, C.bank.d, 14, 1, 0x9a8f7a, { neon: true });
  const bankSign = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: 0xffd76a }));
  bankSign.scale.set(14, 1.4, 0.4);
  bankSign.position.set(C.bank.x, 12.5, C.bank.z + C.bank.d / 2 + 0.3);
  scene.add(bankSign);

  // --- Hospital (140,140) with a red cross ---
  addBuilding(C.hospital.x, C.hospital.z, 24, 18, 12, 2, 0xd8d8d8, {});
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const crossV = new THREE.Mesh(boxGeo, crossMat);
  crossV.scale.set(1.6, 5, 0.5);
  crossV.position.set(C.hospital.x, 14, C.hospital.z + 9.3);
  scene.add(crossV);
  const crossH = new THREE.Mesh(boxGeo, crossMat);
  crossH.scale.set(5, 1.6, 0.5);
  crossH.position.set(C.hospital.x, 14, C.hospital.z + 9.3);
  scene.add(crossH);

  // --- street lamps along the roads ---
  const lampPoleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6);
  const lampPoleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f38 });
  const lampHeadGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 12; i++) {
    const vertical = i % 2 === 0;
    const line = C.roadLines[i % 6];
    const along = -140 + (i * 53) % 280;
    const x = vertical ? line + 9.5 : along;
    const z = vertical ? along : line + 9.5;
    const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
    pole.position.set(x, 3.25, z);
    scene.add(pole);
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(x, 6.6, z);
    scene.add(head);
  }

  // --- palms near the beach ---
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 5, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const crownGeo = new THREE.ConeGeometry(2.2, 2.6, 7);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
  for (let i = 0; i < 8; i++) {
    const x = -170 + i * 48 + (rnd() - 0.5) * 10;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 2.5, 182);
    scene.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 6, 182);
    scene.add(crown);
  }

  // --- the gold beacon (D1) ---
  const beaconMat = new THREE.MeshBasicMaterial({
    color: C.beaconColor,
    transparent: true,
    opacity: C.beaconOpacity,
    blending: THREE.NormalBlending, // additive would wash the gold to white
    depthTest: false, // renders through buildings
    fog: false,
    side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(C.beaconRadiusTop, C.beaconRadiusBottom, C.beaconHeight, 16, 1, true),
    beaconMat,
  );
  beacon.position.set(C.pierPickup.x, C.beaconHeight / 2, C.pierPickup.z);
  beacon.renderOrder = 999;
  scene.add(beacon);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffb300, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 6, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(C.pierPickup.x, 0.15, C.pierPickup.z);
  scene.add(ring);

  const world = {
    scene,
    beacon,
    ring,
    colliders,
    objective: { x: C.pierPickup.x, z: C.pierPickup.z },
    _time: 0,

    objectivePos() {
      return { x: this.objective.x, z: this.objective.z };
    },

    setObjective(x, z) {
      this.objective.x = x;
      this.objective.z = z;
      this.beacon.position.set(x, C.beaconHeight / 2, z);
      this.ring.position.set(x, 0.15, z);
    },

    // Circle vs building AABBs: push the circle out to the nearest edge.
    collideCircle(x, z, r) {
      for (const b of colliders) {
        const cx = clamp(x, b.x0, b.x1);
        const cz = clamp(z, b.z0, b.z1);
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          x += dx * push;
          z += dz * push;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = x - b.x0, pr = b.x1 - x, pt = z - b.z0, pb = b.z1 - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.x0 - r;
          else if (m === pr) x = b.x1 + r;
          else if (m === pt) z = b.z0 - r;
          else z = b.z1 + r;
        }
      }
      return { x, z };
    },

    // Shore wall (D2): the sea is blocked, except the pier corridor.
    clampShore(x, z) {
      const inPier = x >= C.pierCorridor.x0 && x <= C.pierCorridor.x1;
      const maxZ = inPier ? C.pierCorridor.zMax : C.shoreZ;
      if (z > maxZ) z = maxZ;
      if (z < -210) z = -210;
      if (x < -210) x = -210;
      if (x > 210) x = 210;
      return { x, z };
    },

    update(game, dt) {
      this._time += dt;
      // Beacon fade by CAMERA distance to the column axis (r3 fix): a solid
      // gold wall must never cover the screen when the camera is inside it.
      const cam = game._camPos;
      const d = dist2d(cam.x, cam.z, this.beacon.position.x, this.beacon.position.z);
      let fade = 1;
      if (d <= C.beaconFadeNear) fade = 0;
      else if (d < C.beaconFadeFar) fade = (d - C.beaconFadeNear) / (C.beaconFadeFar - C.beaconFadeNear);
      beaconMat.opacity = C.beaconOpacity * fade;
      // Gentle breathing via scale only — opacity stays readable for probes.
      const s = 1 + 0.03 * Math.sin(this._time * 2);
      this.beacon.scale.set(s, 1, s);
      this.ring.material.opacity = 0.55 + 0.25 * Math.sin(this._time * 2.4);
    },
  };
  return world;
}
