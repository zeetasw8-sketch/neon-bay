// Neon Bay — cars: the player's driveable car, street traffic and the
// traffic lights. Driving is an arcade model: W accelerates, S brakes
// then reverses, A/D steer (steering flips while reversing), Space is
// the handbrake. Coasting loses speed slowly, so a car set rolling stays
// fast; braking is sharp. Traffic follows its lane and stops for red
// lights and for the car ahead. A car's heading is the direction its
// nose points: forward = (sin(heading), cos(heading)) in (x, z).

// drivePlayerCar advances the car the player is driving one step.
// `input` is { fwd, back, left, right, handbrake } (all booleans).
// Returns 'crash' when the car hit something hard, else 'ok'.
// The mesh position is the source of truth: it is read in first, so a
// position set from outside (a teleport, the test harness) takes effect.
function drivePlayerCar(car, input, dt, world) {
  var C = NBConfig;
  car.x = car.mesh.position.x;
  car.z = car.mesh.position.z;
  if (input.fwd) {
    car.speed += C.carAccel * dt;
  } else if (input.back) {
    if (car.speed > 0.5) car.speed -= 26 * dt;      // brake hard
    else car.speed -= C.carAccel * 0.6 * dt;        // then reverse
  } else {
    car.speed -= Math.sign(car.speed) * 0.8 * dt;   // gentle rolling loss
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  if (input.handbrake) {
    car.speed -= Math.sign(car.speed) * 12 * dt;
    if (Math.abs(car.speed) < 0.5) car.speed = 0;
  }
  car.speed = Math.max(-C.carReverseMax, Math.min(C.carMaxSpeed, car.speed));

  var dir = car.speed >= 0 ? 1 : -1;
  var steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  var grip = input.handbrake ? 1.6 : 1;
  car.heading -= steer * C.carSteer * grip * dt * Math.min(1, Math.abs(car.speed) / 10) * dir;

  var prevX = car.x, prevZ = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  var p = NBWorld.clampToCity(car.x, car.z);
  car.x = p.x; car.z = p.z;

  if (NBWorld.collides(world, car.x, car.z, C.carRadius)) {
    var impact = Math.abs(car.speed);
    car.x = prevX; car.z = prevZ;
    car.speed = -car.speed * 0.25;
    if (impact > 12) {
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      return 'crash';
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
  return 'ok';
}

// spinWheels rotates the four wheel meshes by the distance travelled.
function spinWheels(car, dt) {
  if (!car.wheels) return;
  var spin = car.speed * dt / 0.35;
  car.wheels.forEach(function (w) { w.rotation.x += spin; });
}

// createCarMesh builds a car: body, cabin, four wheels, head and tail
// lights. Police cars get a red/blue light bar and a white body.
function createCarMesh(color, isPolice) {
  var g = new THREE.Group();
  var bodyMat = new THREE.MeshLambertMaterial({ color: color, emissive: 0x111111 });
  var body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  var cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.55, 2.1),
    new THREE.MeshLambertMaterial({ color: 0x1a2233, emissive: 0x0a0f1a })
  );
  cabin.position.set(0, 1.1, -0.3);
  g.add(cabin);
  var wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
  var wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
  var wheels = [];
  [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]].forEach(function (p) {
    var w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(p[0], 0.35, p[1]);
    g.add(w); wheels.push(w);
  });
  var headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  [-0.7, 0.7].forEach(function (dx) {
    var h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), headMat);
    h.position.set(dx, 0.6, 2.21);
    g.add(h);
  });
  var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  [-0.7, 0.7].forEach(function (dx) {
    var t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), tailMat);
    t.position.set(dx, 0.6, -2.21);
    g.add(t);
  });
  var bar = null;
  if (isPolice) {
    bar = new THREE.Group();
    var red = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2020 })
    );
    red.position.x = -0.4;
    var blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.25, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2040ff })
    );
    blue.position.x = 0.4;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 1.5, -0.3);
    g.add(bar);
  }
  g.userData.wheels = wheels;
  g.userData.bar = bar;
  return g;
}

