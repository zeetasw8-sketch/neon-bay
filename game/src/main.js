// Neon Bay — the orchestrator: renderer, camera, the game loop, player
// movement, entering cars, saving and the debug hooks the test harness
// and the screenshot tool use. The loop renders EVERY frame (a loop
// that never calls render() is a black screen) and updates the HUD
// AFTER the camera, so the objective arrow reads the fresh camera.
// The player's position lives in playerPos (a Vector3); the health
// lives on the game object; inCar mirrors whether a car is occupied.

// startGameLoop begins the requestAnimationFrame loop. `game` is the
// state object built by initGame.
function startGameLoop(game) {
  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // ESC toggles pause in either direction (checked even while paused,
    // so the player can always resume).
    if (NBInput.consumePressed('Escape')) {
      if (game.state === 'playing') {
        game.state = 'paused';
        NBHud.showPause();
      } else if (game.state === 'paused') {
        resumeGame(game);
      }
    }
    if (game.state === 'playing') {
      updateGame(game, dt);
    } else if (game.state === 'menu') {
      game.camYaw += dt * 0.05; // slow menu orbit
      updateCamera(game);
    }
    game.renderer.render(game.scene, game.camera);
  }
  requestAnimationFrame(frame);
}

// updateGame advances one frame of play: input, player, cars, people,
// police, combat, missions, traffic lights, camera, then the HUD.
function updateGame(game, dt) {
  updatePlayer(game, dt);
  updateCars(game, dt);
  NBPeople.updatePedestrians(game.pedestrians, dt, game.world, game.scene);
  NBPeople.updateThugs(game.thugs, dt, game.world, game.player, game);
  var policeRes = NBPolice.updatePolice(game.cops, dt, game.world, game.player, game, game.scene);
  if (policeRes === 'busted' && game.state === 'playing') {
    onBusted(game);
    return;
  }
  NBPolice.updateHeat(game, dt, game.cops);
  NBCombat.handleCombatInput(game, dt);
  NBCombat.updateTracer(game, dt);
  NBMissions.updateMissions(game, dt);
  NBVehicles.updateTrafficLights(dt);
  NBWorld.moveSunWithPlayer(game.player);
  updateCamera(game);
  NBHud.updateHud(game, dt);
  NBAudio.setEngine(game.playerCar ? Math.abs(game.playerCar.speed) / NBConfig.carMaxSpeed : 0);
}

// updatePlayer moves Dex on foot (WASD relative to the camera, Shift to
// run) and handles entering / leaving cars with E. The mesh position is
// read into the player first, so a position set from outside (a
// teleport, the test harness) takes effect; playerPos is written back
// at the end of every frame.
function updatePlayer(game, dt) {
  var p = game.player;
  if (game.health <= 0) return;
  p.x = game.playerPos.x;
  p.z = game.playerPos.z;
  if (game.playerCar) {
    var car = game.playerCar;
    var input = {
      fwd: !!NBInput.held.KeyW || !!NBInput.held.ArrowUp,
      back: !!NBInput.held.KeyS || !!NBInput.held.ArrowDown,
      left: !!NBInput.held.KeyA || !!NBInput.held.ArrowLeft,
      right: !!NBInput.held.KeyD || !!NBInput.held.ArrowRight,
      handbrake: !!NBInput.held.Space
    };
    var res = NBVehicles.drivePlayerCar(car, input, dt, game.world);
    if (res === 'crash') {
      NBAudio.playCrash();
      NBPeople.hurtPlayer(game, 10);
    }
    p.x = car.x; p.z = car.z; p.angle = car.heading;
    p.moving = Math.abs(car.speed) > 0.5;
    p.sprinting = false;
    game.playerPos.set(p.x, 0, p.z);
    if (NBInput.consumePressed('KeyE')) NBVehicles.exitCar(game);
    return;
  }
  var mv = NBInput.readMoveInput();
  var fwd = viewForward(game);
  var right = { x: -fwd.z, z: fwd.x };
  var mx = fwd.x * -mv.z + right.x * mv.x;
  var mz = fwd.z * -mv.z + right.z * mv.x;
  var len = Math.sqrt(mx * mx + mz * mz);
  p.moving = len > 0.01;
  p.sprinting = p.moving && NBInput.isSprinting();
  if (p.moving) {
    var speed = p.sprinting ? NBConfig.runSpeed : NBConfig.walkSpeed;
    mx /= len; mz /= len;
    p.angle = Math.atan2(mx, mz);
    var nx = p.x + mx * speed * dt;
    var nz = p.z + mz * speed * dt;
    var c = NBWorld.clampToCity(nx, nz);
    nx = c.x; nz = c.z;
    if (!NBWorld.collides(game.world, nx, p.z, 0.5)) p.x = nx;
    if (!NBWorld.collides(game.world, p.x, nz, 0.5)) p.z = nz;
    p.walkPhase += dt * (p.sprinting ? 11 : 8);
    p.mesh.position.y = Math.abs(Math.sin(p.walkPhase)) * 0.05;
  }
  p.mesh.position.set(p.x, p.mesh.position.y, p.z);
  p.mesh.rotation.y = p.angle;
  game.playerPos.set(p.x, 0, p.z);
  // camera orbit (drag) and zoom (wheel)
  var drag = NBInput.getDrag();
  game.camYaw -= drag.dx * 0.004;
  game.camPitch = Math.max(0.12, Math.min(0.9, game.camPitch + drag.dy * 0.003));
  game.camDist = Math.max(6, Math.min(16, game.camDist + NBInput.getWheel() * 0.01));
  if (NBInput.consumePressed('KeyE')) tryEnterCar(game);
  if (NBInput.consumePressed('KeyM')) {
    NBAudio.setMuted(!NBAudio.isMuted());
  }
}

