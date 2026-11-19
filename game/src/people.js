// Neon Bay — people (v5 rebuild): 16 pedestrians wandering the sidewalks
// and the 3 dock thugs of JOB 5 (red bandanas). Thugs chase the player
// inside 35 m and punch at close range; a punch from the player is an arc
// that hits every thug in reach.

import { NB_CONFIG as C, mulberry32, clamp, dist2d } from './config.js';

const SHIRT_COLORS = [0xd8b25a, 0x5a8ad8, 0xd85a5a, 0x5ad88a, 0xd8d8d8, 0x8a5ad8, 0x5ad8d8];
const SKIN = [0xe8b98a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

function buildPersonMesh(shirt, skin, bandana) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 0.95;
  g.add(body);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x22242c }),
  );
  legs.position.y = 0.28;
  g.add(legs);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  g.add(head);
  if (bandana) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.12, 0.48),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    band.position.y = 1.78;
    g.add(band);
  }
  return g;
}

export function createPeople(world, scene) {
  const rnd = mulberry32(4242);
  const people = {
    peds: [],
    thugs: [],

    spawnThugs(game) {
      this.clearThugs();
      const spots = [[148, 188], [152, 192], [150, 194]];
      for (let i = 0; i < C.thugCount; i++) {
        const mesh = buildPersonMesh(0x1c1e24, SKIN[i % SKIN.length], true);
        mesh.scale.set(1.15, 1.15, 1.15);
        mesh.position.set(spots[i][0], 0, spots[i][1]);
        scene.add(mesh);
        this.thugs.push({
          mesh, hp: C.thugHp, punchCd: i * 0.5,
          x: spots[i][0], z: spots[i][1],
        });
      }
    },

    clearThugs() {
      for (const t of this.thugs) scene.remove(t.mesh);
      this.thugs.length = 0;
    },

    damageThug(thug, dmg) {
      thug.hp -= dmg;
      // Knockback away from the player.
      const game = window.NBGame;
      if (game) {
        const dx = thug.mesh.position.x - game.playerPos.x;
        const dz = thug.mesh.position.z - game.playerPos.z;
        const d = Math.max(0.5, Math.hypot(dx, dz));
        thug.mesh.position.x += (dx / d) * 0.8;
        thug.mesh.position.z += (dz / d) * 0.8;
      }
      if (thug.hp <= 0) {
        const i = this.thugs.indexOf(thug);
        if (i >= 0) this.thugs.splice(i, 1);
        // Fall over, then fade out of the scene.
        thug.mesh.rotation.x = -Math.PI / 2;
        thug.mesh.position.y = 0.25;
        const dead = thug.mesh;
        setTimeout(() => scene.remove(dead), 900);
        return true;
      }
      return false;
    },

    update(game, dt) {
      // --- pedestrians: stroll the sidewalks, turn at the ends ---
      for (const p of this.peds) {
        p.z += p.dir * p.speed * dt;
        if (p.z > 200) { p.z = 200; p.dir = -1; }
        if (p.z < -200) { p.z = -200; p.dir = 1; }
        p.mesh.position.set(p.x, 0, p.z);
        p.mesh.rotation.y = p.dir === 1 ? 0 : Math.PI;
        // Step aside if the player walks into them.
        const d = dist2d(p.x, p.z, game.playerPos.x, game.playerPos.z);
        if (d < 1.6 && d > 0.01) {
          const push = (1.6 - d) / d;
          p.x += (p.x - game.playerPos.x) * push * 0.5;
          p.z += (p.z - game.playerPos.z) * push * 0.5;
        }
      }
      // --- thugs: chase inside 35 m, punch up close ---
      for (const t of [...this.thugs]) {
        t.punchCd = Math.max(0, t.punchCd - dt);
        const px = game.playerPos.x, pz = game.playerPos.z;
        const d = dist2d(t.mesh.position.x, t.mesh.position.z, px, pz);
        if (d < C.thugChaseDist && game.state === 'playing' && !game.inCar) {
          const dx = px - t.mesh.position.x, dz = pz - t.mesh.position.z;
          const dd = Math.max(0.01, Math.hypot(dx, dz));
          const sp = C.thugSpeed * dt;
          let nx = t.mesh.position.x + (dx / dd) * sp;
          let nz = t.mesh.position.z + (dz / dd) * sp;
          const c = world.collideCircle(nx, nz, 0.6);
          const s = world.clampShore(c.x, c.z);
          t.mesh.position.x = s.x;
          t.mesh.position.z = s.z;
          t.mesh.rotation.y = Math.atan2(dx, dz);
          if (d < 1.9 && t.punchCd <= 0) {
            t.punchCd = 1.4;
            game.damagePlayer(C.thugPunchDamage, 'thug');
            game.audio.punch();
          }
        }
      }
    },
  };

  // --- 16 pedestrians on the sidewalks (road line +/- 10.5 m) ---
  const roads = [-175, -105, -35, 35, 105, 175];
  for (let i = 0; i < C.pedCount; i++) {
    const line = roads[i % roads.length];
    const side = i % 2 === 0 ? -10.5 : 10.5;
    const mesh = buildPersonMesh(
      SHIRT_COLORS[i % SHIRT_COLORS.length], SKIN[i % SKIN.length], false,
    );
    const x = line + side;
    const z = -180 + i * 24 + rnd() * 8;
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    people.peds.push({
      mesh, x, z, dir: i % 2 === 0 ? 1 : -1, speed: 1 + rnd() * 0.8,
    });
  }

  return people;
}
