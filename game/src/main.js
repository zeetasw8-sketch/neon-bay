// NEON BAY — game core: loop, camera, player, wanted, save, states.
'use strict';
const NBGame = {
  state: 'menu', // menu | playing | paused | over
  scene: null, camera: null, renderer: null, clock: null,
  playerMesh: null,
  playerPos: null, // THREE.Vector3 (y ~ 0)
  playerHeading: 0, camYaw: 0, camPitch: 0.32, camDist: 9,
  inCar: false, health: 100, cash: 0, wanted: 0,
  lastCrime: 0, wantedTimer: 0,
  stolenCar: false, failStreak: 0,
  shakeAmt: 0, elapsed: 0,
  _ePressed: false, _fPressed: false, _rPressed: false, _mPressed: false,
  _saveTimer: 0,

  init() {
    window.NBGame = this;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.clock = new THREE.Clock();

    NBWorld.build(this.scene);
    NBVehicles.init(this.scene);
    NBPeople.init(this.scene);
    NBPolice.init(this.scene);
    NBCombat.init();
    NBMissions.init();
    NBHud.init();
    NBInput.init(this.renderer.domElement);
    NBAudio.init();

    // Player character — Dex Marlowe, teal jacket
    this.playerMesh = NBPeople.makePersonMesh(0x2ec4b6, 0x2a2a3a, 0xf1c27d);
    this.scene.add(this.playerMesh);
    this.playerPos = new THREE.Vector3(NB_CONFIG.playerStart.x, 0, NB_CONFIG.playerStart.z);
    this.playerHeading = Math.PI;
    this.camYaw = 0; // camera south of player, looking north — behind the player

    this.load();
    this._wireMenu();
    window.addEventListener('resize', () => this.onResize());
    this.showMenu();
    this.renderer.setAnimationLoop(() => this.tick());
  },

  _wireMenu() {
    const $ = (id) => document.getElementById(id);
    $('btnStart').addEventListener('click', () => this.newGame());
    $('btnContinue').addEventListener('click', () => this.continueGame());
    $('btnHow').addEventListener('click', () => $('howBox').classList.toggle('hidden'));
    $('btnResume').addEventListener('click', () => this.resume());
    $('btnRestartMission').addEventListener('click', () => {
      $('pause').classList.add('hidden');
      NBMissions.retry(this);
      this.state = 'playing';
    });
    $('btnSaveQuit').addEventListener('click', () => {
      this.save(); this.state = 'menu'; this.showMenu();
      $('pause').classList.add('hidden');
    });
    $('btnEndOk').addEventListener('click', () => {
      $('endScreen').classList.add('hidden');
      this.respawn();
    });
  },

  showMenu() {
    this.state = 'menu';
    NBHud.showHud(false);
    document.getElementById('menu').classList.remove('hidden');
    const save = this._readSave();
    const cont = document.getElementById('btnContinue');
    if (save && (save.cash > 0 || save.mission > 0)) {
      cont.classList.remove('hidden');
      document.getElementById('continueInfo').textContent =
        `$${save.cash} · Job ${Math.min(save.mission + 1, 6)}/6`;
    } else cont.classList.add('hidden');
    // Idle menu camera: slow orbit over the city
    this.camYaw = Math.PI * 0.75;
  },

  newGame() {
    this.cash = 0; this.health = NB_CONFIG.maxHealth; this.wanted = 0;
    this.stolenCar = false;
    NBMissions.init(); NBCombat.init(); NBPolice.clearAll();
    this.playerPos.set(NB_CONFIG.playerStart.x, 0, NB_CONFIG.playerStart.z);
    this.playerHeading = Math.PI; this.camYaw = 0;
    if (NBVehicles.playerCar) NBVehicles.exitCar();
    this.inCar = false;
    this._startPlay();
    NBMissions.start(this);
  },

  continueGame() {
    const save = this._readSave() || { cash: 0, mission: 0 };
    this.cash = save.cash || 0;
    this.health = NB_CONFIG.maxHealth; this.wanted = 0; this.stolenCar = false;
    NBMissions.init(); NBMissions.index = Math.min(save.mission || 0, 5);
    NBCombat.init(); NBCombat.hasGun = NBMissions.index >= 4;
    NBPolice.clearAll();
    this.playerPos.set(NB_CONFIG.playerStart.x, 0, NB_CONFIG.playerStart.z);
    this.playerHeading = Math.PI; this.camYaw = 0;
    if (NBVehicles.playerCar) NBVehicles.exitCar();
    this.inCar = false;
    this._startPlay();
    NBMissions.start(this);
  },

  _startPlay() {
    document.getElementById('menu').classList.add('hidden');
    NBHud.showHud(true);
    NBHud.setCash(this.cash);
    NBHud.setHealth(this.health, NB_CONFIG.maxHealth);
    NBHud.setWanted(0);
    this.state = 'playing';
    NBAudio.resume(); NBAudio.startMusic();
    this.save();
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    NBAudio.setEngine(0, false);
  },
  resume() {
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing';
    NBAudio.resume();
  },

  // ---- wanted ----
  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.lastCrime = this.elapsed;
    NBHud.setWanted(this.wanted);
    if (this.wanted === 0) NBPolice.clearAll();
  },
  addWanted(n) {
    if (n <= 0) return;
    this.setWanted(this.wanted + n);
  },

  // ---- health / death / busted ----
  damagePlayer(amount, src) {
    if (this.state !== 'playing' || this.health <= 0) return;
    this.health -= amount;
    NBHud.setHealth(this.health, NB_CONFIG.maxHealth);
    NBHud.flashDamage();
    this.shake(0.3);
    if (this.health <= 0) this.wasted();
  },
  wasted() {
    this.state = 'over';
    NBAudio.busted(); NBAudio.setEngine(0, false);
    this._showEnd('WASTED', 'Dex got dropped in the street. The Bay PD scraped up what was left — and the hospital bill wasn\'t cheap. -$150.');
    this.cash = Math.max(0, this.cash - 150);
    this.setWanted(0);
  },
  busted() {
    if (this.state !== 'playing') return;
    this.state = 'over';
    NBAudio.busted(); NBAudio.setEngine(0, false);
    this._showEnd('BUSTED', 'The Bay PD finally caught up. A night in the cells and a fine — -$200, and your heat is cleared.');
    this.cash = Math.max(0, this.cash - 200);
    this.setWanted(0);
  },
  _showEnd(title, text) {
    document.getElementById('endTitle').textContent = title;
    document.getElementById('endText').textContent = text;
    document.getElementById('endScreen').classList.remove('hidden');
    NBHud.setCash(this.cash);
    this.save();
  },
  respawn() {
    this.health = NB_CONFIG.maxHealth;
    NBHud.setHealth(this.health, NB_CONFIG.maxHealth);
    this.playerPos.set(NB_CONFIG.hospital.x, 0, NB_CONFIG.hospital.z + 16);
    if (this.inCar) { NBVehicles.exitCar(); this.inCar = false; }
    this.playerHeading = 0; this.camYaw = 0;
    this.state = 'playing';
    // mission restarts from its beginning if one was running
    if (NBMissions.active) { NBMissions.active = null; NBMissions.start(this); }
    this.save();
  },

  // ---- helpers used by other modules ----
  toast(t, s) { NBHud.toast(t, s); },
  banner(t, s, sec) { NBHud.banner(t, s, sec); },
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); },
  setMissionUI(t, d, tm) { NBHud.setMission(t, d, tm); },
  setMissionTimer(t) { NBHud.setMissionTimer(t); },
  onThugDown() { NBMissions.onThugDown(); },
  onMouseDown() { if (this.state === 'playing' && !this.inCar) NBCombat.shoot(this); },
  onWheel(dy) { this.camDist = Math.max(5, Math.min(16, this.camDist + (dy > 0 ? 1 : -1))); },
  save() {
    try {
      localStorage.setItem(NB_CONFIG.saveKey, JSON.stringify({
        cash: this.cash, mission: NBMissions.index,
        hasGun: NBCombat.hasGun, savedAt: Date.now(),
      }));
    } catch (e) {}
  },
  _readSave() {
    try { return JSON.parse(localStorage.getItem(NB_CONFIG.saveKey) || 'null'); } catch (e) { return null; }
  },
  load() {
    const s = this._readSave();
    if (s) { this.cash = s.cash || 0; }
  },

  // ---- car enter / exit ----
  tryEnterCar() {
    if (this.inCar) { // exit
      const car = NBVehicles.exitCar();
      this.inCar = false;
      const h = car.heading;
      this.playerPos.set(
        car.mesh.position.x - Math.sin(h) * 3.2, 0,
        car.mesh.position.z - Math.cos(h) * 3.2);
      this.playerHeading = h;
      NBAudio.setEngine(0, false);
      return;
    }
    const car = NBVehicles.nearestCar(this.playerPos.x, this.playerPos.z, 4.5);
    if (car) {
      const wasParkedOrTraffic = car.parked || car.traffic;
      NBVehicles.enterCar(car);
      this.inCar = true;
      this.playerHeading = car.heading;
      if (wasParkedOrTraffic) {
        this.addWanted(1);
        this.toast('Car stolen! The owner called it in — wanted level up.', 4);
        NBMissions.onCarStolen(this);
      }
    }
  },

  // ---- per-frame ----
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;
    if (this.state === 'menu') {
      // slow cinematic orbit
      this.camYaw += dt * 0.05;
      const cx = NB_CONFIG.garage.x, cz = NB_CONFIG.garage.z;
      this.camera.position.set(cx + Math.sin(this.camYaw) * 90, 42, cz + Math.cos(this.camYaw) * 90);
      this.camera.lookAt(cx, 6, cz);
      NBWorld.update(dt, this.elapsed);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state !== 'playing') { // paused / over: still render
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Global keys (edge-triggered: a quick tap is never missed between frames)
    if (NBInput.consume('Escape')) { this.pause(); return; }
    if (NBInput.consume('KeyM')) {
      NBAudio.setMuted(!NBAudio.muted);
      this.toast(NBAudio.muted ? 'Sound muted' : 'Sound on');
    }
    if (NBInput.consume('KeyR')) {
      if (!NBMissions.active && !NBMissions.isFinished()) NBMissions.retry(this);
    }

    // Camera orbit from mouse drag
    const md = NBInput.consumeMouse();
    this.camYaw -= md.x * 0.005;
    this.camPitch = Math.max(0.08, Math.min(1.1, this.camPitch + md.y * 0.003));

    // Interact / punch (edge-triggered)
    if (NBInput.consume('KeyE')) this.tryEnterCar();
    if (NBInput.consume('KeyF')) NBCombat.punch(this);

    const playerSpeed = this.inCar && NBVehicles.playerCar ? Math.abs(NBVehicles.playerCar.speed) : 0;
    if (this.inCar) {
      NBVehicles.updatePlayerCar(dt);
      NBVehicles.separateCars();
      const car = NBVehicles.playerCar;
      this.playerPos.set(car.mesh.position.x, 0, car.mesh.position.z);
      this.playerHeading = car.heading;
      NBHud.setSpeed(Math.abs(car.speed) * 2.237, true);
      NBHud.setCrosshair(false);
    } else {
      this.updateOnFoot(dt);
      NBHud.setSpeed(0, false);
      NBHud.setCrosshair(NBCombat.hasGun);
      NBAudio.setEngine(0, false);
    }

    // Nearby-car prompt
    if (!this.inCar) {
      const near = NBVehicles.nearestCar(this.playerPos.x, this.playerPos.z, 4.5);
      NBHud.setPrompt(near ? 'Press E — take the car' : '');
    } else {
      NBHud.setPrompt('Press E — exit car');
    }

    // Pedestrian hit by player car = crime
    if (this.inCar && playerSpeed > 8) {
      for (const p of NBPeople.peds) {
        const d = Math.hypot(p.mesh.position.x - this.playerPos.x, p.mesh.position.z - this.playerPos.z);
        if (d < 2.6 && !p._hitCd) {
          p._hitCd = 3;
          p.flee = 3;
          this.addWanted(1);
          this.toast('You hit a pedestrian!');
          NBAudio.crash();
          setTimeout(() => { p._hitCd = 0; }, 3000);
        }
      }
    }

    // Wanted decay: no crime for a while and no cop nearby
    if (this.wanted > 0) {
      const nearCop = NBPolice.cars.some((c) =>
        Math.hypot(c.mesh.position.x - this.playerPos.x, c.mesh.position.z - this.playerPos.z) < 45);
      if (!nearCop && this.elapsed - this.lastCrime > NB_CONFIG.wantedDecaySeconds) {
        this.setWanted(this.wanted - 1);
        if (this.wanted === 0) this.toast('You lost them. Heat is off.');
      }
    }

    NBVehicles.updateTraffic(dt);
    NBPeople.update(dt, this.playerPos, playerSpeed);
    NBPolice.update(dt, this.playerPos, playerSpeed, this.wanted);
    NBCombat.update(dt);
    NBMissions.update(dt, this);
    NBWorld.update(dt, this.elapsed);

    // Camera follow
    this.updateCamera(dt);
    // Sun shadow follows player
    if (NBWorld.sun) {
      NBWorld.sun.position.set(this.playerPos.x + 120, 180, this.playerPos.z + 60);
      NBWorld.sun.target.position.set(this.playerPos.x, 0, this.playerPos.z);
      NBWorld.sun.target.updateMatrixWorld();
    }

    // Minimap (every other frame is fine, but cheap enough each frame)
    NBHud.drawMinimap(this);
    NBHud.setCash(this.cash);

    // Autosave every ~20s
    this._saveTimer += dt;
    if (this._saveTimer > 20) { this._saveTimer = 0; this.save(); }

    this.renderer.render(this.scene, this.camera);
  },

  updateOnFoot(dt) {
    const a = NBInput.axis();
    const run = NBInput.down('ShiftLeft') || NBInput.down('ShiftRight');
    const speed = run ? 8.5 : 4.6;
    // Move relative to camera yaw: forward = away from camera
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = fx * -a.z + rx * a.x;
    let mz = fz * -a.z + rz * a.x;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      this.playerHeading = Math.atan2(mx, mz);
      let nx = this.playerPos.x + mx * speed * dt;
      let nz = this.playerPos.z + mz * speed * dt;
      const hit = NBWorld.resolveCircle(nx, nz, 0.7);
      if (hit) { nx = hit.x; nz = hit.z; }
      const cl = NBWorld.clampBounds(nx, nz);
      this.playerPos.x = cl.x; this.playerPos.z = cl.z;
      // walk bob
      this._bob = (this._bob || 0) + dt * speed * 1.6;
      const s = Math.sin(this._bob);
      const parts = this.playerMesh.userData.parts;
      parts.legL.rotation.x = s * 0.6; parts.legR.rotation.x = -s * 0.6;
      parts.armL.rotation.x = -s * 0.45; parts.armR.rotation.x = s * 0.45;
      this.playerMesh.position.y = Math.abs(Math.sin(this._bob)) * 0.06;
    } else {
      const parts = this.playerMesh.userData.parts;
      parts.legL.rotation.x *= 0.8; parts.legR.rotation.x *= 0.8;
      parts.armL.rotation.x *= 0.8; parts.armR.rotation.x *= 0.8;
      this.playerMesh.position.y = 0;
    }
    this.playerMesh.position.set(this.playerPos.x, this.playerMesh.position.y, this.playerPos.z);
    this.playerMesh.rotation.y = this.playerHeading;
  },

  updateCamera(dt) {
    // Third-person: behind the player (or car), orbit yaw from mouse drag
    const target = this.playerPos;
    const yaw = this.inCar ? this.playerHeading + Math.PI : this.camYaw;
    const dist = this.camDist;
    const h = 3.2 + Math.sin(this.camPitch) * dist * 0.55;
    const back = Math.cos(this.camPitch) * dist;
    let cx = target.x + Math.sin(yaw) * back;
    let cz = target.z + Math.cos(yaw) * back;
    // keep camera out of buildings
    const hit = NBWorld.resolveCircle(cx, cz, 1.2);
    if (hit) { cx = hit.x; cz = hit.z; }
    cx = Math.max(-NB_CONFIG.worldBound - 10, Math.min(NB_CONFIG.worldBound + 10, cx));
    cz = Math.max(-NB_CONFIG.worldBound - 10, Math.min(NB_CONFIG.worldBound + 40, cz));
    // smooth
    const k = 1 - Math.pow(0.0001, dt);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (h - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    // shake
    if (this.shakeAmt > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmt;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.02, dt);
    } else this.shakeAmt = 0;
    this.camera.lookAt(target.x, target.y + 1.8, target.z);
  },

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  },
};

// Debug / test hooks (also used to stage screenshots). Harmless in normal play.
window.NB = {
  game: NBGame,
  start: () => NBGame.newGame(),
  teleport: (x, z) => {
    if (NBGame.inCar) { const c = NBVehicles.playerCar; c.mesh.position.x = x; c.mesh.position.z = z; }
    NBGame.playerPos.set(x, 0, z);
    NBGame.playerMesh.position.set(x, 0, z);
  },
  setWanted: (n) => NBGame.setWanted(n),
  mission: (i) => { NBMissions.init(); NBMissions.index = i; NBMissions.start(NBGame); },
  giveGun: () => { NBCombat.hasGun = true; },
  state: () => ({ state: NBGame.state, cash: NBGame.cash, wanted: NBGame.wanted,
    health: NBGame.health, mission: NBMissions.index, inCar: NBGame.inCar,
    pos: [NBGame.playerPos.x, NBGame.playerPos.z] }),
};

window.addEventListener('load', () => NBGame.init());
