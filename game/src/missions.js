// NEON BAY — mission chain: objectives, timers, rewards, story beats.
'use strict';
const NBMissions = {
  index: 0,            // next mission to start (0..6); 6 = all done (free roam)
  active: null,        // running mission state
  phase: 'toTarget',   // toTarget | toHome | survive | fight | done
  timer: 0,
  carrying: false,

  init() { this.index = 0; this.active = null; this.phase = 'toTarget'; this.timer = 0; this.carrying = false; clearTimeout(this._autoTimer); if (typeof NBWorld !== 'undefined' && NBWorld.beacon) NBWorld.setBeacon(0, 0, false); if (typeof NBPeople !== 'undefined') NBPeople.clearThugs(); },

  currentDef() { return NB_MISSIONS[this.index] || null; },
  isFinished() { return this.index >= NB_MISSIONS.length; },

  start(game) {
    const def = this.currentDef();
    if (!def) return;
    clearTimeout(this._autoTimer); // a manual start cancels any pending auto-start
    this.active = def;
    this.phase = def.stealCar ? 'steal' : 'toTarget';
    this.timer = def.timeLimit || 0;
    this.carrying = false;
    if (def.giveGun) { NBCombat.hasGun = true; game.toast('Pistol acquired — CLICK to shoot'); }
    if (def.forceWanted) game.setWanted(def.forceWanted);
    if (def.thugs) NBPeople.spawnThugs(NBWorld.scene, def.target.x, def.target.z, def.thugs);
    if (def.target) NBWorld.setBeacon(def.target.x, def.target.z, true);
    game.setMissionUI(def.title, def.desc, this.timer);
    game.toast(def.intro, 6);
    game.save();
  },

  fail(game, why) {
    if (!this.active) return;
    NBWorld.setBeacon(0, 0, false);
    NBPeople.clearThugs();
    this.active = null; this.carrying = false;
    game.setMissionUI('', '', 0);
    game.toast(why + ' — mission failed. Press R to retry.', 5);
    game.failStreak = (game.failStreak || 0) + 1;
  },

  complete(game) {
    const def = this.active;
    if (!def) return;
    game.cash += def.reward;
    NBAudio.cash(); NBAudio.missionDone();
    game.banner('JOB COMPLETE', `+$${def.reward}  —  ${def.title}`);
    NBWorld.setBeacon(0, 0, false);
    NBPeople.clearThugs();
    this.active = null; this.carrying = false;
    this.index++;
    game.setMissionUI('', '', 0);
    game.save();
    if (this.isFinished()) {
      setTimeout(() => {
        game.banner('NEON BAY LEGEND', 'All six jobs done. The city is yours — free roam!');
        game.toast('Free roam — keep the city, lose the cops, have fun.', 8);
      }, 2600);
    } else {
      // Auto-start the next job after a beat — but only if nothing else
      // started a mission meanwhile (stale timer guard).
      clearTimeout(this._autoTimer);
      this._autoTimer = setTimeout(() => {
        if (!this.active && !this.isFinished()) this.start(game);
      }, 2800);
    }
  },

  retry(game) {
    if (this.active) return; // already running
    if (this.isFinished()) return;
    game.setWanted(0);
    this.start(game);
  },

  // Distance helpers
  _distToTarget(game) {
    const def = this.active;
    if (!def || !def.target) return 1e9;
    const p = game.playerPos;
    return Math.hypot(p.x - def.target.x, p.z - def.target.z);
  },
  _distToHome(game) {
    const p = game.playerPos;
    return Math.hypot(p.x - NB_CONFIG.garage.x, p.z - NB_CONFIG.garage.z);
  },

  update(dt, game) {
    if (!this.active) return;
    const def = this.active;
    if (this.timer > 0) {
      this.timer -= dt;
      game.setMissionTimer(Math.max(0, this.timer));
      if (this.timer <= 0) { this.fail(game, "Time's up"); return; }
    }
    // Steal-a-car phase
    if (this.phase === 'steal') {
      if (game.stolenCar) {
        this.phase = 'toHome';
        NBWorld.setBeacon(NB_CONFIG.garage.x, NB_CONFIG.garage.z, true);
        game.setMissionUI(def.title, 'Stolen! Now bring it to Mara\'s garage.', this.timer);
        game.toast('Nice wheels. Get it to the garage.');
      }
      return;
    }
    // Lose-the-heat phase
    if (this.phase === 'survive' || def.forceWanted) {
      if (game.wanted === 0) {
        // require a moment of calm
        this._calm = (this._calm || 0) + dt;
        if (this._calm > 2) { this.complete(game); return; }
      } else this._calm = 0;
      return;
    }
    // Fight phase
    if (def.thugs) {
      if (NBPeople.thugs.length === 0 && this.phase !== 'done') {
        this.complete(game);
      }
      return;
    }
    // Go-to-target then return-home phases
    if (this.phase === 'toTarget') {
      if (this._distToTarget(game) < (def.target.r || 6)) {
        if (def.forceWantedAfterPickup) {
          this.carrying = true;
          this.phase = 'toHome';
          game.setWanted(def.forceWantedAfterPickup);
          NBWorld.setBeacon(NB_CONFIG.garage.x, NB_CONFIG.garage.z, true);
          game.setMissionUI(def.title, 'Got the case! Lose the cops and reach the garage.', this.timer);
          game.toast('ALARM! Bay PD is coming — RUN!', 5);
          NBAudio.siren(true);
        } else if (def.home) {
          this.carrying = true;
          this.phase = 'toHome';
          NBAudio.pickup();
          NBWorld.setBeacon(NB_CONFIG.garage.x, NB_CONFIG.garage.z, true);
          game.setMissionUI(def.title, 'Got it. Bring it back to Mara\'s garage.', this.timer);
          game.toast('Package secured. Back to the garage.');
        } else {
          this.complete(game);
        }
      }
      return;
    }
    if (this.phase === 'toHome') {
      if (this._distToHome(game) < 16) this.complete(game);
    }
  },

  // Called by the game when the player steals a car during mission 3.
  onCarStolen(game) {
    if (this.active && this.active.stealCar && this.phase === 'steal') {
      game.stolenCar = true;
    }
  },

  // Called by the game when a thug goes down (fight missions use thug count).
  onThugDown() {},
};
