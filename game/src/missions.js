// Neon Bay — missions (v5 rebuild). Six chained jobs from Mara, then free
// roam. A job is a list of stages; a stage is a place to reach, a car to
// steal, heat to lose, or thugs to drop. Completing a job pays out, shows a
// banner, and auto-starts the next one after a short beat. The bank pickup
// sits OUTSIDE the bank (the v2 P0), and JOB 6 only counts when the player
// is home AND clean.

import { NB_CONFIG as C, dist2d } from './config.js';

const AUTO_NEXT_BEAT = 2.8; // seconds between "JOB COMPLETE" and the next intro

export function createMissions() {
  const missions = {
    index: 0,
    stage: 0,
    phase: null,
    active: null,
    timer: 0,
    pendingNext: null,
    _beatT: 0,
    _failed: false,

    def() {
      return C.missions[this.index] || null;
    },

    // Hard reset. init(0) resets to JOB 1; init() resets to the current index.
    init(n) {
      if (typeof n === 'number') this.index = n;
      this.stage = 0;
      this.active = null;
      this.timer = 0;
      this.pendingNext = null;
      this._beatT = 0;
      this._failed = false;
      const d = this.def();
      this.phase = d ? d.stages[0].phase : null;
    },

    start(game) {
      const d = this.def();
      if (!d) { this.active = null; this.phase = null; return; }
      this.active = d;
      this.stage = 0;
      this.phase = d.stages[0].phase;
      this.timer = d.timer || 0;
      this._failed = false;
      this.pendingNext = null;
      if (d.forceWanted) game.setWanted(d.forceWanted);
      if (d.giveGun) game.giveGun();
      if (d.thugs) game.people.spawnThugs(game);
      game.world.setObjective(d.stages[0].x ?? C.garage.x, d.stages[0].z ?? C.garage.z);
      game.hud.setMission(d.title, d.stages[0].text, this.timer);
      game.hud.toast(d.intro, 6);
      game.faceObjective();
    },

    restart(game) {
      // True restart: player back to the garage, stage 1, timer full, heat
      // cleared, intro replayed, camera re-facing the objective.
      game.exitCar(true);
      game.playerPos.set(C.garageSpawn.x, 0, C.garageSpawn.z);
      game.player.heading = 0;
      game.health = C.maxHealth;
      game.hud.setHealth(game.health, C.maxHealth);
      game.setWanted(0);
      game.people.clearThugs();
      this.start(game);
      game.hud.showBanner('JOB RESTARTED', this.active ? this.active.title : '');
      game.state = 'playing';
      game.hud.showPause(false);
    },

    completeStage(game) {
      const d = this.def();
      if (!d) return;
      const st = d.stages[this.stage];
      // JOB 6: grabbing the case trips the alarm and the heat.
      if (d.forceWantedAfterPickup && st.phase === 'toBank') {
        game.setWanted(d.forceWantedAfterPickup);
        game.hud.toast('ALARM! Bay PD is coming — RUN!', 5);
        game.audio.setSiren(true);
      }
      this.stage++;
      if (this.stage >= d.stages.length) {
        this._completeJob(game, d);
        return;
      }
      const nx = d.stages[this.stage];
      this.phase = nx.phase;
      if (nx.x !== undefined) game.world.setObjective(nx.x, nx.z);
      game.hud.setMission(d.title, nx.text, this.timer);
      if (nx.phase === 'toHome' && this.stage === 1 && d.stages[0].phase === 'toPier') {
        game.hud.toast('Package secured. Back to the garage.', 4);
      }
    },

    _completeJob(game, d) {
      game.cash += d.reward;
      game.audio.cash();
      game.audio.missionDone();
      game.save();
      game.hud.showBanner('JOB COMPLETE', `${d.title} — $${d.reward}`);
      game.hud.setMission(d.title, 'Job done. Next job incoming…', 0);
      this.active = null;
      this.phase = null;
      if (this.index >= C.missions.length - 1) {
        // All six done: legend status, then free roam.
        game.hud.showBanner('NEON BAY LEGEND', 'All six jobs done. The city is yours.');
        this.index = C.missions.length;
        this.pendingNext = null;
        game.world.setObjective(C.garage.x, C.garage.z);
        game.hud.setMission('FREE ROAM', 'Neon Bay is yours. Drive, explore, stay out of trouble.', 0);
        game.save();
        return;
      }
      this.pendingNext = this.index + 1;
      this._beatT = AUTO_NEXT_BEAT;
    },

    fail(game) {
      if (this._failed) return;
      this._failed = true;
      this.timer = 0;
      game.hud.showBanner('MISSION FAILED', 'Time ran out — press R to retry.');
      game.hud.setMission(this.active ? this.active.title : '', 'Mission failed. Press R to retry.', 0);
    },

    update(game, dt) {
      // Auto-advance beat after a completed job.
      if (this.pendingNext !== null && !this.active) {
        this._beatT -= dt;
        if (this._beatT <= 0) {
          this.index = this.pendingNext;
          this.pendingNext = null;
          this.start(game);
        }
        return;
      }
      if (!this.active) return;
      const d = this.def();
      if (!d) return;
      if (this.timer > 0 && !this._failed) {
        this.timer -= dt;
        if (this.timer <= 0) { this.timer = 0; this.fail(game); return; }
        game.hud.setMissionTimer(this.timer);
      }
      if (this._failed) return;
      const st = d.stages[this.stage];
      if (!st) return;
      const px = game.playerPos.x, pz = game.playerPos.z;
      if (st.phase === 'steal') {
        // Already in a car when JOB 3 starts? It counts at once.
        if (game.inCar) this.completeStage(game);
        return;
      }
      if (st.phase === 'loseheat') {
        if (game.wanted <= 0) this.completeStage(game);
        return;
      }
      if (st.phase === 'fight') {
        if (game.people.thugs.length === 0) this.completeStage(game);
        return;
      }
      if (st.x !== undefined) {
        const dd = dist2d(px, pz, st.x, st.z);
        if (dd <= st.r) {
          if (st.needCar && !game.inCar) return;
          if (st.needClean && game.wanted > 0) return;
          this.completeStage(game);
        }
      }
    },
  };
  return missions;
}
