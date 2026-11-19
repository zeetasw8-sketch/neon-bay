// Neon Bay — the game core.
// Wires every module together: the renderer, the player (Dex Marlowe),
// the orbit camera, the wanted system, saving, pause and death, and
// the debug hooks the test and screenshot tools use. The frame loop
// always renders (a build once forgot the render call and showed a
// black screen), the HUD is updated after the camera moves, and the
// delta is clamped so a slow frame can never explode the simulation.

import { THREE } from "./three-shim.js";
import { WORLD, PLAYER, CAR, WANTED, MISSIONS, SAVE_KEY, SHOT_LABELS } from "./config.js";
import { Input } from "./input.js";
import { AudioSys } from "./audio.js";
import { buildWorld } from "./world.js";
import {
  allCars,
  createVehicles,
  updateTraffic,
  drivePlayerCar,
  nearestCar,
} from "./vehicles.js";
import { pedestrians, createPeople, updatePeople, placePedestrian } from "./people.js";
import { policeCars, updatePolice, clearPolice, placePolice, syncPolice } from "./police.js";
import { makeCombat, tryPunch, tryShoot, updateTracer, updateThugs, applyDamage, wasted } from "./combat.js";
import {
  startMission,
  restartMission,
  updateMissions,
  updateMissionTarget,
  currentTarget,
  spawnThugs,
  placeThugs,
} from "./missions.js";
import { Hud } from "./hud.js";

function makePlayerMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x0f766e });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.36), jacket);
  torso.position.y = 1.02;
  torso.castShadow = true;
  group.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), pants);
  legs.position.y = 0.32;
  group.add(legs);
  return group;
}

function clampAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

