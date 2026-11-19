// Neon Bay — combat: fists and the pistol. F punches, left click shoots
// (once Mara hands Dex the pistol in job 5). A punch does 2 damage and
// knocks a pedestrian down; a pistol shot does 4 (one shot drops a
// thug). Shooting a pedestrian raises the heat by one star — missing,
// or hitting a thug, does not. A punch hits the nearest thug or
// pedestrian within 3 m in any direction.

// punchEnemies swings at the nearest thug or pedestrian within 3 m.
// Returns the target hit, or null.
function punchEnemies(player, game) {
  var C = NBConfig;
  var best = null, bestD = C.punchRange * C.punchRange;
  var targets = game.thugs.concat(game.pedestrians);
  targets.forEach(function (t) {
    if (t.down || t.dead) return;
    var dx = t.x - player.x, dz = t.z - player.z;
    var d2 = dx * dx + dz * dz;
    if (d2 > bestD) return;
    bestD = d2; best = t;
  });
  if (!best) return null;
  NBAudio.playPunch();
  if (best.hp !== undefined) {
    // a thug: damage, remove from the fight when dead
    best.hp -= C.punchDamage;
    if (best.hp <= 0) NBPeople.removeThug(game.scene, best);
  } else {
    NBPeople.knockPedestrianDown(best);
  }
  return best;
}

// firePistol fires one shot along the camera's view direction (the way
// the player is facing). The nearest thug or pedestrian near the aim
// line inside 60 m is hit. Returns 'thug', 'ped', 'miss' or null.
function firePistol(player, game) {
  var C = NBConfig;
  var dir = aimDirection(game);
  var ox = player.x, oz = player.z;
  var best = null, bestD = C.gunRange;
  var targets = game.thugs.concat(game.pedestrians);
  targets.forEach(function (t) {
    if (t.down || t.dead) return;
    var dx = t.x - ox, dz = t.z - oz;
    var along = dx * dir.x + dz * dir.z;
    if (along < 0 || along > C.gunRange) return;
    var perp = Math.abs(dx * dir.z - dz * dir.x);
    var allowed = 0.8 + along * C.bulletSpread;
    if (perp > allowed) return;
    if (along < bestD) { bestD = along; best = t; }
  });
  var endX = ox + dir.x * bestD, endZ = oz + dir.z * bestD;
  showTracer(game, ox, oz, endX, endZ);
  NBAudio.playGunshot();
  if (!best) return 'miss';
  if (best.hp !== undefined) {
    best.hp -= C.pistolDamage;
    if (best.hp <= 0) NBPeople.removeThug(game.scene, best);
    return 'thug';
  }
  NBPeople.killPedestrian(best);
  NBPolice.setWanted(game, game.wanted + 1);
  return 'ped';
}

// aimDirection returns the horizontal direction the player is facing:
// the camera-to-player vector, flattened onto the ground.
function aimDirection(game) {
  var cam = game.camera;
  if (!cam) return { x: Math.sin(game.player.angle), z: Math.cos(game.player.angle) };
  var dx = game.player.x - cam.position.x;
  var dz = game.player.z - cam.position.z;
  var d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.01) return { x: Math.sin(game.player.angle), z: Math.cos(game.player.angle) };
  return { x: dx / d, z: dz / d };
}

// showTracer draws the single reused tracer line from the gun to the
// hit point for a blink, then hides it.
function showTracer(game, x0, z0, x1, z1) {
  if (!game.tracer) return;
  var pos = game.tracer.geometry.attributes.position;
  pos.setXYZ(0, x0, 1.2, z0);
  pos.setXYZ(1, x1, 1.2, z1);
  pos.needsUpdate = true;
  game.tracer.visible = true;
  game.tracerTimer = 0.08;
}

// initTracer creates the one reused tracer line (a thin yellow segment).
function initTracer(scene) {
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.2, 0, 0, 1.2, 0], 3));
  var line = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9 })
  );
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  return line;
}

// updateTracer hides the tracer once its blink is over.
function updateTracer(game, dt) {
  if (!game.tracer || !game.tracer.visible) return;
  game.tracerTimer -= dt;
  if (game.tracerTimer <= 0) game.tracer.visible = false;
}

// handleCombatInput consumes the punch key and the mouse click each frame
// and fires the matching attack (respecting the cooldowns).
function handleCombatInput(game, dt) {
  if (game.health <= 0 || game.playerCar) return;
  if (game.punchTimer > 0) game.punchTimer -= dt;
  if (game.shootTimer > 0) game.shootTimer -= dt;
  if (NBInput.consumePressed('KeyF') && game.punchTimer <= 0) {
    game.punchTimer = NBConfig.punchCooldown;
    punchEnemies(game.player, game);
  }
  if (NBInput.wasClicked() && game.shootTimer <= 0) {
    if (game.hasGun) {
      game.shootTimer = NBConfig.shootCooldown;
      firePistol(game.player, game);
    } else if (game.punchTimer <= 0) {
      game.punchTimer = NBConfig.punchCooldown;
      punchEnemies(game.player, game);
    }
  }
}

window.NBCombat = {
  punchEnemies: punchEnemies,
  firePistol: firePistol,
  aimDirection: aimDirection,
  initTracer: initTracer,
  updateTracer: updateTracer,
  handleCombatInput: handleCombatInput
};
