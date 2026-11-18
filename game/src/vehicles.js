// NEON BAY — vehicles: car factory, player driving, traffic AI.
'use strict';
const NBVehicles = {
  cars: [],        // traffic + parked cars (not police)
  parked: [],
  playerCar: null, // car the player is driving, or null

  makeCarMesh(color, isPolice) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x18202e });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
    body.position.y = 0.62; body.castShadow = true; g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 2.2), glassMat);
    cabin.position.set(0, 1.25, -0.25); cabin.castShadow = true; g.add(cabin);
    // Windows: the cabin was one dark slab before — now it reads as a car.
    // Pale-blue windshield + rear window, side glass on both flanks, and a
    // body-colour roof panel so the glass does not run to the roofline.
    const winMat = new THREE.MeshLambertMaterial({ color: 0x9adfff });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), winMat);
    shield.position.set(0, 1.28, 0.88); shield.rotation.x = -0.22; g.add(shield);
    const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.08), winMat);
    rearWin.position.set(0, 1.28, -1.36); rearWin.rotation.x = 0.22; g.add(rearWin);
    for (const sx of [-0.94, 0.94]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 1.6), winMat);
      side.position.set(sx, 1.28, -0.25); g.add(side);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.8), bodyMat);
    roof.position.set(0, 1.6, -0.25); g.add(roof);
    // Bumpers front + rear.
    const bumpMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const bz of [2.22, -2.22]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.12), bumpMat);
      bump.position.set(0, 0.35, bz); g.add(bump);
    }
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const hubMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    const wg = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 12);
    const hg = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 10);
    for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
      const w = new THREE.Mesh(wg, wheelMat);
      w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w);
      // Light hubcap disc on the outer face, so wheels are not flat black.
      const hub = new THREE.Mesh(hg, hubMat);
      hub.rotation.z = Math.PI / 2; hub.position.set(wx + Math.sign(wx) * 0.02, 0.42, wz); g.add(hub);
    }
    // headlights
    const hl = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    for (const hx of [-0.7, 0.7]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.1), hl);
      h.position.set(hx, 0.62, 2.22); g.add(h);
    }
    if (isPolice) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      bar.position.set(0, 1.68, -0.25); g.add(bar);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2244ff }));
      bar2.position.set(0, 1.68, 0.15); g.add(bar2);
      g.userData.lightBar = [bar, bar2];
    }
    return g;
  },

  spawnCar(x, z, heading, color, opts) {
    const o = opts || {};
    const mesh = this.makeCarMesh(color, !!o.police);
    mesh.position.set(x, 0, z); mesh.rotation.y = heading;
    NBWorld.scene.add(mesh);
    const car = {
      mesh, heading, speed: 0, color,
      isPolice: !!o.police, parked: !!o.parked, traffic: !!o.traffic,
      lane: o.lane || null,       // {vertical, line, dir} for traffic
      targetSpeed: o.targetSpeed || (10 + Math.random() * 6),
      stuck: 0, siren: 0, hp: 100,
    };
    if (!o.police) this.cars.push(car);
    if (o.parked) this.parked.push(car);
    return car;
  },

  init(scene) {
    this.cars = []; this.parked = []; this.playerCar = null;
    const rng = NB_RNG(777);
    const C = NB_CONFIG, step = C.blockSize + C.roadWidth, half = (C.blocks * step) / 2;
    // Parked cars along road edges
    for (let i = 0; i < 14; i++) {
      const vertical = rng() < 0.5;
      const line = -half + Math.floor(rng() * (C.blocks + 1)) * step;
      const along = -half + 20 + rng() * (half * 2 - 40);
      const off = (rng() < 0.5 ? -1 : 1) * (C.roadWidth / 2 - 1.6);
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      const heading = vertical ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.spawnCar(x, z, heading, C.carColors[Math.floor(rng() * C.carColors.length)], { parked: true });
    }
    // Traffic cars on road lanes
    for (let i = 0; i < C.trafficCount; i++) {
      const vertical = rng() < 0.5;
      const line = -half + Math.floor(rng() * (C.blocks + 1)) * step;
      const along = -half + 20 + rng() * (half * 2 - 40);
      const dir = rng() < 0.5 ? 1 : -1;
      const off = dir * (C.roadWidth / 4);
      const x = vertical ? line + off : along;
      const z = vertical ? along : line + off;
      const heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const car = this.spawnCar(x, z, heading,
        C.carColors[Math.floor(rng() * C.carColors.length)],
        { traffic: true, lane: { vertical, line, dir }, targetSpeed: 9 + rng() * 7 });
      car.speed = car.targetSpeed;
    }
    // Player's starter car near the garage
    const starter = this.spawnCar(14, 138, Math.PI / 2, 0xe364a5, { parked: true });
    starter.starter = true;
  },

  nearestCar(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const dx = c.mesh.position.x - x, dz = c.mesh.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  },

  // Player enters a car: removes it from traffic/parked lists conceptually.
  enterCar(car) {
    if (car.traffic) car.traffic = false;
    if (car.parked) { car.parked = false; const i = this.parked.indexOf(car); if (i >= 0) this.parked.splice(i, 1); }
    this.playerCar = car;
    return car;
  },
  exitCar() {
    const c = this.playerCar;
    this.playerCar = null;
    if (c) { c.speed = 0; c.parked = true; this.parked.push(c); }
    return c;
  },

  updatePlayerCar(dt) {
    const car = this.playerCar;
    if (!car) return;
    const a = NBInput.axis();
    const handbrake = NBInput.down('Space');
    const accel = -a.z; // W = forward
    if (accel > 0) car.speed += 26 * dt * (car.speed < 0 ? 2.2 : 1);
    else if (accel < 0) {
      if (car.speed > 0.5) car.speed -= 34 * dt;      // brake
      else car.speed -= 12 * dt;                      // reverse
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt); // drag
    }
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = Math.max(-14, Math.min(46, car.speed));
    const steer = a.x * (car.speed >= 0 ? 1 : -1);
    const grip = handbrake ? 2.6 : 1.6;
    car.heading += steer * grip * dt * Math.min(1, Math.abs(car.speed) / 8) * (car.speed >= 0 ? 1 : -1) * -1;
    // NOTE: heading sign tuned so D turns right while driving forward.
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let nx = car.mesh.position.x + fx * car.speed * dt;
    let nz = car.mesh.position.z + fz * car.speed * dt;
    const hit = NBWorld.resolveCircle(nx, nz, 2.4);
    if (hit) {
      nx = hit.x; nz = hit.z;
      if (Math.abs(car.speed) > 12) { NBAudio.crash(); window.NBGame.addWanted(0); window.NBGame.shake(0.35); }
      car.speed *= 0.35;
    }
    const cl = NBWorld.clampBounds(nx, nz);
    nx = cl.x; nz = cl.z;
    car.mesh.position.x = nx; car.mesh.position.z = nz;
    car.mesh.rotation.y = car.heading;
    // lean into turns slightly
    car.mesh.rotation.z = -steer * 0.05 * Math.min(1, Math.abs(car.speed) / 20);
    NBAudio.setEngine(Math.abs(car.speed) / 46, true);
  },

  updateTraffic(dt) {
    const C = NB_CONFIG, step = C.blockSize + C.roadWidth, half = (C.blocks * step) / 2;
    for (const car of this.cars) {
      if (!car.traffic || car === this.playerCar) continue;
      const lane = car.lane;
      let nx = car.mesh.position.x, nz = car.mesh.position.z;
      if (lane.vertical) {
        nz += lane.dir * car.speed * dt;
        nx = lane.line + lane.dir * (C.roadWidth / 4);
        if (nz > half + 18) nz = -half - 18;
        if (nz < -half - 18) nz = half + 18;
        car.heading = lane.dir > 0 ? 0 : Math.PI;
      } else {
        nx += lane.dir * car.speed * dt;
        nz = lane.line + lane.dir * (C.roadWidth / 4);
        if (nx > half + 18) nx = -half - 18;
        if (nx < -half - 18) nx = half + 18;
        car.heading = lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      // Slow down if the player car is right ahead
      const pc = this.playerCar;
      if (pc) {
        const dx = pc.mesh.position.x - nx, dz = pc.mesh.position.z - nz;
        if (Math.hypot(dx, dz) < 9) car.speed = Math.max(0, car.speed - 20 * dt);
        else car.speed = Math.min(car.targetSpeed, car.speed + 8 * dt);
      }
      car.mesh.position.x = nx; car.mesh.position.z = nz;
      car.mesh.rotation.y = car.heading;
    }
  },

  // Simple car-vs-car separation (player car vs others)
  separateCars() {
    const pc = this.playerCar;
    if (!pc) return;
    for (const c of this.cars) {
      if (c === pc || c.isPolice) continue;
      const dx = pc.mesh.position.x - c.mesh.position.x;
      const dz = pc.mesh.position.z - c.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / 2;
        const ux = dx / d, uz = dz / d;
        pc.mesh.position.x += ux * push; pc.mesh.position.z += uz * push;
        if (c.traffic) { c.mesh.position.x -= ux * push; c.mesh.position.z -= uz * push; }
        if (Math.abs(pc.speed) > 10) {
          pc.speed *= 0.6; NBAudio.crash(); window.NBGame.addWanted(0); window.NBGame.shake(0.3);
          window.NBGame.toast('You hit a car!');
        }
      }
    }
  },
};
