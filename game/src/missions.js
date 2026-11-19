// Neon Bay — the six jobs. Mara Voss hands Dex one job at a time; each
// pays on completion and the next starts straight away. Every job is a
// small state machine: a stage, an objective point (the gold beacon), an
// optional timer, and a completion rule. The HUD reads game.mission, so
// Mara's line and the dollar reward are always visible on screen.
// The module also exposes its live state (index, active, timer, phase)
// for the HUD and the test harness.

// startMission begins job `index` (0-based): sets the stage, the timer,
// the forced wanted level, the pistol, the thugs, the beacon and Mara's
// intro line. A car already occupied at the start of job 3 counts.
function startMission(index, game) {
  var def = missionById(index);
  if (!def) { game.mission = null; setLive(null); return; }
  game.missionIndex = index;
  var stage = def.pickup ? 'pickup' : (index === 2 ? 'steal' : (index === 3 ? 'escape' : (index === 4 ? 'fight' : 'pickup')));
  game.mission = {
    index: index, def: def, title: def.title,
    stage: stage,
    timer: def.timer || 0,
    text: def.start
  };
  if (def.forceWanted) NBPolice.setWanted(game, def.forceWanted);
  if (index === 4) {
    game.hasGun = true;
    NBPeople.clearThugs(game.scene);
    def.thugs.forEach(function (p) {
      NBPeople.spawnThug(game.scene, p.x, p.z);
    });
    game.thugs = NBPeople.thugs;
  }
  if (index === 2 && game.playerCar) game.mission.stage = 'drop';
  game.showToast(def.intro, 6);
  moveMissionBeacon(game);
  setLive(game.mission);
}

// setLive mirrors the mission into the module's live properties.
function setLive(mission) {
  if (!mission) {
    liveIndex = -1; liveActive = null; liveTimer = 0; livePhase = null;
    return;
  }
  liveIndex = mission.index;
  liveActive = mission;
  liveTimer = mission.timer;
  livePhase = phaseOf(mission.stage);
}

// phaseOf maps a mission stage to the phase name the HUD and the
// harness read: toPickup (going to the pickup), toHome (going back),
// or the stage name itself (steal / escape / fight).
function phaseOf(stage) {
  if (stage === 'pickup') return 'toPickup';
  if (stage === 'drop') return 'toHome';
  return stage;
}

// init resets the mission chain to the beginning (no active job).
function init() {
  liveIndex = 0; liveActive = null; liveTimer = 0; livePhase = null;
}

// start begins the job at the module's current index.
function start(game) {
  startMission(liveIndex, game);
}

// moveMissionBeacon points the gold beam at the current objective:
// the pickup, the drop, the docks, or the nearest car (job 3). During
// job 4's escape there is no place to go, so the beam hides.
function moveMissionBeacon(game) {
  var m = game.mission;
  if (!m) { setBeaconVisible(game, false); return; }
  var def = m.def;
  if (m.stage === 'pickup' && def.pickup) {
    NBWorld.moveBeacon(game.world, def.pickup.x, def.pickup.z);
    setBeaconVisible(game, true);
  } else if (m.stage === 'drop' && def.drop) {
    NBWorld.moveBeacon(game.world, def.drop.x, def.drop.z);
    setBeaconVisible(game, true);
  } else if (m.stage === 'fight' && def.target) {
    NBWorld.moveBeacon(game.world, def.target.x, def.target.z);
    setBeaconVisible(game, true);
  } else if (m.stage === 'steal') {
    var car = NBVehicles.nearestCar(game.cars, game.player.x, game.player.z, 500);
    if (car) {
      NBWorld.moveBeacon(game.world, car.x, car.z);
      setBeaconVisible(game, true);
    } else setBeaconVisible(game, false);
  } else {
    setBeaconVisible(game, false);
  }
}

// setBeaconVisible shows or hides the gold beam and its base disc.
function setBeaconVisible(game, show) {
  game.world.beacon.visible = show;
  game.world.beaconBase.visible = show;
  game.beaconVisible = show;
}

// missionTarget returns the current objective point { x, z } for the
// HUD arrow and minimap (null when there is none). During job 4's
// escape the beam hides (no place to go yet), but the arrow still
// points home — the garage is where the job ends after the heat dies.
function missionTarget(game) {
  var m = game.mission;
  if (!m) return null;
  if (m.stage === 'escape' && m.def.drop) return { x: m.def.drop.x, z: m.def.drop.z };
  if (!game.beaconVisible) return null;
  return { x: game.world.beacon.position.x, z: game.world.beacon.position.z };
}

