// Neon Bay — the police: cops who chase, catch and bust the player.
// One cop per wanted star. Wanted 1 walks; wanted 2-3 drive cruisers.
// A cop gives up (despawns) beyond 80 m on foot or 180 m in a car, and
// gets stuck on buildings like everything else — that is how a runner
// escapes. A cop within 5 m of a slow player (< 3 m/s) for 2 s busts
// them; a cop in contact deals 8 hp/s.

// chasePlayer moves one cop toward the player for one step and handles
// give-up, contact damage and the bust timer. Returns 'busted', 'gaveup'
// or 'chasing'.
function chasePlayer(cop, player, dt, world, game) {
  var C = NBConfig;
  var dx = player.x - cop.x, dz = player.z - cop.z;
  var d = Math.sqrt(dx * dx + dz * dz);
  var giveUp = cop.isCar ? C.copGiveUpCar : C.copGiveUpFoot;
  if (d > giveUp) return 'gaveup';

  var top = cop.isCar ? C.copCarSpeed : C.copWalkSpeed;
  var step = top * dt;
  if (cop.isCar) {
    // a cruiser steers toward the player but stops at buildings
    var want = Math.atan2(dx, dz);
    var diff = normAngle(want - cop.heading);
    cop.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
    var fx = Math.sin(cop.heading), fz = Math.cos(cop.heading);
    var px = cop.x + fx * step, pz = cop.z + fz * step;
    if (!NBWorld.collides(world, px, pz, C.carRadius)) { cop.x = px; cop.z = pz; }
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
  } else {
    var nx = cop.x + (dx / d) * step;
    var nz = cop.z + (dz / d) * step;
    if (!NBWorld.collides(world, nx, nz, 0.6)) { cop.x = nx; cop.z = nz; }
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = Math.atan2(dx, dz);
    cop.walkPhase += dt * 9;
    cop.mesh.position.y = Math.abs(Math.sin(cop.walkPhase)) * 0.05;
  }

  // contact damage: a cop leaning on the player hurts (8 hp/s)
  if (d < 2.2) {
    NBPeople.hurtPlayer(game, C.contactDamage * dt);
    if (game.health <= 0) return 'chasing';
  }

  // bust: within 5 m while the player is slow (< 3 m/s) for 2 s
  var pSpeed = playerSpeed(player);
  if (d < C.bustRange && pSpeed < C.bustStill) {
    cop.bustTimer += dt;
    if (cop.bustTimer >= C.bustHold) return 'busted';
  } else {
    cop.bustTimer = 0;
  }
  return 'chasing';
}

// playerSpeed returns the player's current speed in m/s (car or foot).
function playerSpeed(player) {
  if (player.car) return Math.abs(player.car.speed);
  return player.moving ? (player.sprinting ? NBConfig.runSpeed : NBConfig.walkSpeed) : 0;
}

// normAngle wraps an angle to [-PI, +PI].
function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// createCopMesh builds a cop on foot: dark blue uniform, cap.
function createCopMesh() {
  var g = NBPeople.createPersonMesh(0x1a2a5a, 1.05);
  var cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.26, 0.1, 10),
    new THREE.MeshLambertMaterial({ color: 0x0a1230 })
  );
  cap.position.y = 1.82;
  g.add(cap);
  return g;
}

// spawnCop places one cop at the spawn distance from the player, at an
// angle spread so several cops form a V as they close in. Wanted 1
// walks; wanted 2-3 drive.
function spawnCop(scene, world, player, wanted, index, total) {
  var C = NBConfig;
  var isCar = wanted >= 2;
  var dist = isCar ? C.copSpawnCar : C.copSpawnFoot;
  var spread = total > 1 ? (index - (total - 1) / 2) * 0.55 : 0;
  var baseAngle = Math.atan2(player.x, player.z) + Math.PI; // behind player
  var a = baseAngle + spread;
  var x = player.x + Math.sin(a) * dist;
  var z = player.z + Math.cos(a) * dist;
  var p = NBWorld.clampToCity(x, z);
  x = p.x; z = p.z;
  var mesh, car = null;
  if (isCar) {
    mesh = NBVehicles.createCarMesh(0xf0f0f0, true);
    mesh.position.set(x, 0, z);
    car = { mesh: mesh, x: x, z: z, heading: Math.atan2(player.x - x, player.z - z), speed: 0, wheels: mesh.userData.wheels };
    mesh.rotation.y = car.heading;
  } else {
    mesh = createCopMesh();
    mesh.position.set(x, 0, z);
  }
  scene.add(mesh);
  var bar = mesh.userData.bar || null;
  return {
    mesh: mesh, car: car, x: x, z: z, heading: car ? car.heading : 0,
    isCar: isCar, bustTimer: 0, walkPhase: 0, bar: bar, flashT: 0, flashOn: false
  };
}

