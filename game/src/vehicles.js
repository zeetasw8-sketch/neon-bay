// Neon Bay — vehicles (v5 rebuild): traffic, parked cars, the pink starter
// car, and the player's arcade car physics. A car is a Group whose local
// +z is its nose; rotation.y = heading, and heading 0 points south (+z).

import { NB_CONFIG as C, mulberry32, clamp, dist2d } from './config.js';

const CAR_COLORS = [0x4a6fa5, 0x8a4a5a, 0x4a8a5a, 0x8a7a4a, 0x5a5a6a, 0x7a4a8a, 0x3a7a8a, 0xa55a3a];

export function buildCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.85 });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111214 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.2), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.1, -0.25);
  g.add(cabin);
  // Roof in the body colour, bumpers front and rear.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 2.0), bodyMat);
  roof.position.set(0, 1.42, -0.25);
  g.add(roof);
  const bumpF = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.25), new THREE.MeshLambertMaterial({ color: 0x22242a }));
  bumpF.position.set(0, 0.35, 2.15);
  g.add(bumpF);
  const bumpR = bumpF.clone();
  bumpR.position.z = -2.15;
  g.add(bumpR);
  // Headlights on (yellowish) and red taillights.
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  head.position.set(0, 0.62, 2.13);
  g.add(head);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  tail.position.set(0, 0.62, -2.13);
  g.add(tail);
  // Four black wheels with light hubs.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.3, 8);
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xc8c8c8 });
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.36, wz);
    g.add(hub);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    bar.position.set(0, 1.55, -0.25);
    bar.name = 'lightbar';
    g.add(bar);
  }
  return g;
}