// viewForward returns the horizontal direction the camera is looking:
// the camera-to-player vector, flattened. W walks away from the camera.
function viewForward(game) {
  var cam = game.camera;
  var dx = game.player.x - cam.position.x;
  var dz = game.player.z - cam.position.z;
  var d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.01) return { x: 0, z: -1 };
  return { x: dx / d, z: dz / d };
}

// tryEnterCar toggles the car: if the player is driving, it parks them
// out beside the car; otherwise it puts them into the nearest car
// within 4 m. Taking a car that is not already theirs is stealing:
// +1 wanted.
function tryEnterCar(game) {
  if (game.playerCar) {
    NBVehicles.exitCar(game);
    return;
  }
  var car = NBVehicles.nearestCar(game.cars, game.player.x, game.player.z, NBConfig.carEnterRange);
  if (!car) return;
  if (!car.owned) {
    car.owned = true;
    NBPolice.setWanted(game, game.wanted + 1);
    game.showToast('STOLEN — +1★', 2);
  }
  NBVehicles.enterCar(game, car);
}

// updateCars advances the traffic (parked cars do not move).
function updateCars(game, dt) {
  game.cars.forEach(function (car) {
    if (car.isTraffic && car !== game.playerCar) {
      NBVehicles.updateTrafficCar(car, dt, game.world, game.player, game.cars);
    }
  });
}

// updateCamera places the third-person camera on its orbit around the
// player (drag to orbit, wheel to zoom) and looks at the player's head.
function updateCamera(game) {
  var p = game.player;
  var cp = Math.cos(game.camPitch), sp = Math.sin(game.camPitch);
  var cx = p.x + Math.sin(game.camYaw) * cp * game.camDist;
  var cz = p.z + Math.cos(game.camYaw) * cp * game.camDist;
  var cy = 1.6 + sp * game.camDist;
  game.camera.position.set(cx, cy, cz);
  game.camera.lookAt(p.x, 1.5, p.z);
}

// damagePlayer cuts health by `amount` (source is a label for the log).
// At zero the game handles WASTED.
function damagePlayer(game, amount, source) {
  if (game.health <= 0) return;
  game.health -= amount;
  if (game.health <= 0) {
    game.health = 0;
    game.onPlayerDown();
  }
}

// onPlayerDown handles WASTED: the $150 fine is taken BEFORE saving,
// the mission restarts from the beginning, and the death screen shows.
function onPlayerDown(game) {
  if (game.state !== 'playing') return;
  game.cash = Math.max(0, game.cash - NBConfig.fine);
  game.saveGame();
  NBMissions.abortMission(game);
  NBAudio.playWasted();
  NBAudio.stopEngine();
  NBInput.clearAll();
  NBHud.showDeath(game);
}

// onBusted handles BUSTED the same way: fine first, then save, then
// the busted screen. Continue respawns at the hospital.
function onBusted(game) {
  if (game.state !== 'playing') return;
  NBPolice.bustPlayer(game);
  game.saveGame();
  NBMissions.abortMission(game);
  NBHud.showBusted(game);
}

