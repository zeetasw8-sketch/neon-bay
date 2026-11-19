// Neon Bay — the city: ground, buildings, roads, landmarks, props, sea.
// The city is a 5x5-block grid (400x400 m) at a static purple dusk.
// Static geometry is merged into a few draw calls; the ground is a single
// canvas texture (roads, sidewalks, lane marks, crosswalks in one plane).
// buildCity returns the world object the game loop and the other modules
// use: colliders, the objective beacon, landmark positions, spawn points.

// buildCity fills `scene` with the whole city and returns the world object.
function buildCity(scene) {
  NBWorld.scene = scene; // the shot tool stages cops through NBWorld.scene
  var world = {
    scene: scene,
    colliders: [],   // { x, z, hw, hd } rects and { x, z, r } circles
    beacon: null,    // the gold objective beam (moved by missions)
    beaconBase: null,
    garageDoor: null,
    bankDoor: null
  };

  makeSky(scene);
  makeGround(scene);
  makeSea(scene, world);
  makeBuildings(scene, world);
  makeGarage(scene, world);
  makeBank(scene, world);
  makeHospital(scene, world);
  makePier(scene, world);
  makeProps(scene, world);
  makeBeacon(scene, world);

  return world;
}

// makeSky sets the dusk background, fog and the two lights (hemi + sun).
function makeSky(scene) {
  var C = NBConfig;
  scene.background = new THREE.Color(C.sky);
  scene.fog = new THREE.Fog(C.fog, 120, 420);
  var hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, C.hemiIntensity);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(C.sunColor, C.sunIntensity);
  sun.position.set(C.sunPos.x, C.sunPos.y, C.sunPos.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.camera.far = 400;
  scene.add(sun);
  worldSun = sun;
}

// makeGround draws the whole 400x400 m ground (roads, sidewalks, lane
// markings, crosswalks, block pavement) onto one canvas texture and lays
// it on a single plane. 1 draw call for the entire street surface.
function makeGround(scene) {
  var S = 1024, m = S / 400; // pixels per metre
  var cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  var g = cv.getContext('2d');
  function px(x) { return (x + 200) * m; }
  // base: block pavement
  g.fillStyle = '#241f33'; g.fillRect(0, 0, S, S);
  // roads (both axes)
  g.fillStyle = '#17141f';
  NBConfig.roadAt.forEach(function (c) {
    g.fillRect(px(c - 7), 0, 14 * m, S);
    g.fillRect(0, px(c - 7), S, 14 * m);
  });
  // sidewalks: lighter strips hugging each road
  g.fillStyle = '#2e2942';
  NBConfig.roadAt.forEach(function (c) {
    g.fillRect(px(c - 9), 0, 2 * m, S);
    g.fillRect(px(c + 7), 0, 2 * m, S);
    g.fillRect(0, px(c - 9), S, 2 * m);
    g.fillRect(0, px(c + 7), S, 2 * m);
  });
  // centre dashed lines
  g.fillStyle = '#c9b458';
  NBConfig.roadAt.forEach(function (c) {
    for (var d = -195; d < 195; d += 10) {
      g.fillRect(px(d), px(c - 0.4), 5 * m, 0.8 * m);
      g.fillRect(px(c - 0.4), px(d), 0.8 * m, 5 * m);
    }
  });
  // crosswalks at every intersection
  g.fillStyle = '#cfc8e8';
  NBConfig.roadAt.forEach(function (a) {
    NBConfig.roadAt.forEach(function (b) {
      for (var i = -3; i <= 3; i++) {
        g.fillRect(px(a + i * 1.8 - 0.6), px(b - 6), 1.2 * m, 12 * m);
      }
    });
  });
  var tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// makeSea lays the dark water south of the sea wall (z > 206) and the
// concrete wall itself. The player can walk the pier, not swim.
function makeSea(scene, world) {
  var sea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 60),
    new THREE.MeshLambertMaterial({ color: 0x0d1b2e, emissive: 0x06101f })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.2, 236);
  scene.add(sea);
  var wall = new THREE.Mesh(
    new THREE.BoxGeometry(400, 1.2, 2),
    new THREE.MeshLambertMaterial({ color: 0x3a3348 })
  );
  wall.position.set(0, 0.6, 206);
  scene.add(wall);
  addRectCollider(world, 0, 206, 200, 1);
}

