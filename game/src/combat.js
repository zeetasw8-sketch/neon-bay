// Neon Bay — combat: pukul + pistol (v3, dari nol).
// Garis tembak DIPAKAI ULANG (satu garis, geometri tetap) supaya tidak bocor.
// Aturan panas: tembakan yang meleset TIDAK menaikkan wanted; tembakan yang
// mengenai preman (musuh) juga tidak; hanya yang mengenai pejalan kaki yang
// menaikkan wanted. Pukulan ke preman tidak menaikkan wanted.

const THREE = window.THREE;

import { PLAYER } from './config.js';

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.punchTimer = 0;
    this.gunTimer = 0;
    this.tracerTimer = 0;
    // Satu garis tembak yang dipakai ulang untuk semua tembakan.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 });
    this.tracer = new THREE.Line(geo, mat);
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    scene.add(this.tracer);
  }

  update(dt) {
    this.punchTimer -= dt;
    this.gunTimer -= dt;
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
  }

  // Pukulan: mengenai SEMUA preman + pejalan kaki dalam jangkauan
  // (tanpa cek arah — tinju jarak dekat).
  // Kembalikan daftar yang kena (dengan arah dorong).
  punch(px, pz, heading, people) {
    if (this.punchTimer > 0) return [];
    this.punchTimer = PLAYER.punchCooldown;
    const hits = [];
    const check = (t) => {
      if (!t.alive) return;
      const dx = t.x - px, dz = t.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.punchRange + 0.6) {
        hits.push({ target: t, dirX: dx / Math.max(d, 0.01), dirZ: dz / Math.max(d, 0.01) });
      }
    };
    for (const t of people.thugs) check(t);
    for (const p of people.peds) check(p);
    return hits;
  }

  // Tembakan: sinar dari pemain ke arah kamera (yaw kamera). Kembalikan hasil:
  // {hit: 'thug'|'ped'|null, target, endX, endZ}
  shoot(px, pz, py, aimYaw, people) {
    if (this.gunTimer > 0) return null;
    this.gunTimer = PLAYER.gunCooldown;
    const dx = Math.sin(aimYaw), dz = Math.cos(aimYaw);
    let best = null, bestD = PLAYER.gunRange;
    const test = (t, kind) => {
      if (!t.alive) return;
      const rx = t.x - px, rz = t.z - pz;
      const along = rx * dx + rz * dz;
      if (along < 0.5 || along > bestD) return;
      const perp = Math.abs(rx * dz - rz * dx);
      if (perp < 1.5) { bestD = along; best = { hit: kind, target: t }; }
    };
    for (const t of people.thugs) test(t, 'thug');
    for (const p of people.peds) test(p, 'ped');
    const endX = px + dx * bestD, endZ = pz + dz * bestD;
    // Gambar ulang garis yang sama (posisi ditulis ke buffer yang sudah ada).
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, px, py, pz);
    pos.setXYZ(1, endX, py, endZ);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = 0.12;
    return { ...(best || { hit: null, target: null }), endX, endZ };
  }
}
