// Neon Bay — pedestrians.
// They stroll the sidewalks and run away when the player's car bears
// down on them fast. A pedestrian the player's car touches raises the
// wanted level (handled by the caller).

import { THREE } from "./three-shim.js";
import { WORLD, CROWD } from "./config.js";

export const pedestrians = [];

const SHIRT_COLORS = [0xe8e8e8, 0xd9a441, 0x7a86d9, 0xd96a6a, 0x6ad98a, 0xc96ad9];

function makePersonMesh(shirt) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), shirtMat);
  torso.position.y = 1.02;
  torso.castShadow = true;
  group.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), pantsMat);
  legs.position.y = 0.32;
  group.add(legs);
  return group;
}

function sidewalkSpot() {
  // A random point on a sidewalk: just off a street, inside a block edge.
  const street = WORLD.streets[Math.floor(Math.random() * WORLD.streets.length)];
  const along = -120 + Math.random() * 240;
  if (Math.random() < 0.5) {
    return { x: along, z: street + 9.5 };
  }
  return { x: street + 9.5, z: along };
}

export function createPeople(scene) {
  for (let i = 0; i < CROWD.pedestrians; i++) {
    const spot = sidewalkSpot();
    const mesh = makePersonMesh(SHIRT_COLORS[i % SHIRT_COLORS.length]);
    mesh.position.set(spot.x, 0, spot.z);
    scene.add(mesh);
    pedestrians.push({
      mesh,
      x: spot.x,
      z: spot.z,
      heading: Math.random() * Math.PI * 2,
      speed: CROWD.walkMin + Math.random() * (CROWD.walkMax - CROWD.walkMin),
      fleeing: false,
      pause: Math.random() * 2,
    });
  }
}

export function updatePeople(G, dt) {
  const px = G.player.x;
  const pz = G.player.z;
  const carSpeed = G.inCar && G.playerCar ? Math.abs(G.playerCar.speed) : 0;
  for (const p of pedestrians) {
    const dx = p.x - px;
    const dz = p.z - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // A fast car coming at them sends them running.
    if (G.inCar && carSpeed > 8 && dist < 14) {
      p.fleeing = true;
    } else if (dist > 26) {
      p.fleeing = false;
    }
    let speed = p.speed;
    let hx = Math.sin(p.heading);
    let hz = Math.cos(p.heading);
    if (p.fleeing) {
      speed = CROWD.fleeSpeed;
      if (dist > 0.01) {
        hx = dx / dist;
        hz = dz / dist;
      }
      p.heading = Math.atan2(hx, hz);
    } else {
      p.pause -= dt;
      if (p.pause <= 0) {
        // Pick a new ambling direction along the sidewalks.
        p.heading = Math.floor(Math.random() * 4) * (Math.PI / 2);
        p.pause = 2 + Math.random() * 4;
      }
    }
    let nx = p.x + hx * speed * dt;
    let nz = p.z + hz * speed * dt;
    if (!G.world.collides(nx, p.z, 0.5)) p.x = nx;
    if (!G.world.collides(p.x, nz, 0.5)) p.z = nz;
    const pos = { x: p.x, z: p.z };
    G.world.clampPlayable(pos, 0.5);
    p.x = pos.x;
    p.z = pos.z;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    // A little bob while walking.
    p.mesh.position.y = Math.abs(Math.sin(G.elapsed * 8 + p.x)) * 0.04;
  }
}

// Move a pedestrian to an exact spot (used by the shot staging hooks).
export function placePedestrian(i, x, z, heading = 0) {
  const p = pedestrians[i % pedestrians.length];
  if (!p) return;
  p.x = x;
  p.z = z;
  p.heading = heading;
  p.fleeing = false;
  p.mesh.position.set(x, 0, z);
  p.mesh.rotation.y = heading;
}