// updateMissions advances the current job: the timer, the stage checks
// (pickup / steal / escape / fight / drop) and the retry countdown after
// a failure. Returns 'complete', 'failed' or 'ok'.
function updateMissions(game, dt) {
  if (game.retryIn > 0) {
    game.retryIn -= dt;
    if (game.retryIn <= 0 && !game.mission) startMission(game.missionIndex, game);
    return 'ok';
  }
  var m = game.mission;
  if (!m) return 'ok';
  if (m.timer > 0) {
    m.timer -= dt;
    liveTimer = m.timer;
    if (m.timer <= 0) {
      failMission(game, 'TIME UP');
      return 'failed';
    }
  }
  var p = game.player;
  if (m.stage === 'pickup' && m.def.pickup) {
    if (nearPoint(p, m.def.pickup)) {
      onPickup(game);
      return 'ok';
    }
  }
  if (m.stage === 'steal') {
    if (game.playerCar) {
      m.stage = 'drop';
      m.text = m.def.complete;
      livePhase = 'toHome';
      moveMissionBeacon(game);
    }
    return 'ok';
  }
  if (m.stage === 'escape') {
    if (game.wanted === 0) {
      m.stage = 'drop';
      m.text = m.def.complete;
      livePhase = 'toHome';
      moveMissionBeacon(game);
    }
    return 'ok';
  }
  if (m.stage === 'fight') {
    if (game.thugs.length === 0) {
      m.stage = 'drop';
      m.text = m.def.complete;
      livePhase = 'toHome';
      moveMissionBeacon(game);
    }
    return 'ok';
  }
  if (m.stage === 'drop' && m.def.drop) {
    if (nearPoint(p, m.def.drop)) {
      if (m.index === 5 && game.wanted > 0) return 'ok'; // job 6: home CLEAN
      completeMission(game);
      return 'complete';
    }
  }
  return 'ok';
}

// onPickup handles collecting a package or the bank case: advances the
// stage, and for job 6 trips the alarm (3 stars) as the case is grabbed.
function onPickup(game) {
  var m = game.mission;
  m.stage = 'drop';
  m.text = m.def.complete;
  livePhase = 'toHome';
  if (m.index === 5) {
    NBPolice.setWanted(game, 3);
    game.showToast('ALARM! 3★ WANTED — get home CLEAN', 4);
  }
  moveMissionBeacon(game);
}

// nearPoint reports whether the player is inside a pickup/drop radius.
// The radius is generous (job 6's bank pickup is 8 m, in front of the
// entrance, so it works on foot and in a car).
function nearPoint(player, point) {
  var dx = player.x - point.x, dz = player.z - point.z;
  return dx * dx + dz * dz < point.r * point.r;
}

// completeMission pays the job, plays the payout sounds, saves, and
// starts the next job (or free roam after the last one).
function completeMission(game) {
  var m = game.mission;
  var reward = m.def.reward;
  game.cash += reward;
  game.jobsDone++;
  NBAudio.playCash();
  NBAudio.playMission();
  game.showToast('JOB COMPLETE  +$' + reward, 3);
  game.mission = null;
  setBeaconVisible(game, false);
  var next = m.index + 1;
  game.missionIndex = next; // the save records the NEXT job, not the one done
  game.saveGame();
  if (next < NBConfig.missions.length) startMission(next, game);
  else {
    setLive(null);
    game.showToast('ALL JOBS DONE — Neon Bay is yours. Free roam!', 6);
  }
}

// failMission ends a job on a blown timer: the heat clears, the job
// restarts after 3 seconds so the player can try again.
function failMission(game, reason) {
  var idx = game.missionIndex;
  game.mission = null;
  setBeaconVisible(game, false);
  NBPolice.setWanted(game, 0);
  game.showToast('MISSION FAILED — ' + reason + '. Try again.', 3);
  game.retryIn = 3;
  game.missionIndex = idx;
  setLive(null);
}

// abortMission drops the current job (used when the player is WASTED or
// BUSTED mid-job): the same job restarts from the beginning. After the
// last job there is nothing to restart — it is free roam.
function abortMission(game) {
  var idx = game.missionIndex;
  game.mission = null;
  setBeaconVisible(game, false);
  if (idx >= NBConfig.missions.length) { game.retryIn = 0; setLive(null); return; }
  game.retryIn = 2;
  game.missionIndex = idx;
  setLive(null);
}

var liveIndex = 0, liveActive = null, liveTimer = 0, livePhase = null;

window.NBMissions = {
  startMission: startMission,
  updateMissions: updateMissions,
  completeMission: completeMission,
  failMission: failMission,
  abortMission: abortMission,
  moveMissionBeacon: moveMissionBeacon,
  missionTarget: missionTarget,
  nearPoint: nearPoint,
  init: init,
  start: start,
  index: liveIndex,
  active: liveActive,
  timer: liveTimer,
  phase: livePhase
};

// The live properties are accessors over the module variables, so a
// read always sees the current job (and the harness can set the index).
Object.defineProperty(window.NBMissions, 'index', {
  get: function () { return liveIndex; },
  set: function (v) { liveIndex = v; }
});
Object.defineProperty(window.NBMissions, 'active', {
  get: function () { return liveActive; }
});
Object.defineProperty(window.NBMissions, 'timer', {
  get: function () { return liveTimer; },
  set: function (v) { liveTimer = v; }
});
Object.defineProperty(window.NBMissions, 'phase', {
  get: function () { return livePhase; }
});
