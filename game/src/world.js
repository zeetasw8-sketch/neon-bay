// Neon Bay — dunia: kota 5x5 blok, dermaga, laut, langit senja, beacon.
// Semua geometri statis digabung per kelompok supaya draw call sedikit
// (menu < 100). Tabrakan gedung = AABB; laut dibatasi dinding pantai
// kecuali koridor dermaga.
(function () {
  'use strict';

  var C = window.NB_CONFIG;
  var scene = null;
  var beacon = null;
  var buildings = []; // AABB {minX,maxX,minZ,maxZ} untuk tabrakan
  var rngState = 1234567;

  function rng() {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  }
  function rr(a, b) { return a + rng() * (b - a); }
  function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

  // Gabung banyak BufferGeometry berindeks jadi satu (posisi+normal+warna).
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

  // Kotak berwarna di posisi tertentu (boleh diputar pada sumbu Y).
  function coloredBox(w, h, d, color, x, y, z, ry) {
    var g = new THREE.BoxGeometry(w, h, d);
    var q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0);
    var m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    var c = new THREE.Color(color);
    var n = g.attributes.position.count;
    var arr = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }

  // Silinder berwarna (untuk tiang lampu / pohon).
  function coloredCyl(rt, rb, h, color, x, y, z, seg) {
    var g = new THREE.CylinderGeometry(rt, rb, h, seg || 6);
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

  // ---- Tekstur tanah (digambar di canvas, 1 draw call) ----
  function makeGroundTexture() {
    var cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 1024;
    var g = cv.getContext('2d');
    var sx = 1024 / 420, sy = 1024 / 416;
    var X = function (x) { return (x + 210) * sx; };
    var Z = function (z) { return (z + 210) * sy; };
    // Dasar: beton plaza gelap.
    g.fillStyle = '#38344a';
    g.fillRect(0, 0, 1024, 1024);
    // Variasi blok: petak-petak beton sedikit berbeda.
    var shades = ['#3a3648', '#353145', '#3e3a4e', '#322f42'];
    var vx = [-160, -80, -35, 0, 35, 80, 160];
    var vz = [-160, -95, 0, 80, 160];
    var i, j;
    for (i = 0; i < vx.length - 1; i++) {
      for (j = 0; j < vz.length - 1; j++) {
        g.fillStyle = shades[(i * 7 + j * 3) % shades.length];
        g.fillRect(X(vx[i] + 6), Z(vz[j] + 6), (vx[i + 1] - vx[i] - 12) * sx, (vz[j + 1] - vz[j] - 12) * sy);
      }
    }
    // Jalan aspal.
    g.fillStyle = '#221f2b';
    vx.forEach(function (x) { g.fillRect(X(x - 6), 0, 12 * sx, 1024); });
    vz.forEach(function (z) { g.fillRect(0, Z(z - 6), 1024, 12 * sy); });
    // Garis tengah jalan (putus-putus kuning).
    g.fillStyle = '#c9a227';
    vx.forEach(function (x) {
      for (var z = -205; z < 205; z += 14) g.fillRect(X(x) - 1, Z(z), 2, 7 * sy);
    });
    vz.forEach(function (z) {
      for (var x = -205; x < 205; x += 14) g.fillRect(X(x), Z(z) - 1, 7 * sx, 2);
    });
    // Trotoar: tepi terang di sepanjang jalan.
    g.fillStyle = '#4a4560';
    vx.forEach(function (x) {
      g.fillRect(X(x - 8), 0, 2 * sx, 1024);
      g.fillRect(X(x + 6), 0, 2 * sx, 1024);
    });
    vz.forEach(function (z) {
      g.fillRect(0, Z(z - 8), 1024, 2 * sy);
      g.fillRect(0, Z(z + 6), 1024, 2 * sy);
    });
    // Zebra cross di persimpangan utama.
    g.fillStyle = '#d8d8e0';
    [[0, 0], [0, 80], [35, 0], [-35, 80], [80, 0]].forEach(function (p) {
      for (var k = -5; k <= 5; k += 2) g.fillRect(X(p[0] + k) - 1, Z(p[1] - 5), 1.2 * sx, 10 * sy);
    });
    // Pantai: pasir di tepi selatan.
    g.fillStyle = '#b89a5e';
    g.fillRect(0, Z(196), 1024, (206 - 196) * sy);
    g.fillStyle = '#c9ab6e';
    for (var s = 0; s < 40; s++) {
      g.fillRect(X(rr(-205, 205)), Z(rr(196, 205)), 3, 2);
    }
    var tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4;
    return tex;
  }

  // ---- Langit senja (kubah gradien) ----
  function makeSkyTexture() {
    var cv = document.createElement('canvas');
    cv.width = 16; cv.height = 256;
    var g = cv.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#160a2e');
    grad.addColorStop(0.45, '#3a1c63');
    grad.addColorStop(0.72, '#8a2f7d');
    grad.addColorStop(0.88, '#ff7a4d');
    grad.addColorStop(1.0, '#ffb35c');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 256);
    var tex = new THREE.CanvasTexture(cv);
    return tex;
  }

  function addBuilding(x, z, w, d, h, color) {
    buildings.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return { x: x, z: z, w: w, d: d, h: h, color: color };
  }

  function buildCity() {
    var bodyGeoms = [], winGeoms = [], neonGeoms = [];
    var palette = [0x4a3f6b, 0x5a4a7a, 0x3d3558, 0x6b4a5a, 0x44506b, 0x54406b];
    var neonCols = [0xff2d95, 0x00e5ff, 0xffb300, 0x7dff9a];
    var placed = [];

    // Zona larangan: jangan ada gedung acak di sini.
    var keepOut = [
      { x: 0, z: 120, r: 30 },      // garasi + halaman
      { x: -58, z: -64, r: 26 },    // bank
      { x: 140, z: 140, r: 24 },    // rumah sakit
      { x: 150, z: 190, r: 22 },    // pendekatan dermaga
      { x: 0, z: -150, r: 18 },     // pembeli misi 2
      { x: 10, z: 144, r: 10 },     // mobil starter
      { x: 0, z: 120, r: 8 },
    ];
    function clearOf(x, z, r) {
      for (var i = 0; i < keepOut.length; i++) {
        var k = keepOut[i];
        if (Math.hypot(x - k.x, z - k.z) < r + k.r) return false;
      }
      return true;
    }

    // Gedung acak per blok (di antara jalan). vx/vz = tepi-tepi strip jalan,
    // jadi interval GENAP adalah blok, interval GANJIL adalah jalan itu sendiri.
    var vx = [-210, -166, -154, -86, -74, -41, -29, -6, 6, 29, 41, 74, 86, 154, 166, 210];
    var vz = [-210, -166, -154, -101, -89, -6, 74, 154, 210];
    for (var bi = 0; bi < vx.length - 1; bi += 2) {
      for (var bj = 0; bj < vz.length - 1; bj += 2) {
        var x0 = vx[bi] + 4, x1 = vx[bi + 1] - 4;
        var z0 = vz[bj] + 4, z1 = vz[bj + 1] - 4;
        if (x1 - x0 < 14 || z1 - z0 < 14) continue;
        if (z0 > 190) continue; // pantai selatan tetap kosong
        var count = (x1 - x0) * (z1 - z0) > 900 ? 2 : 1;
        for (var n = 0; n < count; n++) {
          var w = rr(10, Math.min(22, x1 - x0 - 4));
          var d = rr(10, Math.min(22, z1 - z0 - 4));
          var x = rr(x0 + w / 2, x1 - w / 2);
          var z = rr(z0 + d / 2, z1 - d / 2);
          if (!clearOf(x, z, Math.max(w, d) / 2 + 2)) continue;
          var h = rr(8, 30);
          var col = pick(palette);
          placed.push(addBuilding(x, z, w, d, h, col));
        }
      }
    }

    // Landmark: garasi (teal, atap neon hijau), bank (biru tua, kolom),
    // rumah sakit (putih, salib merah di atap).
    var garage = addBuilding(16, 120, 18, 14, 7, 0x2a6b5e);
    placed.push(garage);
    var bank = addBuilding(-58, -64, 22, 14, 16, 0x2c3e6b);
    placed.push(bank);
    var hospital = addBuilding(140, 140, 20, 18, 14, 0xd8d8e0);
    placed.push(hospital);

    placed.forEach(function (b) {
      bodyGeoms.push(coloredBox(b.w, b.h, b.d, b.color, b.x, b.h / 2, b.z, 0));
      // Atap: strip neon di tepi.
      var nc = pick(neonCols);
      neonGeoms.push(coloredBox(b.w + 0.4, 0.5, 0.8, nc, b.x, b.h + 0.25, b.z - b.d / 2, 0));
      neonGeoms.push(coloredBox(b.w + 0.4, 0.5, 0.8, nc, b.x, b.h + 0.25, b.z + b.d / 2, 0));
      // Jendela menyala di fasad selatan + timur + utara + barat.
      var cols = Math.max(2, Math.floor(b.w / 3.4));
      var rows = Math.max(1, Math.floor(b.h / 4.2));
      var lit = 0xffd98a, dark = 0x2a2438;
      for (var f = 0; f < 4; f++) {
        for (var cx = 0; cx < cols; cx++) {
          for (var ry = 0; ry < rows; ry++) {
            var wx = b.x - b.w / 2 + (cx + 0.5) * (b.w / cols);
            var wy = 2.2 + ry * 4.2;
            var wz = b.z - b.d / 2 + (cx + 0.5) * (b.d / cols);
            var on = rng() < 0.6;
            var col = on ? lit : dark;
            var off = 0.08;
            if (f === 0) winGeoms.push(coloredBox(1.3, 1.7, 0.1, col, wx, wy, b.z + b.d / 2 + off, 0));
            else if (f === 1) winGeoms.push(coloredBox(1.3, 1.7, 0.1, col, wx, wy, b.z - b.d / 2 - off, 0));
            else if (f === 2) winGeoms.push(coloredBox(0.1, 1.7, 1.3, col, b.x + b.w / 2 + off, wy, wz, 0));
            else winGeoms.push(coloredBox(0.1, 1.7, 1.3, col, b.x - b.w / 2 - off, wy, wz, 0));
          }
        }
      }
    });

    var lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    var basic = new THREE.MeshBasicMaterial({ vertexColors: true });
    var cityMesh = new THREE.Mesh(mergeGeoms(bodyGeoms), lambert);
    cityMesh.castShadow = true;
    cityMesh.receiveShadow = true;
    scene.add(cityMesh);
    scene.add(new THREE.Mesh(mergeGeoms(winGeoms), basic));
    scene.add(new THREE.Mesh(mergeGeoms(neonGeoms), basic));

    // Salib merah di atap rumah sakit (landmark).
    var crossGeoms = [
      coloredBox(6, 1.2, 1.6, 0xff3b3b, 140, 15.2, 140, 0),
      coloredBox(1.6, 1.2, 6, 0xff3b3b, 140, 15.2, 140, 0),
    ];
    scene.add(new THREE.Mesh(mergeGeoms(crossGeoms), basic));
    // Papan BANK (kotak biru terang di fasad).
    var signGeoms = [coloredBox(10, 2.4, 0.3, 0x5aa2ff, -58, 10, -56.8, 0)];
    scene.add(new THREE.Mesh(mergeGeoms(signGeoms), basic));
  }

  function buildStreetProps() {
    var poleGeoms = [], lampGeoms = [], treeGeoms = [];
    // Lampu jalan di sepanjang jalan, tiap ~32 m, selang-seling sisi.
    var roads = [];
    C.verticalRoads.forEach(function (x) { roads.push({ v: true, line: x }); });
    C.horizontalRoads.forEach(function (z) { roads.push({ v: false, line: z }); });
    roads.forEach(function (r, ri) {
      for (var t = -190; t <= 190; t += 32) {
        var off = (ri % 2 === 0 ? 7.5 : -7.5);
        var px, pz;
        if (r.v) { px = r.line + off; pz = t + (ri % 2) * 16; }
        else { px = t + (ri % 2) * 16; pz = r.line + off; }
        if (pz > 194 || Math.abs(px) > 205) continue;
        poleGeoms.push(coloredCyl(0.09, 0.12, 6, 0x2a2a33, px, 3, pz, 6));
        lampGeoms.push(coloredBox(0.7, 0.25, 0.7, 0xffe9b0, px, 6.1, pz, 0));
      }
    });
    // Pohon palem di pantai + beberapa blok.
    for (var i = 0; i < 22; i++) {
      var tx = rr(-200, 200);
      var tz = i < 12 ? rr(186, 202) : rr(-190, 170);
      if (Math.abs(tx) < 8 && Math.abs(tz - 120) < 30) continue;
      treeGeoms.push(coloredCyl(0.18, 0.3, 5, 0x6b4a2a, tx, 2.5, tz, 6));
      treeGeoms.push(coloredCyl(0.05, 2.2, 1.6, 0x2a7a3a, tx, 5.8, tz, 6));
      treeGeoms.push(coloredBox(3.4, 0.3, 1.2, 0x2a7a3a, tx, 5.6, tz, rr(0, 3)));
    }
    var lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    var basic = new THREE.MeshBasicMaterial({ vertexColors: true });
    scene.add(new THREE.Mesh(mergeGeoms(poleGeoms), lambert));
    scene.add(new THREE.Mesh(mergeGeoms(lampGeoms), basic));
    scene.add(new THREE.Mesh(mergeGeoms(treeGeoms), lambert));
  }

  function buildPier() {
    var geoms = [];
    // Dek kayu dermaga (x 143..157, z 198..209).
    geoms.push(coloredBox(14, 0.5, 12, 0x8a6a42, 150, 0.1, 203.5, 0));
    for (var i = 0; i < 6; i++) {
      geoms.push(coloredCyl(0.25, 0.25, 2.4, 0x5a4028, 144 + i * 2.4, -0.8, 200, 6));
      geoms.push(coloredCyl(0.25, 0.25, 2.4, 0x5a4028, 144 + i * 2.4, -0.8, 208, 6));
    }
    // Tiang lampu dermaga.
    geoms.push(coloredCyl(0.1, 0.12, 5, 0x2a2a33, 145, 2.5, 206, 6));
    var lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
    scene.add(new THREE.Mesh(mergeGeoms(geoms), lambert));
    var basic = new THREE.MeshBasicMaterial({ vertexColors: true });
    scene.add(new THREE.Mesh(mergeGeoms([
      coloredBox(0.7, 0.25, 0.7, 0xffe9b0, 145, 5.1, 206, 0),
    ]), basic));
  }

  function buildBeacon() {
    var geo = new THREE.CylinderGeometry(C.beaconTopR, C.beaconBottomR, C.beaconHeight, 16, 1, true);
    var mat = new THREE.MeshBasicMaterial({
      color: C.beaconColor,
      transparent: true,
      opacity: C.beaconOpacity,
      blending: THREE.NormalBlending,
      depthTest: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    beacon = new THREE.Mesh(geo, mat);
    beacon.position.set(C.pier.x, C.beaconHeight / 2, C.pier.z);
    beacon.renderOrder = 999;
    beacon.visible = true;
    scene.add(beacon);
  }

  function build() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2b1748);
    scene.fog = new THREE.Fog(0x3a1f5c, 120, 520);

    // Langit senja: kubah gradien.
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(760, 24, 16),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), side: THREE.BackSide, fog: false })
    );
    scene.add(sky);
    // Matahari terbenam di barat.
    var sun = new THREE.Mesh(
      new THREE.CircleGeometry(34, 32),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a, fog: false })
    );
    sun.position.set(-520, 70, -260);
    sun.lookAt(0, 20, 0);
    scene.add(sun);
    var glow = new THREE.Mesh(
      new THREE.CircleGeometry(70, 32),
      new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.25, fog: false })
    );
    glow.position.set(-522, 70, -262);
    glow.lookAt(0, 20, 0);
    scene.add(glow);

    // Cahaya: hemisphere + matahari (bayangan 1024, area sempit).
    var hemi = new THREE.HemisphereLight(0x8a5ac0, 0x1a1426, 1.05);
    scene.add(hemi);
    var sunLight = new THREE.DirectionalLight(0xffb37a, 1.9);
    sunLight.position.set(120, 140, -80);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.left = -170;
    sunLight.shadow.camera.right = 170;
    sunLight.shadow.camera.top = 170;
    sunLight.shadow.camera.bottom = -170;
    sunLight.shadow.camera.far = 500;
    scene.add(sunLight);
    // Dua lampu titik di garasi + dermaga (suasana malam).
    var p1 = new THREE.PointLight(0xffb300, 0.7, 40);
    p1.position.set(0, 8, 120);
    scene.add(p1);
    var p2 = new THREE.PointLight(0x5aa2ff, 0.6, 36);
    p2.position.set(150, 8, 196);
    scene.add(p2);

    // Tanah (tekstur canvas) + laut.
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 416),
      new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -2);
    ground.receiveShadow = true;
    scene.add(ground);
    var sea = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 700),
      new THREE.MeshLambertMaterial({ color: 0x14406e })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.35, 206 + 350);
    scene.add(sea);

    buildCity();
    buildStreetProps();
    buildPier();
    buildBeacon();
  }

  // ---- Tabrakan ----
  function blockedAt(x, z, radius) {
    var r = radius || 0.5;
    if (x < -C.worldHalf + r || x > C.worldHalf - r) return true;
    if (z < -C.worldHalf + r || z > C.pierZ + r) return true;
    if (z > C.seaZ) {
      // Di laut: hanya koridor dermaga yang boleh.
      if (x < C.pierX0 || x > C.pierX1) return true;
    }
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  }

  // Gerak dengan geser di dinding (sumbu dipisah): kembalikan posisi baru.
  function slideMove(x, z, dx, dz, radius) {
    var nx = x, nz = z;
    if (dx !== 0 && !blockedAt(x + dx, z, radius)) nx = x + dx;
    if (dz !== 0 && !blockedAt(nx, z + dz, radius)) nz = z + dz;
    // Jepit ke darat (jangan sampai lolos karena pembulatan).
    if (nz > C.seaZ && (nx < C.pierX0 || nx > C.pierX1)) nz = C.seaZ;
    if (nz > C.pierZ) nz = C.pierZ;
    nx = Math.max(-C.worldHalf + 0.5, Math.min(C.worldHalf - 0.5, nx));
    nz = Math.max(-C.worldHalf + 0.5, Math.min(C.pierZ, nz));
    return { x: nx, z: nz };
  }

  window.NBWorld = {
    scene: null,
    beacon: null,
    buildings: buildings,
    build: function () {
      build();
      this.scene = scene;
      this.beacon = beacon;
    },
    isBlocked: blockedAt,
    slideMove: slideMove,
    setObjective: function (x, z) {
      if (x === null || x === undefined) { beacon.visible = false; return; }
      beacon.visible = true;
      beacon.position.set(x, C.beaconHeight / 2, z);
    },
    // Fade beacon berdasar jarak KAMERA ke tiang (0 <=12 m, penuh >=47 m).
    updateBeaconFade: function (camX, camZ) {
      if (!beacon || !beacon.visible) return;
      var d = Math.hypot(camX - beacon.position.x, camZ - beacon.position.z);
      var t = (d - C.beaconFadeNear) / (C.beaconFadeFar - C.beaconFadeNear);
      t = Math.max(0, Math.min(1, t));
      beacon.material.opacity = C.beaconOpacity * t;
    },
    objectivePos: function () {
      return beacon ? { x: beacon.position.x, z: beacon.position.z } : { x: C.pier.x, z: C.pier.z };
    },
  };
})();
