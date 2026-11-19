// Neon Bay — the city itself.
// A 5x5-block warm-dusk city: streets, lit buildings with neon roofs,
// sand and sea to the south, a wooden pier, and the three landmarks
// (garage, bank, hospital). One ground texture draws the whole road
// grid in a single mesh. The gold objective beacon lives here too.
// Collision is circle-vs-box against the building footprints, plus an
// invisible shore wall that keeps everyone out of the open sea.

import { THREE } from "./three-shim.js";
import { WORLD, LIGHT } from "./config.js";

function hash2(ix, iz) {
  // Deterministic pseudo-random from block indices, so the city is
  // identical on every load.
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}

function makeWindowTexture(litRatio, tint) {
  // A canvas of windows: some lit warm, some dark. Used as the map
  // and the emissive map of a building's sides.
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = tint;
  g.fillRect(0, 0, 128, 256);
  const cols = 6;
  const rows = 12;
  const ww = 128 / cols;
  const wh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = Math.random() < litRatio;
      g.fillStyle = lit ? "#ffd98a" : "#1c2436";
      g.fillRect(col * ww + 3, r * wh + 4, ww - 6, wh - 8);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture() {
  // One 1024 canvas for the whole city floor: asphalt, road strips,
  // lane dashes and sidewalk borders, mapped to the street grid.
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  const span = 280; // world units across the texture (-140..140)
  const toPx = (v) => ((v + 140) / span) * S;
  g.fillStyle = "#23232b";
  g.fillRect(0, 0, S, S);
  // Sidewalk borders: a lighter frame around every block.
  g.fillStyle = "#3a3a44";
  const blockCentres = [-100, -50, 0, 50, 100];
  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      g.fillRect(toPx(bx - 19), toPx(bz - 19), toPx(38) - toPx(0), toPx(38) - toPx(0));
    }
  }
  // Road strips.
  g.fillStyle = "#2e2e38";
  for (const s of WORLD.streets) {
    g.fillRect(toPx(s - WORLD.streetHalf), 0, toPx(2 * WORLD.streetHalf) - toPx(0), S);
    g.fillRect(0, toPx(s - WORLD.streetHalf), S, toPx(2 * WORLD.streetHalf) - toPx(0));
  }
  // Centre dashes, gold along the roads.
  g.fillStyle = "#c9a227";
  for (const s of WORLD.streets) {
    for (let v = -135; v < 135; v += 12) {
      g.fillRect(toPx(s) - 2, toPx(v), 4, 14);
      g.fillRect(toPx(v), toPx(s) - 2, 14, 4);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeSkyTexture() {
  // Warm dusk gradient: deep purple overhead, amber at the horizon.
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#2a1740");
  grad.addColorStop(0.55, "#5c2f56");
  grad.addColorStop(0.8, "#c97a3e");
  grad.addColorStop(1, "#dd8a45");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildWorld(scene) {
  const colliders = [];
  const landmarks = {};

  // --- Sky, fog and lights -------------------------------------------
  const skyTex = makeSkyTexture();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  scene.fog = new THREE.Fog(LIGHT.fog, 120, 700);

  const hemi = new THREE.HemisphereLight(
    LIGHT.hemiSky,
    LIGHT.hemiGround,
    LIGHT.hemiIntensity,
  );
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // Two real point lights only: the garage yard and the pier.
  const yardLight = new THREE.PointLight(0xffb36b, 60, 45, 1.8);
  yardLight.position.set(WORLD.garage.x, 6, WORLD.garage.z);
  scene.add(yardLight);
  const pierLight = new THREE.PointLight(0xffc46b, 50, 40, 1.8);
  pierLight.position.set(0, 6, 148);
  scene.add(pierLight);

  // --- Ground, sand, sea, pier ---------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(280, 280),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(280, WORLD.sandTo - WORLD.edge + 4),
    // Unlit on purpose: the strong golden-hour light blows a lit sand
    // plane out to pure white. A flat sandy tan reads as a beach.
    new THREE.MeshBasicMaterial({ color: 0xc2a06b }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (WORLD.edge + WORLD.sandTo) / 2);
  sand.receiveShadow = true;
  scene.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 160),
    // Unlit on purpose, same reason as the sand: a flat sea blue.
    new THREE.MeshBasicMaterial({ color: 0x1e5a7a }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.0, WORLD.seaAt + 80);
  scene.add(sea);

  // Wooden pier deck, flush with the ground, over the water.
  // Unlit, same blow-out reason as the sand: a flat wood tone.
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD.pierHalf * 2, 0.3, WORLD.pierEnd - WORLD.edge + 6),
    new THREE.MeshBasicMaterial({ color: 0x8a6a42 }),
  );
  pierDeck.position.set(0, 0.1, (WORLD.edge + WORLD.pierEnd) / 2);
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);
  // Plank seams across the deck.
  const seamGeo = new THREE.BoxGeometry(WORLD.pierHalf * 2, 0.05, 0.35);
  const seamMat = new THREE.MeshLambertMaterial({ color: 0x6b4e2e });
  for (let z = WORLD.edge + 4; z < WORLD.pierEnd; z += 4) {
    const seam = new THREE.Mesh(seamGeo, seamMat);
    seam.position.set(0, 0.28, z);
    scene.add(seam);
  }

  // --- Buildings ------------------------------------------------------
  const winTexA = makeWindowTexture(0.55, "#2b2f45");
  const winTexB = makeWindowTexture(0.4, "#33283e");
  const winTexC = makeWindowTexture(0.65, "#262b3d");
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
  const neonMats = [
    new THREE.MeshBasicMaterial({ color: 0x22d3ee }),
    new THREE.MeshBasicMaterial({ color: 0xf472b6 }),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
    new THREE.MeshBasicMaterial({ color: 0x34d399 }),
  ];
  const shopMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  const wallMats = [winTexA, winTexB, winTexC].map(
    (t) =>
      new THREE.MeshLambertMaterial({
        map: t,
        emissive: 0xffffff,
        emissiveMap: t,
        emissiveIntensity: 0.55,
      }),
  );

  const blockCentres = [-100, -50, 0, 50, 100];
  let tallest = null;
  let tallestH = 0;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const stripGeo = new THREE.BoxGeometry(1, 0.35, 1);
  const roofBoxGeo = new THREE.BoxGeometry(1, 1, 1);

  function addBuilding(cx, cz, w, d, h, matIdx) {
    const mesh = new THREE.Mesh(boxGeo, [
      wallMats[matIdx],
      wallMats[matIdx],
      roofMat,
      roofMat,
      wallMats[matIdx],
      wallMats[matIdx],
    ]);
    mesh.scale.set(w, h, d);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
    // Neon strip along the roof edge.
    if (hash2(cx, cz) > 0.45) {
      const strip = new THREE.Mesh(stripGeo, neonMats[Math.floor(hash2(cz, cx) * 4) % 4]);
      strip.scale.set(w * 0.96, 1, d * 0.96);
      strip.position.set(cx, h + 0.2, cz);
      scene.add(strip);
    }
    // A rooftop box on tall towers.
    if (h > 26) {
      const rb = new THREE.Mesh(roofBoxGeo, roofMat);
      rb.scale.set(w * 0.3, 3, d * 0.3);
      rb.position.set(cx, h + 1.5, cz);
      scene.add(rb);
    }
    // A lit shopfront strip at street level on some buildings.
    if (hash2(cx + 7, cz + 3) > 0.6) {
      const shop = new THREE.Mesh(stripGeo, shopMat);
      shop.scale.set(w * 0.9, 1, 0.4);
      shop.position.set(cx, 1.6, cz + d / 2 + 0.1);
      scene.add(shop);
    }
    if (h > tallestH) {
      tallestH = h;
      tallest = { x: cx, z: cz, h };
    }
    return mesh;
  }

  for (const bx of blockCentres) {
    for (const bz of blockCentres) {
      // Landmark blocks get their own buildings below.
      if (bx === -100 && bz === -100) continue; // garage
      if (bx === 100 && bz === -100) continue; // bank
      if (bx === -100 && bz === 100) continue; // hospital
      const r = hash2(bx, bz);
      const h = 8 + Math.floor(r * 30);
      const matIdx = Math.floor(hash2(bz, bx) * 3) % 3;
      if (r > 0.62) {
        // Two slimmer towers on this block.
        addBuilding(bx - 8, bz, 15, 30, h, matIdx);
        addBuilding(bx + 9, bz, 13, 30, Math.max(8, h - 9), (matIdx + 1) % 3);
      } else {
        addBuilding(bx, bz, 30, 30, h, matIdx);
      }
    }
  }

  // Antenna on the tallest tower.
  if (tallest) {
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.2, 12, 6),
      new THREE.MeshBasicMaterial({ color: 0xff5a5a }),
    );
    ant.position.set(tallest.x, tallest.h + 6, tallest.z);
    scene.add(ant);
  }

  // --- Landmarks ------------------------------------------------------
  // Garage (HQ): a low wide workshop with a yard and a warm sign.
  const garageMesh = new THREE.Mesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ color: 0x3d5a45 }),
  );
  garageMesh.scale.set(26, 7, 18);
  garageMesh.position.set(WORLD.garage.x, 3.5, WORLD.garage.z - 6);
  garageMesh.castShadow = true;
  garageMesh.receiveShadow = true;
  scene.add(garageMesh);
  colliders.push({
    minX: WORLD.garage.x - 13,
    maxX: WORLD.garage.x + 13,
    minZ: WORLD.garage.z - 15,
    maxZ: WORLD.garage.z + 3,
  });
  const garageSign = new THREE.Mesh(
    stripGeo,
    new THREE.MeshBasicMaterial({ color: 0x34d399 }),
  );
  garageSign.scale.set(20, 1, 1);
  garageSign.position.set(WORLD.garage.x, 7.6, WORLD.garage.z + 3.2);
  scene.add(garageSign);
  landmarks.garage = { x: WORLD.garage.x, z: WORLD.garage.z };

  // Bank: a tall pale tower with columns and front steps, door south.
  const bankMesh = new THREE.Mesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ color: 0x8a7f63, emissive: 0x201a10 }),
  );
  bankMesh.scale.set(28, 34, 24);
  bankMesh.position.set(WORLD.bank.x, 17, WORLD.bank.z - 4);
  bankMesh.castShadow = true;
  bankMesh.receiveShadow = true;
  scene.add(bankMesh);
  colliders.push({
    minX: WORLD.bank.x - 14,
    maxX: WORLD.bank.x + 14,
    minZ: WORLD.bank.z - 16,
    maxZ: WORLD.bank.z + 8,
  });
  const colGeo = new THREE.CylinderGeometry(0.9, 0.9, 10, 8);
  const colMat = new THREE.MeshLambertMaterial({ color: 0xd8cfb8 });
  for (const dx of [-9, -3, 3, 9]) {
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(WORLD.bank.x + dx, 5, WORLD.bank.z + 8);
    col.castShadow = true;
    scene.add(col);
  }
  const bankSign = new THREE.Mesh(
    stripGeo,
    new THREE.MeshBasicMaterial({ color: 0xfbbf24 }),
  );
  bankSign.scale.set(22, 1, 1);
  bankSign.position.set(WORLD.bank.x, 30, WORLD.bank.z + 8.4);
  scene.add(bankSign);
  landmarks.bank = { x: WORLD.bank.x, z: WORLD.bank.z };

  // Hospital: a white block with a glowing cross, respawn point.
  const hospMesh = new THREE.Mesh(
    boxGeo,
    new THREE.MeshLambertMaterial({ color: 0xdfe6ea, emissive: 0x2a2f33 }),
  );
  hospMesh.scale.set(26, 16, 22);
  hospMesh.position.set(WORLD.hospital.x, 8, WORLD.hospital.z);
  hospMesh.castShadow = true;
  hospMesh.receiveShadow = true;
  scene.add(hospMesh);
  colliders.push({
    minX: WORLD.hospital.x - 13,
    maxX: WORLD.hospital.x + 13,
    minZ: WORLD.hospital.z - 11,
    maxZ: WORLD.hospital.z + 11,
  });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d });
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 0.5), crossMat);
  crossV.position.set(WORLD.hospital.x, 18.5, WORLD.hospital.z + 11.2);
  scene.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.5), crossMat);
  crossH.position.set(WORLD.hospital.x, 18.5, WORLD.hospital.z + 11.2);
  scene.add(crossH);
  landmarks.hospital = { x: WORLD.hospital.x, z: WORLD.hospital.z };

  // --- Street lamps ---------------------------------------------------
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c34 });
  const headGeo = new THREE.BoxGeometry(1.4, 0.3, 0.5);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe1a1 });
  for (const s of WORLD.streets) {
    for (const t of [-100, -50, 0, 50, 100]) {
      if ((s + t) % 100 !== 0) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(s + 8, 3, t);
      scene.add(pole);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(s + 8, 6.1, t);
      scene.add(head);
    }
  }

  // --- Objective beacon ----------------------------------------------
  // A tall saturated-gold column. It draws on top of buildings
  // (depthTest off) so it is never hidden, and fades out as the
  // camera closes in, so it never covers the scene on arrival.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.4, 130, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: LIGHT.beaconColor,
      transparent: true,
      opacity: LIGHT.beaconOpacity,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  beacon.renderOrder = 999;
  beacon.visible = false;
  scene.add(beacon);

  function setBeacon(x, z, visible) {
    beacon.position.set(x, 65, z);
    beacon.visible = visible;
  }

  function updateBeacon(camPos) {
    if (!beacon.visible) return;
    const dx = camPos.x - beacon.position.x;
    const dz = camPos.z - beacon.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Fully visible far away, gone only when the camera is right on it,
    // so the column still reads in a close-up shot.
    const f = Math.min(1, Math.max(0, (dist - 8) / 25));
    beacon.material.opacity = LIGHT.beaconOpacity * f;
  }

  function followSun(px, pz) {
    sun.position.set(px + 120, 180, pz + 60);
    sun.target.position.set(px, 0, pz);
  }

  // --- Collision ------------------------------------------------------
  function collides(x, z, r) {
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  // Keep a position inside the playable area. Returns "shore" when the
  // invisible sea wall stopped it, "edge" at the city bounds, "" otherwise.
  function clampPlayable(p, r) {
    let hit = "";
    const lim = WORLD.edge + 3;
    if (p.x < -lim) { p.x = -lim; hit = "edge"; }
    if (p.x > lim) { p.x = lim; hit = "edge"; }
    if (p.z < -lim) { p.z = -lim; hit = "edge"; }
    // South: the sea. The pier corridor stays open to the pier end.
    const inPier = Math.abs(p.x) <= WORLD.pierHalf;
    const maxZ = inPier ? WORLD.pierEnd - 2 : WORLD.edge + 3;
    if (p.z > maxZ) {
      p.z = maxZ;
      hit = "shore";
    }
    return hit;
  }

  return {
    colliders,
    landmarks,
    setBeacon,
    updateBeacon,
    followSun,
    collides,
    clampPlayable,
  };
}
