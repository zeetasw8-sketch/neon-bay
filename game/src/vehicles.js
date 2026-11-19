// Neon Bay — kendaraan: lalu lintas, mobil parkir, mobil pemain.
// Satu mesh per mobil (bodi+kabin+roda digabung, warna vertex).
// Lalu lintas mengikuti jalurnya (x = lane.line untuk jalan vertikal);
// mobil yang "dipegang" (speed 0 + targetSpeed 0) tetap diam — dipakai
// alat screenshot untuk menata adegan.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var scene = null;
  var cars = [];      // lalu lintas (kind 'traffic')
  var parked = [];    // mobil parkir (kind 'parked')
  var playerCar = null;

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

  function coloredCyl(rt, rb, h, color, x, y, z, seg) {
    var g = new THREE.CylinderGeometry(rt, rb, h, seg || 8);
    var m = new THREE.Matrix4();
    m.makeTranslation(x, y, z);
    // Roda: sumbu silinder diputar ke sumbu X.
    var rot = new THREE.Matrix4();
    rot.makeRotationZ(Math.PI / 2);
    g.applyMatrix4(rot);
    g.applyMatrix4(m);
    var c = new THREE.Color(color);
    var n = g.attributes.position.count;
    var arr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  // Satu mesh mobil: bodi + kabin + 4 roda + lampu. Depan = +z lokal,
  // jadi mesh.rotation.y = heading menghadap (sin h, cos h).
  function makeCarMesh(color, opts) {
    opts = opts || {};
    var parts = [];
    var body = opts.police ? 0x1a1a22 : color;
    parts.push(coloredBox(2.0, 0.62, 4.3, body, 0, 0.62, 0));
    parts.push(coloredBox(1.75, 0.55, 2.1, opts.police ? 0x2e2e3a : 0x22222e, 0, 1.18, -0.25));
    // Kaca depan/belakang (gelap mengkilap).
    parts.push(coloredBox(1.6, 0.4, 0.12, 0x8fb8d8, 0, 1.15, 0.82));
    // Roda.
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      parts.push(coloredCyl(0.36, 0.36, 0.28, 0x111114, p[0], 0.36, p[1], 10));
    });
    // Lampu depan.
    parts.push(coloredBox(0.4, 0.16, 0.1, 0xfff2b0, -0.6, 0.7, 2.16));
    parts.push(coloredBox(0.4, 0.16, 0.1, 0xfff2b0, 0.6, 0.7, 2.16));
    // Lampu belakang.
    parts.push(coloredBox(0.4, 0.16, 0.1, 0xff3b3b, -0.6, 0.7, -2.16));
    parts.push(coloredBox(0.4, 0.16, 0.1, 0xff3b3b, 0.6, 0.7, -2.16));
    if (opts.police) {
      // Batang lampu polisi di atap + garis putih di bodi.
      parts.push(coloredBox(1.1, 0.16, 0.5, 0xff3b3b, -0.45, 1.52, -0.25));
      parts.push(coloredBox(1.1, 0.16, 0.5, 0x3b7bff, 0.45, 1.52, -0.25));
      parts.push(coloredBox(2.02, 0.3, 4.32, 0xd8d8e0, 0, 0.62, 0));
    }
    var geo = mergeGeoms(parts);
    var mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    return mesh;
  }

  function makeCar(kind, x, z, heading, color, opts) {
    var mesh = makeCarMesh(color, opts);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    scene.add(mesh);
    return {
      kind: kind,
      mesh: mesh,
      heading: heading,
      speed: 0,
      targetSpeed: 0,
      cruise: 0,
      lane: null,
      starter: false,
    };
  }

  function randomLaneCar(i) {
    var vertical = i % 2 === 0;
    var line, dir;
    if (vertical) {
      line = C.verticalRoads[Math.floor(Math.random() * C.verticalRoads.length)];
      dir = Math.random() < 0.5 ? 1 : -1;
    } else {
      line = C.horizontalRoads[Math.floor(Math.random() * C.horizontalRoads.length)];
      dir = Math.random() < 0.5 ? 1 : -1;
    }
    var colors = [0x8a2f2f, 0x2f5a8a, 0x3a7a3a, 0x8a8a2f, 0x5a3a8a, 0x9a9a9a, 0x2f8a7a];
    var car = makeCar('traffic', 0, 0, 0, colors[i % colors.length], null);
    car.lane = { vertical: vertical, line: line, dir: dir };
    car.cruise = 9 + Math.random() * 5;
    car.speed = car.cruise;
    car.targetSpeed = car.cruise;
    if (vertical) {
      car.mesh.position.set(line, 0, -200 + Math.random() * 400);
      car.heading = dir > 0 ? 0 : Math.PI;
    } else {
      car.mesh.position.set(-200 + Math.random() * 400, 0, line);
      car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.mesh.rotation.y = car.heading;
    return car;
  }

  function spawnParked() {
    var spots = [
      { x: C.starterCar.x, z: C.starterCar.z, h: 0, starter: true, color: 0xff5a9a },
      { x: -30, z: 130, h: Math.PI / 2, color: 0x3a6b8a },
      { x: 30, z: 150, h: -Math.PI / 2, color: 0x6b3a2a },
      { x: -78, z: 40, h: 0, color: 0x2a5a3a },
      { x: 78, z: -40, h: Math.PI, color: 0x8a8a8a },
      { x: -35, z: -120, h: Math.PI / 2, color: 0x4a2a6b },
      { x: 35, z: -90, h: 0, color: 0x2a2a5a },
      { x: 160, z: 100, h: Math.PI, color: 0x7a6a2a },
    ];
    spots.forEach(function (s) {
      var car = makeCar('parked', s.x, s.z, s.h, s.color, null);
      car.starter = !!s.starter;
      parked.push(car);
    });
  }

  // ---- Lalu lintas ----
  function updateTraffic(dt) {
    for (var i = 0; i < cars.length; i++) {
      var car = cars[i];
      if (car === playerCar) continue;
      // Mobil yang dipegang alat screenshot (speed 0 + target 0) tetap diam.
      var held = car.speed === 0 && car.targetSpeed === 0;
      var desired = held ? 0 : car.cruise;
      if (!held) {
        // Pelan bila ada mobil di depan pada jalur yang sama.
        for (var j = 0; j < cars.length; j++) {
          if (i === j) continue;
          var o = cars[j];
          if (!o.lane || !car.lane) continue;
          if (o.lane.vertical !== car.lane.vertical || o.lane.line !== car.lane.line || o.lane.dir !== car.lane.dir) continue;
          var along = car.lane.vertical ? (o.mesh.position.z - car.mesh.position.z) * car.lane.dir
            : (o.mesh.position.x - car.mesh.position.x) * car.lane.dir;
          if (along > 0 && along < 13) desired = Math.min(desired, o.speed);
        }
      }
      car.targetSpeed = desired;
      car.speed += (desired - car.speed) * Math.min(1, dt * 2.5);
      if (Math.abs(car.speed) < 0.05 && desired === 0) car.speed = 0;
      if (car.lane.vertical) {
        car.mesh.position.x = car.lane.line;
        car.mesh.position.z += car.lane.dir * car.speed * dt;
        if (car.mesh.position.z > 205) car.mesh.position.z = -205;
        if (car.mesh.position.z < -205) car.mesh.position.z = 205;
        car.heading = car.lane.dir > 0 ? 0 : Math.PI;
      } else {
        car.mesh.position.z = car.lane.line;
        car.mesh.position.x += car.lane.dir * car.speed * dt;
        if (car.mesh.position.x > 205) car.mesh.position.x = -205;
        if (car.mesh.position.x < -205) car.mesh.position.x = 205;
        car.heading = car.lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.mesh.rotation.y = car.heading;
    }
  }

  // Mobil terdekat (parkir atau lalu lintas) dalam radius tertentu.
  function nearestCar(x, z, radius) {
    var best = null, bestD = radius;
    function scan(list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c === playerCar) continue;
        var d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    scan(parked);
    scan(cars);
    return best ? { car: best, dist: bestD } : null;
  }

  window.NBVehicles = {
    cars: cars,
    parked: parked,
    playerCar: null,
    makeCarMesh: makeCarMesh,
    init: function (sc) {
      scene = sc;
      for (var i = 0; i < C.trafficCount; i++) cars.push(randomLaneCar(i));
      spawnParked();
    },
    update: function (dt) { updateTraffic(dt); },
    nearestCar: nearestCar,
    // Mobil yang sedang dikendarai pemain (null bila jalan kaki).
    getPlayerCar: function () { return playerCar; },
    setPlayerCar: function (c) { playerCar = c; this.playerCar = c; },
    // Fisika mobil pemain: dipanggil main.js tiap tick saat inCar.
    drivePlayerCar: function (car, input, dt, game) {
      var accel = 0;
      if (input.down('KeyW') || input.down('ArrowUp')) accel = C.carAccel;
      if (input.down('KeyS') || input.down('ArrowDown')) accel = -C.carAccel * 0.8;
      var handbrake = input.down('Space');
      if (handbrake) {
        car.speed -= car.speed * Math.min(1, dt * 4);
      } else {
        car.speed += accel * dt;
      }
      // Gesekan + batas kecepatan.
      car.speed -= car.speed * 0.12 * dt;
      if (car.speed > C.carTopSpeed) car.speed = C.carTopSpeed;
      if (car.speed < -C.carReverseSpeed) car.speed = -C.carReverseSpeed;
      if (Math.abs(car.speed) < 0.15 && accel === 0) car.speed = 0;
      // Belok (berbalik saat mundur).
      var steer = 0;
      if (input.down('KeyA') || input.down('ArrowLeft')) steer = 1;
      if (input.down('KeyD') || input.down('ArrowRight')) steer = -1;
      var spdFrac = Math.min(1, Math.abs(car.speed) / 10);
      car.heading += steer * C.carTurnRate * spdFrac * dt * (car.speed >= 0 ? 1 : -1);
      // Gerak + tabrakan gedung/laut (geser).
      var nx = car.mesh.position.x + Math.sin(car.heading) * car.speed * dt;
      var nz = car.mesh.position.z + Math.cos(car.heading) * car.speed * dt;
      var moved = window.NBWorld.slideMove(car.mesh.position.x, car.mesh.position.z, nx - car.mesh.position.x, nz - car.mesh.position.z, 1.4);
      var hitWall = Math.hypot(moved.x - nx, moved.z - nz) > 0.05;
      if (hitWall) {
        car.speed *= 0.45;
        if (Math.abs(car.speed) > 3) game.onCrash();
      }
      car.mesh.position.x = moved.x;
      car.mesh.position.z = moved.z;
      car.mesh.rotation.y = car.heading;
      return hitWall;
    },
    // Masuk/keluar mobil (dipanggil tombol E & NBGame.tryEnterCar).
    // Masuk mobil apa pun = mencuri: +1 wanted.
    tryEnterCar: function (game) {
      if (playerCar) {
        // Keluar: letakkan pemain di samping mobil.
        var car = playerCar;
        var px = car.mesh.position.x, pz = car.mesh.position.z;
        var lx = Math.cos(car.heading), lz = -Math.sin(car.heading);
        var spot = null;
        [[lx, lz], [-lx, -lz], [-Math.sin(car.heading), -Math.cos(car.heading)]].forEach(function (o) {
          if (spot) return;
          var cx = px + o[0] * 2.2, cz = pz + o[1] * 2.2;
          if (!window.NBWorld.isBlocked(cx, cz, 0.6)) spot = { x: cx, z: cz };
        });
        if (!spot) spot = { x: px + lx * 2.2, z: pz + lz * 2.2 };
        playerCar = null;
        this.playerCar = null;
        game.exitCar(spot.x, spot.z, car.heading);
        return { entered: false, x: spot.x, z: spot.z };
      }
      var near = nearestCar(game.playerPos.x, game.playerPos.z, C.carEnterRadius);
      if (!near) return null;
      var c = near.car;
      playerCar = c;
      this.playerCar = c;
      // Mobil lalu lintas yang dicuri berhenti jadi mobil parkir.
      if (c.kind === 'traffic') {
        var idx = cars.indexOf(c);
        if (idx >= 0) cars.splice(idx, 1);
        c.kind = 'parked';
        parked.push(c);
      }
      game.enterCar(c);
      return { entered: true, car: c };
    },
  };
})();
