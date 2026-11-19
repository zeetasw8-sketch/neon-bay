// Neon Bay — cars: traffic, parked cars and the player's car.
// The shared list is called allCars on purpose: an earlier build had
// this file and the police file both declare a global named `cars`,
// and they overwrote each other until no car could be entered.
// Traffic drives the street grid and slows for the player's car ahead.
// The player's own starter car (by the garage) never raises wanted.

import { THREE } from "./three-shim.js";
import { WORLD, CAR, TRAFFIC } from "./config.js";

export const allCars = [];

const BODY_COLORS = [0xd94f4f, 0x4f7dd9, 0xe8b93e, 0x7dd94f, 0xb46bd9, 0xd9d9d9, 0x3a3f4a];

function makeCarMesh(color, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x9fd8e8,
    emissive: 0x2a4a55,
  });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a20 });
  const hubMat = new THREE.MeshBasicMaterial({ color: 0xd8d8d8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.2), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 2.12), bodyMat);
  roof.position.set(0, 1.4, -0.2);
  group.add(roof);

  // Bumpers front and rear.
  for (const dz of [2.12, -2.12]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 0.18), darkMat);
    bumper.position.set(0, 0.42, dz);
    group.add(bumper);
  }
  // Headlights (warm) and taillights (red).
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const dx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), headMat);
    h.position.set(dx, 0.62, 2.13);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.06), tailMat);
    t.position.set(dx, 0.62, -2.13);
    group.add(t);
  }
  // Wheels with bright hubs on the outer side.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, 0.36, wz);
    group.add(hub);
    wheels.push(wheel);
  }
  if (police) {
    // Red/blue light bar on the roof.
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.4), darkMat);
    barBase.position.set(0, 1.5, -0.2);
    group.add(barBase);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    red.position.set(-0.28, 1.56, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    blue.position.set(0.28, 1.56, -0.2);
    group.add(blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }
  group.userData.wheels = wheels;
  return group;
}

function addCar(scene, x, z, heading, color, kind, extra = {}) {
  const mesh = makeCarMesh(color, kind === "police");
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = {
    mesh,
    x,
    z,
    heading,
    speed: 0,
    color,
    kind, // "traffic" | "parked" | "player" | "police"
    owned: !!extra.owned,
    lane: extra.lane ?? null,
    dir: extra.dir ?? 1,
    cruise: extra.cruise ?? 9,
    flash: 0,
    ...extra,
  };
  allCars.push(car);
  return car;
}

export function createVehicles(scene) {
  // The player's own starter car, parked by the garage. Taking it is free.
  const starter = addCar(
    scene,
    WORLD.garage.x + 16,
    WORLD.garage.z + 12,
    Math.PI / 2,
    0xd94f7a,
    "player",
    { owned: true, parked: true },
  );
  starter.parked = true;

  // Parked cars along the curbs.
  const parkedSpots = [
    [-75, -25, 0],
    [25, -75, Math.PI / 2],
    [-25, 25, Math.PI],
    [75, 75, -Math.PI / 2],
    [-75, 75, 0],
    [25, 125, Math.PI / 2],
  ];
  for (const [x, z, h] of parkedSpots) {
    const c = addCar(scene, x, z, h, BODY_COLORS[Math.floor(Math.random() * BODY_COLORS.length)], "parked", { parked: true });
    c.parked = true;
  }

  // Traffic: one car per street lane, cruising the grid.
  const lanes = [];
  for (const s of WORLD.streets) {
    lanes.push({ axis: "x", at: s, dir: 1 });
    lanes.push({ axis: "z", at: s, dir: -1 });
  }
  for (let i = 0; i < TRAFFIC.cars; i++) {
    const lane = lanes[i % lanes.length];
    const along = -100 + i * 23;
    const cruise = TRAFFIC.cruiseMin + Math.random() * (TRAFFIC.cruiseMax - TRAFFIC.cruiseMin);
    if (lane.axis === "x") {
      addCar(scene, along, lane.at + (lane.dir > 0 ? 3.5 : -3.5), lane.dir > 0 ? 0 : Math.PI, BODY_COLORS[i % BODY_COLORS.length], "traffic", {
        lane,
        dir: lane.dir,
        cruise,
      });
    } else {
      addCar(scene, lane.at + (lane.dir > 0 ? 3.5 : -3.5), along, lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2, BODY_COLORS[i % BODY_COLORS.length], "traffic", {
        lane,
        dir: lane.dir,
        cruise,
      });
    }
  }
  return { starter };
}

