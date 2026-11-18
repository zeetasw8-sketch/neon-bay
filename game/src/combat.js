// NEON BAY — combat: punch + pistol, raycast shooting, hit feedback.
'use strict';
const NBCombat = {
  hasGun: false,
  punchCd: 0, shootCd: 0,
  tracers: [],

  init() { this.hasGun = false; this.punchCd = 0; this.shootCd = 0; this.tracers = []; },

  // Called on mouse click while playing on foot.
  shoot(game) {
    if (!this.hasGun || this.shootCd > 0 || game.inCar) return;
    this.shootCd = 0.28;
    NBAudio.shoot();
    game.addWanted(1);
    const cam = game.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const origin = game.playerPos.clone(); origin.y = 1.5;
    // Find nearest thug / ped roughly along the aim ray
    let best = null, bestD = 60;
    const targets = [...NBPeople.thugs];
    for (const t of targets) {
      const tp = new THREE.Vector3(t.mesh.position.x, 1.3, t.mesh.position.z);
      const to = tp.clone().sub(origin);
      const along = to.dot(dir);
      if (along < 1 || along > bestD) continue;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp < 1.6) { best = t; bestD = along; }
    }
    this.spawnTracer(origin, dir, bestD);
    game.shake(0.08);
    if (best) {
      best.hp -= 1;
      game.toast(best.hp > 0 ? 'Hit!' : 'Thug down!');
      if (best.hp <= 0) {
        const i = NBPeople.thugs.indexOf(best);
        if (i >= 0) NBPeople.thugs.splice(i, 1);
        NBWorld.scene.remove(best.mesh);
        game.onThugDown();
      }
    }
  },

  punch(game) {
    if (this.punchCd > 0 || game.inCar) return;
    this.punchCd = 0.45;
    NBAudio.punch();
    const pp = game.playerPos;
    for (let i = NBPeople.thugs.length - 1; i >= 0; i--) {
      const t = NBPeople.thugs[i];
      const d = Math.hypot(t.mesh.position.x - pp.x, t.mesh.position.z - pp.z);
      if (d < 2.4) {
        t.hp -= 1;
        // knockback
        const dx = t.mesh.position.x - pp.x, dz = t.mesh.position.z - pp.z;
        const l = Math.hypot(dx, dz) || 1;
        t.mesh.position.x += (dx / l) * 1.6; t.mesh.position.z += (dz / l) * 1.6;
        if (t.hp <= 0) {
          NBPeople.thugs.splice(i, 1);
          NBWorld.scene.remove(t.mesh);
          game.onThugDown();
          game.toast('Thug down!');
        } else game.toast('Hit!');
      }
    }
    // Shoving a pedestrian counts as a crime
    for (const p of NBPeople.peds) {
      const d = Math.hypot(p.mesh.position.x - pp.x, p.mesh.position.z - pp.z);
      if (d < 2.2) { p.flee = 3; game.addWanted(1); }
    }
  },

  spawnTracer(origin, dir, len) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      origin, origin.clone().addScaledVector(dir, len)]);
    const line = new THREE.Line(geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    NBWorld.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  },

  update(dt) {
    this.punchCd = Math.max(0, this.punchCd - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { NBWorld.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
  },
};
