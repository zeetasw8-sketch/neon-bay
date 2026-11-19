// Neon Bay — the game itself (v5 rebuild). Owns the loop, the camera, the
// player, the state machine and the debug hooks the QA harness uses.
// Order inside one tick matters: game logic first, then the camera, then
// the HUD (so the objective arrow reads this frame's camera, never the
// previous frame's), then render.

import { NB_CONFIG as C, wrapAngle, clamp, dist2d } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { createWorld } from './world.js';
import { createVehicles } from './vehicles.js';
import { createPeople } from './people.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';

const SAVE_KEY = 'neonbay-save-v1';

// --- renderer / scene / camera ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('app').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- subsystems ---
const world = createWorld();
const scene = world.scene;
const vehicles = createVehicles(world, scene);
const people = createPeople(world, scene);
const police = createPolice(world, scene);
const combat = createCombat(world, scene);
const missions = createMissions();
const hud = createHud();
const audio = AudioSys;
const input = Input;
input.init();
audio.init();
hud.init();

// --- the player character (teal jacket) ---
const playerMesh = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32),
    new THREE.MeshLambertMaterial({ color: 0x2a9d8f }));
  body.position.y = 0.95;
  playerMesh.add(body);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x22242c }));
  legs.position.y = 0.28;
  playerMesh.add(legs);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xe8b98a }));
  head.position.y = 1.62;
  playerMesh.add(head);
}
scene.add(playerMesh);

// --- the game object ---
const playerPos = new THREE.Vector3(C.garageSpawn.x, 0, C.garageSpawn.z);
const player = {
  heading: 0,
  get x() { return playerPos.x; },
  set x(v) { playerPos.x = v; },
  get z() { return playerPos.z; },
  set z(v) { playerPos.z = v; },
};

