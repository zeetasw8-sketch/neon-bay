// Neon Bay — combat.
// Punching (with knockback) and the pistol (with a visible tracer).
// A punch or a bullet that lands on a thug never raises wanted; the
// same on an innocent pedestrian does. A shot that misses raises
// nothing at all. Damage flashes the screen red; at zero health the
// player is WASTED, pays a fine FIRST, and only then is the save
// written, so a death never banks money it should have lost.

import { THREE } from "./three-shim.js";
import { COMBAT, WANTED } from "./config.js";

export function makeCombat(scene) {
  // One reusable tracer line for gunshots; it is hidden again shortly
  // after each shot so it never leaks geometry.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(6), 3),
  );
  const tracer = new THREE.Line(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
  );
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);
  return { tracer, tracerTimer: 0 };
}

function aimAt(G, tx, tz) {
  // Angle from the player to a target, in the same frame as heading.
  return Math.atan2(tx - G.player.x, tz - G.player.z);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function tryPunch(G) {
  if (G.inCar) return false;
  if (G.punchCooldown > 0) return false;
  G.punchCooldown = 0.45;
  G.audio.punch();
  const range = COMBAT.punchRange;
  let hitAnything = false;
  // Thugs first: hitting one is mission work, never a crime.
  for (const thug of G.thugs) {
    if (thug.hp <= 0) continue;
    const dx = thug.x - G.player.x;
    const dz = thug.z - G.player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > range) continue;
    const want = aimAt(G, thug.x, thug.z);
    if (Math.abs(angleDiff(want, G.player.heading)) > COMBAT.punchArc) continue;
    thug.hp -= COMBAT.punchDamage;
    // Knockback shoves the thug away from the player.
    const nx = dx / (d || 1);
    const nz = dz / (d || 1);
    thug.x += nx * 1.6;
    thug.z += nz * 1.6;
    thug.mesh.position.set(thug.x, 0, thug.z);
    G.flashDamage(0.25);
    hitAnything = true;
    if (thug.hp <= 0) {
      thug.mesh.visible = false;
      G.showToast("Thug down");
    }
  }
  if (hitAnything) return true;
  // Then pedestrians: punching one is a crime.
  for (const ped of G.crowd) {
    const dx = ped.x - G.player.x;
    const dz = ped.z - G.player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > range) continue;
    const want = aimAt(G, ped.x, ped.z);
    if (Math.abs(angleDiff(want, G.player.heading)) > COMBAT.punchArc) continue;
    G.raiseWanted(1);
    G.flashDamage(0.25);
    // The pedestrian runs.
    ped.fleeing = true;
    return true;
  }
  return false;
}

export function tryShoot(G, combat) {
  if (G.inCar) return false;
  if (!G.hasPistol) return false;
  if (G.shootCooldown > 0) return false;
  G.shootCooldown = 0.28;
  G.audio.gunshot();
  // The shot flies from the player toward the camera's aim: straight
  // ahead of the player on foot.
  const dirX = Math.sin(G.player.heading);
  const dirZ = Math.cos(G.player.heading);
  const ox = G.player.x;
  const oz = G.player.z;
  let endX = ox + dirX * COMBAT.shootRange;
  let endZ = oz + dirZ * COMBAT.shootRange;
  let hit = null;
  let hitKind = "";
  // Closest thug inside a narrow cone along the shot.
  for (const thug of G.thugs) {
    if (thug.hp <= 0) continue;
    const dx = thug.x - ox;
    const dz = thug.z - oz;
    const along = dx * dirX + dz * dirZ;
    if (along < 0 || along > COMBAT.shootRange) continue;
    const side = Math.abs(dx * dirZ - dz * dirX);
    if (side > 1.6) continue;
    if (!hit || along < hit.along) {
      hit = { along, x: thug.x, z: thug.z, target: thug };
      hitKind = "thug";
    }
  }
  if (!hit) {
    for (const ped of G.crowd) {
      const dx = ped.x - ox;
      const dz = ped.z - oz;
      const along = dx * dirX + dz * dirZ;
      if (along < 0 || along > COMBAT.shootRange) continue;
      const side = Math.abs(dx * dirZ - dz * dirX);
      if (side > 1.6) continue;
      if (!hit || along < hit.along) {
        hit = { along, x: ped.x, z: ped.z, target: ped };
        hitKind = "ped";
      }
    }
  }
  if (hit) {
    endX = hit.x;
    endZ = hit.z;
    if (hitKind === "thug") {
      hit.target.hp -= COMBAT.pistolDamage;
      if (hit.target.hp <= 0) {
        hit.target.mesh.visible = false;
        G.showToast("Thug down");
      }
    } else {
      // Shooting an innocent is a crime. A miss is not.
      G.raiseWanted(1);
      hit.target.fleeing = true;
    }
  }
  // Draw the tracer from the player's chest to the impact point.
  const pos = combat.tracer.geometry.attributes.position;
  pos.setXYZ(0, ox, 1.4, oz);
  pos.setXYZ(1, endX, 1.3, endZ);
  pos.needsUpdate = true;
  combat.tracer.visible = true;
  combat.tracerTimer = 0.09;
  return true;
}

export function updateTracer(combat, dt) {
  if (!combat.tracer.visible) return;
  combat.tracerTimer -= dt;
  if (combat.tracerTimer <= 0) combat.tracer.visible = false;
}

// Thugs chase the player and swing when close. They never raise wanted.
export function updateThugs(G, dt) {
  for (const thug of G.thugs) {
    if (thug.hp <= 0) continue;
    const dx = G.player.x - thug.x;
    const dz = G.player.z - thug.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.01) {
      const step = Math.min(d, COMBAT.thugSpeed * dt);
      const nx = thug.x + (dx / d) * step;
      const nz = thug.z + (dz / d) * step;
      if (!G.world.collides(nx, thug.z, 0.6)) thug.x = nx;
      if (!G.world.collides(thug.x, nz, 0.6)) thug.z = nz;
      thug.heading = Math.atan2(dx, dz);
      thug.mesh.position.set(thug.x, 0, thug.z);
      thug.mesh.rotation.y = thug.heading;
    }
    thug.hitTimer -= dt;
    if (d < 2.0 && thug.hitTimer <= 0) {
      thug.hitTimer = COMBAT.thugHitCooldown;
      G.damagePlayer(COMBAT.thugDamage, "thug");
    }
  }
}

// Shared damage path: flash, health, and the WASTED flow at zero.
export function applyDamage(G, amount, source) {
  if (G.status !== "playing") return;
  G.health -= amount;
  if (amount > 0) G.flashDamage(0.4);
  if (G.health <= 0) {
    G.health = 0;
    wasted(G);
  }
}

export function wasted(G) {
  // Fine FIRST, then save — a death never banks money it lost.
  const fine = Math.min(WANTED.fine, G.money);
  G.money -= fine;
  G.saveGame();
  G.status = "wasted";
  G.audio.wasted();
  G.input.clear();
  G.showWasted(fine);
}