// Is there a car of the player right ahead of this traffic car?
function blockedAhead(G, car) {
  const px = G.player.x;
  const pz = G.player.z;
  const dx = px - car.x;
  const dz = pz - car.z;
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const along = dx * fx + dz * fz;
  const side = Math.abs(dx * fz - dz * fx);
  return along > 0 && along < 14 && side < 3;
}

export function updateTraffic(G, dt) {
  for (const car of allCars) {
    if (car.kind !== "traffic") continue;
    // Ease toward cruise speed, slower when the player's car is ahead.
    const target = blockedAhead(G, car) ? 0 : car.cruise;
    car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    let nx = car.x + fx * car.speed * dt;
    let nz = car.z + fz * car.speed * dt;
    // At the city edge, turn around and drive back.
    if (car.lane.axis === "x") {
      if (nz > 128 || nz < -128) {
        car.heading += Math.PI;
        car.dir *= -1;
        nx = car.x;
        nz = Math.max(-128, Math.min(128, car.z));
      }
    } else if (nx > 128 || nx < -128) {
      car.heading += Math.PI;
      car.dir *= -1;
      nx = Math.max(-128, Math.min(128, car.x));
      nz = car.z;
    }
    car.x = nx;
    car.z = nz;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

// Arcade driving for the player's car. Returns the speed in m/s.
export function drivePlayerCar(G, dt, input) {
  const car = G.playerCar;
  if (!car) return 0;
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const gas = input.forward ? 1 : 0;
  const brake = input.back ? 1 : 0;
  const handbrake = input.held("Space");
  if (gas) car.speed += CAR.accel * dt;
  if (brake) {
    car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
  }
  car.speed -= car.speed * (handbrake ? CAR.handbrakeDrag : CAR.drag) * dt;
  if (car.speed > CAR.maxSpeed) car.speed = CAR.maxSpeed;
  if (car.speed < -CAR.reverseMax) car.speed = -CAR.reverseMax;
  if (Math.abs(car.speed) < 0.05 && !gas && !brake) car.speed = 0;
  // Steering bites harder the faster the car goes, up to a point.
  const steerAmount = steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 8 + 0.25);
  car.heading += steerAmount * (car.speed >= 0 ? 1 : -1);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let nx = car.x + fx * car.speed * dt;
  let nz = car.z + fz * car.speed * dt;
  // Buildings stop the car (with a small bounce and a crash sound).
  if (G.world.collides(nx, car.z, 1.4)) {
    nx = car.x;
    if (Math.abs(car.speed) > 6) G.audio.crash();
    car.speed *= 0.4;
  }
  if (G.world.collides(car.x, nz, 1.4)) {
    nz = car.z;
    if (Math.abs(car.speed) > 6) G.audio.crash();
    car.speed *= 0.4;
  }
  const p = { x: nx, z: nz };
  const shore = G.world.clampPlayable(p, 1.4);
  if (shore === "shore") G.showToast("No swimming — the sea is out of bounds");
  car.x = p.x;
  car.z = p.z;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Steer the front wheels a little for the look of it.
  const wheels = car.mesh.userData.wheels || [];
  if (wheels[0]) wheels[0].rotation.x = steer * 0.35;
  if (wheels[1]) wheels[1].rotation.x = steer * 0.35;
  return car.speed;
}

// Nearest enterable car within range of the player, or null.
export function nearestCar(G, range) {
  let best = null;
  let bestD = range;
  for (const car of allCars) {
    if (car.kind === "police") continue;
    if (car === G.playerCar) continue;
    const dx = car.x - G.player.x;
    const dz = car.z - G.player.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best ? { car: best, dist: bestD } : null;
}

export { makeCarMesh };
