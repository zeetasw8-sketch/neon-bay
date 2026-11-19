// Neon Bay — orang: pejalan kaki (16) + preman misi 5 (3).
// Satu mesh per orang (badan+kepala+kaki digabung, warna vertex).
// Preman mengejar pemain bila < 35 m dan memukul bila < 2 m.
// Preman mati (HP 0) dihapus dari daftar — misi 5 selesai bila daftar kosong.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var scene = null;
  var peds = [];
  var thugs = [];
  var skinTones = [0xc98a5a, 0x8a5a3a, 0xe0b088, 0x6b4423];
  var shirtCols = [0x3a6b8a, 0x8a3a3a, 0x3a8a4a, 0x8a7a2a, 0x6b3a8a, 0x2a2a2a, 0x9a9a9a, 0x3a8a8a];

  function mergeGeoms(list) {
    var pos = [], norm = [], col = [], idx = [], off = 0;
    list.forEach(function (g) {
      var p = g.attributes.position.array;
      var n = g.attributes.normal.array;
      var c = g.attributes.color ? g.attributes.color.array : null;
      var i, k;
      for (i = 0; i < p.length; i++) { pos.push(p[i]); norm.push(n[i]); }
      if (c) { for (i = 0; i < c.length; i++) col.push(c[i]); }
      else { for (k = 0; k < p.length / 3; k++) col.push(1, 1, 1); }
      var ix = g.index.array;
      for (i = 0; i < ix.length; i++) idx.push(ix[i] + off);
      off += p.length / 3;
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }

  function coloredBox(w, h, d, color, x, y, z) {
    var g = new THREE.BoxGeometry(w, h, d);
    var m = new THREE.Matrix4();
    m.makeTranslation(x, y, z);
    g.applyMatrix4(m);
    var c = new THREE.Color(color);
    var n = g.attributes.position.count;
    var arr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  // Satu orang: kaki + badan + kepala. Depan = +z lokal.
  function makePersonMesh(shirt, skin, scale) {
    var parts = [];
    parts.push(coloredBox(0.52, 0.8, 0.32, 0x22222e, 0, 0.4, 0));       // kaki
    parts.push(coloredBox(0.62, 0.72, 0.38, shirt, 0, 1.16, 0));          // badan
    parts.push(coloredBox(0.16, 0.55, 0.16, shirt, -0.4, 1.1, 0));        // lengan kiri
    parts.push(coloredBox(0.16, 0.55, 0.16, shirt, 0.4, 1.1, 0));         // lengan kanan
    parts.push(coloredBox(0.36, 0.36, 0.36, skin, 0, 1.72, 0));           // kepala
    parts.push(coloredBox(0.38, 0.1, 0.38, 0x1a1a1a, 0, 1.92, 0));        // rambut
    var geo = mergeGeoms(parts);
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    mesh.scale.setScalar(scale || 1);
    return mesh;
  }

  function randomWalkPoint() {
    for (var tries = 0; tries < 12; tries++) {
      var x = -200 + Math.random() * 400;
      var z = -200 + Math.random() * 395;
      if (z > 196) continue;
      if (window.NBWorld.isBlocked(x, z, 1)) continue;
      return { x: x, z: z };
    }
    return { x: 0, z: 100 };
  }

  function spawnPeds() {
    for (var i = 0; i < C.pedCount; i++) {
      var mesh = makePersonMesh(
        shirtCols[i % shirtCols.length],
        skinTones[i % skinTones.length],
        0.95 + Math.random() * 0.1
      );
      var p = randomWalkPoint();
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      scene.add(mesh);
      peds.push({
        mesh: mesh,
        speed: 1.2 + Math.random() * 0.7,
        target: randomWalkPoint(),
        heading: mesh.rotation.y,
      });
    }
  }

  function updatePeds(dt) {
    peds.forEach(function (p) {
      var dx = p.target.x - p.mesh.position.x;
      var dz = p.target.z - p.mesh.position.z;
      var d = Math.hypot(dx, dz);
      if (d < 1.5) { p.target = randomWalkPoint(); return; }
      var vx = (dx / d) * p.speed * dt;
      var vz = (dz / d) * p.speed * dt;
      var moved = window.NBWorld.slideMove(p.mesh.position.x, p.mesh.position.z, vx, vz, 0.5);
      if (Math.hypot(moved.x - p.mesh.position.x, moved.z - p.mesh.position.z) < 0.01) {
        p.target = randomWalkPoint();
        return;
      }
      p.mesh.position.x = moved.x;
      p.mesh.position.z = moved.z;
      p.heading = Math.atan2(dx, dz);
      p.mesh.rotation.y = p.heading;
      // Ayun langkah (goyang kecil supaya terlihat berjalan).
      p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.006 + p.speed)) * 0.05;
    });
  }

  function spawnThugs(x, z) {
    clearThugs();
    var spots = [[-4, -3], [4, -4], [0, 5]];
    for (var i = 0; i < C.thugCount; i++) {
      var mesh = makePersonMesh(0x8a1a1a, skinTones[i % skinTones.length], 1.12);
      mesh.position.set(x + spots[i][0], 0, z + spots[i][1]);
      mesh.rotation.y = Math.PI;
      scene.add(mesh);
      thugs.push({
        hp: C.thugHp,
        mesh: mesh,
        speed: C.thugSpeed,
        attackCd: 0,
        heading: Math.PI,
      });
    }
  }

  function clearThugs() {
    thugs.forEach(function (t) { scene.remove(t.mesh); });
    thugs.length = 0;
  }

  function updateThugs(dt, game) {
    // Jaga jarak antar preman (jangan menumpuk di satu titik).
    for (var a = 0; a < thugs.length; a++) {
      for (var b = a + 1; b < thugs.length; b++) {
        var ta = thugs[a], tb = thugs[b];
        var sx = tb.mesh.position.x - ta.mesh.position.x;
        var sz = tb.mesh.position.z - ta.mesh.position.z;
        var sd = Math.hypot(sx, sz);
        if (sd > 0.01 && sd < 1.8) {
          var push = (1.8 - sd) / 2;
          var ux = sx / sd, uz = sz / sd;
          var ma = window.NBWorld.slideMove(ta.mesh.position.x, ta.mesh.position.z, -ux * push, -uz * push, 0.5);
          var mb = window.NBWorld.slideMove(tb.mesh.position.x, tb.mesh.position.z, ux * push, uz * push, 0.5);
          ta.mesh.position.x = ma.x; ta.mesh.position.z = ma.z;
          tb.mesh.position.x = mb.x; tb.mesh.position.z = mb.z;
        }
      }
    }
    for (var i = thugs.length - 1; i >= 0; i--) {
      var t = thugs[i];
      if (t.hp <= 0) continue;
      t.attackCd = Math.max(0, t.attackCd - dt);
      var dx = game.playerPos.x - t.mesh.position.x;
      var dz = game.playerPos.z - t.mesh.position.z;
      var d = Math.hypot(dx, dz);
      if (d < C.thugChaseDist && !game.inCar) {
        // Kejar pemain tapi berhenti 2 m darinya (mengepung, bukan menumpuk).
        if (d > 2.0) {
          var vx = (dx / d) * t.speed * dt;
          var vz = (dz / d) * t.speed * dt;
          var moved = window.NBWorld.slideMove(t.mesh.position.x, t.mesh.position.z, vx, vz, 0.5);
          t.mesh.position.x = moved.x;
          t.mesh.position.z = moved.z;
        }
        t.heading = Math.atan2(dx, dz);
        t.mesh.rotation.y = t.heading;
        if (d < 2.4 && t.attackCd <= 0 && game.state === 'playing') {
          t.attackCd = 1.0;
          game.damagePlayer(C.thugDamage, 'thug');
        }
      } else if (d < C.thugChaseDist && game.inCar) {
        // Pemain di mobil: preman berdiri, menghadap mobil.
        t.heading = Math.atan2(dx, dz);
        t.mesh.rotation.y = t.heading;
      }
    }
  }

  // Preman kena damage; mati -> hapus dari daftar (misi 5 selesai saat kosong).
  function damageThug(t, amount, fromX, fromZ) {
    t.hp -= amount;
    // Knockback menjauhi penyerang.
    var dx = t.mesh.position.x - fromX;
    var dz = t.mesh.position.z - fromZ;
    var d = Math.hypot(dx, dz) || 1;
    var moved = window.NBWorld.slideMove(t.mesh.position.x, t.mesh.position.z, (dx / d) * 0.9, (dz / d) * 0.9, 0.5);
    t.mesh.position.x = moved.x;
    t.mesh.position.z = moved.z;
    if (t.hp <= 0) {
      var idx = thugs.indexOf(t);
      if (idx >= 0) thugs.splice(idx, 1);
      scene.remove(t.mesh);
      return true;
    }
    return false;
  }

  window.NBPeople = {
    peds: peds,
    thugs: thugs,
    makePersonMesh: makePersonMesh,
    init: function (sc) { scene = sc; spawnPeds(); },
    spawnThugs: spawnThugs,
    clearThugs: clearThugs,
    damageThug: damageThug,
    update: function (dt, game) {
      updatePeds(dt);
      updateThugs(dt, game);
    },
  };
})();
