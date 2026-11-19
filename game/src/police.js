// Neon Bay — police (v5 rebuild). One car per wanted star. A police car
// steers toward the player but eases off as it closes in (an arrive
// behaviour), so it can sit beside the player and bust them instead of
// overshooting at full speed — the P1-1 fix. Contact damage is low on
// purpose, so BUSTED lands before death. If every police car is farther
// than 45 m and the player stays clean, a star fades every 20 s.

import { NB_CONFIG as C, mulberry32, clamp, dist2d, wrapAngle } from './config.js';
import { buildCarMesh } from './vehicles.js';

export function createPolice(world, scene) {
  const rnd = mulberry32(99);
  const police = {
    cars: [],
    bustTimer: 0,
    _lightT: 0,

    spawn(sceneArg, x, z) {
      const mesh = buildCarMesh(0x1a1d24, true);
      mesh.position.set(x, 0, z);
      const car = {
        mesh, heading: 0, speed: 0,
        stuckT: 0, reverseT: 0,
        lightBar: mesh.getObjectByName('lightbar'),
        lightPhase: rnd() < 0.5,
      };
      (sceneArg || scene).add(mesh);
      this.cars.push(car);
      return car;
    },

    _spawnNearPlayer(game) {
      // A random bearing, ~55 m out, on open ground (not inside a building).
      for (let tries = 0; tries < 8; tries++) {
        const a = rnd() * Math.PI * 2;
        const x = game.playerPos.x + Math.sin(a) * C.policeSpawnDist;
        const z = game.playerPos.z + Math.cos(a) * C.policeSpawnDist;
        if (Math.abs(x) > 205 || Math.abs(z) > 205) continue;
        const c = world.collideCircle(x, z, 3);
        if (Math.abs(c.x - x) > 0.5 || Math.abs(c.z - z) > 0.5) continue;
        const car = this.spawn(scene, c.x, c.z);
        car.heading = Math.atan2(game.playerPos.x - c.x, game.playerPos.z - c.z);
        return car;
      }
      return this.spawn(scene, game.playerPos.x + C.policeSpawnDist, game.playerPos.z);
    },

    setCount(game, n) {
      n = clamp(n, 0, C.maxWanted);
      while (this.cars.length < n) this._spawnNearPlayer(game);
      while (this.cars.length > n) {
        // Drop the farthest car first.
        let far = 0, farD = -1;
        this.cars.forEach((c, i) => {
          const d = dist2d(c.mesh.position.x, c.mesh.position.z, game.playerPos.x, game.playerPos.z);
          if (d > farD) { farD = d; far = i; }
        });
        const [gone] = this.cars.splice(far, 1);
        scene.remove(gone.mesh);
      }
    },

    clear() {
      for (const c of this.cars) scene.remove(c.mesh);
      this.cars.length = 0;
      this.bustTimer = 0;
    },

    update(game, dt) {
      this.setCount(game, game.wanted);
      const px = game.playerPos.x, pz = game.playerPos.z;
      const pSpeed = game.playerSpeed || 0;
      let anyNear = false;

      for (const c of this.cars) {
        const dx = px - c.mesh.position.x;
        const dz = pz - c.mesh.position.z;
        const d = Math.max(0.01, Math.hypot(dx, dz));
        const wantHeading = Math.atan2(dx, dz);
        // Steer toward the player, limited turn rate.
        const dh = wrapAngle(wantHeading - c.heading);
        // A fast car cannot turn sharply: the turn rate falls with speed,
        // so a staged police car ahead of the player cannot spin around
        // and ruin the chase framing in the first seconds.
        const turnRate = clamp(2.8 - Math.abs(c.speed) * 0.08, 0.7, 2.8);
        const turn = clamp(dh, -turnRate * dt, turnRate * dt);
        c.heading += turn;
        // Arrive behaviour: ease off as we close in, stop beside the player.
        let target = clamp((d - 3) * 0.55, 0, C.policeTopSpeed);
        if (c.reverseT > 0) {
          c.reverseT -= dt;
          target = -4;
        }
        c.speed += clamp(target - c.speed, -10 * dt, 7 * dt);
        if (Math.abs(c.speed) < 0.05 && target === 0) c.speed = 0;
        const nx = c.mesh.position.x + Math.sin(c.heading) * c.speed * dt;
        const nz = c.mesh.position.z + Math.cos(c.heading) * c.speed * dt;
        let p = world.collideCircle(nx, nz, 1.6);
        p = world.clampShore(p.x, p.z);
        const moved = dist2d(p.x, p.z, c.mesh.position.x, c.mesh.position.z);
        // Stuck recovery: blocked and far from the player -> reverse briefly.
        if (Math.abs(c.speed) > 3 && moved < Math.abs(c.speed) * dt * 0.25 && d > 12) {
          c.stuckT += dt;
          if (c.stuckT > 2) { c.reverseT = 1; c.stuckT = 0; }
        } else {
          c.stuckT = 0;
        }
        c.mesh.position.x = p.x;
        c.mesh.position.z = p.z;
        c.mesh.rotation.y = c.heading;
        // Flashing red/blue roof bar.
        this._lightT += dt;
        if (c.lightBar) {
          const phase = Math.floor(this._lightT * 2.4 + (c.lightPhase ? 1 : 0)) % 2 === 0;
          c.lightBar.material.color.setHex(phase ? 0xff2a2a : 0x2a6aff);
        }
        // Bust window: close and the player slow.
        if (d < C.policeBustDist && pSpeed < C.policeBustSpeed) anyNear = true;
        // Contact damage while touching (low, so BUSTED wins over death).
        if (d < 2.6 && !game.inCar && game.state === 'playing') {
          game.damagePlayer(C.policeContactDps * dt, 'police');
        }
      }

      if (anyNear && game.state === 'playing' && !game.inCar) {
        this.bustTimer += dt;
        if (this.bustTimer >= C.policeBustTime) {
          this.bustTimer = 0;
          game.busted();
        }
      } else {
        this.bustTimer = 0;
      }

      // Wanted decay: no police within 45 m and no fresh crime.
      if (game.wanted > 0) {
        let nearest = Infinity;
        for (const c of this.cars) {
          nearest = Math.min(nearest, dist2d(c.mesh.position.x, c.mesh.position.z, px, pz));
        }
        const clean = game.timeSinceCrime > 4;
        if ((this.cars.length === 0 || nearest > C.policeLoseDist) && clean) {
          game._decayT = (game._decayT || 0) + dt;
          if (game._decayT >= C.wantedDecaySeconds) {
            game._decayT = 0;
            game.setWanted(game.wanted - 1);
          }
        } else {
          game._decayT = 0;
        }
      }
    },
  };
  return police;
}