export function createVehicles(world, scene) {
  const rnd = mulberry32(777);
  const vehicles = {
    cars: [], // traffic, kind === 'traffic'
    parked: [],
    playerCar: null,

    nearestCar(x, z, r) {
      let best = null, bestD = r;
      for (const c of this.parked) {
        const d = dist2d(x, z, c.mesh.position.x, c.mesh.position.z);
        if (d < bestD) { best = c; bestD = d; }
      }
      // A stopped traffic car can be taken too.
      for (const c of this.cars) {
        if (Math.abs(c.speed) > 1) continue;
        const d = dist2d(x, z, c.mesh.position.x, c.mesh.position.z);
        if (d < bestD) { best = c; bestD = d; }
      }
      return best;
    },

    update(game, dt) {
      // --- traffic: follow the lane, brake for the car ahead ---
      for (const c of this.cars) {
        if (c === this.playerCar) continue;
        // Car-following: slow if the player car (or another car) is ahead.
        let want = c.targetSpeed;
        const ahead = this._carAhead(c, 16);
        if (ahead !== null) want = 0;
        c.speed += clamp(want - c.speed, -8 * dt, 5 * dt);
        if (Math.abs(c.speed) < 0.05 && want === 0) c.speed = 0;
        const z = c.mesh.position.z + c.lane.dir * c.speed * dt;
        c.mesh.position.z = z;
        c.mesh.position.x = c.lane.line + (c.laneOff || 0);
        c.mesh.rotation.y = c.heading;
        if (z > 208) c.mesh.position.z = -208;
        if (z < -208) c.mesh.position.z = 208;
      }
      // --- the player's car ---
      const pc = this.playerCar;
      if (pc && game.inCar) this._drivePlayerCar(game, pc, dt);
    },

    _carAhead(c, range) {
      // Anything stopped or slow in front of c on the same lane.
      const px = c.mesh.position.x, pz = c.mesh.position.z;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
      const all = [...this.cars, ...this.parked];
      for (const o of all) {
        if (o === c) continue;
        const dx = o.mesh.position.x - px, dz = o.mesh.position.z - pz;
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (along > 2 && along < range && side < 3) return o;
      }
      return null;
    },

    _drivePlayerCar(game, pc, dt) {
      const input = game.input;
      const fwd = input.isDown('KeyW') || input.isDown('w');
      const back = input.isDown('KeyS') || input.isDown('s');
      const left = input.isDown('KeyA') || input.isDown('a');
      const right = input.isDown('KeyD') || input.isDown('d');
      const brake = input.isDown(' ') || input.isDown('space');
      if (fwd) pc.speed += C.carAccel * dt;
      if (back) {
        if (pc.speed > 0.5) pc.speed -= C.carBrake * dt;
        else pc.speed -= C.carAccel * 0.6 * dt;
      }
      if (brake) pc.speed -= Math.sign(pc.speed) * 26 * dt;
      if (!fwd && !back) pc.speed -= Math.sign(pc.speed) * 8 * dt;
      if (Math.abs(pc.speed) < 0.15 && !fwd && !back) pc.speed = 0;
      pc.speed = clamp(pc.speed, -C.carReverseTop, C.carTopSpeed);
      const steer = (left ? 1 : 0) - (right ? 1 : 0);
      const spdF = clamp(pc.speed / 10, -1, 1);
      pc.heading += steer * C.carTurn * spdF * dt * (brake ? 1.5 : 1);
      const nx = pc.mesh.position.x + Math.sin(pc.heading) * pc.speed * dt;
      const nz = pc.mesh.position.z + Math.cos(pc.heading) * pc.speed * dt;
      let p = world.collideCircle(nx, nz, 1.6);
      p = world.clampShore(p.x, p.z);
      const hitWall = Math.abs(p.x - nx) > 0.01 || Math.abs(p.z - nz) > 0.01;
      if (hitWall && Math.abs(pc.speed) > 6) {
        game.shake(0.35);
        game.audio.crash();
        game.flashDamage();
        pc.speed *= 0.45;
      } else if (hitWall) {
        pc.speed *= 0.7;
      }
      // Push through / past traffic: lose some speed, never a hard stop.
      for (const o of this.cars) {
        if (o === pc) continue;
        const d = dist2d(p.x, p.z, o.mesh.position.x, o.mesh.position.z);
        if (d < 3.4 && d > 0.01) {
          const push = (3.4 - d) / d;
          o.mesh.position.x += (o.mesh.position.x - p.x) * push * 0.5;
          o.mesh.position.z += (o.mesh.position.z - p.z) * push * 0.5;
          pc.speed *= 0.8;
        }
      }
      pc.mesh.position.x = p.x;
      pc.mesh.position.z = p.z;
      pc.mesh.rotation.y = pc.heading;
      game.playerPos.set(p.x, 0, p.z);
      game.audio.setEngine(Math.abs(pc.speed) / C.carTopSpeed);
    },
  };

  // --- traffic: 10 cars on five roads (x=35 kept clear for the drive test) ---
  const trafficRoads = [-175, -105, -35, 105, 175];
  for (let i = 0; i < C.trafficCount; i++) {
    const line = trafficRoads[i % trafficRoads.length];
    const dir = i % 2 === 0 ? 1 : -1;
    const car = {
      kind: 'traffic',
      mesh: buildCarMesh(CAR_COLORS[i % CAR_COLORS.length], false),
      heading: dir === 1 ? 0 : Math.PI,
      speed: 6 + rnd() * 3,
      targetSpeed: 6 + rnd() * 3,
      lane: { vertical: true, line, dir },
      laneOff: (i % 2 === 0 ? -3.5 : 3.5),
    };
    car.mesh.position.set(line + car.laneOff, 0, -180 + i * 38 + rnd() * 10);
    car.mesh.rotation.y = car.heading;
    scene.add(car.mesh);
    vehicles.cars.push(car);
  }

  // --- parked cars (15). parked[0] is a plain car facing north; the pink
  // starter sits by the garage at (18,142), 4 m from the (14,142) prompt
  // spot and 7.2 m from the (12,138) test teleport.
  const parkedSpots = [
    { x: -35, z: 60, h: Math.PI }, { x: 18, z: 142, h: Math.PI, starter: true },
    { x: -105, z: -20, h: 0 }, { x: 105, z: 80, h: Math.PI }, { x: 175, z: -60, h: 0 },
    { x: -175, z: 120, h: Math.PI }, { x: 35, z: -80, h: 0 }, { x: -35, z: -140, h: Math.PI },
    { x: 105, z: -120, h: 0 }, { x: -105, z: 160, h: Math.PI }, { x: 175, z: 40, h: 0 },
    { x: -175, z: -100, h: Math.PI }, { x: 105, z: 160, h: 0 }, { x: -35, z: 180, h: Math.PI },
    { x: 35, z: 20, h: 0 },
  ];
  for (const s of parkedSpots) {
    const color = s.starter ? 0xff6b9d : CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)];
    const car = {
      kind: 'parked',
      mesh: buildCarMesh(color, false),
      heading: s.h,
      speed: 0,
      targetSpeed: 0,
      starter: !!s.starter,
    };
    car.mesh.position.set(s.x, 0, s.z);
    car.mesh.rotation.y = car.heading;
    scene.add(car.mesh);
    vehicles.parked.push(car);
  }

  return vehicles;
}
