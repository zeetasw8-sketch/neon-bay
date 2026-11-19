// Neon Bay — people: pedestrians strolling the sidewalks and the thugs
// who guard the docks. Pedestrians walk from one road point to another.
// Thugs chase the player inside 35 m and hit for 5 damage, but they
// keep 5 m from each other, so they spread into a wide arc around the
// player instead of piling on top of him — a fight with three thugs
// takes a few seconds, not one. A thug whose health hits zero is
// removed from the thugs list (and the scene) outright.

// walkPedestrian advances one pedestrian one step: it strolls toward its
// target point, picks a fresh target when it arrives or is blocked, and
// bobs gently as it walks. The mesh position is read in first, so a
// position set from outside (herding, the test harness) takes effect;
// a `speed` set on the pedestrian overrides the stroll speed (0 freezes
// it in place for a staged shot).
function walkPedestrian(ped, dt, world) {
  if (ped.down > 0) { ped.down -= dt; return; } // knocked down: stay put
  if (ped.dead) return;
  ped.x = ped.mesh.position.x;
  ped.z = ped.mesh.position.z;
  var spd = (ped.speed !== undefined) ? ped.speed : NBConfig.pedSpeed;
  var dx = ped.tx - ped.x, dz = ped.tz - ped.z;
  var d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1.5 || ped.stuck > 2) {
    var t = NBWorld.randomRoadPoint();
    ped.tx = t.x; ped.tz = t.z; ped.stuck = 0;
    return;
  }
  var step = spd * dt;
  var nx = ped.x + (dx / d) * step;
  var nz = ped.z + (dz / d) * step;
  if (NBWorld.collides(world, nx, nz, 0.5)) {
    ped.stuck += dt;
    ped.tx = ped.x - dx; ped.tz = ped.z - dz; // turn around
    return;
  }
  ped.stuck = 0;
  ped.x = nx; ped.z = nz;
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = Math.atan2(dx, dz);
  ped.walkPhase += dt * 6;
  ped.mesh.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.06;
}

// createPersonMesh builds a simple standing figure: a body, a head and
// legs, in the given shirt colour. `scale` makes thugs bulkier.
function createPersonMesh(shirt, scale) {
  var s = scale || 1;
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55 * s, 0.7 * s, 0.3 * s),
    new THREE.MeshLambertMaterial({ color: shirt })
  );
  body.position.y = 1.05 * s;
  g.add(body);
  var head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22 * s, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd9a986 })
  );
  head.position.y = 1.62 * s;
  g.add(head);
  var legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  [-0.14, 0.14].forEach(function (dx) {
    var leg = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.7 * s, 0.22 * s), legMat);
    leg.position.set(dx * s, 0.35 * s, 0);
    g.add(leg);
  });
  g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
  return g;
}

// createPlayerMesh builds Dex: a teal jacket and gold trim so he reads
// against the dusk city.
function createPlayerMesh() {
  var g = createPersonMesh(0x1a8a8a, 1);
  var trim = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.1, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xffd700 })
  );
  trim.position.y = 1.32;
  g.add(trim);
  return g;
}

// createThugMesh builds a thug: dark jacket, red headband, a bat in hand.
function createThugMesh() {
  var g = createPersonMesh(0x3a3a44, 1.15);
  var band = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.08, 0.48),
    new THREE.MeshBasicMaterial({ color: 0xd23c2e })
  );
  band.position.y = 1.72;
  g.add(band);
  var bat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.07, 0.8, 6),
    new THREE.MeshLambertMaterial({ color: 0x7a5a34 })
  );
  bat.position.set(0.35, 1.1, 0.2);
  bat.rotation.z = 0.5;
  g.add(bat);
  return g;
}

// spawnPedestrian puts a walker on a random road point and registers
// it in the peds list.
function spawnPedestrian(scene, world) {
  var shirts = [0x8a2a2a, 0x2a4a8a, 0x3a6b3a, 0x8a6a2a, 0x6a4a8a, 0xaaaaaa, 0x2a8a7a];
  var p = NBWorld.randomRoadPoint();
  var t = NBWorld.randomRoadPoint();
  var mesh = createPersonMesh(shirts[Math.floor(Math.random() * shirts.length)], 1);
  mesh.position.set(p.x, 0, p.z);
  scene.add(mesh);
  var ped = {
    mesh: mesh, x: p.x, z: p.z, tx: t.x, tz: t.z,
    stuck: 0, down: 0, dead: false, walkPhase: Math.random() * 6
  };
  peds.push(ped);
  return ped;
}