const game = {
  state: 'menu',
  cash: 0,
  health: C.maxHealth,
  wanted: 0,
  hasGun: false,
  inCar: false,
  playerSpeed: 0,
  timeSinceCrime: 999,
  _decayT: 0,
  camYaw: 0,
  camDist: C.camDistDefault,
  camPitch: C.camPitchDefault,
  _camYawSmooth: 0,
  _camPos: new THREE.Vector3(0, 95, 180),
  _shake: 0,
  _menuT: 0,
  playerLunge: 0,
  renderer, camera, scene,
  player, playerPos,
  world, vehicles, people, police, combat, missions, hud, audio, input,

  // --- camera helpers ---
  faceObjective() {
    const obj = world.objectivePos();
    if (!missions.active) return;
    this.camYaw = Math.atan2(obj.x - playerPos.x, obj.z - playerPos.z) - player.heading;
    this._snapCamera();
  },

  _snapCamera() {
    const target = wrapAngle(player.heading + this.camYaw);
    this._camYawSmooth = target;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    this._camPos.set(
      playerPos.x - Math.sin(target) * this.camDist * cp,
      1.6 + this.camDist * sp,
      playerPos.z - Math.cos(target) * this.camDist * cp,
    );
    camera.position.copy(this._camPos);
    camera.lookAt(playerPos.x, 1.6, playerPos.z);
  },

  updateCamera(dt) {
    if (this.state === 'menu') {
      // Slow cinematic orbit over the city.
      this._menuT += dt;
      const a = this._menuT * 0.05;
      const tx = Math.sin(a) * 180, tz = Math.cos(a) * 180;
      this._camPos.x += (tx - this._camPos.x) * (1 - Math.exp(-dt * 1.5));
      this._camPos.y += (95 - this._camPos.y) * (1 - Math.exp(-dt * 1.5));
      this._camPos.z += (tz - this._camPos.z) * (1 - Math.exp(-dt * 1.5));
      camera.position.copy(this._camPos);
      camera.lookAt(0, 8, 0);
      return;
    }
    const target = wrapAngle(player.heading + this.camYaw);
    const k = 1 - Math.exp(-dt * C.camSmoothK);
    this._camYawSmooth += wrapAngle(target - this._camYawSmooth) * k;
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const tx = playerPos.x - Math.sin(this._camYawSmooth) * this.camDist * cp;
    const ty = 1.6 + this.camDist * sp;
    const tz = playerPos.z - Math.cos(this._camYawSmooth) * this.camDist * cp;
    const kp = 1 - Math.exp(-dt * C.camPosK);
    this._camPos.x += (tx - this._camPos.x) * kp;
    this._camPos.y += (ty - this._camPos.y) * kp;
    this._camPos.z += (tz - this._camPos.z) * kp;
    // Camera shake on collision / damage.
    let sx = 0, sy = 0;
    if (this._shake > 0.002) {
      sx = (Math.random() - 0.5) * this._shake;
      sy = (Math.random() - 0.5) * this._shake;
      this._shake *= Math.exp(-dt * 6);
    }
    camera.position.set(this._camPos.x + sx, this._camPos.y + sy, this._camPos.z);
    camera.lookAt(playerPos.x, 1.6, playerPos.z);
  },

  shake(amount) { this._shake = Math.max(this._shake, amount); },
  flashDamage() { hud.flashDamage(); },

  // --- wanted / crime ---
  setWanted(n) {
    this.wanted = clamp(Math.round(n), 0, C.maxWanted);
    this._decayT = 0;
    hud.setWanted(this.wanted);
    audio.setSiren(this.wanted > 0);
    // Keep the police count in sync immediately, not only on the next
    // playing tick — so a despawn also lands while paused or busted.
    police.setCount(this, this.wanted);
  },

  commitCrime(n) {
    this.setWanted(this.wanted + n);
    this.timeSinceCrime = 0;
  },

  giveGun() {
    if (this.hasGun) return;
    this.hasGun = true;
    hud.toast('Pistol acquired — CLICK to shoot', 4);
  },

  damagePlayer(amount, source) {
    if (this.state !== 'playing' || amount <= 0) return;
    this.health -= amount;
    if (this.health < 0) this.health = 0;
    hud.setHealth(this.health, C.maxHealth);
    hud.flashDamage();
    this.shake(0.25);
    if (this.health <= 0) this.wasted();
  },

  // --- car ---
  tryEnterCar() {
    if (this.state !== 'playing') return;
    if (this.inCar) { this.exitCar(); return; }
    const car = vehicles.nearestCar(playerPos.x, playerPos.z, C.enterRadius);
    if (!car) return;
    // A traffic car that gets taken stops being traffic.
    const ti = vehicles.cars.indexOf(car);
    if (ti >= 0) vehicles.cars.splice(ti, 1);
    this.inCar = true;
    vehicles.playerCar = car;
    player.heading = car.heading;
    this.commitCrime(1); // taking a car is stealing, starter included
    audio.ensure();
  },

  exitCar(force) {
    if (!this.inCar) return;
    const car = vehicles.playerCar;
    this.inCar = false;
    vehicles.playerCar = null;
    if (car && !force) {
      playerPos.set(car.mesh.position.x + 2.2, 0, car.mesh.position.z + 0.5);
      player.heading = car.heading;
    }
    audio.setEngine(0);
  },

  // --- state changes ---
  startNewGame() {
    this.cash = 0;
    this.health = C.maxHealth;
    this.wanted = 0;
    this.hasGun = false;
    this.inCar = false;
    vehicles.playerCar = null;
    people.clearThugs();
    playerPos.set(C.garageSpawn.x, 0, C.garageSpawn.z);
    player.heading = 0;
    this.camYaw = 0;
    this.camDist = C.camDistDefault;
    this.camPitch = C.camPitchDefault;
    missions.init(0);
    hud.setHealth(this.health, C.maxHealth);
    hud.setMoney(this.cash);
    hud.setWanted(0);
    hud.showMenu(false);
    hud.showDeath(false);
    hud.showPause(false);
    this.state = 'playing';
    missions.start(this);
    this.faceObjective();
    this._snapCamera();
    audio.ensure();
    this.save();
    input.clear();
  },

  continueGame() {
    const s = this.loadSave();
    if (s) {
      this.cash = s.cash || 0;
      this.hasGun = !!s.hasGun;
      missions.init(typeof s.mission === 'number' ? s.mission : 0);
    } else {
      missions.init(0);
    }
    this.health = C.maxHealth;
    this.wanted = 0;
    this.inCar = false;
    vehicles.playerCar = null;
    people.clearThugs();
    playerPos.set(C.garageSpawn.x, 0, C.garageSpawn.z);
    player.heading = 0;
    this.camYaw = 0;
    hud.setHealth(this.health, C.maxHealth);
    hud.setMoney(this.cash);
    hud.setWanted(0);
    hud.showMenu(false);
    hud.showDeath(false);
    hud.showPause(false);
    this.state = 'playing';
    if (missions.index >= C.missions.length) {
      missions.active = null;
      hud.setMission('FREE ROAM', 'Neon Bay is yours. Drive, explore, stay out of trouble.', 0);
    } else {
      missions.start(this);
    }
    this.faceObjective();
    this._snapCamera();
    audio.ensure();
    input.clear();
  },

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    hud.showPause(true);
    input.clear();
  },

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    hud.showPause(false);
    input.clear();
  },

  quitToMenu() {
    this.state = 'menu';
    hud.showPause(false);
    hud.showDeath(false);
    hud.showMenu(true, !!this.loadSave());
    audio.setSiren(false);
    audio.setEngine(0);
    input.clear();
  },

  _die(title, text) {
    // Fine FIRST, then save (so a quit after death keeps the fine).
    this.cash = Math.max(0, this.cash - C.fine);
    hud.setMoney(this.cash);
    this.save();
    this.exitCar(true);
    this.state = title === 'BUSTED' ? 'busted' : 'wasted';
    hud.showDeath(true, title, text);
    hud.showPause(false);
    audio.setSiren(false);
    audio.setEngine(0);
    audio.busted();
    input.clear();
  },

  wasted() {
    this._die('WASTED', `Bay PD fined you $${C.fine}. Respawn at the hospital to keep playing.`);
  },

  busted() {
    this._die('BUSTED', `Bay PD caught you — fined $${C.fine}. Respawn at the hospital.`);
  },

  respawnAtHospital() {
    playerPos.set(C.hospital.x, 0, C.hospital.z);
    player.heading = 0;
    this.health = C.maxHealth;
    hud.setHealth(this.health, C.maxHealth);
    this.setWanted(0);
    people.clearThugs();
    hud.showDeath(false);
    hud.showPause(false);
    this.state = 'playing';
    if (missions.index < C.missions.length) missions.start(this);
    this.faceObjective();
    this._snapCamera();
    input.clear();
  },

  // --- save ---
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, mission: missions.index, hasGun: this.hasGun,
      }));
    } catch (e) {}
  },

  loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    } catch (e) { return null; }
  },

  toast(text, seconds) { hud.toast(text, seconds); },

  // --- on-foot movement ---
  _moveOnFoot(dt) {
    const vb = this._camYawSmooth; // the camera's actual view bearing
    const fwdX = Math.sin(vb), fwdZ = Math.cos(vb);
    const rightX = -Math.cos(vb), rightZ = Math.sin(vb);
    let mx = 0, mz = 0;
    if (input.isDown('KeyW') || input.isDown('w')) { mx += fwdX; mz += fwdZ; }
    if (input.isDown('KeyS') || input.isDown('s')) { mx -= fwdX; mz -= fwdZ; }
    if (input.isDown('KeyD') || input.isDown('d')) { mx += rightX; mz += rightZ; }
    if (input.isDown('KeyA') || input.isDown('a')) { mx -= rightX; mz -= rightZ; }
    const len = Math.hypot(mx, mz);
    if (len < 0.01) { this.playerSpeed = 0; audio.setEngine(0); return; }
    mx /= len; mz /= len;
    const sprint = input.isDown('Shift') || input.isDown('shift') || input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprint ? C.sprintSpeed : C.walkSpeed;
    this.playerSpeed = speed;
    // Face the movement direction, but absorb the turn into camYaw so the
    // camera itself never rotates just because the player turned (D3).
    const moveAngle = Math.atan2(mx, mz);
    const oldHeading = player.heading;
    player.heading = moveAngle;
    this.camYaw = wrapAngle(this.camYaw - wrapAngle(moveAngle - oldHeading));
    let nx = playerPos.x + mx * speed * dt;
    let nz = playerPos.z + mz * speed * dt;
    if (this.playerLunge > 0) {
      this.playerLunge -= dt;
      nx += mx * 2.5 * dt;
      nz += mz * 2.5 * dt;
    }
    let p = world.collideCircle(nx, nz, C.playerRadius);
    p = world.clampShore(p.x, p.z);
    if (p.z >= C.shoreZ - 0.5 && p.z < C.shoreZ && Math.abs(p.x) > C.pierCorridor.x0) {
      // Brushing the shore wall (not the pier): warn once in a while.
      if (!this._shoreToast || performance.now() - this._shoreToast > 8000) {
        this._shoreToast = performance.now();
        hud.toast("You can't swim — turn back!", 3);
      }
    }
    playerPos.set(p.x, 0, p.z);
  },

  // --- one tick ---
  tick(dt) {
    this.timeSinceCrime += dt;
    if (this.state === 'playing') {
      // Mouse look + zoom.
      if (input.dragDX !== 0) this.camYaw = wrapAngle(this.camYaw + input.dragDX * C.dragSensitivity);
      if (input.wheelDelta !== 0) {
        this.camDist = clamp(this.camDist + input.wheelDelta * 0.005, C.camDistMin, C.camDistMax);
      }
      // Keys.
      if (input.wasPressed('escape')) { this.pauseGame(); }
      else if (input.wasPressed('KeyM') || input.wasPressed('m')) { audio.setMuted(!audio.muted); }
      else if (input.wasPressed('KeyR') || input.wasPressed('r')) { missions.restart(this); }
      else if (input.wasPressed('KeyE') || input.wasPressed('e')) { this.tryEnterCar(); }
      else if (input.wasPressed('KeyF') || input.wasPressed('f')) { combat.punch(this); }
      if (input.clicked) combat.shoot(this);

      if (this.inCar) {
        this.playerSpeed = vehicles.playerCar ? Math.abs(vehicles.playerCar.speed) : 0;
      } else {
        this._moveOnFoot(dt);
      }
      vehicles.update(this, dt);
      people.update(this, dt);
      police.update(this, dt);
      combat.update(dt);
      missions.update(this, dt);
      world.update(this, dt);
      if (this.health <= 0 && this.state === 'playing') this.wasted();
    } else if (this.state === 'paused') {
      if (input.wasPressed('escape')) this.resumeGame();
    }
    // Camera, then HUD (the arrow reads this frame's camera).
    this.updateCamera(dt);
    hud.update(this, dt);
    // Player mesh follows the (possibly teleported) position.
    playerMesh.position.set(playerPos.x, 0, playerPos.z);
    playerMesh.rotation.y = player.heading;
    renderer.render(scene, camera);
    input.endTick();
  },
};

