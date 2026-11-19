// Neon Bay — the police.
// One patrol car per wanted star. They chase, they slow down as they
// close in (so they can actually stay on the player instead of
// overshooting past), and they arrest a slow player who stays within
// five metres for two seconds. Contact hurts; an arrest ends the run.
// This file keeps its own list, policeCars — it never touches the
// vehicle list, so the two can never overwrite each other.

import { THREE } from "./three-shim.js";
import { WORLD, POLICE, WANTED } from "./config.js";
import { makeCarMesh } from "./vehicles.js";

export const policeCars = [];

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function spawnOne(G, scene) {
  // Appear on a ring around the player, 45-70 m out.
  const ang = Math.random() * Math.PI * 2;
  const dist = POLICE.spawnMin + Math.random() * (POLICE.spawnMax - POLICE.spawnMin);
  let x = G.player.x + Math.sin(ang) * dist;
  let z = G.player.z + Math.cos(ang) * dist;
  const p = { x, z };
  G.world.clampPlayable(p, 2);
  x = p.x;
  z = p.z;
  const mesh = makeCarMesh(0xf2f2f2, true);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  const car = {
    mesh,
    x,
    z,
    heading: Math.atan2(G.player.x - x, G.player.z - z),
    speed: 0,
    kind: "police",
    arrestTimer: 0,
    flash: Math.random(),
  };
  policeCars.push(car);
  return car;
}

function removeOne(G, scene) {
  // Take the farthest car off the street.
  let worst = null;
  let worstD = -1;
  for (const car of policeCars) {
    const dx = car.x - G.player.x;
    const dz = car.z - G.player.z;
    const d = dx * dx + dz * dz;
    if (d > worstD) {
      worstD = d;
      worst = car;
    }
  }
  if (!worst) return;
  scene.remove(worst.mesh);
  const i = policeCars.indexOf(worst);
  if (i >= 0) policeCars.splice(i, 1);
}

export function syncPolice(G, scene) {
  const want = Math.max(0, Math.min(WANTED.max, G.wanted));
  while (policeCars.length < want) spawnOne(G, scene);
  while (policeCars.length > want) removeOne(G, scene);
}

export function clearPolice(G, scene) {
  while (policeCars.length > 0) removeOne(G, scene);
}

// Place police cars at exact spots (shot staging). Spawns what is missing.
export function placePolice(G, scene, spots) {
  syncPolice(G, scene);
  while (policeCars.length < spots.length) spawnOne(G, scene);
  spots.forEach((s, i) => {
    const car = policeCars[i];
    if (!car) return;
    car.x = s.x;
    car.z = s.z;
    car.heading = s.heading ?? Math.atan2(G.player.x - s.x, G.player.z - s.z);
    car.speed = s.speed ?? 0;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  });
}

export function updatePolice(G, dt, scene) {
  syncPolice(G, scene);
  const px = G.player.x;
  const pz = G.player.z;
  const playerSpeed = G.inCar && G.playerCar ? Math.abs(G.playerCar.speed) : G.playerSpeed;
  for (const car of policeCars) {
    const dx = px - car.x;
    const dz = pz - car.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Steer toward the player.
    const desired = Math.atan2(dx, dz);
    const diff = wrapAngle(desired - car.heading);
    const turn = 2.4 * dt;
    car.heading += Math.max(-turn, Math.min(turn, diff));
    // Match the player's pace when close, so the car can stay on the
    // player instead of blasting past. Far away, come in fast.
    let target;
    if (dist > 25) target = POLICE.topSpeed;
    else target = Math.max(4, playerSpeed + 1.5);
    car.speed += (target - car.speed) * Math.min(1, dt * 1.2);
    if (car.speed < 0) car.speed = 0;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let nx = car.x + fx * car.speed * dt;
    let nz = car.z + fz * car.speed * dt;
    if (G.world.collides(nx, car.z, 1.4)) {
      nx = car.x;
      car.speed *= 0.5;
    }
    if (G.world.collides(car.x, nz, 1.4)) {
      nz = car.z;
      car.speed *= 0.5;
    }
    const p = { x: nx, z: nz };
    G.world.clampPlayable(p, 1.4);
    car.x = p.x;
    car.z = p.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    // Too far away to matter: pull the car back into the chase.
    if (dist > 220) {
      const ang = Math.random() * Math.PI * 2;
      car.x = px + Math.sin(ang) * 55;
      car.z = pz + Math.cos(ang) * 55;
      const q = { x: car.x, z: car.z };
      G.world.clampPlayable(q, 2);
      car.x = q.x;
      car.z = q.z;
    }
    // Flash the light bar, red then blue.
    car.flash += dt;
    const redOn = Math.floor(car.flash / 0.28) % 2 === 0;
    if (car.mesh.userData.lightRed) {
      car.mesh.userData.lightRed.visible = redOn;
      car.mesh.userData.lightBlue.visible = !redOn;
    }
    // Touching the player hurts. A slow player held close gets arrested.
    if (dist < 3.4) {
      const rate = G.inCar ? 5 : POLICE.contactDamage;
      G.damagePlayer(rate * dt, "police");
    }
    if (dist < POLICE.arrestDist && playerSpeed < POLICE.slowSpeed) {
      car.arrestTimer += dt;
      if (car.arrestTimer >= POLICE.arrestSeconds) {
        car.arrestTimer = 0;
        G.busted();
        return;
      }
    } else {
      car.arrestTimer = 0;
    }
  }
}