// continueAfterDeath respawns at the hospital at full health. Continue
// never resumes a half-dead player, and after the last job it is free
// roam, not a job-6 replay.
function continueAfterDeath(game) {
  game.health = 100;
  game.player.x = NBConfig.respawn.x;
  game.player.z = NBConfig.respawn.z;
  game.player.mesh.position.set(game.player.x, 0, game.player.z);
  game.player.mesh.visible = true;
  game.playerPos.set(game.player.x, 0, game.player.z);
  game.state = 'playing';
  game.retryIn = 0;
  NBHud.hideEndScreens();
  NBInput.clearAll();
  if (game.missionIndex < NBConfig.missions.length && !game.mission) {
    NBMissions.startMission(game.missionIndex, game);
  }
}

// resumeGame hides the pause overlay and returns to play.
function resumeGame(game) {
  game.state = 'playing';
  NBHud.hidePause();
}

// saveGame writes the progress (cash AFTER any fine, jobs done, the
// next job, the pistol, health and position) to localStorage.
function saveGame(game) {
  try {
    localStorage.setItem('neonbay-save-v1', JSON.stringify({
      cash: game.cash,
      jobsDone: game.jobsDone,
      missionIndex: game.missionIndex,
      hasGun: game.hasGun,
      health: game.health,
      x: game.player.x,
      z: game.player.z
    }));
  } catch (e) { /* storage unavailable: play on without a save */ }
}

