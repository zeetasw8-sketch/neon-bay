// NEON BAY — pedestrians and mission thugs.
'use strict';
const NBPeople = {
  peds: [],
  thugs: [],

  makePersonMesh(shirt, pants, skin) {
    const g = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.22), pantsMat);
    legL.position.set(-0.14, 0.38, 0); g.add(legL);
    const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
    body.position.y = 1.12; body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skinMat);
    head.position.y = 1.72; head.castShadow = true; g.add(head);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), shirtMat);
    armL.position.set(-0.42, 1.12, 0); g.add(armL);
    const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
    g.userData.parts = { legL, legR, armL, armR };
    return g;
  },

  init(scene) {
    this.peds = []; this.thugs = [];
    const rng = NB_RNG(4242);
    const C = NB_CONFIG, step = C.blockSize + C.roadWidth, half = (C.blocks * step) / 2;
    const shirts = [0xe364a5, 0x2ec4b6, 0xffd94d, 0x7dff5e, 0xff7a59, 0x9a7bff, 0xffffff, 0x4a90d9];
    const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    for (let i = 0; i < C.pedCount; i++) {
      const mesh = this.makePersonMesh(
        shirts[Math.floor(rng() * shirts.length)], 0x2a2a3a,
        skins[Math.floor(rng() * skins.length)]);
      // Spawn on a sidewalk near a road
      const vertical = rng() < 0.5;
      const line = -half + Math.floor(rng() * (C.blocks + 1)) * step;
      const along = -half + 10 + rng() * (half * 2 - 20);
      const off = (rng() < 0.5 ? -1 : 1) * (C.roadWidth / 2 + 2.5);
      mesh.position.set(vertical ? line + off : along, 0, vertical ? along : line + off);
      mesh.rotation.y = rng() * Math.PI * 2;
      scene.add(mesh);
      this.peds.push({
        mesh, speed: 1.1 + rng() * 0.9, heading: rng() * Math.PI * 2,
        dirChange: 2 + rng() * 4, flee: 0, bob: rng() * 6,
        walkAxis: vertical ? 'z' : 'x',
      });
    }
  },

  spawnThugs(scene, x, z, n) {
    this.clearThugs();
    for (let i = 0; i < n; i++) {
      const mesh = this.makePersonMesh(0x1a1a1a, 0x1a1a1a, 0xe0ac69);
      // red bandana strip
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.54),
        new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      band.position.y = 1.86; mesh.add(band);
      mesh.position.set(x + (i - 1) * 4, 0, z + (i % 2) * 3);
      scene.add(mesh);
      this.thugs.push({ mesh, hp: 3, speed: 2.6, heading: 0, attackCd: 0, bob: i * 2,
        homeX: x + (i - 1) * 4, homeZ: z + (i % 2) * 3, wanderT: 0 });
    }
    return this.thugs;
  },
  clearThugs() {
    for (const t of this.thugs) NBWorld.scene.remove(t.mesh);
    this.thugs = [];
  },

  update(dt, playerPos, playerSpeed) {
    for (const p of this.peds) {
      // Flee if the player is close and fast (in a car) or recently violent
      const dx = p.mesh.position.x - playerPos.x, dz = p.mesh.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && playerSpeed > 6) p.flee = 2.5;
      if (p.flee > 0) {
        p.flee -= dt;
        p.heading = Math.atan2(dx, dz);
        p.speed = 4.2;
      } else {
        p.dirChange -= dt;
        if (p.dirChange <= 0) { p.dirChange = 2 + Math.random() * 4; p.heading += (Math.random() - 0.5) * 2.2; p.speed = 1.1 + Math.random() * 0.9; }
      }
      let nx = p.mesh.position.x + Math.sin(p.heading) * p.speed * dt;
      let nz = p.mesh.position.z + Math.cos(p.heading) * p.speed * dt;
      const hit = NBWorld.resolveCircle(nx, nz, 0.6);
      if (hit) { nx = hit.x; nz = hit.z; p.heading += Math.PI / 2; }
      const cl = NBWorld.clampBounds(nx, nz);
      p.mesh.position.x = cl.x; p.mesh.position.z = cl.z;
      p.mesh.rotation.y = p.heading;
      // walk bob
      p.bob += dt * p.speed * 4;
      const s = Math.sin(p.bob) * 0.35;
      const parts = p.mesh.userData.parts;
      parts.legL.rotation.x = s; parts.legR.rotation.x = -s;
      parts.armL.rotation.x = -s * 0.7; parts.armR.rotation.x = s * 0.7;
    }
    // Thugs chase and punch the player — but only once the player comes
    // to their turf (within ~35m of their post); otherwise they loiter.
    const game = window.NBGame;
    for (const t of this.thugs) {
      const dx = playerPos.x - t.mesh.position.x, dz = playerPos.z - t.mesh.position.z;
      const d = Math.hypot(dx, dz);
      t.attackCd -= dt;
      if (d > 35) {
        // loiter around home post
        t.wanderT -= dt;
        if (t.wanderT <= 0) { t.wanderT = 2 + Math.random() * 3; t.heading = Math.random() * Math.PI * 2; }
        const hx = t.mesh.position.x + Math.sin(t.heading) * 0.8 * dt;
        const hz = t.mesh.position.z + Math.cos(t.heading) * 0.8 * dt;
        if (Math.hypot(hx - t.homeX, hz - t.homeZ) < 10) { t.mesh.position.x = hx; t.mesh.position.z = hz; }
        t.mesh.rotation.y = t.heading;
        continue;
      }
      t.heading = Math.atan2(dx, dz);
      if (d > 1.6) {
        t.mesh.position.x += Math.sin(t.heading) * t.speed * dt;
        t.mesh.position.z += Math.cos(t.heading) * t.speed * dt;
      } else if (t.attackCd <= 0 && game && game.state === 'playing') {
        t.attackCd = 1.1;
        game.damagePlayer(8, 'thug');
        // punch anim
        t.mesh.userData.parts.armR.rotation.x = -1.4;
        setTimeout(() => { if (t.mesh.userData.parts) t.mesh.userData.parts.armR.rotation.x = 0; }, 180);
      }
      t.mesh.rotation.y = t.heading;
      t.bob += dt * 5;
      const s = Math.sin(t.bob) * 0.3;
      t.mesh.userData.parts.legL.rotation.x = s; t.mesh.userData.parts.legR.rotation.x = -s;
    }
  },
};