class Game {
  constructor() {
    this.status = "menu";
    this.elapsed = 0;
    this.money = 0;
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    this.hasPistol = false;
    this.missionIndex = 0;
    this.mission = null;
    this.missionStage = 0;
    this.missionTimer = 0;
    this.missionFailed = false;
    this.targetPos = null;
    this.thugs = [];
    this.inCar = false;
    this.playerCar = null;
    this.playerSpeed = 0;
    this.punchCooldown = 0;
    this.shootCooldown = 0;
    this.crimeTimer = 0;
    this.shake = 0;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 11;
    this.camYawS = this.camYaw;
    this.camPitchS = this.camPitch;
    this.damageFlash = 0;

    const canvas = document.getElementById("game-canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(0, 40, 80);

    this.input = new Input();
    this.input.attach(canvas);
    this.audio = new AudioSys();
    this.hud = new Hud(document);
    this.world = buildWorld(this.scene);
    this.combat = makeCombat(this.scene);
    createVehicles(this.scene);
    createPeople(this.scene);
    this.allCars = allCars;
    this.policeCars = policeCars;
    this.crowd = pedestrians;

    // Dex Marlowe, teal jacket, spawns at the garage.
    this.player = {
      mesh: makePlayerMesh(),
      x: WORLD.garage.x,
      z: WORLD.garage.z + 14,
      heading: Math.PI,
    };
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.scene.add(this.player.mesh);

    this.flashEl = document.getElementById("damage-flash");
    this.bindMenu();
    this.faceObjective();
    this.exposeDebug();

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      this.elapsed += dt;
      if (this.status === "playing") this.update(dt);
      else if (this.status === "menu") this.updateMenuCamera(dt);
      else if (this.status === "paused") {
        // update() is skipped while paused, so the resume key has to
        // be handled here — otherwise P can pause but never unpause.
        if (this.input.tapped("Escape") || this.input.tapped("KeyP")) {
          this.resume();
        }
        this.input.endFrame();
      }
      // The render call lives here and runs every frame, whatever the
      // state — a build once forgot it and shipped a black screen.
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  // --- Menu, pause, death --------------------------------------------
  bindMenu() {
    const $ = (id) => document.getElementById(id);
    $("btn-start").addEventListener("click", () => {
      this.audio.start();
      this.newGame();
    });
    $("btn-continue").addEventListener("click", () => {
      this.audio.start();
      this.continueGame();
    });
    $("btn-howto").addEventListener("click", () => $("howto").classList.add("show"));
    $("btn-howto-close").addEventListener("click", () => $("howto").classList.remove("show"));
    $("btn-resume").addEventListener("click", () => this.resume());
    $("btn-restart").addEventListener("click", () => {
      restartMission(this);
      this.resume();
    });
    $("btn-mute").addEventListener("click", () => {
      this.audio.setMuted(!this.audio.muted);
      $("btn-mute").textContent = this.audio.muted ? "UNMUTE" : "MUTE";
    });
    $("btn-quit").addEventListener("click", () => this.toMenu());
    $("btn-wasted").addEventListener("click", () => this.respawn());
    $("btn-busted").addEventListener("click", () => this.respawn());
    $("btn-pause-howto").addEventListener("click", () => $("howto").classList.add("show"));
    const save = this.readSave();
    $("btn-continue").style.display = save ? "block" : "none";
  }

  show(id) {
    document.getElementById(id).classList.add("show");
  }

  hide(id) {
    document.getElementById(id).classList.remove("show");
  }

  toMenu() {
    this.status = "menu";
    this.hide("pause-menu");
    this.hide("wasted-screen");
    this.hide("busted-screen");
    this.show("menu");
    this.input.clear();
  }

  newGame() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
    this.money = 0;
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    this.hasPistol = false;
    this.missionIndex = 0;
    this.thugs = [];
    this.exitCar(true);
    this.player.x = WORLD.garage.x;
    this.player.z = WORLD.garage.z + 14;
    this.player.heading = Math.PI;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.hide("menu");
    this.status = "playing";
    this.input.clear();
    startMission(this, 0);
    this.faceObjective();
    this.saveGame();
  }

  continueGame() {
    const save = this.readSave();
    if (save) {
      this.money = save.money || 0;
      this.missionIndex = Math.min(save.missionIndex || 0, MISSIONS.length - 1);
      this.hasPistol = !!save.hasPistol;
    } else {
      this.money = 0;
      this.missionIndex = 0;
    }
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    this.thugs = [];
    this.exitCar(true);
    this.player.x = WORLD.garage.x;
    this.player.z = WORLD.garage.z + 14;
    this.player.heading = Math.PI;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.hide("menu");
    this.status = "playing";
    this.input.clear();
    startMission(this, this.missionIndex);
    this.faceObjective();
  }

  pause() {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.show("pause-menu");
    this.input.clear();
  }

  resume() {
    if (this.status !== "paused") return;
    this.hide("pause-menu");
    this.hide("howto");
    this.status = "playing";
    // Wipe the input queue so a stale Escape cannot re-pause instantly.
    this.input.clear();
  }

  // Respawn after WASTED or BUSTED: hospital, full health, the death
  // screen and the pause menu both closed, input wiped.
  respawn() {
    this.hide("wasted-screen");
    this.hide("busted-screen");
    this.hide("pause-menu");
    this.exitCar(true);
    this.player.x = WORLD.hospital.x;
    this.player.z = WORLD.hospital.z + 14;
    this.player.heading = 0;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.health = PLAYER.maxHealth;
    this.wanted = 0;
    clearPolice(this, this.scene);
    this.status = "playing";
    this.input.clear();
    this.faceObjective();
    this.saveGame();
  }

  showWasted(fine) {
    document.getElementById("wasted-fine").textContent = `Fine paid: $${fine}`;
    this.show("wasted-screen");
  }

  showBusted(fine) {
    document.getElementById("busted-fine").textContent = `Fine paid: $${fine}`;
    this.show("busted-screen");
  }

  // --- Wanted, damage, arrest -----------------------------------------
  raiseWanted(n) {
    this.wanted = Math.min(WANTED.max, this.wanted + n);
    this.crimeTimer = WANTED.decaySeconds;
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(WANTED.max, n));
    this.crimeTimer = WANTED.decaySeconds;
  }

  damagePlayer(amount, source) {
    applyDamage(this, amount, source);
  }

  flashDamage(strength) {
    this.damageFlash = Math.max(this.damageFlash, strength);
    this.shake = Math.max(this.shake, 0.35);
  }

  busted() {
    if (this.status !== "playing") return;
    // Fine FIRST, then save — the arrest must cost money.
    const fine = Math.min(WANTED.fine, this.money);
    this.money -= fine;
    this.wanted = 0;
    clearPolice(this, this.scene);
    this.saveGame();
    this.status = "busted";
    this.audio.busted();
    this.input.clear();
    this.showBusted(fine);
  }

