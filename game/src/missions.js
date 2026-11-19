// Neon Bay — misi: 6 job berantai (Dex Marlowe untuk Mara Voss).
// phase adalah STRING nama tahap (toPier/pickup/toHome/steal/toBuyer/
// loseheat/fight/toBank/escape). Misi berikut mulai otomatis ~2,8 dtk
// setelah misi sebelumnya selesai. Sembuh penuh tiap awal misi.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var M = {
    index: 0,
    stageIdx: 0,
    stage: 'toPier',
    active: null,
    timer: 0,
    pendingNext: 0,
    stageHold: 0,
    failTimer: 0,
  };

  function def() { return C.missions[M.index] || null; }
  function stageDef() {
    var d = def();
    return d ? d.stages[M.stageIdx] : null;
  }

  function setStage(i) {
    M.stageIdx = i;
    var s = stageDef();
    M.stage = s ? s.name : '';
    M.stageHold = 0;
    var d = def();
    // Beacon mengikuti target tahap (disembunyikan bila tak ada lokasi).
    if (s && s.target) {
      window.NBWorld.setObjective(s.target.x, s.target.z);
    } else if (s && s.name === 'pickup' && d && d.stages[0].target) {
      // Tahap 'pickup' singkat: beacon tetap di target tahap sebelumnya.
    } else {
      window.NBWorld.setObjective(null);
    }
  }

  function start(game) {
    var d = def();
    if (!d) {
      // Semua job selesai: free roam.
      M.active = null;
      M.stage = '';
      M.timer = 0;
      window.NBWorld.setObjective(null);
      return;
    }
    M.active = d;
    M.stageIdx = 0;
    M.pendingNext = 0;
    M.failTimer = 0;
    M.timer = d.timer || 0;
    game.heal();
    setStage(0);
    var s = stageDef();
    // Tahap yang butuh mobil: bila pemain sudah di mobil, langsung lanjut.
    if (s && s.needCar && game.inCar) advance(game);
    if (M.index === 3) {
      // JOB 4: wanted dipaksa 2.
      game.setWanted(2);
    }
    if (M.index === 4) {
      // JOB 5: 3 preman muncul di dermaga.
      window.NBPeople.spawnThugs(C.pier.x, C.pier.z);
    }
    game.updateMissionBox();
  }

  // Reset keras (tanpa memulai): dipakai tes + tombol restart.
  function init(n) {
    M.index = (n === undefined || n === null) ? 0 : n;
    M.stageIdx = 0;
    M.stage = (C.missions[M.index] && C.missions[M.index].stages[0]) ? C.missions[M.index].stages[0].name : '';
    M.active = null;
    M.timer = 0;
    M.pendingNext = 0;
    M.stageHold = 0;
    M.failTimer = 0;
    window.NBPeople.clearThugs();
  }

  function advance(game) {
    var d = def();
    if (!d) return;
    M.stageIdx++;
    if (M.stageIdx >= d.stages.length) {
      complete(game);
      return;
    }
    setStage(M.stageIdx);
    var s = stageDef();
    if (s && s.needCar && game.inCar) advance(game);
    game.updateMissionBox();
  }

  function complete(game) {
    var d = def();
    if (!d) return;
    game.cash += d.reward;
    window.NBAudio.missionDone();
    window.NBAudio.cash();
    game.banner(d.title + ' COMPLETE', '+$' + d.reward);
    game.saveGame();
    M.active = null;
    M.timer = 0;
    if (M.index >= C.missions.length - 1) {
      // Job terakhir: free roam.
      M.index = C.missions.length;
      M.stage = '';
      window.NBWorld.setObjective(null);
      game.toast('ALL JOBS DONE — free roam. The bay is yours, Dex.', 6);
    } else {
      M.index++;
      M.pendingNext = 2.8;
      M.stage = '';
    }
    game.updateMissionBox();
  }

  function fail(game, reason) {
    var d = def();
    if (!d || M.failTimer > 0) return;
    M.failTimer = 2.5;
    game.banner('MISSION FAILED', reason);
    window.NBAudio.wasted();
  }

  function restart(game) {
    init(M.index);
    start(game);
  }

  function update(dt, game) {
    if (M.failTimer > 0) {
      M.failTimer -= dt;
      if (M.failTimer <= 0) restart(game);
      return;
    }
    if (M.pendingNext > 0) {
      M.pendingNext -= dt;
      if (M.pendingNext <= 0) {
        M.pendingNext = 0;
        start(game);
      }
      return;
    }
    if (!M.active) return;
    var d = def();
    var s = stageDef();
    if (!s) return;
    // Timer misi (JOB 2: 100 dtk, JOB 6: 240 dtk).
    if (M.timer > 0) {
      M.timer -= dt;
      if (M.timer <= 0) {
        M.timer = 0;
        fail(game, "Time's up — press R to retry");
        return;
      }
    }
    // Tahap 'pickup' singkat (JOB 1): tunggu 0,8 dtk lalu lanjut.
    if (s.name === 'pickup' && s.hold) {
      M.stageHold += dt;
      if (M.stageHold >= s.hold) advance(game);
      return;
    }
    if (s.needCar) {
      if (game.inCar) advance(game);
      return;
    }
    if (s.name === 'loseheat') {
      if (game.wanted <= 0) complete(game);
      return;
    }
    if (s.name === 'fight') {
      // Pistol didapat saat tiba di dermaga (bila belum punya).
      if (!game.hasGun) {
        var dp = Math.hypot(game.playerPos.x - C.pier.x, game.playerPos.z - C.pier.z);
        if (dp < 10) game.giveGun();
      }
      if (window.NBPeople.thugs.length === 0) complete(game);
      return;
    }
    if (s.target) {
      var dist = Math.hypot(game.playerPos.x - s.target.x, game.playerPos.z - s.target.z);
      if (s.name === 'escape') {
        if (dist <= s.radius && game.wanted <= 0) complete(game);
        return;
      }
      if (dist <= s.radius) {
        if (s.name === 'toPier' || s.name === 'toBank') window.NBAudio.pickup();
        advance(game);
      }
    }
  }

  window.NBMissions = {
    get index() { return M.index; },
    set index(v) { M.index = v; },
    get stage() { return M.stage; },
    get phase() { return M.stage; },
    get active() { return M.active; },
    get timer() { return M.timer; },
    get pendingNext() { return M.pendingNext; },
    init: init,
    start: start,
    restart: restart,
    complete: complete,
    update: update,
  };
})();