// makeWindowTexture draws one facade tile: dark wall, a grid of windows,
// some lit warm. The top-left corner is kept plain dark for roofs.
function makeWindowTexture() {
  var cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  var g = cv.getContext('2d');
  g.fillStyle = '#191423'; g.fillRect(0, 0, 128, 128);
  for (var row = 0; row < 8; row++) {
    for (var col = 0; col < 4; col++) {
      var lit = Math.random() < 0.42;
      g.fillStyle = lit ? '#ffd27a' : '#0a0a14';
      g.fillRect(10 + col * 30, 8 + row * 15, 18, 9);
    }
  }
  g.fillStyle = '#0d0b14'; g.fillRect(0, 0, 8, 8); // roof patch
  var tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// appendBox pushes one axis-aligned box into the growing merge arrays.
// uvSX/uvSY tile the window texture across the side faces; the top face
// maps to the plain roof patch. `tint` is an [r,g,b] facade colour.
function appendBox(arr, x, y, z, w, h, d, uvSX, uvSY, tint) {
  var x0 = x - w / 2, x1 = x + w / 2;
  var y0 = y, y1 = y + h;
  var z0 = z - d / 2, z1 = z + d / 2;
  // each face: 4 corners [pos, uv], normal
  var faces = [
    { n: [0, 0, 1], v: [[x0, y0, z1, 0, 0], [x1, y0, z1, uvSX, 0], [x1, y1, z1, uvSX, uvSY], [x0, y1, z1, 0, uvSY]] },
    { n: [0, 0, -1], v: [[x1, y0, z0, 0, 0], [x0, y0, z0, uvSX, 0], [x0, y1, z0, uvSX, uvSY], [x1, y1, z0, 0, uvSY]] },
    { n: [1, 0, 0], v: [[x1, y0, z1, 0, 0], [x1, y0, z0, uvSX, 0], [x1, y1, z0, uvSX, uvSY], [x1, y1, z1, 0, uvSY]] },
    { n: [-1, 0, 0], v: [[x0, y0, z0, 0, 0], [x0, y0, z1, uvSX, 0], [x0, y1, z1, uvSX, uvSY], [x0, y1, z0, 0, uvSY]] },
    { n: [0, 1, 0], v: [[x0, y1, z1, 0, 0], [x1, y1, z1, 0.06, 0], [x1, y1, z0, 0.06, 0.06], [x0, y1, z0, 0, 0.06]] },
    { n: [0, -1, 0], v: [[x0, y0, z0, 0, 0], [x1, y0, z0, 0.06, 0], [x1, y0, z1, 0.06, 0.06], [x0, y0, z1, 0, 0.06]] }
  ];
  faces.forEach(function (f) {
    var base = arr.pos.length / 3;
    f.v.forEach(function (p) {
      arr.pos.push(p[0], p[1], p[2]);
      arr.nor.push(f.n[0], f.n[1], f.n[2]);
      arr.uv.push(p[3], p[4]);
      arr.col.push(tint[0], tint[1], tint[2]);
    });
    arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
}

// makeBuildings fills every block with 2x2 buildings (merged into one
// geometry, one draw call) and adds neon signs to a few of them.
function makeBuildings(scene, world) {
  var tex = makeWindowTexture();
  var arr = { pos: [], nor: [], uv: [], col: [], idx: [] };
  var tints = [[0.75, 0.72, 0.85], [0.85, 0.75, 0.7], [0.7, 0.8, 0.85], [0.85, 0.8, 0.75], [0.65, 0.65, 0.8]];
  var centres = [-140, -70, 0, 70, 140];
  var skip = { '0,140': 1, '-70,-70': 1, '140,-70': 1 }; // landmark blocks
  centres.forEach(function (bx) {
    centres.forEach(function (bz) {
      if (skip[bx + ',' + bz]) return;
      [[-14, -14], [14, -14], [-14, 14], [14, 14]].forEach(function (off) {
        var w = 16 + Math.random() * 8, d = 16 + Math.random() * 8;
        var h = 9 + Math.random() * 26;
        var x = bx + off[0], z = bz + off[1];
        var tint = tints[Math.floor(Math.random() * tints.length)];
        appendBox(arr, x, 0, z, w, h, d, Math.max(1, w / 9), Math.max(1, h / 14), tint);
        addRectCollider(world, x, z, w / 2, d / 2);
      });
    });
  });
  // a few taller towers near the centre
  [[-35, -35], [35, 35], [0, -35]].forEach(function (p) {
    appendBox(arr, p[0], 0, p[1], 20, 42 + Math.random() * 12, 20, 2.2, 3.4, [0.8, 0.78, 0.9]);
    addRectCollider(world, p[0], p[1], 10, 10);
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(arr.nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(arr.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(arr.col, 3));
  geo.setIndex(arr.idx);
  var mat = new THREE.MeshLambertMaterial({
    map: tex, emissiveMap: tex, emissive: 0x8a7a5a, vertexColors: true
  });
  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  // neon signs: bright unlit planes on some facades
  var neonCols = [0x00e5ff, 0xff2ea6, 0xff9f1c, 0x7cff5e, 0xff5e5e];
  for (var i = 0; i < 26; i++) {
    var bx = centres[Math.floor(Math.random() * 5)];
    var bz = centres[Math.floor(Math.random() * 5)];
    var sign = new THREE.Mesh(
      new THREE.PlaneGeometry(6 + Math.random() * 6, 1.2),
      new THREE.MeshBasicMaterial({ color: neonCols[i % neonCols.length] })
    );
    sign.position.set(bx + (Math.random() - 0.5) * 30, 6 + Math.random() * 14, bz + 29);
    sign.rotation.y = Math.PI;
    scene.add(sign);
  }
}

// makeGarage builds the player's home base: a low warehouse with a big
// roller door facing the road, plus a glowing "GARAGE" sign.
function makeGarage(scene, world) {
  var C = NBConfig.garage;
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(C.w, 7, C.d),
    new THREE.MeshLambertMaterial({ color: 0x4a3f5e, emissive: 0x1a1426 })
  );
  body.position.y = 3.5; body.castShadow = true;
  g.add(body);
  var door = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x6b5a8a, emissive: 0x2a2040 })
  );
  door.position.set(0, 2.5, -C.d / 2 - 0.2);
  g.add(door);
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 2),
    new THREE.MeshBasicMaterial({ color: 0xffd27a })
  );
  sign.position.set(0, 6.2, -C.d / 2 - 0.5);
  sign.rotation.y = Math.PI;
  g.add(sign);
  g.position.set(C.x, 0, C.z);
  scene.add(g);
  world.garageDoor = { x: C.x, z: C.z - C.d / 2 };
  addRectCollider(world, C.x, C.z, C.w / 2, C.d / 2); // whole building solid
}