  // --- Save ------------------------------------------------------------
  saveGame() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          money: this.money,
          missionIndex: this.missionIndex,
          hasPistol: this.hasPistol,
        }),
      );
    } catch (e) {}
  }

  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // --- Cars ------------------------------------------------------------
  enterCar(car) {
    if (this.inCar) return;
    if (!car.owned) this.raiseWanted(1);
    this.inCar = true;
    this.playerCar = car;
    car.parked = false;
    this.player.mesh.visible = false;
    this.camDist = 13;
    this.showToast(car.owned ? "Your car" : "Car stolen — 1★ wanted");
  }

  exitCar(silent) {
    if (!this.inCar || !this.playerCar) {
      this.inCar = false;
      this.playerCar = null;
      this.player.mesh.visible = true;
      return;
    }
    const car = this.playerCar;
    // Step out to the car's left side.
    const side = car.heading + Math.PI / 2;
    this.player.x = car.x + Math.sin(side) * 2.2;
    this.player.z = car.z + Math.cos(side) * 2.2;
    this.player.heading = car.heading;
    this.player.mesh.position.set(this.player.x, 0, this.player.z);
    this.player.mesh.visible = true;
    this.inCar = false;
    this.playerCar = null;
    this.camDist = 11;
    if (!silent) this.showToast("On foot");
  }

  // --- Camera ----------------------------------------------------------
  faceObjective() {
    const t = this.targetPos || currentTarget(this);
    const dx = t.x - this.player.x;
    const dz = t.z - this.player.z;
    this.camYaw = Math.atan2(dx, dz);
    this.camYawS = this.camYaw;
    this.camPitch = 0.32;
    this.camPitchS = 0.32;
  }

  updateCamera(dt) {
    // Mouse drag orbits; the wheel zooms. Yaw is damped along the arc
    // (the difference is wrapped first), so turning never spirals.
    this.camYaw -= this.input.dragDX * 0.0042;
    this.camPitch += this.input.dragDY * 0.0028;
    this.camPitch = Math.max(0.08, Math.min(1.0, this.camPitch));
    this.camDist = Math.max(7, Math.min(17, this.camDist + this.input.wheel * 0.9));
    const k = Math.min(1, dt * 10);
    this.camYawS += clampAngle(this.camYaw - this.camYawS) * k;
    this.camPitchS += (this.camPitch - this.camPitchS) * k;
    const eye = new THREE.Vector3(
      this.player.x - Math.sin(this.camYawS) * Math.cos(this.camPitchS) * this.camDist,
      1.6 + Math.sin(this.camPitchS) * this.camDist,
      this.player.z - Math.cos(this.camYawS) * Math.cos(this.camPitchS) * this.camDist,
    );
    // Keep the camera out of buildings.
    if (this.world.collides(eye.x, eye.z, 1)) {
      eye.x = this.player.x - Math.sin(this.camYawS) * 4;
      eye.z = this.player.z - Math.cos(this.camYawS) * 4;
      eye.y = 3.2;
    }
    if (this.shake > 0) {
      eye.x += (Math.random() - 0.5) * this.shake;
      eye.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.4);
    }
    this.camera.position.copy(eye);
    this.camera.lookAt(this.player.x, 1.6, this.player.z);
  }

  updateMenuCamera(dt) {
    // A slow cinematic orbit over the city behind the title screen.
    this.camYaw += dt * 0.045;
    const r = 150;
    this.camera.position.set(
      Math.sin(this.camYaw) * r,
      85,
      Math.cos(this.camYaw) * r,
    );
    this.camera.lookAt(0, 0, 0);
  }

  showToast(text) {
    this.hud.showToast(text);
  }

  // --- Per-frame update -------------------------------------------------
  update(dt) {
    const input = this.input;
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    // Health can reach zero without a damage event (a debug set, a
    // future effect) — the death must still fire.
    if (this.health <= 0) {
      wasted(this);
      input.endFrame();
      return;
    }
    // Pause, mute, retry.
    if (input.tapped("Escape") || input.tapped("KeyP")) {
      this.pause();
      input.endFrame();
      return;
    }
    if (input.tapped("KeyM")) {
      this.audio.setMuted(!this.audio.muted);
    }
    if (input.tapped("KeyR")) {
      restartMission(this);
      input.endFrame();
      return;
    }

    // Enter / exit the car.
    if (input.tapped("KeyE")) {
      if (this.inCar) {
        this.exitCar(false);
      } else {
        const near = nearestCar(this, 8);
        if (near) this.enterCar(near.car);
      }
    }
    // Punch and shoot.
    if (input.tapped("KeyF")) tryPunch(this);
    if (input.clicked) tryShoot(this, this.combat);

    // Move.
    if (this.inCar && this.playerCar) {
      const speed = drivePlayerCar(this, dt, input);
      this.player.x = this.playerCar.x;
      this.player.z = this.playerCar.z;
      this.player.heading = this.playerCar.heading;
      this.playerSpeed = Math.abs(speed);
      this.player.mesh.position.set(this.player.x, 0, this.player.z);
      this.checkPedestrianHit();
    } else {
      this.moveOnFoot(dt, input);
    }

    updateTraffic(this, dt);
    updatePeople(this, dt);
    updatePolice(this, dt, this.scene);
    updateThugs(this, dt);
    updateTracer(this.combat, dt);
    updateMissions(this, dt);
    updateMissionTarget(this);

    // Wanted fades one star per quiet stretch without a fresh crime.
    if (this.crimeTimer > 0) {
      this.crimeTimer -= dt;
    } else if (this.wanted > 0) {
      this.wanted -= 1;
      this.crimeTimer = WANTED.decaySeconds;
    }

    // Camera first, then the HUD (the arrow reads the fresh camera).
    this.updateCamera(dt);
    this.world.updateBeacon(this.camera.position);
    this.world.followSun(this.player.x, this.player.z);
    this.hud.update(this, dt);

    // Sound follows the game.
    this.audio.engine(
      this.inCar && this.playerCar ? Math.abs(this.playerCar.speed) / CAR.maxSpeed : 0,
      this.inCar,
    );
    this.audio.siren(this.wanted, dt);
    this.audio.bass(dt);

    // Damage flash overlay.
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
      this.flashEl.style.opacity = String(this.damageFlash * 0.55);
    } else {
      this.flashEl.style.opacity = "0";
    }

    // Interaction prompt: the nearest car, with its distance.
    if (!this.inCar && this.status === "playing") {
      const near = nearestCar(this, 8);
      if (near) {
        this.hud.promptEl.textContent = `Press E to enter — ${near.dist.toFixed(1)} m`;
        this.hud.promptEl.style.display = "block";
      } else {
        this.hud.promptEl.style.display = "none";
      }
    } else if (this.inCar) {
      this.hud.promptEl.textContent = "Press E to exit the car";
      this.hud.promptEl.style.display = "block";
    } else {
      this.hud.promptEl.style.display = "none";
    }

    input.endFrame();
  }

  moveOnFoot(dt, input) {
    const fwdX = Math.sin(this.camYawS);
    const fwdZ = Math.cos(this.camYawS);
    const rightX = Math.cos(this.camYawS);
    const rightZ = -Math.sin(this.camYawS);
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += fwdX; mz += fwdZ; }
    if (input.back) { mx -= fwdX; mz -= fwdZ; }
    if (input.right) { mx += rightX; mz += rightZ; }
    if (input.left) { mx -= rightX; mz -= rightZ; }
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0.01) {
      mx /= len;
      mz /= len;
      const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      let nx = this.player.x + mx * speed * dt;
      let nz = this.player.z + mz * speed * dt;
      if (!this.world.collides(nx, this.player.z, PLAYER.radius)) this.player.x = nx;
      if (!this.world.collides(this.player.x, nz, PLAYER.radius)) this.player.z = nz;
      const p = { x: this.player.x, z: this.player.z };
      const shore = this.world.clampPlayable(p, PLAYER.radius);
      if (shore === "shore") this.showToast("No swimming — the sea is out of bounds");
      this.player.x = p.x;
      this.player.z = p.z;
      this.player.heading = Math.atan2(mx, mz);
      this.playerSpeed = speed;
      // A walking bob.
      this.player.mesh.position.y = Math.abs(Math.sin(this.elapsed * 10)) * 0.06;
    } else {
      this.playerSpeed = 0;
      this.player.mesh.position.y = 0;
    }
    this.player.mesh.position.set(this.player.x, this.player.mesh.position.y, this.player.z);
    this.player.mesh.rotation.y = this.player.heading;
  }

  checkPedestrianHit() {
    if (!this.inCar || !this.playerCar) return;
    const speed = Math.abs(this.playerCar.speed);
    if (speed < 3) return;
    for (const ped of this.crowd) {
      const dx = ped.x - this.player.x;
      const dz = ped.z - this.player.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.9 && (ped.hitTimer || 0) <= 0) {
        ped.hitTimer = 5;
        ped.fleeing = true;
        this.raiseWanted(1);
        this.flashDamage(0.3);
        this.showToast("Pedestrian hit — 1★ wanted");
      }
    }
    for (const ped of this.crowd) {
      if (ped.hitTimer > 0) ped.hitTimer -= 1 / 60;
    }
  }

  // --- Debug hooks (tests and screenshots only) ------------------------
  exposeDebug() {
    const self = this;
    window.NBGame = {
      state() {
        return {
          status: self.status,
          money: self.money,
          wanted: self.wanted,
          health: Math.round(self.health),
          missionIndex: self.missionIndex,
          missionStage: self.missionStage,
          missionTimer: Math.round(self.missionTimer * 10) / 10,
          missionFailed: self.missionFailed,
          inCar: self.inCar,
          hasPistol: self.hasPistol,
          x: Math.round(self.player.x * 10) / 10,
          z: Math.round(self.player.z * 10) / 10,
          heading: Math.round(self.player.heading * 100) / 100,
          speed: Math.round(self.playerSpeed * 10) / 10,
          thugsAlive: self.thugs.filter((t) => t.hp > 0).length,
          target: self.targetPos,
          camYaw: Math.round(self.camYaw * 100) / 100,
          elapsed: Math.round(self.elapsed * 10) / 10,
          punchCd: Math.round(self.punchCooldown * 100) / 100,
          shootCd: Math.round(self.shootCooldown * 100) / 100,
        };
      },
      newGame() {
        self.newGame();
      },
      startMission(i) {
        startMission(self, i);
      },
      teleport(x, z) {
        // Keep the player in the car (and move the car too) so a
        // teleport can stage a driving scene instead of ejecting.
        self.player.x = x;
        self.player.z = z;
        self.player.mesh.position.set(x, 0, z);
        if (self.playerCar) {
          self.playerCar.x = x;
          self.playerCar.z = z;
          self.playerCar.mesh.position.set(x, 0, z);
          self.playerCar.speed = 0;
        }
      },
      setWanted(n) {
        self.setWanted(n);
      },
      givePistol() {
        self.hasPistol = true;
      },
      setMoney(n) {
        self.money = n;
      },
      setHealth(n) {
        self.health = n;
      },
      setCamera(yaw, pitch, dist) {
        if (yaw !== undefined) {
          self.camYaw = yaw;
          self.camYawS = yaw;
        }
        if (pitch !== undefined) {
          self.camPitch = pitch;
          self.camPitchS = pitch;
        }
        if (dist !== undefined) self.camDist = dist;
      },
      setCarSpeed(mph) {
        if (self.playerCar) self.playerCar.speed = mph / 2.237;
      },
      setCarHeading(h) {
        if (self.playerCar) {
          self.playerCar.heading = h;
          self.playerCar.mesh.rotation.y = h;
          self.player.heading = h;
        }
      },
      setPlayerHeading(h) {
        self.player.heading = h;
        self.player.mesh.rotation.y = h;
      },
      placePolice(spots) {
        placePolice(self, self.scene, spots);
      },
      placeThugs(spots) {
        placeThugs(self, spots);
      },
      thugs() {
        return self.thugs.map((t) => ({ x: t.x, z: t.z, hp: t.hp }));
      },
      placePedestrians(spots) {
        spots.forEach((s, i) => placePedestrian(i, s.x, s.z, s.heading || 0));
      },
      placeTraffic(spots) {
        const traffic = self.allCars.filter((c) => c.kind === "traffic");
        spots.forEach((s, i) => {
          const car = traffic[i];
          if (!car) return;
          car.x = s.x;
          car.z = s.z;
          car.heading = s.heading ?? 0;
          car.speed = s.speed ?? 0;
          car.mesh.position.set(car.x, 0, car.z);
          car.mesh.rotation.y = car.heading;
        });
      },
      clearTraffic() {
        for (const car of self.allCars) {
          if (car.kind === "traffic") {
            car.speed = 0;
            car.mesh.visible = false;
          }
        }
      },
      showTraffic() {
        for (const car of self.allCars) {
          if (car.kind === "traffic") car.mesh.visible = true;
        }
      },
      showToast(text) {
        self.showToast(text);
      },
      showBanner(text) {
        self.hud.showBanner(text);
      },
      setMissionTimer(s) {
        self.missionTimer = s;
      },
      arrowDegrees() {
        if (!self.targetPos) return 0;
        return self.hud.updateArrow(self.camera, self.targetPos, self.player);
      },
    };
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new Game();
});