// spawnTrafficCar puts a traffic car on a random road, facing along it,
// at a random cruising speed. Returns the car object.
function spawnTrafficCar(scene, world) {
  var colors = [0x8a2a2a, 0x2a4a8a, 0x3a6b3a, 0x8a6a2a, 0x5a4a7a, 0x777777, 0x9a3a6a];
  var p = NBWorld.randomRoadPoint();
  var heading = Math.random() < 0.5
    ? (Math.random() < 0.5 ? 0 : Math.PI)          // facing +z / -z
    : (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2); // facing +x / -x
  var mesh = createCarMesh(colors[Math.floor(Math.random() * colors.length)], false);
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  var car = {
    mesh: mesh, x: p.x, z: p.z, heading: heading,
    speed: 8 + Math.random() * 6, cruise: 8 + Math.random() * 6,
    isPolice: false, isTraffic: true, kind: 'traffic', wheels: mesh.userData.wheels
  };
  allCars.push(car);
  return car;
}

// spawnParkedCar puts a parked car at (x, z) facing `heading` and
// registers it in the parked list (job 3's steal targets). `starter`
// marks the car by the garage.
function spawnParkedCar(scene, x, z, heading, color, starter) {
  var mesh = createCarMesh(color, false);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  var car = {
    mesh: mesh, x: x, z: z, heading: heading, speed: 0, cruise: 0,
    isPolice: false, isTraffic: false, kind: 'parked', owned: false,
    starter: !!starter, wheels: mesh.userData.wheels
  };
  parked.push(car);
  allCars.push(car);
  return car;
}

// updateTrafficCar drives one traffic car along its lane: it holds its
// cruise speed, brakes for a red light or a car ahead, and turns around
// (respawns) when it leaves the city or gets far from the player.
function updateTrafficCar(car, dt, world, player, cars) {
  car.x = car.mesh.position.x;
  car.z = car.mesh.position.z;
  var ahead = carAheadBlocked(car, cars, player);
  var red = lightAheadRed(car);
  if (ahead || red) {
    car.speed = Math.max(0, car.speed - 18 * dt);
  } else if (car.speed < car.cruise) {
    car.speed = Math.min(car.cruise, car.speed + 6 * dt);
  }
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  var p = NBWorld.clampToCity(car.x, car.z);
  if (p.x !== car.x || p.z !== car.z || farFromPlayer(car, player)) {
    var fresh = NBWorld.randomRoadPoint();
    car.x = fresh.x; car.z = fresh.z;
    car.heading = Math.random() < 0.5 ? 0 : Math.PI;
    car.speed = car.cruise;
  } else {
    car.x = p.x; car.z = p.z;
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
}

// carAheadBlocked reports whether another car (or the player's car) is
// directly ahead of this traffic car within 10 m.
function carAheadBlocked(car, cars, player) {
  var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  var all = cars.concat(player && player.car ? [player.car] : []);
  for (var i = 0; i < all.length; i++) {
    var o = all[i];
    if (o === car) continue;
    var dx = o.x - car.x, dz = o.z - car.z;
    var along = dx * fx + dz * fz;
    if (along > 0 && along < 10 && Math.abs(dx * fz - dz * fx) < 3) return true;
  }
  return false;
}

// farFromPlayer reports whether a traffic car is far enough from the
// player to be recycled to a fresh road.
function farFromPlayer(car, player) {
  var dx = car.x - player.x, dz = car.z - player.z;
  return dx * dx + dz * dz > 260 * 260;
}

// makeTrafficLights builds the light poles at the four central
// intersections. Each light cycles green/red on an 8-second phase; the
// north-south and east-west directions run opposite phases.
function makeTrafficLights(scene) {
  trafficLights = [];
  var spots = [[-35, -35], [-35, 35], [35, -35], [35, 35]];
  spots.forEach(function (s, i) {
    var g = new THREE.Group();
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    pole.position.y = 2.5;
    g.add(pole);
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 1.6, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    box.position.y = 5.4;
    g.add(box);
    var redMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    var greenMat = new THREE.MeshBasicMaterial({ color: 0x223322 });
    var red = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), redMat);
    red.position.y = 5.8;
    var green = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), greenMat);
    green.position.y = 5.0;
    g.add(red); g.add(green);
    g.position.set(s[0] + 8, 0, s[1] + 8);
    scene.add(g);
    trafficLights.push({
      x: s[0], z: s[1], phase: i % 2, timer: 0,
      redMat: redMat, greenMat: greenMat, nsGreen: (i % 2 === 0)
    });
  });
}