// makeBank builds the bank: a stone-clad block with columns and a gold
// "BANK" sign. The entrance faces south (toward the pickup at z -54).
function makeBank(scene, world) {
  var C = NBConfig.bank;
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(C.w, 12, C.d),
    new THREE.MeshLambertMaterial({ color: 0x8a7a5e, emissive: 0x2a2016 })
  );
  body.position.y = 6; body.castShadow = true;
  g.add(body);
  for (var i = -1; i <= 1; i++) {
    var col = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.2, 10, 8),
      new THREE.MeshLambertMaterial({ color: 0xb8a888 })
    );
    col.position.set(i * 8, 5, -C.d / 2 - 1.5);
    g.add(col);
  }
  var sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2),
    new THREE.MeshBasicMaterial({ color: 0xffd700 })
  );
  sign.position.set(0, 11, -C.d / 2 - 0.5);
  sign.rotation.y = Math.PI;
  g.add(sign);
  g.position.set(C.x, 0, C.z);
  scene.add(g);
  world.bankDoor = { x: C.x, z: C.z + C.d / 2 };
  addRectCollider(world, C.x, C.z, C.w / 2, C.d / 2);
}

// makeHospital builds the hospital: a white block with a red cross sign.
// The respawn point is the door on its north side.
function makeHospital(scene, world) {
  var x = NBConfig.hospital.x, z = NBConfig.hospital.z;
  var g = new THREE.Group();
  var body = new THREE.Mesh(
    new THREE.BoxGeometry(24, 14, 18),
    new THREE.MeshLambertMaterial({ color: 0xd8d4cc, emissive: 0x3a3640 })
  );
  body.position.y = 7; body.castShadow = true;
  g.add(body);
  var cross = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 })
  );
  cross.position.set(0, 12, -9.2);
  cross.rotation.y = Math.PI;
  g.add(cross);
  g.position.set(x, 0, z);
  scene.add(g);
  addRectCollider(world, x, z, 12, 9);
}

