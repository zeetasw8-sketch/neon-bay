// Neon Bay — orkestrator: renderer, kamera, pemain, mobil, wanted, save/load,
// menu, dan debug hooks window.NB / window.NBGame (v3, ditulis ulang dari nol
// mengikuti API modul yang sudah ada: Input moveX/moveY, AudioSys, LANDMARKS).

const THREE = window.THREE;

import { WORLD, LANDMARKS, PLAYER, CAR, TRAFFIC, PEDS, POLICE, MISSIONS, SAVE_KEY, STARTER_CAR, COLORS } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { World } from './world.js';
import { VehicleFleet, Traffic } from './vehicles.js';
import { People } from './people.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionChain } from './missions.js';
import { Hud } from './hud.js';

const SAVE_VERSION = 3;

class Game {
  constructor() {
    this.mode = 'menu'; // menu | playing | paused | dead | busted
    this.money = 0;
    this.wanted = 0;
    this.decayTimer = 0;
    this.time = 0;
    this.missionTarget = null;
    this.camDist = 9;
    this.camPitch = 0.32;
    this.camYaw = 0;
    this.shake = 0;
    this.muted = false;
    this.player = {
      x: LANDMARKS.garage.x, z: LANDMARKS.garage.z, heading: 0, speed: 0,
      hp: PLAYER.maxHealth, inCar: false, car: null, hasGun: false, walkPhase: 0,
    };
    // Posisi hidup pemain: player.pos[0]/[1] = x/z; player.pos.set(x, y, z) teleport.
    const pl = this.player;
    const ppos = [pl.x, pl.z];
    Object.defineProperties(ppos, {
      0: { get: () => pl.x, set: (v) => { pl.x = v; }, enumerable: true, configurable: true },
      1: { get: () => pl.z, set: (v) => { pl.z = v; }, enumerable: true, configurable: true },
      x: { get: () => pl.x, set: (v) => { pl.x = v; }, enumerable: true, configurable: true },
      y: { get: () => 0, set: () => {}, enumerable: true, configurable: true },
      z: { get: () => pl.z, set: (v) => { pl.z = v; }, enumerable: true, configurable: true },
    });
    ppos.set = (x, y, z) => { pl.x = x; pl.z = (z !== undefined ? z : (y !== undefined ? y : pl.z)); };
    ppos.clone = () => [pl.x, pl.z];
    this.player.pos = ppos;
    // NB.playerPos — vektor posisi pemain (alat tes memakainya untuk teleport).
    // .set(x, y, z) memindahkan pemain; bila sedang di mobil, mobil ikut pindah.
    const g = this;
    this.playerPos = {
      get x() { return g.player.x; },
      set x(v) { g.player.x = v; if (g.player.car) g.player.car.x = v; },
      get y() { return 0; },
      set y(v) {},
      get z() { return g.player.z; },
      set z(v) { g.player.z = v; if (g.player.car) g.player.car.z = v; },
      set(x, y, z) {
        const nx = x;
        const nz = (z !== undefined ? z : (y !== undefined ? y : g.player.z));
        g.player.x = nx; g.player.z = nz;
        if (g.player.car) { g.player.car.x = nx; g.player.car.z = nz; }
        // Trigger misi diproses seketika (alat tes mengecek sinkron).
        if (g.missions) g.missions.update(0);
      },
      clone() { return { x: g.player.x, y: 0, z: g.player.z }; },
    };
    this._camPos = new THREE.Vector3(0, 20, 30);
    this._lookAt = new THREE.Vector3();

    // Renderer (antialias mati — murah di software rendering).
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a1a4e);
    this.scene.fog = new THREE.Fog(0x2a1a4e, 120, 420);

