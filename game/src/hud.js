// Neon Bay — HUD: uang, bintang, darah, misi, panah + jarak objektif,
// minimap bulat 168px, prompt, toast, banner, flash damage.
// Minimap dipetakan dari pusat dunia (0,0): skala = radius / jangkauan,
// marker objektif dijepit ke tepi lingkaran (R-10) + cincin emas.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var el = {};
  var mapCtx = null;
  var toastTimer = 0;
  var bannerTimer = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    ['hud', 'missionBox', 'missionTitle', 'missionText', 'timer', 'money', 'stars',
      'healthBar', 'healthFill', 'speed', 'speedVal', 'crosshair', 'minimap',
      'mapLegend', 'objGuide', 'objArrow', 'objDist', 'prompt', 'controlsHint',
      'toast', 'banner', 'bannerTitle', 'bannerSub', 'damageFlash'].forEach(function (id) {
      el[id] = $(id);
    });
    mapCtx = el.minimap.getContext('2d');
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // Peta dunia -> kanvas minimap (pusat dunia di tengah lingkaran).
  function toMap(x, z) {
    var s = C.mapRadius / C.mapRange;
    return { x: C.mapRadius + x * s, y: C.mapRadius + z * s };
  }

  function drawMinimap(game) {
    var ctx = mapCtx;
    if (!ctx) return;
    var S = C.mapSize, R = C.mapRadius, cx = R, cy = R;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    // Latar kota.
    ctx.fillStyle = '#232338';
    ctx.fillRect(0, 0, S, S);
    // Laut (selatan) + pantai: strip biru di bawah.
    var seaY = toMap(0, C.seaZ).y;
    ctx.fillStyle = '#14406e';
    ctx.fillRect(0, seaY, S, S - seaY);
    ctx.fillStyle = '#b89a5e';
    ctx.fillRect(0, toMap(0, 196).y, S, seaY - toMap(0, 196).y);
    // Jalan.
    ctx.strokeStyle = '#4a4a5a';
    ctx.lineWidth = 5;
    C.verticalRoads.forEach(function (x) {
      var p = toMap(x, 0);
      ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, S); ctx.stroke();
    });
    C.horizontalRoads.forEach(function (z) {
      var p = toMap(0, z);
      ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(S, p.y); ctx.stroke();
    });
    // Garasi (hijau), bank (biru), rumah sakit (salib merah).
    function square(x, z, size, color) {
      var p = toMap(x, z);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    square(C.garage.x, C.garage.z, 9, '#7dff9a');
    square(C.bank.x, C.bank.z, 9, '#5aa2ff');
    var hp = toMap(C.hospital.x, C.hospital.z);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(hp.x - 1.5, hp.y - 5, 3, 10);
    ctx.fillRect(hp.x - 5, hp.y - 1.5, 10, 3);
    // Lalu lintas (abu) + polisi (merah/biru).
    window.NBVehicles.cars.forEach(function (c) {
      var p = toMap(c.mesh.position.x, c.mesh.position.z);
      ctx.fillStyle = '#9a9a9a';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });
    window.NBPolice.cars.forEach(function (c, i) {
      var p = toMap(c.mesh.position.x, c.mesh.position.z);
      ctx.fillStyle = i % 2 ? '#3b7bff' : '#ff3b3b';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    });
    // Objektif: lingkaran putih + cincin emas, dijepit ke tepi (R-10).
    var obj = window.NBWorld.objectivePos();
    var beaconVisible = window.NBWorld.beacon && window.NBWorld.beacon.visible;
    if (beaconVisible && obj) {
      var op = toMap(obj.x, obj.z);
      var dx = op.x - cx, dy = op.y - cy;
      var dist = Math.hypot(dx, dy);
      var maxR = R - 10;
      if (dist > maxR) { op.x = cx + (dx / dist) * maxR; op.y = cy + (dy / dist) * maxR; }
      var ux = dx / (dist || 1), uy = dy / (dist || 1);
      // Segitiga emas penunjuk arah (di luar marker).
      var tx = op.x + ux * 11, ty = op.y + uy * 11;
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.moveTo(tx + ux * 6, ty + uy * 6);
      ctx.lineTo(tx - uy * 4 - ux * 2, ty + ux * 4 - uy * 2);
      ctx.lineTo(tx + uy * 4 - ux * 2, ty - ux * 4 - uy * 2);
      ctx.closePath(); ctx.fill();
      // Lingkaran putih (denyut halus) + cincin emas.
      var pulse = 5.5 + Math.sin(performance.now() * 0.005) * 1.2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(op.x, op.y, Math.max(4.5, pulse), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffb300';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(op.x, op.y, Math.max(4.5, pulse) + 2.5, 0, Math.PI * 2); ctx.stroke();
    }
    // Pemain: segitiga emas searah heading.
    var pp = toMap(game.playerPos.x, game.playerPos.z);
    var fx = Math.sin(game.player.heading), fz = Math.cos(game.player.heading);
    var px2 = pp.x + fx * 7, py2 = pp.y + fz * 7;
    var bx = pp.x - fx * 5, by = pp.y - fz * 5;
    var perpX = fz, perpY = -fx;
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(px2, py2);
    ctx.lineTo(bx + perpX * 4.5, by + perpY * 4.5);
    ctx.lineTo(bx - perpX * 4.5, by - perpY * 4.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Penanda utara.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 13);
    ctx.restore();
    // Bingkai lingkaran.
    ctx.strokeStyle = 'rgba(255,179,0,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.stroke();
  }

  function update(game, dt) {
    // Uang + bintang + darah.
    el.money.textContent = '$' + Math.floor(game.cash);
    var stars = '';
    for (var i = 0; i < C.maxWanted; i++) stars += i < game.wanted ? '★' : '☆';
    el.stars.textContent = stars;
    // Misi + timer.
    var m = window.NBMissions;
    var active = m.active;
    if (active) {
      el.missionTitle.textContent = active.title;
      // Teks tahap aktif (lebih spesifik dari brief).
      var stageText = '';
      if (m.phase === 'toPier') stageText = 'Pergi ke dermaga selatan';
      else if (m.phase === 'pickup' && active.title.indexOf('JOB 2') === 0) stageText = 'Naik mobil apa saja';
      else if (m.phase === 'toBuyer') stageText = 'Antar ke pembeli di utara';
      else if (m.phase === 'steal') stageText = 'Curi sebuah mobil (E untuk masuk)';
      else if (m.phase === 'toHome') stageText = 'Kembali ke garasi';
      else if (m.phase === 'loseheat') stageText = 'Jauhi polisi sampai bintang hilang';
      else if (m.phase === 'fight') stageText = game.hasGun ? 'Kalahkan 3 preman di dermaga' : 'Ambil pistol di dermaga, kalahkan 3 preman';
      else if (m.phase === 'toBank') stageText = 'Pergi ke bank';
      else if (m.phase === 'escape') stageText = 'Kabur ke garasi dengan wanted 0';
      else if (m.phase === 'pickup') stageText = 'Paket diamankan!';
      el.missionText.textContent = stageText || active.brief || '';
      if (m.timer > 0) {
        el.timer.classList.remove('hidden');
        el.timer.textContent = Math.ceil(m.timer) + 's';
      } else {
        el.timer.classList.add('hidden');
      }
    } else if (m.pendingNext > 0) {
      el.missionTitle.textContent = 'JOB COMPLETE';
      el.missionText.textContent = 'Job berikutnya datang...';
      el.timer.classList.add('hidden');
    } else {
      el.missionTitle.textContent = 'FREE ROAM';
      el.missionText.textContent = 'Semua job selesai. The bay is yours.';
      el.timer.classList.add('hidden');
    }
    // Kecepatan (saat menyetir).
    if (game.inCar && window.NBVehicles.playerCar) {
      el.speed.classList.remove('hidden');
      el.speedVal.textContent = Math.round(Math.abs(window.NBVehicles.playerCar.speed) * 2.24);
    } else {
      el.speed.classList.add('hidden');
    }
    // Crosshair bila bersenjata.
    if (game.hasGun && game.state === 'playing') el.crosshair.classList.remove('hidden');
    else el.crosshair.classList.add('hidden');
    // Panah + jarak objektif.
    var beaconVisible = window.NBWorld.beacon && window.NBWorld.beacon.visible;
    if (beaconVisible && game.state === 'playing' && active) {
      var obj = window.NBWorld.objectivePos();
      var dx = obj.x - game.playerPos.x;
      var dz = obj.z - game.playerPos.z;
      var dist = Math.hypot(dx, dz);
      var bearing = Math.atan2(dx, dz);
      // Arah pandang kamera AKTUAL (dari posisi kamera ke pemain), bukan yaw
      // yang dihaluskan: saat drag cepat / fps rendah, _camYawSmooth bisa
      // menyimpang dari arah pandang sebenarnya (posisi kamera di-lerp
      // sepanjang chord, bukan busur), sehingga panah sempat menunjuk arah
      // yang salah di dekat ±180°. Bila kamera terlalu dekat dengan pemain
      // (transit chord), pakai yaw yang dihaluskan sebagai cadangan.
      var cdx = game.playerPos.x - game._camPos.x;
      var cdz = game.playerPos.z - game._camPos.z;
      var camFwd = (cdx * cdx + cdz * cdz) > 0.25
        ? Math.atan2(cdx, cdz) : game.camYawAbs();
      var rel = wrapAngle(bearing - camFwd);
      el.objGuide.style.display = 'flex';
      el.objDist.textContent = Math.round(dist) + ' m';
      el.objArrow.style.transform = 'rotate(' + (-rel * 180 / Math.PI) + 'deg)';
    } else {
      el.objGuide.style.display = 'none';
    }
    // Prompt interaksi (mobil terdekat).
    if (game.state === 'playing') {
      if (game.inCar) {
        el.prompt.classList.remove('hidden');
        el.prompt.textContent = 'Press E to exit car';
      } else {
        var near = window.NBVehicles.nearestCar(game.playerPos.x, game.playerPos.z, C.carEnterRadius);
        if (near) {
          el.prompt.classList.remove('hidden');
          el.prompt.textContent = 'Press E to steal car — ' + Math.round(near.dist) + 'm';
        } else {
          el.prompt.classList.add('hidden');
        }
      }
    } else {
      el.prompt.classList.add('hidden');
    }
    // Toast + banner (hitung mundur).
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el.toast.classList.add('hidden');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) el.banner.classList.add('hidden');
    }
    drawMinimap(game);
  }

  window.NBHud = {
    init: init,
    update: update,
    setHealth: function (hp, maxHp) {
      if (!el.healthFill) return;
      var pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
      el.healthFill.style.width = pct + '%';
      el.healthFill.style.background = pct > 50
        ? 'linear-gradient(90deg,#37d67a,#7dff9a)'
        : pct > 25 ? 'linear-gradient(90deg,#d6a437,#ffd97a)' : 'linear-gradient(90deg,#d63737,#ff7a7a)';
    },
    toast: function (text, seconds) {
      el.toast.textContent = text;
      el.toast.classList.remove('hidden');
      toastTimer = seconds || 3;
    },
    banner: function (title, sub) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.remove('hidden');
      bannerTimer = 2.5;
    },
    flash: function (opacity) {
      el.damageFlash.style.opacity = opacity;
    },
  };
})();