// loadSave reads the save back, or null when there is none.
function loadSave() {
  try {
    var raw = localStorage.getItem('neonbay-save-v1');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// clearSave deletes the save (New Game).
function clearSave() {
  try { localStorage.removeItem('neonbay-save-v1'); } catch (e) { /* ignore */ }
}

// initGame builds the renderer, the scene, the world, the player, the
// traffic and the pedestrians, wires the menu buttons, and returns the
// game object.
function initGame() {
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('game-container').appendChild(renderer.domElement);
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
  camera.position.set(0, 8, 12);

  var world = NBWorld.buildCity(scene);
  NBVehicles.makeTrafficLights(scene);

  var playerMesh = NBPeople.createPlayerMesh();
  playerMesh.position.set(NBConfig.spawn.x, 0, NBConfig.spawn.z);
  scene.add(playerMesh);

  var game = {
    renderer: renderer, scene: scene, camera: camera, world: world,
    state: 'menu',
    playerPos: new THREE.Vector3(NBConfig.spawn.x, 0, NBConfig.spawn.z),
    player: {
      mesh: playerMesh, x: NBConfig.spawn.x, z: NBConfig.spawn.z,
      angle: Math.PI, car: null,
      moving: false, sprinting: false, walkPhase: 0
    },
    playerCar: null, inCar: false, cars: NBVehicles.cars, pedestrians: NBPeople.peds,
    thugs: NBPeople.thugs, cops: NBPolice.cars,
    wanted: 0, cleanTimer: 0, cash: NBConfig.startCash, jobsDone: 0,
    missionIndex: 0, mission: null, retryIn: 0, hasGun: false,
    health: NBConfig.playerHealth,
    toastTimer: 0, minimapTimer: 0, punchTimer: 0, shootTimer: 0,
    tracer: null, tracerTimer: 0, beaconVisible: false,
    camYaw: 0, camPitch: 0.35, camDist: 10
  };
  game.tracer = NBCombat.initTracer(scene);
  game.showToast = function (text, seconds) { NBHud.showToast(game, text, seconds); };
  game.toast = game.showToast;
  game._snapCamera = function () { updateCamera(game); };
  game.saveGame = function () { saveGame(game); };
  game.onPlayerDown = function () { onPlayerDown(game); };
  game.damagePlayer = function (amount, source) { damagePlayer(game, amount, source); };
  game.tryEnterCar = function () { tryEnterCar(game); };

  // traffic + parked cars (the starter car sits by the garage, and two
  // more wait on the road, so a car is always at hand). The spawners
  // register each car in NBVehicles.cars (which is game.cars).
  for (var i = 0; i < NBConfig.trafficCount; i++) {
    NBVehicles.spawnTrafficCar(scene, world);
  }
  NBVehicles.spawnParkedCar(scene, 12, 138, 0, 0x8a2a2a, true);
  NBVehicles.spawnParkedCar(scene, -20, 105, 0, 0x2a4a8a, false);
  NBVehicles.spawnParkedCar(scene, 20, 105, 0, 0x3a6b3a, false);
  for (var k = 0; k < NBConfig.pedCount; k++) {
    NBPeople.spawnPedestrian(scene, world);
  }

  // menu buttons
  var startBtn = document.getElementById('btnStart');
  if (startBtn) startBtn.addEventListener('click', function () { startGame(game, false); });
  var continueBtn = document.getElementById('btnContinue');
  var save = loadSave();
  if (continueBtn) {
    continueBtn.style.display = save ? 'inline-block' : 'none';
    continueBtn.addEventListener('click', function () { startGame(game, true); });
  }
  var resumeBtn = document.getElementById('btnResume');
  if (resumeBtn) resumeBtn.addEventListener('click', function () { resumeGame(game); });
  var deathBtn = document.getElementById('death-continue');
  if (deathBtn) deathBtn.addEventListener('click', function () { continueAfterDeath(game); });
  var bustedBtn = document.getElementById('busted-continue');
  if (bustedBtn) bustedBtn.addEventListener('click', function () { continueAfterDeath(game); });
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // debug hooks for the test harness and the screenshot tool
  window.NBGame = game;
  window.NB = {
    mission: function (i) { NBMissions.startMission(i, game); },
    setWanted: function (n) { NBPolice.setWanted(game, n); },
    state: function () {
      return {
        state: game.state,
        mission: game.missionIndex,
        pos: [Math.round(game.player.x), Math.round(game.player.z)],
        inCar: !!game.playerCar,
        wanted: game.wanted,
        cash: game.cash,
        health: Math.round(game.health),
        jobsDone: game.jobsDone,
        hasGun: game.hasGun,
        cops: game.cops.length,
        thugsDown: game.thugs.filter(function (t) { return t.down; }).length
      };
    },
    teleport: function (x, z) {
      game.player.x = x; game.player.z = z;
      game.player.mesh.position.set(x, 0, z);
      game.playerPos.set(x, 0, z);
      if (game.playerCar) {
        game.playerCar.x = x; game.playerCar.z = z;
        game.playerCar.mesh.position.set(x, 0, z);
      }
      updateCamera(game);
    },
    giveGun: function () { game.hasGun = true; },
    setCash: function (n) { game.cash = n; },
    toast: function (text, seconds) { NBHud.showToast(game, text, seconds); }
  };

  startGameLoop(game);
  return game;
}

// startGame hides the menu and starts play: fresh (job 1) or from the
// save (cash, jobs done, the next job, the pistol).
function startGame(game, fromSave) {
  NBAudio.resumeAudio();
  NBAudio.startMusic();
  NBHud.hideMenu();
  game.state = 'playing';
  if (fromSave) {
    var save = loadSave();
    if (save) {
      game.cash = save.cash;
      game.jobsDone = save.jobsDone;
      game.missionIndex = save.missionIndex;
      game.hasGun = !!save.hasGun;
      game.health = save.health || 100;
      game.player.x = save.x; game.player.z = save.z;
      game.player.mesh.position.set(game.player.x, 0, game.player.z);
      game.playerPos.set(game.player.x, 0, game.player.z);
    }
  } else {
    clearSave();
    game.cash = NBConfig.startCash;
    game.jobsDone = 0;
    game.missionIndex = 0;
    game.hasGun = false;
    game.health = NBConfig.playerHealth;
    game.player.x = NBConfig.spawn.x;
    game.player.z = NBConfig.spawn.z;
    game.player.mesh.position.set(game.player.x, 0, game.player.z);
    game.playerPos.set(game.player.x, 0, game.player.z);
  }
  if (game.missionIndex < NBConfig.missions.length) {
    NBMissions.startMission(game.missionIndex, game);
  }
}

window.NBGame = null;
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', function () { initGame(); });
} else {
  initGame();
}

window.NBMain = {
  startGameLoop: startGameLoop,
  initGame: initGame,
  startGame: startGame,
  updateGame: updateGame,
  updateCamera: updateCamera,
  continueAfterDeath: continueAfterDeath,
  resumeGame: resumeGame,
  saveGame: saveGame,
  loadSave: loadSave,
  tryEnterCar: tryEnterCar,
  damagePlayer: damagePlayer
};