// --- debug hooks (the QA harness drives the game through these) ---
window.NBGame = game;
window.NB = {
  state() {
    return {
      state: game.state,
      mission: missions.index,
      pos: [playerPos.x, playerPos.z],
      inCar: game.inCar,
      wanted: game.wanted,
    };
  },
  teleport(x, z) {
    playerPos.set(x, 0, z);
    if (game.inCar && vehicles.playerCar) {
      vehicles.playerCar.mesh.position.x = x;
      vehicles.playerCar.mesh.position.z = z;
      vehicles.playerCar.speed = 0;
    }
  },
  mission(i) {
    // Same mission already active -> do not restart it (the guard the
    // pause-menu restart does not have).
    if (missions.index === i && missions.active) return;
    missions.init(i);
    missions.start(game);
  },
  setWanted(n) { game.setWanted(n); },
  giveGun() { game.giveGun(); },
};
window.NBWorld = world;
window.NBVehicles = vehicles;
window.NBPeople = people;
window.NBPolice = police;
window.NBMissions = missions;
window.NBHud = hud;
window.NB_CONFIG = C;

// --- menu buttons ---
function bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}
bind('btnStart', () => game.startNewGame());
bind('btnContinue', () => game.continueGame());
bind('btnResume', () => game.resumeGame());
bind('restartBtn', () => missions.restart(game));
bind('btnQuit', () => game.quitToMenu());
bind('btnRespawn', () => game.respawnAtHospital());
bind('btnHow', () => {
  const h = document.getElementById('howBox');
  if (h) h.style.display = h.style.display === 'block' ? 'none' : 'block';
});
bind('btnSound', () => {
  audio.ensure();
  audio.setMuted(!audio.muted);
  const b = document.getElementById('btnSound');
  if (b) b.textContent = audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
});
bind('btnSoundPause', () => {
  audio.ensure();
  audio.setMuted(!audio.muted);
});

// --- boot ---
hud.setMoney(0);
hud.setWanted(0);
hud.setHealth(C.maxHealth, C.maxHealth);
hud.showMenu(true, !!game.loadSave());
game.state = 'menu';
let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  game.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
