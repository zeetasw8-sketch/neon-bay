// Neon Bay — pertarungan: tinju (F) + tembak (klik mouse).
// Tembakan TIDAK menaikkan wanted (baik kena preman maupun meleset),
// supaya jalur pistol misi 5 tetap bisa dimainkan. Tinju ke preman juga
// tidak menaikkan wanted; tinju ke pejalan kaki +1 bintang.
// Tracer peluru dibuat per tembakan lalu dibuang (tanpa bocor geometri).
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var scene = null;
  var raycaster = null;
  var tracers = []; // {line, ttl}
  var punchCd = 0;

  function init(sc) {
    scene = sc;
    raycaster = new THREE.Raycaster();
  }

  // Jarak terdekat ray ke bola (pusat, radius). -1 bila tidak kena.
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    var lx = cx - ox, ly = cy - oy, lz = cz - oz;
    var t = lx * dx + ly * dy + lz * dz;
    if (t < 0) return -1;
    var px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    var dd = Math.hypot(cx - px, cy - py, cz - pz);
    if (dd > r) return -1;
    return t;
  }

  // Ray vs AABB gedung (slab). -1 bila tidak kena, else jarak masuk.
  function rayBox(ox, oy, oz, dx, dy, dz, b) {
    var tmin = 0, tmax = 1e9;
    var o = [ox, oy, oz], d = [dx, dy, dz];
    var mn = [b.minX, 0, b.minZ], mx = [b.maxX, 30, b.maxZ];
    for (var i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < mn[i] || o[i] > mx[i]) return -1;
      } else {
        var t1 = (mn[i] - o[i]) / d[i];
        var t2 = (mx[i] - o[i]) / d[i];
        if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  }

  function addTracer(from, to) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [from.x, from.y, from.z, to.x, to.y, to.z], 3));
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9b0 }));
    scene.add(line);
    tracers.push({ line: line, ttl: 0.09 });
  }

  function updateTracers(dt) {
    for (var i = tracers.length - 1; i >= 0; i--) {
      tracers[i].ttl -= dt;
      if (tracers[i].ttl <= 0) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers[i].line.material.dispose();
        tracers.splice(i, 1);
      }
    }
  }

  // Tinju: preman terdekat dalam jangkauan kena 1 damage + knockback.
  // Pejalan kaki yang kena tinju lari + wanted +1. Preman tidak menaikkan wanted.
  function punch(game) {
    if (punchCd > 0) return false;
    punchCd = 0.35;
    var px = game.playerPos.x, pz = game.playerPos.z;
    var best = null, bestD = C.punchRange;
    window.NBPeople.thugs.forEach(function (t) {
      if (t.hp <= 0) return;
      var d = Math.hypot(t.mesh.position.x - px, t.mesh.position.z - pz);
      if (d < bestD) { bestD = d; best = { kind: 'thug', t: t }; }
    });
    if (!best) {
      window.NBPeople.peds.forEach(function (p) {
        var d = Math.hypot(p.mesh.position.x - px, p.mesh.position.z - pz);
        if (d < bestD) { bestD = d; best = { kind: 'ped', t: p }; }
      });
    }
    window.NBAudio.punch();
    if (!best) return false;
    if (best.kind === 'thug') {
      window.NBPeople.damageThug(best.t, C.punchDamage, px, pz);
    } else {
      // Pejalan kaki: lari menjauh + wanted naik.
      var p = best.t;
      var dx = p.mesh.position.x - px, dz = p.mesh.position.z - pz;
      var d = Math.hypot(dx, dz) || 1;
      p.target = { x: p.mesh.position.x + (dx / d) * 60, z: p.mesh.position.z + (dz / d) * 60 };
      p.speed = 4.5;
      game.addWanted(1);
    }
    return true;
  }

  // Tembak lewat titik klik layar. Ray dari kamera; kena preman terdekat
  // yang tidak terhalang gedung (bola dada radius 1,3 m — pemaaf).
  function shoot(game, clientX, clientY) {
    if (!game.hasGun) return false;
    var w = window.innerWidth, h = window.innerHeight;
    var nx = (clientX / w) * 2 - 1;
    var ny = -(clientY / h) * 2 + 1;
    raycaster.setFromCamera({ x: nx, y: ny }, game.camera);
    var ro = raycaster.ray.origin;
    var rd = raycaster.ray.direction;
    var px = game.playerPos.x, pz = game.playerPos.z;
    // Jarak gedung terdekat di sepanjang ray (penghalang).
    var blockD = 1e9;
    window.NBWorld.buildings.forEach(function (b) {
      var t = rayBox(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, b);
      if (t >= 0 && t < blockD) blockD = t;
    });
    var best = null, bestT = 1e9;
    window.NBPeople.thugs.forEach(function (t) {
      if (t.hp <= 0) return;
      var m = t.mesh.position;
      var tt = raySphere(ro.x, ro.y, ro.z, rd.x, rd.y, rd.z, m.x, 1.15, m.z, 1.35);
      if (tt >= 0 && tt < bestT) { bestT = tt; best = t; }
    });
    var from = { x: px, y: 1.3, z: pz };
    var to;
    if (best && bestT < blockD) {
      to = { x: ro.x + rd.x * bestT, y: ro.y + rd.y * bestT, z: ro.z + rd.z * bestT };
      window.NBPeople.damageThug(best, C.gunDamage, px, pz);
    } else {
      var far = Math.min(blockD < 1e8 ? blockD : 120, 120);
      to = { x: ro.x + rd.x * far, y: Math.max(0.4, ro.y + rd.y * far), z: ro.z + rd.z * far };
    }
    addTracer(from, to);
    window.NBAudio.gunshot();
    // Menembak TIDAK menaikkan wanted (misi 5 tetap bisa dimainkan).
    return true;
  }

  window.NBCombat = {
    init: init,
    punch: punch,
    shoot: shoot,
    update: function (dt) {
      punchCd = Math.max(0, punchCd - dt);
      updateTracers(dt);
    },
  };
})();
