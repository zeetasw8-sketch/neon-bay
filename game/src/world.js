// Neon Bay — kota 5x5 blok: jalan, gedung, pantai, dermaga, landmark (v3, dari nol).
// Geometri statis digabung per blok jadi sedikit mesh (draw call rendah);
// lampu jalan dan palem juga digabung. Tabrakan = daftar kotak AABB.

const THREE = window.THREE;

import { WORLD, LANDMARKS, COLORS } from './config.js';

// Generator acak deterministik (seed tetap) supaya tata kota sama tiap load.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Tekstur kanvas: fasad dengan jendela menyala (dipakai ulang semua gedung).
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d4258'; // D6: fasad lebih terang supaya gedung tidak hitam di malam hari
  g.fillRect(0, 0, 256, 256);
  const lit = ['#ffd76a', '#9fd8ff', '#ff9d5c', '#c9f2ff'];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 4; x++) {
      const on = ((x * 7 + y * 3) % 5) !== 0;
      g.fillStyle = on ? lit[(x + y) % lit.length] : '#14161f';
      g.fillRect(14 + x * 60, 14 + y * 40, 34, 24);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 64px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Penampung geometri gabungan: kotak dengan warna vertex + UV berulang per meter.
class MergeBucket {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.v = 0;
  }
  box(cx, cy, cz, sx, sy, sz, color, tile = 8) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    // [verts(4), normal, uSize, vSize] per sisi
    const faces = [
      { pts: [[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]], n: [1, 0, 0], u: sz, v: sy },
      { pts: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], n: [-1, 0, 0], u: sz, v: sy },
      { pts: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], n: [0, 1, 0], u: sx, v: sz },
      { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], n: [0, -1, 0], u: sx, v: sz },
      { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: [0, 0, 1], u: sx, v: sy },
      { pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: [0, 0, -1], u: sx, v: sy },
    ];
    for (const f of faces) {
      const us = [0, f.u / tile, f.u / tile, 0];
      const vs = [0, 0, f.v / tile, f.v / tile];
      for (let i = 0; i < 4; i++) {
        this.pos.push(f.pts[i][0], f.pts[i][1], f.pts[i][2]);
        this.nor.push(f.n[0], f.n[1], f.n[2]);
        this.uv.push(us[i], vs[i]);
        this.col.push(r, g, b);
      }
      this.idx.push(this.v, this.v + 1, this.v + 2, this.v, this.v + 2, this.v + 3);
      this.v += 4;
    }
  }
  pyramid(cx, cy, cz, w, h, color) {
    // Piramida 4 sisi (untuk tajuk palem): alas di cy, puncak di cy+h.
    const hw = w / 2;
    const r = ((color >> 16) & 255) / 255;
    const g = ((color >> 8) & 255) / 255;
    const b = (color & 255) / 255;
    const base = [
      [cx - hw, cy, cz - hw], [cx + hw, cy, cz - hw],
      [cx + hw, cy, cz + hw], [cx - hw, cy, cz + hw],
    ];
    const apex = [cx, cy + h, cz];
    for (let i = 0; i < 4; i++) {
      const a = base[i], c = base[(i + 1) % 4];
      // normal kasar dari cross product
      const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
      const vx = apex[0] - a[0], vy = apex[1] - a[1], vz = apex[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      for (const p of [a, c, apex]) {
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(nx, ny, nz);
        this.uv.push(0, 0);
        this.col.push(r, g, b);
      }
      this.idx.push(this.v, this.v + 1, this.v + 2);
      this.v += 3;
    }
  }
  build(material) {
    if (this.v === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {x0,z0,x1,z1}
    this.beacon = null;
    this.beaconRing = null;
    this._buildLights();
    this._buildGround();
    this._buildBuildings();
    this._buildStreetProps();
    this._buildBeachPier();
    this._buildBeacon();
  }

  _buildLights() {
    // D6: malam terlalu gelap (gedung jadi balok hitam) — naikkan cahaya
    // ambient + matahari supaya kota tetap terbaca di malam hari.
    const hemi = new THREE.HemisphereLight(0x8a6fd0, 0x1a1410, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.0);
    sun.position.set(-120, 160, -80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    sun.shadow.bias = -0.0015;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  _buildGround() {
    const groundMat = new THREE.MeshLambertMaterial({ color: COLORS.ground });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(820, 820), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // Jalan (aspal) — strip vertikal + horizontal digabung.
    const roadBucket = new MergeBucket();
    for (const line of WORLD.roadLines) {
      roadBucket.box(line, 0.06, 13, WORLD.roadWidth, 0.12, 396, 0xffffff, 1);
      roadBucket.box(13, 0.06, line, 396, 0.12, WORLD.roadWidth, 0xffffff, 1);
    }
    const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road, vertexColors: true });
    const roads = roadBucket.build(roadMat);
    if (roads) { roads.castShadow = false; this.scene.add(roads); }
    // Trotoar di kedua sisi tiap jalan.
    const walkBucket = new MergeBucket();
    for (const line of WORLD.roadLines) {
      for (const off of [-10.5, 10.5]) {
        walkBucket.box(line + off, 0.05, 13, 7, 0.1, 396, 0xffffff, 1);
        walkBucket.box(13, 0.05, line + off, 396, 0.1, 7, 0xffffff, 1);
      }
    }
    const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk, vertexColors: true });
    const walks = walkBucket.build(walkMat);
    if (walks) this.scene.add(walks);
    // Marka jalan putus-putus (garis tengah).
    const markBucket = new MergeBucket();
    for (const line of WORLD.roadLines) {
      for (let t = -175; t <= 175; t += 12) {
        markBucket.box(line, 0.13, t, 0.5, 0.02, 5, 0xffffff, 1);
        markBucket.box(t, 0.13, line, 5, 0.02, 0.5, 0xffffff, 1);
      }
    }
    const markMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8, vertexColors: true });
    const marks = markBucket.build(markMat);
    if (marks) this.scene.add(marks);
  }

  _addCollider(cx, cz, w, d) {
    this.colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });
  }

  _buildBuildings() {
    const winTex = makeWindowTexture();
    const facadeMat = new THREE.MeshLambertMaterial({ map: winTex, vertexColors: true });
    const neonMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const shopMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const antennaBucket = new MergeBucket();
    const tints = [0xffffff, 0xf2e8d8, 0xd8e2f2, 0xf2d8d8, 0xd8f2e2];
    const neonCols = [0x00e5ff, 0xff2ea6, 0xffe14d, 0x7cff5e];
    let tallest = null;
    for (const bx of WORLD.blockCenters) {
      for (const bz of WORLD.blockCenters) {
        const isGarageBlock = (bx === 0 && bz === 140);
        const isBankBlock = (bx === -70 && bz === -70);
        const isHospBlock = (bx === 140 && bz === 140);
        const bucket = new MergeBucket();
        const neonBucket = new MergeBucket();
        const shopBucket = new MergeBucket();
        if (isGarageBlock || isBankBlock || isHospBlock) {
          // Blok landmark: hanya gedung landmarknya (dibangun di bawah).
        } else {
          const r = rng(bx * 131 + bz * 57 + 7);
          const n = 1 + Math.floor(r() * 2); // 1-2 gedung per blok
          for (let i = 0; i < n; i++) {
            const w = 16 + r() * 14;
            const d = 14 + r() * 12;
            const h = 8 + r() * 20;
            const cx = bx + (r() - 0.5) * (WORLD.blockSize - w - 8);
            const cz = bz + (r() - 0.5) * (WORLD.blockSize - d - 8);
            const tint = tints[Math.floor(r() * tints.length)];
            bucket.box(cx, h / 2, cz, w, h, d, tint, 8);
            this._addCollider(cx, cz, w, d);
            if (h > 18) {
              bucket.box(cx, h + 1.5, cz, w * 0.45, 3, d * 0.45, tint, 8); // kotak atap
            }
            if (r() < 0.5) {
              shopBucket.box(cx, 1.2, cz + d / 2 + 0.15, w * 0.8, 2.2, 0.3, neonCols[Math.floor(r() * 4)], 1);
            }
            if (r() < 0.45) {
              const nc = neonCols[Math.floor(r() * 4)];
              neonBucket.box(cx, h + 0.25, cz, w * 0.9, 0.5, 0.5, nc, 1);
              neonBucket.box(cx, h + 0.25, cz, 0.5, 0.5, d * 0.9, nc, 1);
            }
            if (!tallest || h > tallest.h) tallest = { cx, cz, h };
          }
        }
        const mesh = bucket.build(facadeMat);
        if (mesh) { mesh.castShadow = true; this.scene.add(mesh); }
        const neon = neonBucket.build(neonMat);
        if (neon) this.scene.add(neon);
        const shop = shopBucket.build(shopMat);
        if (shop) this.scene.add(shop);
      }
    }
    // Antena di gedung tertinggi.
    if (tallest) {
      antennaBucket.box(tallest.cx, tallest.h + 5, tallest.cz, 0.5, 10, 0.5, 0x888888, 1);
      const ant = antennaBucket.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
      if (ant) this.scene.add(ant);
    }
    this._buildLandmarks(facadeMat);
  }

  _buildLandmarks(facadeMat) {
    // Garasi (markas) — papan emas.
    const g = LANDMARKS.garage.building;
    const gBucket = new MergeBucket();
    gBucket.box(g.cx, g.h / 2, g.cz, g.w, g.h, g.d, 0xe8c25a, 8);
    const gMesh = gBucket.build(facadeMat);
    if (gMesh) { gMesh.castShadow = true; this.scene.add(gMesh); }
    this._addCollider(g.cx, g.cz, g.w, g.d);
    this._addSign('GARAGE', 0x1a1a1a, 0xffd76a, g.cx, g.h + 1.2, g.cz + g.d / 2 + 0.2, 16, 4);
    // Bank — lebih tinggi, papan biru.
    const b = LANDMARKS.bank.building;
    const bBucket = new MergeBucket();
    bBucket.box(b.cx, b.h / 2, b.cz, b.w, b.h, b.d, 0xd8e2f2, 8);
    const bMesh = bBucket.build(facadeMat);
    if (bMesh) { bMesh.castShadow = true; this.scene.add(bMesh); }
    this._addCollider(b.cx, b.cz, b.w, b.d);
    this._addSign('MERIDIAN BANK', 0xffffff, 0x1d4e9b, b.cx, b.h + 1.2, b.cz + b.d / 2 + 0.2, 20, 5);
    // Rumah sakit — putih, salib merah.
    const h = LANDMARKS.hospital.building;
    const hBucket = new MergeBucket();
    hBucket.box(h.cx, h.h / 2, h.cz, h.w, h.h, h.d, 0xf2f2f2, 8);
    const hMesh = hBucket.build(facadeMat);
    if (hMesh) { hMesh.castShadow = true; this.scene.add(hMesh); }
    this._addCollider(h.cx, h.cz, h.w, h.d);
    this._addSign('HOSPITAL', 0xcc2222, 0xffffff, h.cx, h.h + 1.2, h.cz + h.d / 2 + 0.2, 16, 4);
  }

  _addSign(text, fg, bg, x, y, z, w, h) {
    const tex = makeSignTexture(text, '#' + fg.toString(16).padStart(6, '0'), '#' + bg.toString(16).padStart(6, '0'));
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(x, y, z);
    this.scene.add(plane);
  }

  _buildStreetProps() {
    // Tiang lampu (digabung) + kepala lampu menyala (digabung).
    const poleBucket = new MergeBucket();
    const headBucket = new MergeBucket();
    const r = rng(99);
    for (const lx of WORLD.roadLines) {
      for (const lz of WORLD.roadLines) {
        if (r() < 0.4) continue;
        const px = lx + 9, pz = lz + 9;
        poleBucket.box(px, 3, pz, 0.35, 6, 0.35, 0x333333, 1);
        headBucket.box(px, 6.1, pz, 1.1, 0.4, 0.5, 0xffe9a8, 1);
      }
    }
    const poles = poleBucket.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    if (poles) this.scene.add(poles);
    const heads = headBucket.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
    if (heads) this.scene.add(heads);
    // Palem di sepanjang pantai.
    const trunkBucket = new MergeBucket();
    const leafBucket = new MergeBucket();
    for (let x = -180; x <= 180; x += 30) {
      trunkBucket.box(x, 2.5, 190, 0.5, 5, 0.5, 0x8a6b45, 1);
      leafBucket.pyramid(x, 5, 190, 5, 2.2, 0x2e8b57);
    }
    const trunks = trunkBucket.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    if (trunks) this.scene.add(trunks);
    const leaves = leafBucket.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    if (leaves) this.scene.add(leaves);
  }

  _buildBeachPier() {
    // Pasir selatan.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 30),
      new THREE.MeshLambertMaterial({ color: COLORS.sand })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.08, 196);
    sand.receiveShadow = true;
    this.scene.add(sand);
    // Laut.
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(820, 220),
      new THREE.MeshLambertMaterial({ color: COLORS.sea })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.05, 318);
    this.scene.add(sea);
    // Dermaga kayu di x=150, dari pantai ke laut.
    const pierBucket = new MergeBucket();
    for (let z = 178; z <= 210; z += 4) {
      pierBucket.box(150, 0.35, z, 9, 0.5, 3.6, 0x9a7b4f, 1);
    }
    for (const dz of [180, 196, 210]) {
      pierBucket.box(146, 0.1, dz, 0.5, 1.2, 0.5, 0x6b4f2a, 1);
      pierBucket.box(154, 0.1, dz, 0.5, 1.2, 0.5, 0x6b4f2a, 1);
    }
    const pier = pierBucket.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    if (pier) { pier.castShadow = true; this.scene.add(pier); }
  }

  _buildBeacon() {
    // D1: suar objective WAJIB terlihat dari seberang kota — dulu kolomnya
    // tipis (radius ~2) dan redup (opacity 0,35) sehingga pemain tidak
    // pernah melihatnya. Ronde 1 menebalkannya (radius 4,2/5,6, tinggi 120)
    // tapi review Chrome ronde 2 tetap tidak melihat sorotan vertikal dari
    // spawn: kolom 120 m tertutup gedung blok (70,140) dan puncaknya keluar
    // dari frame (FOV 62°, kamera rendah) — yang terlihat cuma strip neon
    // atap gedung. RONDE 2: kolom JAUH lebih tinggi (260 m, menembus langit
    // di atas atap mana pun) + lebih lebar + depthTest:false supaya terlihat
    // MENEMBUS gedung — suar penunjuk objective memang harus terlihat dari
    // mana saja, seperti quest marker. Fade saat mendekat tetap dipertahankan
    // supaya tidak menutupi adegan di sekitar target.
    const geo = new THREE.CylinderGeometry(7, 9, 260, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.6, fog: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      depthTest: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.set(0, 130, 0);
    this.beacon.visible = false;
    this.beacon.renderOrder = 999;
    this.scene.add(this.beacon);
    const ringGeo = new THREE.RingGeometry(4.5, 6.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, fog: false,
    });
    this.beaconRing = new THREE.Mesh(ringGeo, ringMat);
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.set(0, 0.2, 0);
    this.beaconRing.visible = false;
    this.scene.add(this.beaconRing);
  }

  setBeacon(x, z, on) {
    if (!this.beacon) return;
    this.beacon.visible = on;
    this.beaconRing.visible = on;
    if (on) {
      this.beacon.position.set(x, 130, z);
      this.beaconRing.position.set(x, 0.2, z);
    }
  }

  // D2: tepi laut — dinding tak terlihat. Koridor dermaga (x 143..157)
  // boleh sampai ujung dermaga (z 209), selebihnya pasir berakhir di z 206.
  clampShore(x, z) {
    const maxZ = (x > WORLD.pierX0 && x < WORLD.pierX1) ? WORLD.pierMaxZ : WORLD.shoreMaxZ;
    return z > maxZ ? maxZ : z;
  }

  // Pindahkan kamera bayangan mengikuti pemain (area sempit = murah).
  followShadow(px, pz) {
    if (!this.sun) return;
    this.sun.position.set(px - 120, 160, pz - 80);
    this.sun.target.position.set(px, 0, pz);
    this.sun.target.updateMatrixWorld();
  }

  update(dt, t, px, pz) {
    if (this.beacon && this.beacon.visible) {
      // Suar memudar saat pemain mendekat: dari jauh tetap terang (mudah
      // ditemukan), dari dekat nyaris transparan supaya tidak menutupi
      // pemandangan/pemusuh di sekitar target (shot 2 dulu tertutup suar).
      const d = (px === undefined) ? 999
        : Math.hypot(px - this.beacon.position.x, pz - this.beacon.position.z);
      const fade = Math.min(1, Math.max(0.18, (d - 8) / 42));
      this.beacon.material.opacity = (0.45 + 0.15 * Math.sin(t * 3)) * fade;
      const s = 1 + 0.08 * Math.sin(t * 3);
      this.beaconRing.scale.set(s, s, 1);
    }
  }

  // Dorong lingkaran (x,z,r) keluar dari semua AABB; kembalikan posisi baru.
  resolveCollision(x, z, r) {
    for (const c of this.colliders) {
      const nx = Math.max(c.x0, Math.min(x, c.x1));
      const nz = Math.max(c.z0, Math.min(z, c.z1));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          x = nx + (dx / d) * r;
          z = nz + (dz / d) * r;
        } else {
          // Tepat di dalam kotak: dorong ke sisi terdekat.
          const dl = x - c.x0, dr = c.x1 - x, dn = z - c.z0, df = c.z1 - z;
          const m = Math.min(dl, dr, dn, df);
          if (m === dl) x = c.x0 - r;
          else if (m === dr) x = c.x1 + r;
          else if (m === dn) z = c.z0 - r;
          else z = c.z1 + r;
        }
      }
    }
    return { x, z };
  }
}