// makePier builds the wooden south pier: planks from the sea wall out to
// z 209, posts along the sides, and a small shack at the tip.
function makePier(scene, world) {
  var g = new THREE.Group();
  var deck = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.6, 20),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
  );
  deck.position.set(150, 0.4, 199);
  g.add(deck);
  for (var i = 0; i < 8; i++) {
    [-6.5, 6.5].forEach(function (dx) {
      var post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 1.6, 6),
        new THREE.MeshLambertMaterial({ color: 0x4a3220 })
      );
      post.position.set(150 + dx, 0.8, 191 + i * 2.4);
      g.add(post);
    });
  }
  var shack = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 5),
    new THREE.MeshLambertMaterial({ color: 0x3f5a6b, emissive: 0x14202a })
  );
  shack.position.set(150, 2, 207);
  g.add(shack);
  scene.add(g);
}

// makeProps scatters street lamps, palms, benches and hydrants along the
// roads. Each is a small circle collider.
function makeProps(scene, world) {
  var lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a33 });
  var lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  var trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3d24 });
  var leafMat = new THREE.MeshLambertMaterial({ color: 0x2e6b34, emissive: 0x0a2410 });
  for (var i = 0; i < 24; i++) {
    var road = NBConfig.roadAt[i % 6];
    var along = -180 + Math.floor(i / 6) * 90 + (i % 4) * 20;
    var px = (i % 2 === 0) ? road + 9 : along;
    var pz = (i % 2 === 0) ? along : road + 9;
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 6), lampMat);
    pole.position.set(px, 3, pz);
    scene.add(pole);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), lampHeadMat);
    head.position.set(px, 6.1, pz);
    scene.add(head);
    addCircleCollider(world, px, pz, 0.3);
  }
  for (var j = 0; j < 14; j++) {
    var tx = -170 + j * 26, tz = (j % 2 === 0) ? 196 : -196;
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.set(tx, 3.5, tz);
    scene.add(trunk);
    var crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3, 7), leafMat);
    crown.position.set(tx, 8, tz);
    scene.add(crown);
    addCircleCollider(world, tx, tz, 0.5);
  }
  for (var k = 0; k < 8; k++) {
    var bx = -140 + k * 40, bz = (k % 2 === 0) ? 44 : -44;
    var bench = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.5, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x7a5a34 })
    );
    bench.position.set(bx, 0.5, bz);
    scene.add(bench);
    addCircleCollider(world, bx, bz, 1.2);
  }
  for (var h = 0; h < 6; h++) {
    var hx = -105 + h * 42, hz = (h % 2 === 0) ? 112 : -112;
    var hyd = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 1, 8),
      new THREE.MeshLambertMaterial({ color: 0xd23c2e, emissive: 0x3a0a06 })
    );
    hyd.position.set(hx, 0.5, hz);
    scene.add(hyd);
    addCircleCollider(world, hx, hz, 0.5);
  }
}

