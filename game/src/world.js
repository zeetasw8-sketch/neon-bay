// NEON BAY — the city: roads, buildings, beach, props, collision.
'use strict';
const NBWorld = {
  scene: null, colliders: [], // {x0,z0,x1,z1} building footprints
  roadLines: [],              // road centre lines (for traffic + minimap)
  buildings: [],
  beacon: null, beaconLight: null,
  garagePos: null, hospitalPos: null,

  build(scene) {
    this.scene = scene;
    this.colliders = []; this.buildings = []; this.roadLines = [];
    const rng = NB_RNG(1337);
    const C = NB_CONFIG, step = C.blockSize + C.roadWidth; // 70
    const half = (C.blocks * step) / 2; // 175

    // Sky + fog + lights (sunset over the bay)
    scene.background = new THREE.Color(0x2a1a4e);
    scene.fog = new THREE.Fog(0x2a1a4e, 120, 520);
    const hemi = new THREE.HemisphereLight(0xffd9a0, 0x2a1a4e, 1.0);
    scene.add(hemi);
    scene.add(new THREE.AmbientLight(0x604a80, 0.35)); // lift shadow sides
    const sun = new THREE.DirectionalLight(0xffb347, 1.25);
    sun.position.set(120, 180, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
    sun.shadow.camera.far = 600;
    scene.add(sun);
    this.sun = sun;

    // Ground (grass/dirt base)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshLambertMaterial({ color: 0x2f4a2a }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.1, 40);
    ground.receiveShadow = true; scene.add(ground);

    // Sea (south) + sand beach
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 180),
      new THREE.MeshLambertMaterial({ color: 0x1a5f8a }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.05, C.seaZ + 90);
    scene.add(sea);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 26),
      new THREE.MeshLambertMaterial({ color: 0xd9c28a }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, C.seaZ - 8);
    sand.receiveShadow = true; scene.add(sand);

    // Roads: asphalt strips on the grid + sidewalks
    const roadMat = new THREE.MeshLambertMaterial({ color: 0x2b2b33 });
    const walkMat = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d8a0 });
    for (let i = 0; i <= C.blocks; i++) {
      const c = -half + i * step;
      // vertical road (along z)
      const rv = new THREE.Mesh(new THREE.PlaneGeometry(C.roadWidth, half * 2 + 40), roadMat);
      rv.rotation.x = -Math.PI / 2; rv.position.set(c, 0.02, 20); rv.receiveShadow = true; scene.add(rv);
      const rh = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 40, C.roadWidth), roadMat);
      rh.rotation.x = -Math.PI / 2; rh.position.set(0, 0.02, c); rh.receiveShadow = true; scene.add(rh);
      this.roadLines.push({ x: c, vertical: true });
      this.roadLines.push({ z: c, vertical: false });
      // dashed centre lines
      for (let d = -half; d < half; d += 12) {
        const dv = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 4), dashMat);
        dv.rotation.x = -Math.PI / 2; dv.position.set(c, 0.04, d); scene.add(dv);
        const dh = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), dashMat);
        dh.rotation.x = -Math.PI / 2; dh.position.set(d, 0.04, c); scene.add(dh);
      }
    }
    // Sidewalk slabs around each block
    for (let bx = 0; bx < C.blocks; bx++) for (let bz = 0; bz < C.blocks; bz++) {
      const cx = -half + C.roadWidth / 2 + bx * step + C.blockSize / 2;
      const cz = -half + C.roadWidth / 2 + bz * step + C.blockSize / 2;
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(C.blockSize + 6, C.blockSize + 6), walkMat);
      sw.rotation.x = -Math.PI / 2; sw.position.set(cx, 0.03, cz); sw.receiveShadow = true; scene.add(sw);
    }

    // Buildings: window textures from canvas, varied heights + neon roofs
    const winTex = this._windowTextures(rng);
    const palette = [0x5a6b8a, 0x8a5a6b, 0x4a7a6a, 0x7a6a4a, 0x6a5a9a, 0x3a4a6a, 0x9a7a5a];
    const neonCols = [0xff2ea6, 0x00e5ff, 0xffd94d, 0x7dff5e];
    for (let bx = 0; bx < C.blocks; bx++) for (let bz = 0; bz < C.blocks; bz++) {
      const cx = -half + C.roadWidth / 2 + bx * step + C.blockSize / 2;
      const cz = -half + C.roadWidth / 2 + bz * step + C.blockSize / 2;
      // skip the garage block (home base) entirely — no random buildings there
      const isGarageBlock = (bx === 2 && bz === 4);
      const n = isGarageBlock ? 0 : (rng() < 0.55 ? 2 : 1);
      for (let k = 0; k < n; k++) {
        const w = 16 + rng() * 14, d = 16 + rng() * 14, h = 14 + rng() * 46;
        const ox = (k === 0 ? -1 : 1) * (n === 2 ? 11 : 0) + (rng() - 0.5) * 6;
        const oz = (rng() - 0.5) * 8;
        const x = cx + ox, z = cz + oz;
        const mat = new THREE.MeshLambertMaterial({
          color: palette[Math.floor(rng() * palette.length)],
          map: winTex[Math.floor(rng() * winTex.length)],
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true;
        scene.add(b);
        this.buildings.push(b);
        this.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
        // neon roof strip on some towers
        if (rng() < 0.45) {
          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.6, 0.7, 0.7),
            new THREE.MeshBasicMaterial({ color: neonCols[Math.floor(rng() * neonCols.length)] }));
          strip.position.set(x, h + 0.4, z - d / 2); scene.add(strip);
          const strip2 = strip.clone();
          strip2.position.set(x, h + 0.4, z + d / 2); scene.add(strip2);
        }
      }
    }

    // Garage (Mara's base) — low building with a big gold sign
    const g = new THREE.Group();
    const gBody = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 20),
      new THREE.MeshLambertMaterial({ color: 0x39415e }));
    gBody.position.y = 4.5; gBody.castShadow = true; gBody.receiveShadow = true; g.add(gBody);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(30, 2.4, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    sign.position.set(0, 10.2, 10.2); g.add(sign);
    g.position.set(NB_CONFIG.garage.x, 0, NB_CONFIG.garage.z);
    scene.add(g);
    this.colliders.push({ x0: NB_CONFIG.garage.x - 17, x1: NB_CONFIG.garage.x + 17, z0: NB_CONFIG.garage.z - 10, z1: NB_CONFIG.garage.z + 10 });
    this.garagePos = { x: NB_CONFIG.garage.x, z: NB_CONFIG.garage.z };

    // Meridian Bank landmark (mission 6 target)
    const bank = new THREE.Mesh(new THREE.BoxGeometry(26, 18, 22),
      new THREE.MeshLambertMaterial({ color: 0xcfc4a0 }));
    bank.position.set(-70, 9, -70); bank.castShadow = true; scene.add(bank);
    this.colliders.push({ x0: -83, x1: -57, z0: -81, z1: -59 });
    const bankSign = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 0.6),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
    bankSign.position.set(-70, 19, -59); scene.add(bankSign);

    // Hospital (respawn point)
    const hosp = new THREE.Mesh(new THREE.BoxGeometry(24, 14, 18),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    hosp.position.set(NB_CONFIG.hospital.x, 7, NB_CONFIG.hospital.z); hosp.castShadow = true; scene.add(hosp);
    this.colliders.push({ x0: NB_CONFIG.hospital.x - 12, x1: NB_CONFIG.hospital.x + 12, z0: NB_CONFIG.hospital.z - 9, z1: NB_CONFIG.hospital.z + 9 });
    this.hospitalPos = { x: NB_CONFIG.hospital.x, z: NB_CONFIG.hospital.z };

    // Street lamps along roads + palm trees near the beach
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    let lampLights = 0;
    for (let i = 0; i <= C.blocks; i++) {
      const c = -half + i * step;
      for (let d = -half + 35; d < half; d += 70) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), lampMat);
        pole.position.set(c + C.roadWidth / 2 + 1.5, 3.5, d); scene.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
        bulb.position.set(c + C.roadWidth / 2 + 1.5, 7.1, d); scene.add(bulb);
        if (lampLights < 8) { // a few real lights only — perf on low-end GPUs
          lampLights++;
          const pl = new THREE.PointLight(0xffe9a8, 0.5, 26);
          pl.position.set(c + C.roadWidth / 2 + 1.5, 7, d); scene.add(pl);
        }
      }
    }
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4a });
    for (let i = 0; i < 14; i++) {
      const x = -180 + rng() * 360, z = C.seaZ - 22 + rng() * 8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 6, 6), trunkMat);
      trunk.position.set(x, 3, z); trunk.rotation.z = (rng() - 0.5) * 0.25; scene.add(trunk);
      const top = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), leafMat);
      top.position.set(x, 6.8, z); top.scale.y = 0.55; scene.add(top);
    }
    // Pier (mission 1/5 target) — wooden deck into the sea
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 34), pierMat);
    pier.position.set(150, 0.6, C.seaZ + 8); pier.castShadow = true; scene.add(pier);

    // Mission beacon (reused, moved by missions)
    const beaconGeo = new THREE.CylinderGeometry(3, 3, 60, 16, 1, true);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.beacon.position.set(0, 30, 120); this.beacon.visible = false; scene.add(this.beacon);
    this.beaconLight = new THREE.PointLight(0xffd94d, 1.2, 40);
    this.beaconLight.position.set(0, 4, 120); this.beaconLight.visible = false; scene.add(this.beaconLight);
  },

  _windowTextures(rng) {
    const out = [];
    for (let v = 0; v < 4; v++) {
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
      const g = cv.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 256);
      for (let y = 8; y < 248; y += 18) for (let x = 8; x < 120; x += 16) {
        const lit = rng() < 0.4;
        g.fillStyle = lit ? (rng() < 0.5 ? '#ffd94d' : '#9adfff') : '#1c2438';
        g.fillRect(x, y, 10, 12);
      }
      const tex = new THREE.CanvasTexture(cv);
      out.push(tex);
    }
    return out;
  },

  // Circle (x,z,r) vs building AABBs. Returns corrected position or null.
  resolveCircle(x, z, r) {
    for (const c of this.colliders) {
      const cx = Math.max(c.x0, Math.min(x, c.x1));
      const cz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 < 1e-6) { // centre inside box: push out along smallest axis
          const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
          else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
        } else {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r; z = cz + (dz / d) * r;
        }
        return { x, z, hit: true };
      }
    }
    return null;
  },
  collides(x, z, r) { return this.resolveCircle(x, z, r) !== null; },
  clampBounds(x, z) {
    const B = NB_CONFIG.worldBound;
    return { x: Math.max(-B, Math.min(B, x)), z: Math.max(-B, Math.min(B + 26, z)) };
  },
  setBeacon(x, z, on) {
    if (!this.beacon) return;
    this.beacon.visible = on; this.beaconLight.visible = on;
    if (on) { this.beacon.position.set(x, 30, z); this.beaconLight.position.set(x, 4, z); }
  },
  update(dt, t) {
    if (this.beacon && this.beacon.visible) {
      this.beacon.rotation.y += dt * 0.6;
      this.beacon.material.opacity = 0.28 + Math.sin(t * 3) * 0.1;
    }
  },
};