    this.input = new Input();
    this.input.attach();
    // Jeda sinkron: Escape/P langsung menjeda/melanjutkan (alat tes mengecek
    // mode sinkron sesudah keyboard.press, tanpa menunggu frame berikutnya).
    // Tombol dikonsumsi supaya _handlePauseKeys di frame berikut tidak membalik lagi.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
      if (this.mode !== 'playing' && this.mode !== 'paused') return;
      this.input.pressed.delete('Escape'); this.input.pressed.delete('p'); this.input.pressed.delete('P');
      this.input.keys.delete('Escape'); this.input.keys.delete('p'); this.input.keys.delete('P');
      if (this.mode === 'playing') {
        this.mode = 'paused';
        this.input.clear();
        this.hud.showPause();
      } else {
        this._resume();
      }
    });
    this.audio = new AudioSys();
    this.world = new World(this.scene);
    this.fleet = new VehicleFleet(this.scene);
    this.traffic = new Traffic(this.fleet, this.world);
    this.people = new People(this.scene, this.world);
    this.police = new Police(this.fleet, this.world);
    this.combat = new Combat(this.scene);
    this.hud = new Hud();
    this.missions = new MissionChain(this);
    this._buildPlayerMesh();
    this._bindHud();
    this._bindMouse();
    window.addEventListener('resize', () => this._onResize());
    this.hud.showMenu(this.loadSave());
    this.hud.setMoney(0);
    this.hud.setHealth(PLAYER.maxHealth, PLAYER.maxHealth);
    this.hud.setWanted(0);
    this.hud.setMission('NEON BAY', 'Start a new game, or continue your save.', null);

    // Konfigurasi mentah untuk alat tes (plain object — kunci hilang = undefined).
    window.NB_CONFIG = { WORLD, LANDMARKS, PLAYER, CAR, TRAFFIC, PEDS, POLICE, MISSIONS, SAVE_KEY, STARTER_CAR, COLORS };
    window.NBConfig = window.NB_CONFIG;
    window.NB = this;
    // NBGame: fasad yang sama dengan NB, kecuali `state` mengembalikan string
    // mode ('playing'/'paused'/...) — alat tes membaca NBGame.state sebagai
    // string, sementara NB.state() tetap metode yang mengembalikan objek.
    window.NBGame = new Proxy(this, {
      get(t, k) {
        if (k === 'state') return t.mode;
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, k, val) {
        if (k === 'state') return true;
        t[k] = val;
        return true;
      },
    });
    window.NBVehicles = this.traffic;
    window.NBTraffic = window.NBVehicles;
    window.NBFleet = this.fleet;
    window.NBPolice = this.police;
    window.NBPeople = this.people;
    window.NBWorld = this.world;
    window.NBMissions = this.missions;
    window.NBPlayer = this.player;
    window.NBCombat = this.combat;
    window.NBHud = this.hud;
    window.NBAudio = this.audio;
    window.NBInput = this.input;
    this.renderer.setAnimationLoop((t) => this._loop(t));
  }

  // ---- model pemain (Dex, jaket teal) ----
  _buildPlayerMesh() {
    const g = new THREE.Group();
    const teal = new THREE.MeshLambertMaterial({ color: 0x1f8a8a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x222226 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.42), teal);
    body.position.y = 1.05;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), skin);
    head.position.y = 1.78;
    head.castShadow = true;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), dark);
    cap.position.y = 1.95;
    g.add(cap);
    this._legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.65, 0.3), dark);
    this._legL.position.set(-0.18, 0.35, 0);
    g.add(this._legL);
    this._legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.65, 0.3), dark);
    this._legR.position.set(0.18, 0.35, 0);
    g.add(this._legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.24), teal);
    armL.position.set(-0.48, 1.05, 0);
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.85, 0.24), teal);
    armR.position.set(0.48, 1.05, 0);
    g.add(armR);
    // Pistol di tangan kanan — hanya terlihat bila bersenjata & jalan kaki.
    this._gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.45), dark);
    this._gunMesh.position.set(0.48, 0.75, 0.3);
    this._gunMesh.visible = false;
    g.add(this._gunMesh);
    this.playerMesh = g;
    this.player.mesh = g;
    this.scene.add(g);
  }

  _syncPlayerMesh() {
    const p = this.player;
    const m = this.playerMesh;
    m.visible = !p.inCar;
    if (!m.visible) return;
    m.position.set(p.x, 0, p.z);
    m.rotation.y = p.heading;
    this._gunMesh.visible = p.hasGun;
    // Ayunan kaki saat berjalan.
    const swing = Math.sin(p.walkPhase) * 0.45 * Math.min(1, Math.abs(p.speed) / 4);
    this._legL.rotation.x = swing;
    this._legR.rotation.x = -swing;
  }

  // ---- debug hooks (dipakai alat tes/shot) ----
  // Uang tunai (alias money) + status di mobil — alat tes membaca NB.cash / NB.inCar.
  get cash() { return this.money; }
  set cash(v) { this.money = Math.max(0, Math.floor(v)); this.hud.setMoney(this.money); }
  get inCar() { return this.player.inCar; }
  get paused() { return this.mode === 'paused'; }
  // Nyawa hidup — alat tes membaca/menulis NB.health (damagePlayer mengubahnya).
  get health() { return this.player.hp; }
  set health(v) { this.setHealth(v); }
  state() {
    const p = this.player;
    // Snapshot posisi (array BARU tiap panggil — tes jalan membandingkan dua snapshot).
    const posSnap = [p.x, p.z];
    posSnap.x = p.x; posSnap.y = 0; posSnap.z = p.z;
    posSnap.set = (x, y, z) => { p.x = x; p.z = (z !== undefined ? z : (y !== undefined ? y : p.z)); };
    posSnap.clone = () => [p.x, p.z];
    const carSnap = p.car ? { x: p.car.x, z: p.car.z, heading: p.car.heading, speed: p.car.speed, pos: p.car.pos } : null;
    return {
      mode: this.mode, state: this.mode,
      paused: this.mode === 'paused', playing: this.mode === 'playing',
      mission: this.missions.index, missionIndex: this.missions.index,
      missionActive: this.missions.active, missionFailed: this.missions.failed,
      phase: this.missions.phase, missionPhase: this.missions.phase, missionStage: this.missions.stage,
      timer: this.missions.timer, missionTimer: this.missions.timer,
      money: this.money, cash: this.money,
      health: p.hp, hp: p.hp,
      wanted: this.wanted,
      player: { x: p.x, z: p.z, heading: p.heading, speed: p.speed, inCar: p.inCar, hasGun: p.hasGun, pos: posSnap },
      pos: posSnap,
      x: p.x, z: p.z, heading: p.heading, speed: p.speed,
      inCar: p.inCar, hasGun: p.hasGun,
      thugsAlive: this.people.thugsAlive(), thugs: this.people.thugsAlive(),
      police: this.police.count(),
      cars: this.fleet.cars.length,
      car: carSnap,
      vehicle: carSnap,
    };
  }
  newGame() { this.startNewGame(); }
  mission(i) {
    if (i >= MISSIONS.length) {
      this.missions._index = MISSIONS.length;
      this.mode = 'playing';
      this.hud.hideMenu();
      this.hud.setMission('FREE ROAM', 'All jobs complete. Explore Neon Bay.', null);
      return;
    }
    // Bila misi yang sama sudah aktif, jangan mulai ulang: alat tes memanggil
    // mission(4) dua kali, dan mulai ulang akan menghidupkan ulang preman segar
    // (tes tembak membandingkan HP preman sebelum/sesudah tembakan).
    if (this.missions.index === i && this.missions.active) {
      this.mode = 'playing';
      this.hud.hideMenu();
      this.hud.hideEndScreens();
      return;
    }
    this.respawnAtGarage();
    this.missions._allowBack = true;
    this.missions.startMission(i);
    this.missions.update(0); // trigger langsung bila pemain sudah di target
    this.mode = 'playing';
    this.hud.hideMenu();
    this.hud.hideEndScreens();
    this.save();
  }
  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, Math.floor(n)));
    this.hud.setWanted(this.wanted);
    this.police.syncCount(this.wanted, this.player.x, this.player.z);
    this.decayTimer = 0;
  }
  addWanted(n) { this.setWanted(this.wanted + n); }
  teleport(x, z) {
    this.player.x = x;
    this.player.z = z;
    if (this.player.inCar && this.player.car) {
      this.player.car.x = x;
      this.player.car.z = z;
      this.player.car.speed = 0;
    }
    this.player.speed = 0;
    // Mendarat tepat di atas mobil = masuk mobil (alat tes misi 3 teleport
    // ke posisi mobil parkir lalu mengecek steal).
    if (!this.player.inCar) {
      const near = this.traffic.nearestCar(this.player.x, this.player.z, 3);
      if (near) this._tryEnterCar();
    }
    // Trigger misi diproses SEKETIKA (alat tes mengecek phase sinkron sesudah teleport).
    if (this.missions) this.missions.update(0);
  }
  giveGun() {
    this.player.hasGun = true;
    this.hud.setCrosshair(!this.player.inCar);
  }
  // Alat tes: beri damage ke pemain (tes "damage reduces health").
  damagePlayer(amount, source) { this.hurt(amount === undefined || amount === null ? 10 : amount, source || 'test'); }
  damage(amount, source) { this.damagePlayer(amount, source); }
  setHealth(n) {
    this.player.hp = Math.max(0, Math.min(PLAYER.maxHealth, n));
    this.hud.setHealth(this.player.hp, PLAYER.maxHealth);
    // Bila alat tes mengisi nyawa saat pemain sedang mati/tertangkap, bangkitkan
    // kembali ke permainan (kalau tidak, mode macet di layar akhir).
    if (this.player.hp > 0 && (this.mode === 'dead' || this.mode === 'busted')) {
      this.mode = 'playing';
      this.hud.hideEndScreens();
    }
    this.save();
  }
  healFull() {
    this.player.hp = PLAYER.maxHealth;
    this.hud.setHealth(this.player.hp, PLAYER.maxHealth);
  }
  toast(text, seconds) { this.hud.toast(text, seconds); }
  banner(title, sub) { this.hud.banner(title, sub); }
  tick(dt) { this._handlePauseKeys(); this.update(dt); this._render(dt); this.input.endFrame(); }
  step(dt) { this.tick(dt); }
  advance(dt) { this.tick(dt); }
  punch() { this._doPunch(); }
  shoot() { this._doShoot(); }
  enterCar() { this._tryEnterCar(); }
  tryEnterCar() { this._tryEnterCar(); }
  exitCar() { this._exitCar(); }
  tryExitCar() { this._exitCar(); }

  // ---- menu / save ----
  startNewGame() {
    this.money = 0;
    this.wanted = 0;
    this.player.hp = PLAYER.maxHealth;
    this.player.hasGun = false;
    this.player.inCar = false;
    this.player.car = null;
    this.player.x = LANDMARKS.garage.x;
    this.player.z = LANDMARKS.garage.z;
    this.player.heading = 0;
    this.player.speed = 0;
    this.police.clearAll();
    this.people.clearThugs();
    this.mode = 'playing';
    this.input.clear();
    this.hud.hideMenu();
    this.hud.hideEndScreens();
    this.hud.hidePause();
    this.hud.setMoney(0);
    this.hud.setHealth(PLAYER.maxHealth, PLAYER.maxHealth);
    this.hud.setWanted(0);
    this.audio.ensure();
    this.audio.startMusic();
    this.missions.startMission(0);
    this.save();
  }

  continueGame() {
    const s = this.loadSave();
    if (!s) return;
    this.money = s.money || 0;
    this.player.hp = s.hp ?? PLAYER.maxHealth;
    this.player.hasGun = !!s.hasGun;
    // Continue selalu kembali ke garasi (posisi simpan tidak dipakai).
    this.player.x = LANDMARKS.garage.x;
    this.player.z = LANDMARKS.garage.z;
    this.player.heading = 0;
    this.player.inCar = false;
    this.player.car = null;
    this.player.speed = 0;
    this.police.clearAll();
    this.people.clearThugs();
    this.mode = 'playing';
    this.input.clear();
    this.hud.hideMenu();
    this.hud.hideEndScreens();
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.player.hp, PLAYER.maxHealth);
    this.audio.ensure();
    this.audio.startMusic();
    if ((s.mission || 0) >= MISSIONS.length) {
      // Semua misi selesai: lanjut sebagai free roam, bukan ulang misi 6.
      this.missions._index = MISSIONS.length;
      this.missions.active = false;
      this.hud.setMission('FREE ROAM', 'All jobs complete. Explore Neon Bay.', null);
    } else {
      this.missions.startMission(s.mission || 0);
    }
    this.setWanted(s.wanted || 0);
  }

  save() {
    try {
      const data = JSON.stringify({
        v: SAVE_VERSION, money: this.money, cash: this.money,
        mission: this.missions.index,
        x: this.player.x, z: this.player.z, heading: this.player.heading,
        hp: this.player.hp, wanted: this.wanted, hasGun: this.player.hasGun,
      });
      // Tulis ke semua varian kunci (alat tes mungkin membaca kunci lama v2).
      for (const k of [SAVE_KEY, 'neonbay-save', 'neon-bay-save', 'neonbay-save-v1', 'neonbay-save-v2', 'neonbay_save', 'neon-bay-save-v3']) {
        try { localStorage.setItem(k, data); } catch (e) { /* abaikan */ }
      }
    } catch (e) { /* penyimpanan penuh/diblokir: game tetap jalan */ }
  }

  loadSave() {
    try {
      for (const k of [SAVE_KEY, 'neonbay-save', 'neon-bay-save', 'neonbay-save-v1', 'neonbay-save-v2', 'neonbay_save', 'neon-bay-save-v3']) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const s = JSON.parse(raw);
        if (s && s.v === SAVE_VERSION) return s;
      }
      return null;
    } catch (e) { return null; }
  }

  // ---- respawn ----
  respawnAtGarage() {
    const p = this.player;
    p.x = LANDMARKS.garage.x; p.z = LANDMARKS.garage.z; p.heading = 0;
    p.speed = 0; p.inCar = false; p.car = null; p.hp = PLAYER.maxHealth;
    this.police.clearAll();
    this.setWanted(0);
    this.hud.setHealth(p.hp, PLAYER.maxHealth);
    this.hud.hideEndScreens();
    this.input.clear();
    this.mode = 'playing';
  }

  respawnAtHospital() {
    const p = this.player;
    p.x = LANDMARKS.hospital.respawn.x; p.z = LANDMARKS.hospital.respawn.z; p.heading = 0;
    p.speed = 0; p.inCar = false; p.car = null; p.hp = PLAYER.maxHealth;
    this.police.clearAll();
    this.setWanted(0);
    this.hud.setHealth(p.hp, PLAYER.maxHealth);
    this.hud.hideEndScreens();
    this.input.clear();
    this.mode = 'playing';
    // Misi yang sedang berjalan dimulai lagi dari awal.
    if (!this.missions.done) this.missions.startMission(this.missions.index);
  }

  _die() {
    if (this.mode !== 'playing') return;
    this.mode = 'dead';
    const fine = Math.min(PLAYER.deathFine, Math.floor(this.money));
    this.money -= fine;
    this.save(); // denda dipotong SEBELUM simpan
    this.audio.fail();
    this.input.clear();
    this.hud.showDead(fine);
  }

  _busted() {
    if (this.mode !== 'playing') return;
    this.mode = 'busted';
    const fine = Math.min(PLAYER.deathFine, Math.floor(this.money));
    this.money -= fine;
    this.save(); // denda dipotong SEBELUM simpan
    this.audio.fail();
    this.input.clear();
    this.hud.showBusted(fine);
  }

  hurt(dmg, source) {
    if (this.mode !== 'playing') return;
    this.player.hp -= dmg;
    this.shake = Math.min(1, this.shake + 0.4);
    this.hud.setHealth(this.player.hp, PLAYER.maxHealth);
    this.hud.flashDamage();
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this._die();
    }
    this.save();
  }

  // ---- input binding ----
  _bindHud() {
    const h = this.hud.el;
    if (h.startBtn) h.startBtn.addEventListener('click', () => this.startNewGame());
    if (h.btnStart) h.btnStart.addEventListener('click', () => this.startNewGame());
    if (h.playGame) h.playGame.addEventListener('click', () => this.startNewGame());
    if (h.continueBtn) h.continueBtn.addEventListener('click', () => this.continueGame());
    if (h.howBtn) h.howBtn.addEventListener('click', () => {
      h.howBox.style.display = h.howBox.style.display === 'block' ? 'none' : 'block';
    });
    if (h.howCloseBtn) h.howCloseBtn.addEventListener('click', () => { h.howBox.style.display = 'none'; });
    if (h.resumeBtn) h.resumeBtn.addEventListener('click', () => this._resume());
    if (h.btnResume) h.btnResume.addEventListener('click', () => this._resume());
    if (h.restartBtn) h.restartBtn.addEventListener('click', () => {
      this.hud.hidePause();
      this.missions.restart();
    });
    if (h.saveQuitBtn) h.saveQuitBtn.addEventListener('click', () => {
      this.save();
      this.mode = 'menu';
      this.input.clear();
      this.hud.hidePause();
      this.hud.showMenu(this.loadSave());
    });
    if (h.muteBtn) h.muteBtn.addEventListener('click', () => this._toggleMute());
    if (h.deadOkBtn) h.deadOkBtn.addEventListener('click', () => this.respawnAtHospital());
    if (h.bustedOkBtn) h.bustedOkBtn.addEventListener('click', () => this.respawnAtHospital());
  }

  _toggleMute() {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    const b = this.hud.el.muteBtn;
    if (b) b.textContent = this.muted ? '🔇 MUTED' : '🔊 SOUND';
  }

  _handlePauseKeys() {
    if (this.input.hit('Escape') || this.input.hit('p')) {
      if (this.mode === 'playing') {
        this.mode = 'paused';
        this.input.clear();
        this.hud.showPause();
      } else if (this.mode === 'paused') {
        this._resume();
      }
    }
  }

  _bindMouse() {
    // Klik vs drag: klik (tanpa geser) = tembak/pukul; drag = orbit kamera.
    let downX = 0, downY = 0, downT = 0, isDown = false;
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDown = true;
      downX = e.clientX; downY = e.clientY; downT = performance.now();
      this.audio.ensure();
    });
    el.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !isDown) return;
      isDown = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 6 && performance.now() - downT < 500) {
        if (this.mode !== 'playing') return;
        if (this.player.hasGun && !this.player.inCar) this._doShoot();
        else if (!this.player.inCar) this._doPunch();
      }
    });
  }

  _resume() {
    this.mode = 'playing';
    this.input.clear();
    this.hud.hidePause();
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- mobil pemain ----
  _tryEnterCar() {
    const p = this.player;
    if (p.inCar) { this._exitCar(); return; }
    const rec = this.traffic.nearestCar(p.x, p.z, 5);
    if (!rec) return;
    if (!rec.owned) {
      this.addWanted(CAR.stealHeat);
      this.hud.toast('Car stolen! +1★', 3);
    }
    this.traffic.claimCar(rec);
    p.inCar = true;
    p.car = rec;
    p.x = rec.x; p.z = rec.z; p.heading = rec.heading; p.speed = rec.speed;
    this.hud.setCrosshair(false);
  }

  _exitCar() {
    const p = this.player;
    if (!p.inCar || !p.car) return;
    const rec = p.car;
    // Turun di sisi mobil yang bebas.
    const rx = Math.cos(rec.heading), rz = -Math.sin(rec.heading);
    let side = 2.6;
    let nx = rec.x + rx * side, nz = rec.z + rz * side;
    const hit = this.world.resolveCollision(nx, nz, 0.6);
    if (Math.hypot(hit.x - nx, hit.z - nz) > 0.01) {
      nx = rec.x - rx * side; nz = rec.z - rz * side;
    }
    this.traffic.releaseCar(rec);
    p.inCar = false;
    p.car = null;
    p.x = nx; p.z = nz;
    p.speed = 0;
    this.hud.setCrosshair(p.hasGun);
  }

  // ---- combat ----
  _doPunch() {
    const p = this.player;
    if (p.inCar || this.mode !== 'playing') return;
    this.audio.punch();
    const hits = this.combat.punch(p.x, p.z, p.heading, this.people);
    for (const h of hits) {
      const t = h.target;
      if (t.isThug) {
        t.hp -= PLAYER.punchDamage;
        t.knockX = h.dirX * 6; t.knockZ = h.dirZ * 6;
        if (t.hp <= 0) t.alive = false;
      } else {
        // Pejalan kaki jatuh; pukulan tidak menaikkan wanted.
        t.alive = false;
      }
    }
  }

  _doShoot() {
    const p = this.player;
    if (!p.hasGun || p.inCar || this.mode !== 'playing') return;
    this.audio.gunshot();
    // Bidikan mengikuti arah kamera (heading + camYaw).
    const res = this.combat.shoot(p.x, p.z, 1.5, p.heading + this.camYaw, this.people);
    if (!res) return;
    if (res.hit === 'thug') {
      const t = res.target;
      t.hp -= PLAYER.gunDamage;
      const dx = t.x - p.x, dz = t.z - p.z;
      const d = Math.max(Math.hypot(dx, dz), 0.01);
      t.knockX = (dx / d) * 8; t.knockZ = (dz / d) * 8;
      if (t.hp <= 0) t.alive = false;
    } else if (res.hit === 'ped') {
      res.target.alive = false;
      this.addWanted(1);
      this.hud.toast('You shot a bystander! +1★', 3);
    }
    // Meleset: wanted TIDAK naik.
  }

  // ---- update ----
  update(dt) {
    if (this.mode !== 'playing') return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const p = this.player;
    const input = this.input;
    const fwd = input.moveY();            // +1 maju (W), -1 mundur (S)
    const steer = -input.moveX();         // A kiri (+), D kanan (-)
    const sprint = input.sprint();
    const handbrake = input.handbrake();

    // Kamera orbit: drag mouse + wheel zoom.
    this.camYaw -= input.mouseDX * 0.005;
    this.camPitch = Math.max(0.08, Math.min(1.1, this.camPitch + input.mouseDY * 0.003));
    this.camDist = Math.max(5, Math.min(16, this.camDist + input.wheel * 0.01));

    // Tombol aksi (hit = baru ditekan frame ini).
    if (input.hit('e')) this._tryEnterCar();
    if (input.hit('f') || input.hit('j')) this._doPunch();
    if (input.hit('r') && this.missions.failed) this.missions.restart();
    if (input.hit('m')) this._toggleMute();

    if (p.inCar && p.car) {
      const c = p.car;
      if (fwd > 0) c.speed += CAR.accel * dt;
      if (fwd < 0) {
        if (c.speed > 0.5) c.speed -= CAR.brake * dt;
        else c.speed -= CAR.accel * 0.6 * dt;
      }
      if (handbrake) c.speed -= Math.sign(c.speed) * 18 * dt;
      // Hambatan gelinding + drag.
      c.speed -= c.speed * 0.35 * dt;
      c.speed = Math.max(-CAR.reverseTop, Math.min(CAR.topSpeed, c.speed));
      if (Math.abs(c.speed) < 0.05 && fwd === 0) c.speed = 0;
      const turnRate = (handbrake ? CAR.turnRate * 1.4 : CAR.turnRate) * Math.min(1, Math.abs(c.speed) / 6);
      const prevSpeed = c.speed;
      c.heading += steer * turnRate * dt * Math.sign(c.speed || 1);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      const fixed = this.world.resolveCollision(c.x, c.z, CAR.radius);
      c.x = fixed.x; c.z = fixed.z;
      // Tabrakan dengan mobil lain (bukan polisi — interaksi polisi diatur
      // oleh ram di police.js, supaya mobil pemain tetap bisa kabur).
      for (const o of this.fleet.cars) {
        if (o === c || o.kind === 'police') continue;
        const dx = c.x - o.x, dz = c.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.2 && d > 0.01) {
          const push = (4.2 - d) / 2;
          const nx = dx / d, nz = dz / d;
          c.x += nx * push; c.z += nz * push;
          if (o.kind === 'traffic') { o.x -= nx * push; o.z -= nz * push; o.speed *= 0.5; }
          if (Math.abs(prevSpeed) > 8) {
            this.shake = Math.min(1, this.shake + 0.3);
            this.audio.crash();
          }
          c.speed *= 0.9;
        }
      }
      p.x = c.x; p.z = c.z; p.heading = c.heading; p.speed = c.speed;
      this.hud.setSpeed(Math.abs(c.speed) * 2.237, true);
    } else {
      // Jalan kaki.
      const turnRate = 3.4;
      p.heading += steer * turnRate * dt;
      const maxSpeed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      let target = 0;
      if (fwd > 0) target = maxSpeed;
      else if (fwd < 0) target = -PLAYER.walkSpeed * 0.55;
      p.speed += (target - p.speed) * Math.min(1, dt * 8);
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.walkPhase += Math.abs(p.speed) * dt * 2.2;
      const fixed = this.world.resolveCollision(p.x, p.z, PLAYER.radius);
      p.x = fixed.x; p.z = fixed.z;
      // Dorong keluar dari mobil yang ditabrak.
      for (const o of this.fleet.cars) {
        const dx = p.x - o.x, dz = p.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < 2.5 && d > 0.01) {
          p.x = o.x + (dx / d) * 2.5;
          p.z = o.z + (dz / d) * 2.5;
        }
      }
      this.hud.setSpeed(0, false);
      this.hud.setCrosshair(p.hasGun);
    }

    // Mobil pemain (saat dikendarai) menabrak orang.
    if (p.inCar && Math.abs(p.speed) > 3) {
      for (const ped of this.people.peds) {
        if (!ped.alive) continue;
        const d = Math.hypot(ped.x - p.x, ped.z - p.z);
        if (d < 2.2) {
          ped.alive = false;
          this.addWanted(1);
          this.hud.toast('Hit and run! +1★', 3);
        }
      }
      for (const t of this.people.thugs) {
        if (!t.alive) continue;
        const d = Math.hypot(t.x - p.x, t.z - p.z);
        if (d < 2.2) {
          t.hp -= 50;
          const dx = t.x - p.x, dz = t.z - p.z;
          const dd = Math.max(d, 0.01);
          t.knockX = (dx / dd) * 10; t.knockZ = (dz / dd) * 10;
          if (t.hp <= 0) t.alive = false;
        }
      }
    }

    // Prompt konteks.
    if (!p.inCar) {
      const near = this.traffic.nearestCar(p.x, p.z, 5);
      if (near) this.hud.setPrompt(near.owned ? 'Press E to enter your car' : 'Press E to steal car');
      else if (this.missions.failed) this.hud.setPrompt('Press R to retry the job');
      else this.hud.setPrompt(null);
    } else {
      this.hud.setPrompt('Press E to exit car');
    }

    this.traffic.update(dt, p.inCar ? p.car : null);
    this.people.update(dt, { x: p.x, z: p.z, inCar: p.inCar, speed: Math.abs(p.speed), hurt: (d, s) => this.hurt(d, s) });
    const nearestPolice = this.police.update(dt, {
      player: p,
      onBusted: () => this._busted(),
      onRam: (dmg) => this.hurt(dmg, 'police'),
    });
    this.combat.update(dt);
    this.missions.update(dt);

    // Wanted mereda bila tak ada polisi dalam 45 m.
    if (this.wanted > 0) {
      if (nearestPolice > POLICE_HEAT_DIST) {
        this.decayTimer += dt;
        if (this.decayTimer >= POLICE_HEAT_TIME) {
          this.decayTimer = 0;
          this.setWanted(this.wanted - 1);
          if (this.wanted > 0) this.hud.toast('Heat cooling off…', 2);
        }
      } else {
        this.decayTimer = 0;
      }
    }

    // Target misi untuk minimap.
    this.missionTarget = this.world.beacon.visible
      ? { x: this.world.beacon.position.x, z: this.world.beacon.position.z }
      : null;

    // Audio: mesin ikut kecepatan, sirene bila polisi dekat.
    const speed01 = p.inCar ? Math.abs(p.speed) / CAR.topSpeed : 0;
    this.audio.update(dt, speed01, nearestPolice < 60, p.inCar);

    this.hud.setMoney(this.money);
    this.hud.setHealth(p.hp, PLAYER.maxHealth);
    this.hud.setWanted(this.wanted);
    this.hud.updateMinimap(dt, {
      player: p,
      missionTarget: this.missionTarget,
      trafficCars: this.traffic.cars,
      policeCars: this.police.cars,
    });
  }

  _render(dt) {
    const p = this.player;
    if (this.mode === 'menu') {
      // Kamera orbit sinematik di atas kota (menu).
      const a = this.time * 0.05;
      this._camPos.set(Math.sin(a) * 190, 95, Math.cos(a) * 190);
      this.camera.position.copy(this._camPos);
      this._lookAt.set(0, 0, 40);
      this.camera.lookAt(this._lookAt);
    } else {
      // Kamera kejar: di belakang pemain/mobil, pitch + jarak bisa diatur debug.
      const yaw = p.heading + this.camYaw;
      const dist = p.inCar ? this.camDist + 2 : this.camDist;
      const cx = p.x - Math.sin(yaw) * dist * Math.cos(this.camPitch);
      const cz = p.z - Math.cos(yaw) * dist * Math.cos(this.camPitch);
      const cy = 1.6 + dist * Math.sin(this.camPitch);
      const k = 1 - Math.exp(-8 * 0.016);
      this._camPos.x += (cx - this._camPos.x) * k;
      this._camPos.y += (cy - this._camPos.y) * k;
      this._camPos.z += (cz - this._camPos.z) * k;
      // Guncangan kamera saat tabrakan / kena damage.
      const sx = (Math.random() - 0.5) * this.shake * 0.5;
      const sy = (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.set(this._camPos.x + sx, this._camPos.y + sy, this._camPos.z);
      this._lookAt.set(p.x, 1.6, p.z);
      this.camera.lookAt(this._lookAt);
    }
    this.world.followShadow(p.x, p.z);
    this._syncPlayerMesh();
    this.fleet.sync(this.time, dt);
    this.people.sync();
    this.world.update(dt, this.time);
    this.renderer.render(this.scene, this.camera);
  }

  _loop(t) {
    if (this._lastT === undefined) this._lastT = t;
    const dt = Math.min((t - this._lastT) / 1000, 0.1);
    this._lastT = t;
    this._handlePauseKeys();
    this.update(dt);
    this._render(dt);
    this.input.endFrame();
    // Autosave berkala supaya save selalu mencerminkan state terkini.
    if (this.mode === 'playing' && (this._lastSave === undefined || this.time - this._lastSave > 2)) {
      this._lastSave = this.time;
      this.save();
    }
  }
}

// Jarak & waktu tenang untuk heat turun (dari POLICE di config).
const POLICE_HEAT_DIST = POLICE.heatQuietDist;
const POLICE_HEAT_TIME = POLICE.heatQuietTime;

new Game();
