// Neon Bay — combat (v5 rebuild). F punches: an arc that hits every thug
// in reach (2 damage each); if no thug is in reach it catches the nearest
// pedestrian instead, which is a crime (+1 star). CLICK fires the pistol
// (only once Mara hands it over): a hitscan ray through the centre of the
// screen. A shot that misses, or that drops a thug, never raises heat —
// only a shot that hits an innocent does.

import { NB_CONFIG as C, dist2d } from './config.js';

export function createCombat(world, scene) {
  // One reusable tracer line (no per-shot allocation).
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.frustumCulled = false;
  scene.add(tracer);
  let tracerT = 0;

  const combat = {
    punchCd: 0,
    shootCd: 0,

    punch(game) {
      if (this.punchCd > 0 || game.state !== 'playing') return;
      this.punchCd = 0.35;
      game.audio.punch();
      const px = game.playerPos.x, pz = game.playerPos.z;
      let hitThug = false;
      for (const t of [...game.people.thugs]) {
        const d = dist2d(px, pz, t.mesh.position.x, t.mesh.position.z);
        if (d <= C.punchRange) {
          hitThug = true;
          game.people.damageThug(t, C.punchDamage);
        }
      }
      if (!hitThug) {
        // Nearest pedestrian in reach takes the punch — and it is a crime.
        let best = null, bestD = C.punchRange;
        for (const p of game.people.peds) {
          const d = dist2d(px, pz, p.mesh.position.x, p.mesh.position.z);
          if (d < bestD) { best = p; bestD = d; }
        }
        if (best) {
          game.commitCrime(1);
          // The pedestrian flees.
          best.speed = 5;
          best.dir = best.mesh.position.z >= pz ? 1 : -1;
          game.hud.toast('The crowd saw that!', 2);
        }
      }
      game.playerLunge = 0.18; // a short forward lunge, read by main
    },

    shoot(game) {
      if (this.shootCd > 0 || game.state !== 'playing' || !game.hasGun) return;
      this.shootCd = 0.28;
      game.audio.gunshot();
      game.camera.updateMatrixWorld();
      const origin = new THREE.Vector3();
      game.camera.getWorldPosition(origin);
      const dir = new THREE.Vector3();
      game.camera.getWorldDirection(dir);
      const maxDist = 70;
      let best = null, bestT = maxDist, bestKind = null;
      // Nearest person whose body sphere the ray passes close by.
      const testPerson = (x, z, radius, obj, kind) => {
        const ox = x - origin.x, oz = z - origin.z;
        const along = ox * dir.x + oz * dir.z;
        if (along < 0.5 || along > maxDist) return;
        const cx = origin.x + dir.x * along, cz = origin.z + dir.z * along;
        const dd = Math.hypot(x - cx, z - cz);
        if (dd < radius && along < bestT) { best = obj; bestT = along; bestKind = kind; }
      };
      for (const t of game.people.thugs) testPerson(t.mesh.position.x, t.mesh.position.z, 1.0, t, 'thug');
      for (const p of game.people.peds) testPerson(p.mesh.position.x, p.mesh.position.z, 0.9, p, 'ped');
      // A building between the muzzle and the target blocks the shot.
      if (best) {
        const hx = origin.x + dir.x * bestT, hz = origin.z + dir.z * bestT;
        if (this._segmentBlocked(origin.x, origin.z, hx, hz)) { best = null; bestT = maxDist; }
      }
      const endT = best ? bestT : maxDist;
      const end = new THREE.Vector3(origin.x + dir.x * endT, 1.3, origin.z + dir.z * endT);
      // Tracer from the muzzle to the hit point.
      const pos = tracerGeo.attributes.position.array;
      pos[0] = game.playerPos.x; pos[1] = 1.4; pos[2] = game.playerPos.z;
      pos[3] = end.x; pos[4] = end.y; pos[5] = end.z;
      tracerGeo.attributes.position.needsUpdate = true;
      tracerMat.opacity = 0.9;
      tracerT = 0.14;
      game.shake(0.12);
      if (bestKind === 'thug') {
        game.people.damageThug(best, C.pistolDamage);
      } else if (bestKind === 'ped') {
        // Hitting an innocent is a crime; a miss is not.
        game.commitCrime(1);
        best.speed = 6;
        game.hud.toast('You shot a bystander!', 2);
      }
    },

    // Does the segment (x0,z0)-(x1,z1) cross any building footprint?
    _segmentBlocked(x0, z0, x1, z1) {
      for (const b of world.colliders) {
        // Slab test on the 2D segment.
        let tmin = 0, tmax = 1;
        const dx = x1 - x0, dz = z1 - z0;
        if (Math.abs(dx) < 1e-9) {
          if (x0 < b.x0 || x0 > b.x1) continue;
        } else {
          let t1 = (b.x0 - x0) / dx, t2 = (b.x1 - x0) / dx;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        if (Math.abs(dz) < 1e-9) {
          if (z0 < b.z0 || z0 > b.z1) continue;
        } else {
          let t1 = (b.z0 - z0) / dz, t2 = (b.z1 - z0) / dz;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) continue;
        }
        return true;
      }
      return false;
    },

    update(dt) {
      this.punchCd = Math.max(0, this.punchCd - dt);
      this.shootCd = Math.max(0, this.shootCd - dt);
      if (tracerT > 0) {
        tracerT -= dt;
        tracerMat.opacity = Math.max(0, tracerT / 0.14) * 0.9;
      } else {
        tracerMat.opacity = 0;
      }
    },
  };
  return combat;
}
