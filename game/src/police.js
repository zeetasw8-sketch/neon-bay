// NEON BAY — wanted level and Bay PD pursuit.
'use strict';
const NBPolice = {
  cars: [],
  spawnTimer: 0,
  sirenOn: false,

  init(scene) { this.cars = []; this.spawnTimer = 0; },

  spawn(scene, nearX, nearZ) {
    // Spawn a police car on a nearby road, behind the player if possible.
    const C = NB_CONFIG, step = C.blockSize + C.roadWidth, half = (C.blocks * step) / 2;
    const vertical = Math.random() < 0.5;
    const line = Math.max(-half, Math.min(half, (vertical ? nearX : nearZ) + (Math.random() < 0.5 ? -1 : 1) * 70));
    const along = (vertical ? nearZ : nearX) - 45;
    const car = NBVehicles.spawnCar(
      vertical ? line : along, vertical ? along : line,
      0, 0x111122, { police: true });
    // keep police out of the civilian car lists' traffic handling
    const idx = NBVehicles.cars.indexOf(car);
    if (idx >= 0) NBVehicles.cars.splice(idx, 1);
    car.speed = 12;
    car.bustTimer = 0;
    this.cars.push(car);
    return car;
  },

  desiredCount(wanted) { return wanted; }, // 1 police car per star (cap 5)

  update(dt, playerPos, playerSpeed, wanted) {
    const game = window.NBGame;
    // Spawn / despawn to match wanted level
    if (wanted > 0 && this.cars.length < this.desiredCount(wanted)) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 2.2;
        this.spawn(NBWorld.scene, playerPos.x, playerPos.z);
      }
    }
    if (wanted === 0) {
      for (const c of this.cars) NBWorld.scene.remove(c.mesh);
      this.cars = [];
      if (this.sirenOn) { NBAudio.siren(false); this.sirenOn = false; }
      return;
    }
    if (!this.sirenOn) { NBAudio.siren(true); this.sirenOn = true; }

    const topSpeed = NB_CONFIG.policeTopSpeed[Math.min(5, wanted)] || 26;
    for (const car of this.cars) {
      const dx = playerPos.x - car.mesh.position.x;
      const dz = playerPos.z - car.mesh.position.z;
      const d = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      // steer toward player with limited turn rate
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      car.speed = Math.min(topSpeed, car.speed + 14 * dt);
      let nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
      let nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
      const hit = NBWorld.resolveCircle(nx, nz, 2.4);
      if (hit) { nx = hit.x; nz = hit.z; car.speed *= 0.5; car.heading += 0.9; }
      const cl = NBWorld.clampBounds(nx, nz);
      car.mesh.position.x = cl.x; car.mesh.position.z = cl.z;
      car.mesh.rotation.y = car.heading;
      // flashing light bar
      if (car.mesh.userData.lightBar) {
        car.siren = (car.siren || 0) + dt;
        const phase = Math.floor(car.siren * 6) % 2 === 0;
        car.mesh.userData.lightBar[0].material.color.setHex(phase ? 0xff2222 : 0x550000);
        car.mesh.userData.lightBar[1].material.color.setHex(phase ? 0x000055 : 0x2244ff);
      }
      // Ram: slow the player's car / hurt the player on foot
      if (d < 4.2) {
        if (game.inCar) {
          const pc = NBVehicles.playerCar;
          if (pc) pc.speed *= 0.94;
          if (Math.abs(pc ? pc.speed : 0) > 6 || d < 3.2) game.shake(0.25);
        } else if (d < 2.6) {
          game.damagePlayer(6 * dt * 10, 'police');
        }
      }
      // Bust: player slow and a cop right on them
      if (d < 5 && playerSpeed < 3) {
        car.bustTimer += dt;
        if (car.bustTimer > 2.0) game.busted();
      } else {
        car.bustTimer = 0;
      }
    }
  },

  clearAll() {
    for (const c of this.cars) NBWorld.scene.remove(c.mesh);
    this.cars = [];
    if (this.sirenOn) { NBAudio.siren(false); this.sirenOn = false; }
  },
};
