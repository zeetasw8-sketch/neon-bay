// Neon Bay — the HUD: objective arrow, minimap, mission box, stats,
// toasts and the menu / pause / death / busted screens. All DOM. The
// HUD is updated AFTER the camera moves each frame, so the arrow reads
// the camera's actual forward direction, never a stale smoothed yaw.

// updateObjectiveArrow points the ⬆ glyph at the objective. Bearing is
// atan2(dx, dz) in degrees; rel is the objective bearing minus the view
// bearing, normalised to [-180, +180]; the CSS rotation is -rel. The
// glyph is U+2B06 (a shafted arrow) — a bare ▲ reads as ◀/▶ at 43°.
// The view direction is the actual camera forward (player minus camera
// position), a pure function of the current frame: no smoothing state.
function updateObjectiveArrow(game) {
  var el = document.getElementById('objArrow');
  var distEl = document.getElementById('objDist');
  if (!el) return;
  var target = NBMissions.missionTarget(game);
  if (!target) { el.style.display = 'none'; if (distEl) distEl.style.display = 'none'; return; }
  el.style.display = 'inline-block';
  if (distEl) distEl.style.display = 'inline-block';
  var cam = game.camera;
  var cdx = game.player.x - cam.position.x;
  var cdz = game.player.z - cam.position.z;
  var viewBearing = Math.atan2(cdx, cdz) * 180 / Math.PI;
  var odx = target.x - game.player.x;
  var odz = target.z - game.player.z;
  var objBearing = Math.atan2(odx, odz) * 180 / Math.PI;
  var rel = objBearing - viewBearing;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;
  el.style.transform = 'rotate(' + (-rel) + 'deg)';
  if (distEl) {
    var d = Math.sqrt(odx * odx + odz * odz);
    distEl.textContent = Math.round(d) + ' m';
  }
}

// updateMissionBox writes the title, Mara's line / objective, reward and
// timer into the mission box. It only touches the DOM when a value
// changed, so the box does not flicker.
function updateMissionBox(game) {
  var box = document.getElementById('mission-box');
  if (!box) return;
  var m = game.mission;
  if (!m) {
    var done = game.jobsDone >= NBConfig.missions.length;
    setText('mission-title', done ? 'FREE ROAM' : 'NEON BAY');
    setText('mission-text', done ? 'All jobs done. The city is yours.' : 'Take a job from Mara.');
    setText('mission-reward', '');
    setText('mission-timer', '');
    return;
  }
  setText('mission-title', 'JOB ' + (m.index + 1) + ' — ' + m.def.title);
  setText('mission-text', m.text);
  setText('mission-reward', 'Reward $' + m.def.reward);
  setText('mission-timer', m.timer > 0 ? Math.ceil(m.timer) + 's' : '');
}