// makeBeacon creates the gold objective beam: a tall translucent cylinder
// plus a glowing base disc. Missions move it; the HUD points at it.
function makeBeacon(scene, world) {
  var beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.2, 70, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd700, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  beam.position.y = 35;
  scene.add(beam);
  var base = new THREE.Mesh(
    new THREE.CircleGeometry(3, 20),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.55 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.1;
  scene.add(base);
  world.beacon = beam;
  world.beaconBase = base;
}

// addRectCollider registers an axis-aligned box collider.
function addRectCollider(world, x, z, hw, hd) {
  world.colliders.push({ x: x, z: z, hw: hw, hd: hd });
}

// addCircleCollider registers a circle collider.
function addCircleCollider(world, x, z, r) {
  world.colliders.push({ x: x, z: z, r: r });
}

// collides reports whether a circle at (x, z) with radius r overlaps any
// collider (rect or circle). Used by the player, cars, cops and thugs.
function collides(world, x, z, r) {
  for (var i = 0; i < world.colliders.length; i++) {
    var c = world.colliders[i];
    if (c.r !== undefined) {
      var dx = x - c.x, dz = z - c.z, rr = r + c.r;
      if (dx * dx + dz * dz < rr * rr) return true;
    } else {
      var cx = Math.max(c.x - c.hw, Math.min(x, c.x + c.hw));
      var cz = Math.max(c.z - c.hd, Math.min(z, c.z + c.hd));
      var ddx = x - cx, ddz = z - cz;
      if (ddx * ddx + ddz * ddz < r * r) return true;
    }
  }
  return false;
}

// clampToCity keeps a position inside the playable area: the 400x400 m
// city, the sea wall at z 206, and the pier corridor to z 209.
function clampToCity(x, z) {
  var cx = Math.max(-198, Math.min(198, x));
  var cz = Math.max(-198, Math.min(198, z));
  if (cz > 206) {
    if (cx >= NBConfig.pierMinX && cx <= NBConfig.pierMaxX) cz = Math.min(cz, NBConfig.pierTipZ);
    else cz = 206;
  }
  return { x: cx, z: cz };
}

// randomRoadPoint returns a random point on a random road (for spawns).
function randomRoadPoint() {
  var road = NBConfig.roadAt[Math.floor(Math.random() * NBConfig.roadAt.length)];
  var along = -180 + Math.random() * 360;
  if (Math.random() < 0.5) return { x: along, z: road };
  return { x: road, z: along };
}

// moveBeacon places the gold beam (and its base disc) at (x, z).
function moveBeacon(world, x, z) {
  world.beacon.position.x = x;
  world.beacon.position.z = z;
  world.beaconBase.position.x = x;
  world.beaconBase.position.z = z;
}

// moveSunWithPlayer keeps the 1024 shadow map centred on the player so
// shadows stay crisp wherever the player goes.
function moveSunWithPlayer(player) {
  if (!worldSun) return;
  worldSun.position.set(player.x + 60, 40, player.z - 80);
  worldSun.target.position.set(player.x, 0, player.z);
  worldSun.target.updateMatrixWorld();
}

var worldSun = null;

window.NBWorld = {
  buildCity: buildCity,
  collides: collides,
  clampToCity: clampToCity,
  randomRoadPoint: randomRoadPoint,
  moveBeacon: moveBeacon,
  moveSunWithPlayer: moveSunWithPlayer,
  addRectCollider: addRectCollider,
  addCircleCollider: addCircleCollider
};