// spawn places one police cruiser at (x, z) and registers it in the
// cops list. The shot tool uses it to stage a V formation; the cops
// then chase the player through the normal update.
function spawn(scene, x, z) {
  var mesh = NBVehicles.createCarMesh(0xf0f0f0, true);
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  var cop = {
    mesh: mesh, car: null, x: x, z: z, heading: Math.PI,
    isCar: true, bustTimer: 0, walkPhase: 0,
    bar: mesh.userData.bar || null, flashT: 0, flashOn: false,
    speed: 0
  };
  cars.push(cop);
  return cop;
}

// updatePolice advances every cop, spawns cops up to the wanted level,
// removes cops who gave up, and returns 'busted' when the player is
// caught (the game then handles the BUSTED screen).
function updatePolice(list, dt, world, player, game, scene) {
  var wanted = game.wanted;
  while (list.length < wanted) {
    list.push(spawnCop(scene, world, player, wanted, list.length, wanted));
  }
  while (list.length > wanted) {
    var extra = list.pop();
    scene.remove(extra.mesh);
  }
  for (var i = list.length - 1; i >= 0; i--) {
    var cop = list[i];
    flashLightBar(cop, dt);
    var res = chasePlayer(cop, player, dt, world, game);
    if (res === 'busted') return 'busted';
    if (res === 'gaveup') {
      scene.remove(cop.mesh);
      list.splice(i, 1);
    }
  }
  return 'ok';
}

// flashLightBar alternates the cruiser's red and blue lamps.
function flashLightBar(cop, dt) {
  if (!cop.bar) return;
  cop.flashT += dt;
  if (cop.flashT < 0.35) return;
  cop.flashT = 0;
  cop.flashOn = !cop.flashOn;
  var red = cop.bar.children[0], blue = cop.bar.children[1];
  red.material.color.setHex(cop.flashOn ? 0xff2020 : 0x661111);
  blue.material.color.setHex(cop.flashOn ? 0x112266 : 0x2040ff);
}

// setWanted sets the wanted level (0-3) and plays the siren on a rise.
function setWanted(game, n) {
  var old = game.wanted;
  game.wanted = Math.max(0, Math.min(NBConfig.maxWanted, n));
  if (game.wanted > old) {
    NBAudio.playSiren();
    game.cleanTimer = 0;
  }
  if (game.wanted === 0) game.cleanTimer = 0;
}

// updateHeat decays the wanted level: one star per 22 clean seconds
// (no cop within 45 m). Called every frame by the game loop.
function updateHeat(game, dt, list) {
  if (game.wanted <= 0) return;
  var near = false;
  for (var i = 0; i < list.length; i++) {
    var dx = list[i].x - game.player.x, dz = list[i].z - game.player.z;
    if (dx * dx + dz * dz < NBConfig.heatCheckRange * NBConfig.heatCheckRange) { near = true; break; }
  }
  if (near) { game.cleanTimer = 0; return; }
  game.cleanTimer += dt;
  if (game.cleanTimer >= NBConfig.heatDecay) {
    game.cleanTimer = 0;
    setWanted(game, game.wanted - 1);
  }
}

// bustPlayer handles a BUSTED: fine, wanted cleared, player respawned at
// the hospital. The fine is taken BEFORE the save is written.
function bustPlayer(game) {
  game.cash = Math.max(0, game.cash - NBConfig.fine);
  game.wanted = 0;
  game.cleanTimer = 0;
  game.health = 100;
  game.player.x = NBConfig.respawn.x;
  game.player.z = NBConfig.respawn.z;
  game.player.mesh.position.set(game.player.x, 0, game.player.z);
  game.player.mesh.visible = true;
  if (game.playerCar) {
    game.playerCar = null;
    game.player.car = null;
    game.inCar = false;
    NBAudio.stopEngine();
  }
  NBInput.clearAll();
  NBAudio.playBusted();
}

var cars = [];

window.NBPolice = {
  chasePlayer: chasePlayer,
  spawnCop: spawnCop,
  spawn: spawn,
  updatePolice: updatePolice,
  setWanted: setWanted,
  updateHeat: updateHeat,
  bustPlayer: bustPlayer,
  playerSpeed: playerSpeed,
  normAngle: normAngle,
  cars: cars
};
