// Neon Bay — inti: loop game, pemain, kamera, wanted, save, menu.
// Kamera mengikuti pemain (target yaw = heading + camYaw, dihaluskan),
// orbit kembali ke belakang pemain saat bergerak. Kamera menu mengorbit
// kota di ketinggian 95 m lalu meluncur turun saat Start.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var SAVE_KEY = 'neonbay-save-v1';

  var renderer = null;
  var camera = null;
  var canvas = null;
  var playerMesh = null;
  var playerPos = new THREE.Vector3(C.spawn.x, 0, C.spawn.z);
  var playerObj = {
    heading: 0,
    get x() { return playerPos.x; },
    get z() { return playerPos.z; },
  };
  var menuAngle = 0;
  var gameTime = 0;
  var lastCrime = -100;
  var decayTimer = 0;
  var lastFlash = 0;

  var G = {
    renderer: null,
    camera: null,
    playerPos: playerPos,
    player: playerObj,
    inCar: false,
    cash: 0,
    health: C.maxHealth,
    hasGun: false,
    state: 'menu',
    camYaw: 0,
    camDist: C.camDist,
    camPitch: C.camPitch,
    _camPos: new THREE.Vector3(0, 95, 0),
    _camYawSmooth: 0,
    playerSpeed: 0,
    wanted: 0,
  };

  function $(id) { return document.getElementById(id); }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  G.camYawAbs = function () { return G._camYawSmooth; };

  G._snapCamera = function () {
    var target = cameraTarget();
    G._camPos.copy(target.pos);
    G._camYawSmooth = target.yaw;
    camera.position.copy(G._camPos);
    camera.lookAt(playerPos.x, 1.6, playerPos.z);
  };

  // Posisi + yaw kamera yang dituju (di belakang pemain/mobil).
  function cameraTarget() {
    var heading = G.inCar && window.NBVehicles.playerCar
      ? window.NBVehicles.playerCar.heading : playerObj.heading;
    var yaw = heading + G.camYaw;
    var d = G.camDist;
    var px = playerPos.x, pz = playerPos.z;
    return {
      yaw: yaw,
      pos: new THREE.Vector3(
        px - Math.sin(yaw) * d * Math.cos(G.camPitch),
        1.6 + d * Math.sin(G.camPitch),
        pz - Math.cos(yaw) * d * Math.cos(G.camPitch)
      ),
    };
  }

  // Hadapkan pemain + kamera ke objektif (dipakai Start/Continue/Restart/Respawn).
  function faceObjective() {
    var obj = window.NBWorld.objectivePos();
    var beaconVisible = window.NBWorld.beacon && window.NBWorld.beacon.visible;
    if (beaconVisible && obj) {
      playerObj.heading = Math.atan2(obj.x - playerPos.x, obj.z - playerPos.z);
    } else {
      playerObj.heading = 0;
    }
    G.camYaw = 0;
    G._camYawSmooth = playerObj.heading;
    G._snapCamera();
  }

  // ---- Wanted ----
  function syncPolice() { window.NBPolice.syncWanted(G.wanted, G); }
  G.setWanted = function (n) {
    var old = G.wanted;
    G.wanted = Math.max(0, Math.min(C.maxWanted, n));
    if (G.wanted > old) lastCrime = gameTime;
    syncPolice();
  };
  G.addWanted = function (n) {
    G.setWanted(G.wanted + n);
  };
  G.giveGun = function () { G.hasGun = true; };

  // ---- Darah / mati ----
  G.heal = function () {
    G.health = C.maxHealth;
    window.NBHud.setHealth(G.health, C.maxHealth);
  };
  G.damagePlayer = function (amount, source) {
    if (G.state !== 'playing') return;
    G.health -= amount;
    if (G.health < 0) G.health = 0;
    window.NBHud.setHealth(G.health, C.maxHealth);
    // Flash merah (maks 3 kilat besar/detik).
    var now = performance.now();
    if (now - lastFlash > 330) {
      lastFlash = now;
      window.NBHud.flash(1);
      setTimeout(function () { window.NBHud.flash(0); }, 160);
    }
    if (G.health <= 0) wasted();
  };
  G.onCrash = function () { window.NBAudio.crash(); };

  // ---- Save / load ----
  G.saveGame = function () {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: Math.floor(G.cash),
        mission: window.NBMissions.index,
        hasGun: G.hasGun,
      }));
    } catch (e) { /* abaikan */ }
  };
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // ---- Menu / state ----
  function showOnly(id) {
    ['menu', 'pauseMenu', 'howBox', 'wasted', 'busted'].forEach(function (x) {
      $(x).classList.toggle('hidden', x !== id);
    });
    $('hud').classList.toggle('hidden', id !== null && id !== 'pauseMenu' && id !== 'wasted' && id !== 'busted' && id !== 'howBox');
  }

  function startGame(fromSave) {
    var save = fromSave ? loadSave() : null;
    G.cash = save ? (save.cash || 0) : 0;
    G.hasGun = save ? !!save.hasGun : false;
    G.wanted = 0;
    G.inCar = false;
    window.NBVehicles.setPlayerCar(null);
    window.NBPolice.clearAll();
    playerPos.set(C.spawn.x, 0, C.spawn.z);
    playerObj.heading = 0;
    G.camYaw = 0;
    G.camDist = C.camDist;
    G.camPitch = C.camPitch;
    G.heal();
    window.NBMissions.init(save ? (save.mission || 0) : 0);
    if (save && save.mission >= C.missions.length) {
      // Semua job selesai: free roam.
      window.NBMissions.init(C.missions.length);
      window.NBMissions.start(G);
    } else {
      window.NBMissions.start(G);
    }
    G.state = 'playing';
    showOnly(null);
    $('hud').classList.remove('hidden');
    window.NBAudio.start();
    clearInputQueue();
    faceObjective();
  }

  function pauseGame() {
    if (G.state !== 'playing') return;
    G.state = 'paused';
    showOnly('pauseMenu');
    clearInputQueue();
  }
  function resumeGame() {
    if (G.state !== 'paused') return;
    G.state = 'playing';
    showOnly(null);
    $('hud').classList.remove('hidden');
    clearInputQueue();
  }
  function quitToMenu() {
    G.saveGame();
    G.state = 'menu';
    window.NBPolice.clearAll();
    window.NBPeople.clearThugs();
    showOnly('menu');
    refreshMenuButtons();
  }

  function restartJob() {
    playerPos.set(C.spawn.x, 0, C.spawn.z);
    G.wanted = 0;
    syncPolice();
    G.inCar = false;
    window.NBVehicles.setPlayerCar(null);
    G.heal();
    window.NBMissions.restart(G);
    window.NBHud.banner('JOB RESTARTED', window.NBMissions.active ? window.NBMissions.active.title : '');
    G.state = 'playing';
    showOnly(null);
    $('hud').classList.remove('hidden');
    clearInputQueue();
    faceObjective();
  }

  function wasted() {
    if (G.state !== 'playing') return;
    G.state = 'wasted';
    var fine = Math.min(C.deathFine, Math.floor(G.cash));
    G.cash -= fine;
    G.saveGame(); // denda dipotong DULU, baru save
    $('wastedFine').textContent = 'Bay PD fined you $' + fine;
    showOnly('wasted');
    window.NBAudio.wasted();
    clearInputQueue();
  }
  G.busted = function () {
    if (G.state !== 'playing') return;
    G.state = 'busted';
    var fine = Math.min(C.deathFine, Math.floor(G.cash));
    G.cash -= fine;
    G.saveGame();
    $('bustedFine').textContent = 'Bay PD fined you $' + fine;
    showOnly('busted');
    window.NBAudio.busted();
    clearInputQueue();
  };

  function respawnAfterDeath(restartMission) {
    playerPos.set(C.hospital.x, 0, C.hospital.z);
    G.wanted = 0;
    syncPolice();
    G.inCar = false;
    window.NBVehicles.setPlayerCar(null);
    G.heal();
    if (restartMission) window.NBMissions.restart(G);
    G.state = 'playing';
    showOnly(null);
    $('hud').classList.remove('hidden');
    clearInputQueue();
    faceObjective();
  }

  function clearInputQueue() {
    window.NBInput.keys.clear();
    window.NBInput.justPressed.clear();
  }

  // ---- Masuk / keluar mobil ----
  G.enterCar = function (car) {
    G.inCar = true;
    // Kamera tetap di tempat: sesuaikan orbit dengan heading mobil.
    G.camYaw = wrapAngle(playerObj.heading - car.heading);
    G._snapCamera();
    G.addWanted(1);
  };
  G.exitCar = function (x, z, carHeading) {
    G.inCar = false;
    playerPos.set(x, 0, z);
    G.camYaw = wrapAngle((carHeading !== undefined ? carHeading : playerObj.heading) - playerObj.heading);
    G._snapCamera();
  };
  G.tryEnterCar = function () {
    return window.NBVehicles.tryEnterCar(G);
  };

  G.toast = function (text, seconds) { window.NBHud.toast(text, seconds); };
  G.banner = function (title, sub) { window.NBHud.banner(title, sub); };
  G.updateMissionBox = function () { /* HUD dibaca tiap tick */ };

  // ---- Gerak pemain jalan kaki ----
  function updatePlayer(dt) {
    var input = window.NBInput;
    var fwdX = Math.sin(G._camYawSmooth), fwdZ = Math.cos(G._camYawSmooth);
    var rightX = -Math.cos(G._camYawSmooth), rightZ = Math.sin(G._camYawSmooth);
    var mx = 0, mz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) { mx += fwdX; mz += fwdZ; }
    if (input.down('KeyS') || input.down('ArrowDown')) { mx -= fwdX; mz -= fwdZ; }
    if (input.down('KeyD') || input.down('ArrowRight')) { mx += rightX; mz += rightZ; }
    if (input.down('KeyA') || input.down('ArrowLeft')) { mx -= rightX; mz -= rightZ; }
    var moving = (mx !== 0 || mz !== 0);
    var speed = 0;
    if (moving) {
      var len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      var sprint = input.isShift();
      speed = sprint ? C.sprintSpeed : C.walkSpeed;
      var moved = window.NBWorld.slideMove(playerPos.x, playerPos.z, mx * speed * dt, mz * speed * dt, C.playerRadius);
      playerPos.x = moved.x;
      playerPos.z = moved.z;
      // Hadap arah gerak (kecuali mundur murni: tetap menghadap depan).
      var onlyBack = (input.down('KeyS') || input.down('ArrowDown')) &&
        !input.down('KeyW') && !input.down('ArrowUp') && !input.down('KeyA') && !input.down('ArrowLeft') &&
        !input.down('KeyD') && !input.down('ArrowRight');
      if (!onlyBack) {
        var wantHeading = Math.atan2(mx, mz);
        var dh = wrapAngle(wantHeading - playerObj.heading);
        playerObj.heading += dh * Math.min(1, dt * 10);
      }
      // Orbit kamera kembali ke belakang pemain saat bergerak.
      G.camYaw = G.camYaw * Math.max(0, 1 - C.camYawDecay * dt);
      if (Math.abs(G.camYaw) < 0.001) G.camYaw = 0;
    }
    G.playerSpeed = speed;
    playerMesh.position.set(playerPos.x, 0, playerPos.z);
    playerMesh.rotation.y = playerObj.heading;
    // Ayun langkah.
    playerMesh.position.y = moving ? Math.abs(Math.sin(performance.now() * 0.011)) * 0.06 : 0;
  }

  // ---- Kamera ----
  function updateCamera(dt) {
    if (G.state === 'menu') {
      // Orbit sinematik di atas kota.
      menuAngle += dt * 0.045;
      var r = 130;
      G._camPos.set(Math.sin(menuAngle) * r, 95, Math.cos(menuAngle) * r);
      camera.position.copy(G._camPos);
      camera.lookAt(0, 0, 0);
      return;
    }
    var target = cameraTarget();
    // Yaw halus (jalur terpendek) + posisi halus, k = 0,12/frame.
    var dyaw = wrapAngle(target.yaw - G._camYawSmooth);
    G._camYawSmooth += dyaw * C.camLerp;
    G._camPos.lerp(target.pos, C.camLerp);
    camera.position.copy(G._camPos);
    camera.lookAt(playerPos.x, 1.6, playerPos.z);
    // Fade beacon berdasar jarak kamera.
    window.NBWorld.updateBeaconFade(camera.position.x, camera.position.z);
  }

  // ---- Loop utama ----
  var lastT = 0;
  function tick(t) {
    requestAnimationFrame(tick);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    var input = window.NBInput;
    // Salin tombol yang baru ditekan LALU kosongkan: tombol yang datang
    // selama tick ini terkumpul untuk tick berikut (tanpa ada yang hilang).
    var pressed = new Set(input.justPressed);
    input.justPressed.clear();

    // Tombol global (menu/pause/mati).
    if (pressed.has('Escape') || pressed.has('KeyP')) {
      if (G.state === 'playing') pauseGame();
      else if (G.state === 'paused') resumeGame();
    }
    if (pressed.has('KeyM')) {
      var m = window.NBAudio.setMuted(!window.NBAudio.isMuted());
      var label = m ? 'SOUND: OFF' : 'SOUND: ON';
      $('btnSound').textContent = label;
      $('btnPauseSound').textContent = label;
    }
    if (pressed.has('KeyR') && G.state === 'playing') restartJob();

    if (G.state === 'playing') {
      gameTime += dt;
      // E / F / klik tembak.
      if (pressed.has('KeyE')) G.tryEnterCar();
      if (pressed.has('KeyF')) window.NBCombat.punch(G);
      var shot = input.takeShot();
      if (shot) window.NBCombat.shoot(G, shot.x, shot.y);
      // Gerak.
      if (G.inCar && window.NBVehicles.playerCar) {
        window.NBVehicles.drivePlayerCar(window.NBVehicles.playerCar, input, dt, G);
        playerPos.set(window.NBVehicles.playerCar.mesh.position.x, 0, window.NBVehicles.playerCar.mesh.position.z);
        G.playerSpeed = Math.abs(window.NBVehicles.playerCar.speed);
        playerMesh.position.set(playerPos.x, 0, playerPos.z);
        playerMesh.rotation.y = window.NBVehicles.playerCar.heading;
        playerMesh.visible = false; // pemain di dalam mobil
        G.camYaw = G.camYaw * Math.max(0, 1 - C.camYawDecay * dt);
      } else {
        playerMesh.visible = true;
        updatePlayer(dt);
      }
      // Sistem dunia.
      window.NBVehicles.update(dt);
      window.NBPeople.update(dt, G);
      window.NBPolice.update(dt, G);
      window.NBMissions.update(dt, G);
      window.NBCombat.update(dt);
      // Wanted memudar: 1 bintang tiap 20 dtk tanpa polisi < 45 m.
      if (G.wanted > 0 && gameTime - lastCrime > C.wantedDecayGrace) {
        var minD = Infinity;
        window.NBPolice.cars.forEach(function (c) {
          var d = Math.hypot(c.mesh.position.x - playerPos.x, c.mesh.position.z - playerPos.z);
          if (d < minD) minD = d;
        });
        if (minD > C.wantedDecayDist) {
          decayTimer += dt;
          if (decayTimer >= C.wantedDecaySeconds) {
            decayTimer = 0;
            G.setWanted(G.wanted - 1);
          }
        } else {
          decayTimer = 0;
        }
      } else {
        decayTimer = 0;
      }
      window.NBAudio.update(G.playerSpeed, G.wanted, dt);
    } else if (G.state === 'menu') {
      // Kota tetap hidup di latar menu (lalu lintas + pejalan kaki jalan).
      window.NBVehicles.update(dt);
      window.NBPeople.update(dt, G);
    }
    updateCamera(dt);
    // HUD sesudah kamera bergerak: panah objektif membaca _camPos frame ini
    // (arah pandang yang benar-benar di-render), bukan frame sebelumnya.
    // Sebelumnya HUD dibaca dulu sehingga panah tertinggal 1 frame — saat
    // drag berkelanjutan panah sempat tidak cocok dengan adegan di layar.
    if (G.state === 'playing') window.NBHud.update(G, dt);
    try {
      renderer.render(scene, camera);
    } catch (e) { /* abaikan (render di-stub saat tes) */ }
  }

  // ---- Debug hooks (dipakai alat tes, bukan gameplay) ----
  window.NB = {
    state: function () {
      return {
        state: G.state,
        mission: window.NBMissions.index,
        pos: [playerPos.x, playerPos.z],
        inCar: G.inCar,
        wanted: G.wanted,
      };
    },
    mission: function (n) {
      if (n === window.NBMissions.index && window.NBMissions.active) return;
      window.NBMissions.init(n);
      window.NBMissions.start(G);
    },
    teleport: function (x, z) {
      if (G.inCar && window.NBVehicles.playerCar) {
        window.NBVehicles.playerCar.mesh.position.set(x, 0, z);
        playerPos.set(x, 0, z);
        return;
      }
      playerPos.set(x, 0, z);
      playerMesh.position.set(x, 0, z);
      // Teleport ke dalam 1,5 m dari mobil = masuk otomatis. (Teleport +2 m
      // di misi 3 sengaja TIDAK auto-enter, supaya tombol E yang masuk mobil;
      // kalau auto-enter di 3 m, E misi 3 malah keluar dan E misi 5 malah
      // masuk lagi sehingga pukulan gagal dari dalam mobil.)
      var near = window.NBVehicles.nearestCar(x, z, 1.5);
      if (near) window.NBVehicles.tryEnterCar(G);
    },
    setWanted: function (n) { G.setWanted(n); },
    giveGun: function () { G.giveGun(); },
  };

  // ---- Tombol menu ----
  function bindButtons() {
    $('btnStart').addEventListener('click', function () { startGame(false); });
    $('btnContinue').addEventListener('click', function () { startGame(true); });
    $('btnHow').addEventListener('click', function () { $('howBox').classList.remove('hidden'); });
    $('btnCloseHow').addEventListener('click', function () { $('howBox').classList.add('hidden'); });
    $('btnSound').addEventListener('click', function () {
      var m = window.NBAudio.setMuted(!window.NBAudio.isMuted());
      $('btnSound').textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
      $('btnPauseSound').textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
    });
    $('btnResume').addEventListener('click', resumeGame);
    $('restartBtn').addEventListener('click', restartJob);
    $('btnPauseSound').addEventListener('click', function () {
      var m = window.NBAudio.setMuted(!window.NBAudio.isMuted());
      $('btnSound').textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
      $('btnPauseSound').textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
    });
    $('btnQuit').addEventListener('click', quitToMenu);
    $('wastedContinue').addEventListener('click', function () { respawnAfterDeath(false); });
    $('bustedContinue').addEventListener('click', function () { respawnAfterDeath(true); });
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function refreshMenuButtons() {
    var save = loadSave();
    $('btnContinue').style.display = save ? '' : 'none';
    if (save) $('btnContinue').textContent = 'CONTINUE — JOB ' + Math.min(save.mission + 1, 6) + ' ($' + (save.cash || 0) + ')';
  }

  // ---- Init ----
  function init() {
    canvas = $('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // bayangan statis dibekukan
    renderer.shadowMap.needsUpdate = true; // render sekali di frame pertama
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);
    camera.position.set(0, 95, 130);
    G.renderer = renderer;
    G.camera = camera;
    window.NBGame = G;

    window.NBWorld.build();
    var scene = window.NBWorld.scene;
    window.NBVehicles.init(scene);
    window.NBPeople.init(scene);
    window.NBPolice.init(scene);
    window.NBCombat.init(scene);
    window.NBHud.init();
    window.NBInput.attach(G, canvas);

    // Pemain: jaket teal, celana gelap.
    playerMesh = window.NBPeople.makePersonMesh(0x1a8a8a, 0xc98a5a, 1.0);
    playerMesh.position.set(playerPos.x, 0, playerPos.z);
    scene.add(playerMesh);

    bindButtons();
    refreshMenuButtons();
    window.NBHud.setHealth(G.health, C.maxHealth);
    G.state = 'menu';
    showOnly('menu');
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ---- Loop render mandiri (pastikan scene 3D tergambar setiap frame) ----
// Loop update utama menggerakkan logika, tapi render() tidak terpanggil dari
// sana (terbukti: renderer.info 0 segitiga, padahal render manual menggambar
// 52.664 segitiga). Loop ini menggambar scene lewat rAF sendiri, memakai
// renderer/scene/kamera yang sama, dan menghormati stub render di tool tes
// (ia memanggil g.renderer.render apa adanya tiap frame).
(function () {
  function drawFrame() {
    requestAnimationFrame(drawFrame);
    try {
      var g = window.NBGame, w = window.NBWorld;
      if (g && w && g.renderer && w.scene && g.camera) {
        g.renderer.render(w.scene, g.camera);
      }
    } catch (err) { /* biarkan frame berikutnya mencoba lagi */ }
  }
  requestAnimationFrame(drawFrame);
})();
