// Neon Bay — polisi (Bay PD): 1 mobil per bintang wanted.
// Kejar dengan belok terbatas (radius putar besar) dan melambat saat dekat
// supaya tidak meleset lewat pemain — dulu mereka selalu overshoot dan
// tidak pernah bisa menangkap. Tabrakan ke pemain jalan kaki hanya 4 HP/dtk
// supaya BUSTED sempat terjadi sebelum pemain mati. Setirnya naif
// (langsung ke arah pemain, tanpa hindari gedung) sehingga mobil polisi
// bisa tersangkut di gedung dan pemain bisa lolos > 45 m.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var scene = null;
  var cars = [];
  var bustTimer = 0;
  var sirenPhase = 0;

  function spawn(sceneArg, x, z, game) {
    var sc = sceneArg || scene;
    var mesh = window.NBVehicles.makeCarMesh(0x1a1a22, { police: true });
    mesh.position.set(x, 0, z);
    sc.add(mesh);
    var car = {
      kind: 'police',
      mesh: mesh,
      heading: 0,
      speed: 0,
      targetSpeed: 0,
      ramCd: 0,
      strobe: null,
      dispatch: C.policeDispatchDelay, // jeda respons sebelum mulai mengejar
    };
    // Lampu strobo di atap (mesh terpisah supaya warnanya bisa berkedip).
    var strobe = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.22, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xff3b3b })
    );
    strobe.position.set(0, 1.62, -0.25);
    mesh.add(strobe);
    car.strobe = strobe;
    if (game) {
      car.heading = Math.atan2(game.playerPos.x - x, game.playerPos.z - z);
      mesh.rotation.y = car.heading;
    }
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    var idx = cars.indexOf(car);
    if (idx >= 0) cars.splice(idx, 1);
    if (scene) scene.remove(car.mesh);
  }

  // Samakan jumlah mobil polisi dengan wanted (1 per bintang, maks 5).
  // Spawn di depan arah hadap pemain (~48 m), supaya terlihat mengejar.
  function syncWanted(wanted, game) {
    wanted = Math.max(0, Math.min(C.maxWanted, wanted));
    while (cars.length < wanted) {
      var ang = (game.player ? game.player.heading : 0) + (Math.random() - 0.5) * 0.8;
      var d = game.inCar ? (C.policeSpawnDistCar || 130) : C.policeSpawnDist;
      var x = game.playerPos.x + Math.sin(ang) * d;
      var z = game.playerPos.z + Math.cos(ang) * d;
      // Jepit ke dalam kota & darat.
      x = Math.max(-200, Math.min(200, x));
      z = Math.max(-200, Math.min(200, z));
      if (window.NBWorld.isBlocked(x, z, 1.5)) {
        // Geser ke jalan terdekat bila titik spawn di dalam gedung.
        var placed = false;
        for (var r = 4; r <= 40 && !placed; r += 4) {
          for (var a = 0; a < 8; a++) {
            var ax = x + Math.sin(a * Math.PI / 4) * r;
            var az = z + Math.cos(a * Math.PI / 4) * r;
            if (!window.NBWorld.isBlocked(ax, az, 1.5)) { x = ax; z = az; placed = true; break; }
          }
        }
        if (!placed) continue;
      }
      spawn(scene, x, z, game);
    }
    while (cars.length > wanted) {
      // Hapus yang terjauh dulu.
      var far = null, farD = -1;
      cars.forEach(function (c) {
        var dd = Math.hypot(c.mesh.position.x - game.playerPos.x, c.mesh.position.z - game.playerPos.z);
        if (dd > farD) { farD = dd; far = c; }
      });
      if (far) removeCar(far); else break;
    }
    if (wanted === 0) {
      while (cars.length) removeCar(cars[0]);
      bustTimer = 0;
    }
  }

  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function update(dt, game) {
    if (game.state !== 'playing') return;
    var px = game.playerPos.x, pz = game.playerPos.z;
    var playerSpeed = game.playerSpeed || 0;
    var anyClose = false;
    sirenPhase += dt;

    for (var i = 0; i < cars.length; i++) {
      var car = cars[i];
      car.ramCd = Math.max(0, car.ramCd - dt);
      // Jeda respons: mobil baru spawn diam 2 detik (sirene menyala).
      if (car.dispatch > 0) {
        car.dispatch -= dt;
        car.speed = 0;
        if (car.strobe) {
          car.strobe.material.color.setHex(Math.sin(sirenPhase * 9 + i * 2.1) > 0 ? 0xff3b3b : 0x3b7bff);
        }
        continue;
      }
      var dx = px - car.mesh.position.x;
      var dz = pz - car.mesh.position.z;
      var dist = Math.hypot(dx, dz);
      // Belok ke arah pemain (terbatas — radius putar besar).
      var want = Math.atan2(dx, dz);
      var diff = angDiff(want, car.heading);
      var turn = Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      car.heading += turn;
      // Kecepatan sebanding jarak: pelan saat dekat (tetap menempel),
      // kencang saat jauh. Inilah yang dulu salah (selalu top speed).
      var target = Math.max(2.2, Math.min(C.policeTopSpeed, dist * 0.55));
      car.speed += (target - car.speed) * Math.min(1, dt * 1.6);
      var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
      var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
      var moved = window.NBWorld.slideMove(car.mesh.position.x, car.mesh.position.z, nx - car.mesh.position.x, nz - car.mesh.position.z, 1.4);
      car.mesh.position.x = moved.x;
      car.mesh.position.z = moved.z;
      car.mesh.rotation.y = car.heading;
      // Lampu strobo berkedip merah/biru.
      if (car.strobe) {
        car.strobe.material.color.setHex(Math.sin(sirenPhase * 9 + i * 2.1) > 0 ? 0xff3b3b : 0x3b7bff);
      }
      // Tabrakan ke pemain jalan kaki: damage kecil (BUSTED dulu, bukan mati).
      if (!game.inCar && dist < 2.0) {
        game.damagePlayer(C.policeContactDps * dt, 'police');
      }
      // Menabrak mobil pemain: perlambat (ram).
      if (game.inCar && dist < 3.0 && car.ramCd <= 0 && window.NBVehicles.playerCar) {
        car.ramCd = 0.6;
        window.NBVehicles.playerCar.speed *= 0.72;
        game.onCrash();
      }
      // Penangkapan: polisi < 5 m DAN pemain lambat (< 3 m/s) selama 2 dtk.
      if (dist < C.bustDist && playerSpeed < C.bustSpeed) anyClose = true;
    }
    // Lampu strobo: ganti warna batang lampu via scale pulsa (murah).
    if (anyClose) {
      bustTimer += dt;
      if (bustTimer >= C.bustTime) {
        bustTimer = 0;
        game.busted();
      }
    } else {
      bustTimer = Math.max(0, bustTimer - dt * 2);
    }
  }

  window.NBPolice = {
    cars: cars,
    spawn: spawn,
    init: function (sc) { scene = sc; },
    syncWanted: syncWanted,
    update: update,
    clearAll: function () { while (cars.length) removeCar(cars[0]); bustTimer = 0; },
  };
})();
