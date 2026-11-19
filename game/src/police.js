// Neon Bay — polisi: kejar, tahan, tangkap (v3, dari nol).
// Perbaikan v2: polisi MELAMBAT saat dekat pemain dan MENAHAN posisi di
// sampingnya (bukan melaju melewatinya), sehingga penangkapan benar-benar
// bisa terjadi; sentuhan hanya memberi damage kecil supaya BUSTED sempat
// terjadi sebelum pemain mati; polisi menyerah bila pemain sudah >80 m.

import { WORLD, POLICE } from './config.js';

export class Police {
  constructor(fleet, world) {
    this.fleet = fleet;
    this.world = world;
    this.cars = [];
    this.arrestTimer = 0;
    this.ramTimer = 0;
    this.sirenPhase = 0;
  }

  count() { return this.cars.length; }

  nearestDist(x, z) {
    let best = 1e9;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < best) best = d;
    }
    return best;
  }

  // Samakan jumlah mobil polisi dengan bintang wanted.
  syncCount(wanted, px, pz) {
    while (this.cars.length < wanted) this._spawn(px, pz);
    while (this.cars.length > wanted) {
      const c = this.cars.pop();
      this.fleet.remove(c);
    }
  }

  // Buat satu mobil polisi di posisi tertentu (staging screenshot / debug).
  // `scene` diterima demi kompatibilitas pemanggil, armada sudah pegang scene.
  spawn(scene, x, z) {
    const rec = this.fleet.add({
      kind: 'police',
      x, z,
      heading: Math.PI,
      speed: 0, targetSpeed: POLICE.chaseSpeed,
      color: 0x1a1a22, owned: false, lightBar: true,
      searchTimer: 0, holding: false,
    });
    this.cars.push(rec);
    return rec;
  }

  _spawn(px, pz) {
    // Muncul di jalan terdekat, ~45 m dari pemain.
    const lines = WORLD.roadLines;
    // Geser dari pemain ke arah acak sejauh spawnDist, lalu jepit ke jalan terdekat.
    const a = Math.random() * Math.PI * 2;
    const x = px + Math.cos(a) * POLICE.spawnDist;
    const z = pz + Math.sin(a) * POLICE.spawnDist;
    const snapX = lines.reduce((p, l) => (Math.abs(l - x) < Math.abs(p - x) ? l : p), lines[0]);
    const snapZ = lines.reduce((p, l) => (Math.abs(l - z) < Math.abs(p - z) ? l : p), lines[0]);
    const useX = Math.abs(snapX - x) < Math.abs(snapZ - z);
    const rec = this.fleet.add({
      kind: 'police',
      x: useX ? snapX : x, z: useX ? z : snapZ,
      heading: Math.atan2(px - x, pz - z),
      speed: 0, targetSpeed: POLICE.chaseSpeed,
      color: 0x1a1a22, owned: false, lightBar: true,
      searchTimer: 0, holding: false,
    });
    this.cars.push(rec);
  }

  _turnToward(rec, targetHeading, dt, rate) {
    let diff = targetHeading - rec.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    rec.heading += step;
  }

  // Dipanggil tiap tick. ctx: {player, onBusted, onRam}
  update(dt, ctx) {
    const p = ctx.player;
    const pSpeed = p.speed;
    let nearest = 1e9;
    this.sirenPhase += dt;
    for (const c of this.cars) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < nearest) nearest = dist;
      // Menyerah bila pemain sudah sangat jauh: berhenti mengejar.
      if (dist > POLICE.standDownDist) {
        c.searchTimer += dt;
        c.targetSpeed = 0;
        c.speed += (0 - c.speed) * Math.min(1, dt * 2);
        if (c.searchTimer > 8) {
          // Mundur dari kejaran (tetap ada sebagai patroli diam).
          c.searchTimer = 0;
        }
        continue;
      }
      c.searchTimer = 0;
      if (dist < 10) {
        // DEKAT: melambat dan menahan posisi di samping pemain.
        c.holding = true;
        const wantHeading = Math.atan2(dx, dz);
        this._turnToward(c, wantHeading, dt, 2.5);
        const targetSpeed = Math.min(pSpeed + 1.5, 8);
        c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 3);
      } else {
        c.holding = false;
        const wantHeading = Math.atan2(dx, dz);
        this._turnToward(c, wantHeading, dt, 2.0);
        c.speed += (POLICE.chaseSpeed - c.speed) * Math.min(1, dt * 1.5);
      }
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      const fixed = this.world.resolveCollision(c.x, c.z, 2.2);
      c.x = fixed.x; c.z = fixed.z;
      // Sentuhan dengan pemain jalan kaki: damage kecil + jeda.
      this.ramTimer -= dt;
      if (!p.inCar && dist < 3.2 && this.ramTimer <= 0) {
        this.ramTimer = POLICE.ramCooldown;
        ctx.onRam(POLICE.ramDamage);
      }
      // Sentuhan dengan mobil pemain: dorong + damage kecil.
      if (p.inCar && dist < 4.6 && this.ramTimer <= 0) {
        this.ramTimer = POLICE.ramCooldown;
        ctx.onRam(2);
        p.speed *= 0.85;
      }
    }
    // Penangkapan: HANYA saat jalan kaki — polisi < 5 m DAN pemain lambat
    // (< 3 m/s) selama 2 detik. Di dalam mobil polisi hanya menabrak.
    if (!p.inCar && nearest < POLICE.arrestDist && pSpeed < POLICE.arrestStill && this.cars.length > 0) {
      this.arrestTimer += dt;
      if (this.arrestTimer >= POLICE.arrestTime) {
        this.arrestTimer = 0;
        ctx.onBusted();
      }
    } else {
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
    }
    return nearest;
  }

  clearAll() {
    for (const c of this.cars) this.fleet.remove(c);
    this.cars = [];
    this.arrestTimer = 0;
  }
}