// updatePedestrians walks every pedestrian and respawns anyone who was
// shot (a fresh walker appears elsewhere after a short delay).
function updatePedestrians(peds, dt, world, scene) {
  for (var i = peds.length - 1; i >= 0; i--) {
    var ped = peds[i];
    if (ped.dead) {
      ped.respawnIn -= dt;
      if (ped.respawnIn <= 0) {
        scene.remove(ped.mesh);
        peds[i] = spawnPedestrian(scene, world);
      }
      continue;
    }
    walkPedestrian(ped, dt, world);
  }
}

// spawnThug puts a thug at (x, z) with full health and registers it in
// the thugs list.
function spawnThug(scene, x, z) {
  var mesh = createThugMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  var thug = {
    mesh: mesh, x: x, z: z, hp: NBConfig.thugHealth,
    cooldown: 0, down: false, walkPhase: 0
  };
  thugs.push(thug);
  return thug;
}

// removeThug drops a thug from the thugs list and the scene (called
// when its health hits zero). The mission counts the list shrinking.
function removeThug(scene, thug) {
  var i = thugs.indexOf(thug);
  if (i >= 0) thugs.splice(i, 1);
  if (scene) scene.remove(thug.mesh);
}

// clearThugs removes every thug (used when a job restarts).
function clearThugs(scene) {
  while (thugs.length > 0) removeThug(scene, thugs[0]);
}

// updateThugs moves the thugs: inside 35 m they chase the player and hit
// for 5 damage within 2 m (1.4 s cooldown); they keep 5 m from each
// other so they spread into a wide arc around the player.
function updateThugs(list, dt, world, player, game) {
  var C = NBConfig;
  list.forEach(function (t) {
    if (t.down) return;
    if (t.cooldown > 0) t.cooldown -= dt;
    var dx = player.x - t.x, dz = player.z - t.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < C.thugChaseRange) {
      var step = 4.2 * dt;
      var nx = t.x + (dx / d) * step;
      var nz = t.z + (dz / d) * step;
      if (!NBWorld.collides(world, nx, nz, 0.6)) { t.x = nx; t.z = nz; }
      t.mesh.rotation.y = Math.atan2(dx, dz);
      t.walkPhase += dt * 8;
      t.mesh.position.y = Math.abs(Math.sin(t.walkPhase)) * 0.05;
      if (d < 2 && t.cooldown <= 0) {
        t.cooldown = C.thugCooldown;
        hurtPlayer(game, C.thugDamage);
        NBAudio.playPunch();
      }
    }
    t.mesh.position.set(t.x, t.mesh.position.y, t.z);
  });
  // separation: push thugs apart so they form a wide arc, never a pile
  for (var i = 0; i < list.length; i++) {
    for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j];
      if (a.down || b.down) continue;
      var sx = b.x - a.x, sz = b.z - a.z;
      var sd = Math.sqrt(sx * sx + sz * sz);
      if (sd > 0.01 && sd < C.thugSpread) {
        var push = (C.thugSpread - sd) / 2;
        var ux = sx / sd, uz = sz / sd;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
  }
}

// knockPedestrianDown flattens a pedestrian for 2 seconds (a punch).
// Returns true if the pedestrian was standing.
function knockPedestrianDown(ped) {
  if (ped.dead || ped.down > 0) return false;
  ped.down = 2;
  ped.mesh.rotation.x = Math.PI / 2;
  setTimeout(function () {
    if (!ped.dead) ped.mesh.rotation.x = 0;
  }, 2000);
  return true;
}

// killPedestrian drops a pedestrian permanently (a gunshot) and schedules
// a replacement walker. Returns true if it was alive.
function killPedestrian(ped) {
  if (ped.dead) return false;
  ped.dead = true;
  ped.respawnIn = 20;
  ped.mesh.rotation.x = Math.PI / 2;
  return true;
}

// hurtPlayer is called by thugs, cops and car crashes — it is defined
// here because people are the ones who hurt the player. Health lives on
// the game object; at zero the game handles WASTED.
function hurtPlayer(game, amount) {
  if (!game || game.health <= 0) return;
  game.health -= amount;
  if (game.health <= 0) {
    game.health = 0;
    game.onPlayerDown();
  }
}

var thugs = [];
var peds = [];

window.NBPeople = {
  walkPedestrian: walkPedestrian,
  createPersonMesh: createPersonMesh,
  createPlayerMesh: createPlayerMesh,
  createThugMesh: createThugMesh,
  spawnPedestrian: spawnPedestrian,
  updatePedestrians: updatePedestrians,
  spawnThug: spawnThug,
  removeThug: removeThug,
  clearThugs: clearThugs,
  updateThugs: updateThugs,
  knockPedestrianDown: knockPedestrianDown,
  killPedestrian: killPedestrian,
  hurtPlayer: hurtPlayer,
  thugs: thugs,
  peds: peds
};