// setText writes text into an element only when it changed.
function setText(id, text) {
  var el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

// setHealth writes the health label and bar (health / maxHealth).
// Used by the game loop and by anything that resets health directly.
function setHealth(health, maxHealth) {
  var hp = Math.max(0, Math.round(health));
  setText('health-label', 'HEALTH ' + hp);
  var bar = document.getElementById('health-fill');
  if (bar) bar.style.width = (maxHealth > 0 ? (hp / maxHealth) * 100 : 0) + '%';
}

// updateStats writes cash, health, wanted stars and speed (mph). Only
// changed values touch the DOM.
function updateStats(game) {
  setText('cash', '$' + game.cash);
  setHealth(game.health, NBConfig.maxHealth);
  var stars = '';
  for (var i = 0; i < 3; i++) stars += i < game.wanted ? '★' : '☆';
  setText('wanted', stars);
  var speed = game.playerCar ? Math.abs(game.playerCar.speed) : (game.player.moving ? (game.player.sprinting ? NBConfig.runSpeed : NBConfig.walkSpeed) : 0);
  setText('speed', Math.round(speed * 2.237) + ' mph');
}

// drawMinimap redraws the whole-city minimap: roads, sea, the player
// (white arrow), the objective (gold ring), police (red dots), thugs
// (orange dots) and traffic (grey dots). Throttled to ~150 ms by the
// caller so it never costs a frame.
function drawMinimap(game) {
  var cv = document.getElementById('minimap');
  if (!cv) return;
  var g = cv.getContext('2d');
  var S = cv.width, k = S / 400;
  function X(x) { return (x + 200) * k; }
  function Z(z) { return (z + 200) * k; }
  g.fillStyle = '#241f33'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#0d1b2e'; g.fillRect(0, Z(206), S, S - Z(206)); // sea
  g.strokeStyle = '#17141f'; g.lineWidth = 14 * k;
  NBConfig.roadAt.forEach(function (c) {
    g.beginPath(); g.moveTo(X(c), 0); g.lineTo(X(c), S); g.stroke();
    g.beginPath(); g.moveTo(0, Z(c)); g.lineTo(S, Z(c)); g.stroke();
  });
  // traffic (grey)
  g.fillStyle = '#999999';
  game.cars.forEach(function (c) {
    if (c.isTraffic) { g.beginPath(); g.arc(X(c.x), Z(c.z), 1.6, 0, 7); g.fill(); }
  });
  // thugs (orange)
  g.fillStyle = '#ff7a1a';
  game.thugs.forEach(function (t) {
    if (!t.down) { g.beginPath(); g.arc(X(t.x), Z(t.z), 2.2, 0, 7); g.fill(); }
  });
  // police (red)
  g.fillStyle = '#ff2a22';
  game.cops.forEach(function (c) {
    g.beginPath(); g.arc(X(c.x), Z(c.z), 2.6, 0, 7); g.fill();
  });
  // objective (gold ring)
  var target = NBMissions.missionTarget(game);
  if (target) {
    g.strokeStyle = '#ffd700'; g.lineWidth = 2;
    g.beginPath(); g.arc(X(target.x), Z(target.z), 5, 0, 7); g.stroke();
    g.fillStyle = '#ffd700';
    g.beginPath(); g.arc(X(target.x), Z(target.z), 2, 0, 7); g.fill();
  }
  // player (white arrow, rotated to facing)
  var px = X(game.player.x), pz = Z(game.player.z);
  g.save();
  g.translate(px, pz);
  g.rotate(Math.atan2(Math.sin(game.player.angle), -Math.cos(game.player.angle)) + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(-3.5, 4); g.closePath();
  g.fill();
  g.restore();
}

// showToast displays a centred toast (the shot label, Mara's line, or a
// payout) for `seconds`. Called LAST before a screenshot capture.
function showToast(game, text, seconds) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  game.toastTimer = seconds || 3;
}

// updateToast counts the toast down and hides it when it expires.
function updateToast(game, dt) {
  if (game.toastTimer > 0) {
    game.toastTimer -= dt;
    if (game.toastTimer <= 0) {
      var el = document.getElementById('toast');
      if (el) el.style.display = 'none';
    }
  }
}

// updateCrosshair shows the + crosshair while the player is on foot
// with the pistol.
function updateCrosshair(game) {
  var el = document.getElementById('crosshair');
  if (!el) return;
  el.style.display = (game.hasGun && !game.playerCar && game.health > 0) ? 'block' : 'none';
}

// showMenu displays the start menu overlay.
function showMenu() {
  var el = document.getElementById('menu');
  if (el) el.style.display = 'flex';
}

// hideMenu hides the start menu overlay.
function hideMenu() {
  var el = document.getElementById('menu');
  if (el) el.style.display = 'none';
}

// showPause displays the pause overlay (ESC).
function showPause() {
  var el = document.getElementById('pause-menu');
  if (el) el.style.display = 'flex';
}

// hidePause hides the pause overlay.
function hidePause() {
  var el = document.getElementById('pause-menu');
  if (el) el.style.display = 'none';
}

// showDeath shows the WASTED screen with the $150 fine.
function showDeath(game) {
  var el = document.getElementById('death-screen');
  if (!el) return;
  setText('death-fine', 'You lost $' + NBConfig.fine);
  el.style.display = 'flex';
  game.state = 'dead';
}

// showBusted shows the BUSTED screen with the $150 fine.
function showBusted(game) {
  var el = document.getElementById('busted-screen');
  if (!el) return;
  setText('busted-fine', 'You lost $' + NBConfig.fine);
  el.style.display = 'flex';
  game.state = 'busted';
}

// hideEndScreens hides both end screens (used on Continue).
function hideEndScreens() {
  ['death-screen', 'busted-screen'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

// updateHud is the per-frame HUD entry: arrow, mission box, stats,
// crosshair, toast and the throttled minimap. Called AFTER the camera.
function updateHud(game, dt) {
  updateObjectiveArrow(game);
  updateMissionBox(game);
  updateStats(game);
  updateCrosshair(game);
  updateToast(game, dt);
  game.minimapTimer -= dt;
  if (game.minimapTimer <= 0) {
    game.minimapTimer = 0.15;
    drawMinimap(game);
  }
}

window.NBHud = {
  updateObjectiveArrow: updateObjectiveArrow,
  updateMissionBox: updateMissionBox,
  updateStats: updateStats,
  setHealth: setHealth,
  drawMinimap: drawMinimap,
  showToast: showToast,
  updateToast: updateToast,
  updateCrosshair: updateCrosshair,
  showMenu: showMenu,
  hideMenu: hideMenu,
  showPause: showPause,
  hidePause: hidePause,
  showDeath: showDeath,
  showBusted: showBusted,
  hideEndScreens: hideEndScreens,
  updateHud: updateHud
};
