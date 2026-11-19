// Neon Bay — pejalan kaki + preman misi 5 (v3, dari nol).
// Pejalan kaki berjalan di trotoar dan lari menjauh bila mobil pemain melaju
// kencang ke arah mereka. Preman mengejar pemain dan memukul dari dekat.

const THREE = window.THREE;

import { WORLD, PEDS } from './config.js';

const MAX_PEDS = 24;

export class People {
  constructor(scene, world) {
    this.world = world;
    this.peds = [];
    this.thugs = [];
    this._respawnTimer = 0;
    const bodyGeo = new THREE.BoxGeometry(0.7, 1.1, 0.45);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_PEDS);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.castShadow = true;
    scene.add(this.bodies);
    const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    this.heads = new THREE.InstancedMesh(headGeo, headMat, MAX_PEDS);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.heads);
    // Bandana merah preman.
    const bandGeo = new THREE.BoxGeometry(0.56, 0.14, 0.56);
    const bandMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
    this.bands = new THREE.InstancedMesh(bandGeo, bandMat, 6);
    this.bands.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.bands);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._tmpColor = new THREE.Color();
    this._spawnPeds();
  }

  _rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // Posisi + mesh hidup per orang (alat tes: ped.pos.set / ped.mesh.position).
  _attachLive(p) {
    const pos = [p.x, p.z];
    Object.defineProperties(pos, {
      0: { get: () => p.x, set: (v) => { p.x = v; }, enumerable: true, configurable: true },
      1: { get: () => p.z, set: (v) => { p.z = v; }, enumerable: true, configurable: true },
      x: { get: () => p.x, set: (v) => { p.x = v; }, enumerable: true, configurable: true },
      y: { get: () => 0, set: () => {}, enumerable: true, configurable: true },
      z: { get: () => p.z, set: (v) => { p.z = v; }, enumerable: true, configurable: true },
    });
    pos.set = (x, y, z) => { p.x = x; p.z = (z !== undefined ? z : (y !== undefined ? y : p.z)); };
    pos.clone = () => [p.x, p.z];
    p.pos = pos;
    p.mesh = new THREE.Object3D();
    p.mesh.position.set(p.x, 0, p.z);
    return p;
  }

  _spawnPeds() {
    const r = this._rng(31337);
    const colors = [0x3a6fd2, 0xd2a23a, 0x6a3ad2, 0x2a8a5a, 0xd25a8a, 0x888888, 0x2a2a2a];
    for (let i = 0; i < PEDS.count; i++) {
      const vertical = r() < 0.5;
      const line = WORLD.roadLines[Math.floor(r() * WORLD.roadLines.length)];
      const off = (r() < 0.5 ? -10.5 : 10.5);
      const along = -170 + r() * 340;
      const p = {
        x: vertical ? line + off : along,
        z: vertical ? along : line + off,
        heading: r() * Math.PI * 2,
        speed: PEDS.walkSpeed * (0.8 + r() * 0.4),
        color: colors[Math.floor(r() * colors.length)],
        vertical, line, off,
        flee: 0, fleeX: 0, fleeZ: 0,
        alive: true, isThug: false,
      };
      this._attachLive(p);
      this.peds.push(p);
      this.bodies.setColorAt(this.peds.length - 1, this._tmpColor.setHex(p.color));
    }
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  spawnThugs(x, z, count) {
    this.clearThugs();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const t = {
        x: x + Math.cos(a) * 6, z: z + Math.sin(a) * 6,
        heading: 0, speed: 3.4, color: 0x1a1a1a,
        hp: 3, alive: true, isThug: true,
        punchTimer: 0, knockX: 0, knockZ: 0,
      };
      this._attachLive(t);
      this.thugs.push(t);
    }
  }

  clearThugs() {
    this.thugs = [];
  }

  thugsAlive() {
    return this.thugs.filter((t) => t.alive).length;
  }

  // Pejalan kaki terdekat dari titik (untuk tembakan/pukulan).
  nearestPed(x, z, d) {
    let best = null, bd = d;
    for (const p of this.peds) {
      if (!p.alive) continue;
      const dd = Math.hypot(p.x - x, p.z - z);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best;
  }

  update(dt, player) {
    // Pejalan kaki yang tumbang muncul lagi perlahan supaya kota tidak kosong.
    this._respawnTimer -= dt;
    if (this._respawnTimer <= 0) {
      this._respawnTimer = 15;
      const dead = this.peds.find((p) => !p.alive);
      if (dead) {
        const vertical = Math.random() < 0.5;
        const line = WORLD.roadLines[Math.floor(Math.random() * WORLD.roadLines.length)];
        const off = (Math.random() < 0.5 ? -10.5 : 10.5);
        const along = -170 + Math.random() * 340;
        dead.x = vertical ? line + off : along;
        dead.z = vertical ? along : line + off;
        dead.heading = Math.random() * Math.PI * 2;
        dead.flee = 0;
        dead.alive = true;
      }
    }
    // Pejalan kaki: jalan di trotoar; lari bila mobil pemain melaju ke arahnya.
    for (const p of this.peds) {
      if (!p.alive) continue;
      const dx = player.x - p.x, dz = player.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (player.inCar && player.speed > 8 && dist < PEDS.fleeRadius) {
        p.flee = 1.2;
        p.fleeX = -dx / Math.max(dist, 0.01);
        p.fleeZ = -dz / Math.max(dist, 0.01);
      }
      if (p.flee > 0) {
        p.flee -= dt;
        p.heading = Math.atan2(p.fleeX, p.fleeZ);
        p.x += p.fleeX * PEDS.fleeSpeed * dt;
        p.z += p.fleeZ * PEDS.fleeSpeed * dt;
      } else {
        // Jalan lurus di trotoar; di ujung jalan, balik arah.
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        p.x += fx * p.speed * dt;
        p.z += fz * p.speed * dt;
        if (p.vertical) {
          if (p.z > 178 || p.z < -178) p.heading += Math.PI;
        } else if (p.x > 178 || p.x < -178) {
          p.heading += Math.PI;
        }
      }
      // D2: pejalan kaki tidak boleh masuk laut.
      p.z = this.world.clampShore(p.x, p.z);
      const fixed = this.world.resolveCollision(p.x, p.z, 0.5);
      p.x = fixed.x; p.z = fixed.z;
    }
    // Preman: kejar pemain, pukul bila dekat.
    for (const t of this.thugs) {
      if (!t.alive) continue;
      t.punchTimer -= dt;
      const dx = player.x - t.x, dz = player.z - t.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.6) {
        t.heading = Math.atan2(dx, dz);
        t.x += Math.sin(t.heading) * t.speed * dt;
        t.z += Math.cos(t.heading) * t.speed * dt;
      } else if (t.punchTimer <= 0) {
        t.punchTimer = 0.9;
        player.hurt(8, 'thug');
      }
      // Knockback meluruh.
      t.x += t.knockX * dt;
      t.z += t.knockZ * dt;
      t.knockX *= Math.max(0, 1 - dt * 6);
      t.knockZ *= Math.max(0, 1 - dt * 6);
      // D2: preman tidak boleh masuk laut (mengejar pemain sampai dermaga).
      t.z = this.world.clampShore(t.x, t.z);
      const fixed = this.world.resolveCollision(t.x, t.z, 0.6);
      t.x = fixed.x; t.z = fixed.z;
    }
  }

  sync() {
    const all = [...this.peds, ...this.thugs];
    for (let i = 0; i < all.length && i < MAX_PEDS; i++) {
      const p = all[i];
      const vis = p.alive ? 1 : 0;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      this._e.set(0, p.heading, 0);
      this._q.setFromEuler(this._e);
      this._v.set(p.x, 0.75, p.z);
      this._m.compose(this._v, this._q, this._s);
      this.bodies.setMatrixAt(i, vis ? this._m : this._zero);
      this._v.set(p.x, 1.55, p.z);
      this._m.compose(this._v, this._q, this._s);
      this.heads.setMatrixAt(i, vis ? this._m : this._zero);
    }
    for (let i = all.length; i < MAX_PEDS; i++) {
      this.bodies.setMatrixAt(i, this._zero);
      this.heads.setMatrixAt(i, this._zero);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    // Bandana hanya untuk preman hidup.
    let bi = 0;
    for (const t of this.thugs) {
      if (!t.alive || bi >= 6) continue;
      this._e.set(0, t.heading, 0);
      this._q.setFromEuler(this._e);
      this._v.set(t.x, 1.62, t.z);
      this._m.compose(this._v, this._q, this._s);
      this.bands.setMatrixAt(bi, this._m);
      bi++;
    }
    for (; bi < 6; bi++) this.bands.setMatrixAt(bi, this._zero);
    this.bands.instanceMatrix.needsUpdate = true;
  }
}