// updateTrafficLights advances the light cycle and repaints the lamps.
function updateTrafficLights(dt) {
  trafficLights.forEach(function (L) {
    L.timer += dt;
    if (L.timer >= 8) { L.timer = 0; L.nsGreen = !L.nsGreen; }
    var ns = L.nsGreen;
    L.redMat.color.setHex(ns ? 0x331111 : 0xff2020);
    L.greenMat.color.setHex(ns ? 0x20ff40 : 0x113311);
  });
}

// lightAheadRed reports whether this traffic car is approaching a red
// light at an intersection within 12 m (in its direction of travel).
function lightAheadRed(car) {
  for (var i = 0; i < trafficLights.length; i++) {
    var L = trafficLights[i];
    var dx = L.x - car.x, dz = L.z - car.z;
    var along = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    if (along < 0 || along > 12) continue;
    var side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
    if (side > 4) continue;
    var ns = Math.abs(Math.cos(car.heading)) > 0.7; // travelling north-south
    if (ns && !L.nsGreen) return true;
    if (!ns && L.nsGreen) return true;
  }
  return false;
}

// enterCar puts the player into a car (hides the player mesh) and
// records it as the player's car on this module.
function enterCar(game, car) {
  game.playerCar = car;
  game.player.car = car;
  game.inCar = true;
  playerCar = car;
  window.NBVehicles.playerCar = car;
  game.player.mesh.visible = false;
  NBAudio.startEngine();
}

// exitCar drops the player out beside the car (hides nothing, parks it).
function exitCar(game) {
  var car = game.playerCar;
  if (!car) return;
  var side = car.heading + Math.PI / 2;
  game.player.x = car.x + Math.sin(side) * 3;
  game.player.z = car.z + Math.cos(side) * 3;
  game.player.mesh.position.set(game.player.x, 0, game.player.z);
  game.player.mesh.visible = true;
  game.playerCar = null;
  game.player.car = null;
  game.inCar = false;
  playerCar = null;
  window.NBVehicles.playerCar = null;
  NBAudio.stopEngine();
}

// nearestCar returns the closest car within `range` of (x, z), or null.
function nearestCar(cars, x, z, range) {
  var best = null, bestD = range * range;
  cars.forEach(function (c) {
    var dx = c.x - x, dz = c.z - z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = c; }
  });
  return best;
}

var trafficLights = [];
var parked = [];
var playerCar = null;
var allCars = [];

window.NBVehicles = {
  drivePlayerCar: drivePlayerCar,
  createCarMesh: createCarMesh,
  spawnTrafficCar: spawnTrafficCar,
  spawnParkedCar: spawnParkedCar,
  updateTrafficCar: updateTrafficCar,
  makeTrafficLights: makeTrafficLights,
  updateTrafficLights: updateTrafficLights,
  lightAheadRed: lightAheadRed,
  enterCar: enterCar,
  exitCar: exitCar,
  nearestCar: nearestCar,
  parked: parked,
  playerCar: playerCar,
  cars: allCars
};
