// Neon Bay — kendaraan: rendering InstancedMesh + AI lalu lintas (v3, dari nol).
// Semua mobil (lalu lintas, parkir, pemain, polisi) digambar lewat segelintir
// InstancedMesh: bodi, kaca, bumper, roda, lampu depan/belakang, bilah polisi.
// Lalu lintas mengikuti graf simpul jalan (persimpangan), melambat bila mobil
// pemain tepat di depan.

const THREE = window.THREE;

import { WORLD, TRAFFIC, STARTER_CAR } from './config.js';

const MAX_CARS = 40;
const WHEELS_PER_CAR = 4;

function mergeBoxes(boxes) {
  // boxes: [{cx,cy,cz,sx,sy,sz}] -> BufferGeometry gabungan (tanpa warna/uv).
  const pos = [], nor = [], idx = [];
  let v = 0;
  for (const b of boxes) {
    const x0 = b.cx - b.sx / 2, x1 = b.cx + b.sx / 2;
    const y0 = b.cy - b.sy / 2, y1 = b.cy + b.sy / 2;
    const z0 = b.cz - b.sz / 2, z1 = b.cz + b.sz / 2;
    const faces = [
      { v: [[x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [x1, y0, z0]], n: [1, 0, 0] },
      { v: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], n: [-1, 0, 0] },
      { v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], n: [0, 1, 0] },
      { v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], n: [0, -1, 0] },
      { v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: [0, 0, 1] },
      { v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: [0, 0, -1] },
    ];
    for (const f of faces) {
      for (const p of f.v) { pos.push(p[0], p[1], p[2]); nor.push(f.n[0], f.n[1], f.n[2]); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

// Satu mobil = satu record; fleet menulis matriks instance tiap frame.
export class VehicleFleet {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    const bodyGeo = new THREE.BoxGeometry(2.0, 0.9, 4.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.body = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_CARS);
    this.body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.body.castShadow = true;
    scene.add(this.body);

    const glassGeo = new THREE.BoxGeometry(1.7, 0.65, 2.1);
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ff });
    this.glass = new THREE.InstancedMesh(glassGeo, glassMat, MAX_CARS);
    this.glass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.glass);

    // Atap sewarna bodi (di atas kaca).
    const roofGeo = new THREE.BoxGeometry(1.6, 0.14, 1.9);
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.roof = new THREE.InstancedMesh(roofGeo, roofMat, MAX_CARS);
    this.roof.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.roof);

    const bumperGeo = mergeBoxes([
      { cx: 0, cy: 0.32, cz: 2.22, sx: 2.0, sy: 0.28, sz: 0.18 },
      { cx: 0, cy: 0.32, cz: -2.22, sx: 2.0, sy: 0.28, sz: 0.18 },
    ]);
    const bumperMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e });
    this.bumper = new THREE.InstancedMesh(bumperGeo, bumperMat, MAX_CARS);
    this.bumper.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.bumper);

    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141416 });
    this.wheels = new THREE.InstancedMesh(wheelGeo, wheelMat, MAX_CARS * WHEELS_PER_CAR);
    this.wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wheels.castShadow = true;
    scene.add(this.wheels);

    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    this.hubs = new THREE.InstancedMesh(hubGeo, hubMat, MAX_CARS * WHEELS_PER_CAR);
    this.hubs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.hubs);

    const frontGeo = mergeBoxes([
      { cx: -0.62, cy: 0.78, cz: 2.24, sx: 0.5, sy: 0.22, sz: 0.1 },
      { cx: 0.62, cy: 0.78, cz: 2.24, sx: 0.5, sy: 0.22, sz: 0.1 },
    ]);
    const frontMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    this.frontLights = new THREE.InstancedMesh(frontGeo, frontMat, MAX_CARS);
    this.frontLights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.frontLights);

    const rearGeo = mergeBoxes([
      { cx: -0.62, cy: 0.78, cz: -2.24, sx: 0.5, sy: 0.22, sz: 0.1 },
      { cx: 0.62, cy: 0.78, cz: -2.24, sx: 0.5, sy: 0.22, sz: 0.1 },
    ]);
    const rearMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    this.rearLights = new THREE.InstancedMesh(rearGeo, rearMat, MAX_CARS);
    this.rearLights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.rearLights);

    const barGeo = new THREE.BoxGeometry(1.3, 0.28, 0.55);
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.lightBar = new THREE.InstancedMesh(barGeo, barMat, MAX_CARS);
    this.lightBar.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.lightBar);

    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._red = new THREE.Color(0xff2222);
    this._blue = new THREE.Color(0x2266ff);
    this._tmpColor = new THREE.Color();
  }

  add(rec) {
    if (this.cars.length >= MAX_CARS) return null;
    rec.fleetIndex = this.cars.length;
    rec.wheelSpin = 0;
    // Flag jenis untuk pemanggil (herd shot, alat tes): kind tetap sumber utama.
    rec.traffic = rec.kind === 'traffic';
    rec.parkedCar = rec.kind === 'parked';
    rec.policeCar = rec.kind === 'police';
    // Objek 3D pendamping (bukan dirender): alat tes membaca car.mesh.position.
    rec.mesh = new THREE.Object3D();
    rec.mesh.position.set(rec.x, 0.62, rec.z);
    rec._meshX = rec.x; rec._meshZ = rec.z;
    // Posisi hidup: car.pos[0]/[1] = x/z; car.pos.set(x, y, z) memindahkan mobil.
    const r = rec;
    const pos = [r.x, r.z];
    Object.defineProperties(pos, {
      0: { get: () => r.x, set: (v) => { r.x = v; }, enumerable: true, configurable: true },
      1: { get: () => r.z, set: (v) => { r.z = v; }, enumerable: true, configurable: true },
      x: { get: () => r.x, set: (v) => { r.x = v; }, enumerable: true, configurable: true },
      y: { get: () => 0.62, set: () => {}, enumerable: true, configurable: true },
      z: { get: () => r.z, set: (v) => { r.z = v; }, enumerable: true, configurable: true },
    });
    pos.set = (x, y, z) => { r.x = x; r.z = (z !== undefined ? z : (y !== undefined ? y : r.z)); };
    pos.clone = () => [r.x, r.z];
    rec.pos = pos;
    this.cars.push(rec);
    this.body.setColorAt(rec.fleetIndex, this._tmpColor.setHex(rec.color));
    this.roof.setColorAt(rec.fleetIndex, this._tmpColor.setHex(rec.color));
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.roof.instanceColor) this.roof.instanceColor.needsUpdate = true;
    return rec;
  }

  remove(rec) {
    const i = this.cars.indexOf(rec);
    if (i < 0) return;
    const last = this.cars.pop();
    if (i < this.cars.length) {
      this.cars[i] = last;
      last.fleetIndex = i;
      this.body.setColorAt(i, this._tmpColor.setHex(last.color));
      this.roof.setColorAt(i, this._tmpColor.setHex(last.color));
      if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
      if (this.roof.instanceColor) this.roof.instanceColor.needsUpdate = true;
    }
    rec.fleetIndex = -1;
  }

  _carMatrix(rec, yOff, out) {
    this._e.set(0, rec.heading, 0);
    this._q.setFromEuler(this._e);
    this._v.set(rec.x, yOff, rec.z);
    out.compose(this._v, this._q, this._s);
    return out;
  }

  sync(time, dt = 0.016) {
    const n = this.cars.length;
    for (let i = 0; i < n; i++) {
      const c = this.cars[i];
      // Bila ada yang menggeser mesh dari luar (alat tes teleport), ikuti posisinya.
      if (c.mesh.position.x !== c._meshX || c.mesh.position.z !== c._meshZ) {
        c.x = c.mesh.position.x; c.z = c.mesh.position.z;
      }
      c.mesh.position.set(c.x, 0.62, c.z);
      c._meshX = c.x; c._meshZ = c.z;
      c.mesh.rotation.y = c.heading;
      this._carMatrix(c, 0.62, this._m);
      this.body.setMatrixAt(i, this._m);
      this._carMatrix(c, 1.38, this._m);
      // Kaca agak ke belakang (z lokal -0.25): geser sebelum rotasi.
      this._m2.makeTranslation(0, 0, -0.25);
      this._m.multiply(this._m2);
      this.glass.setMatrixAt(i, this._m);
      this._carMatrix(c, 1.76, this._m);
      this._m2.makeTranslation(0, 0, -0.2);
      this._m.multiply(this._m2);
      this.roof.setMatrixAt(i, this._m);
      this._carMatrix(c, 0, this._m);
      this.bumper.setMatrixAt(i, this._m);
      this._carMatrix(c, 0, this._m);
      this.frontLights.setMatrixAt(i, this._m);
      this._carMatrix(c, 0, this._m);
      this.rearLights.setMatrixAt(i, this._m);
      if (c.lightBar) {
        this._carMatrix(c, 1.86, this._m);
        this.lightBar.setMatrixAt(i, this._m);
        const phase = Math.floor(time * 6 + i) % 2 === 0;
        this.lightBar.setColorAt(i, phase ? this._red : this._blue);
      } else {
        this.lightBar.setMatrixAt(i, this._zero);
      }
      // Roda: posisi sudut + putaran sesuai kecepatan.
      c.wheelSpin += (c.speed / 0.42) * dt;
      const offs = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
      for (let w = 0; w < 4; w++) {
        const ox = offs[w][0], oz = offs[w][1];
        const cs = Math.cos(c.heading), sn = Math.sin(c.heading);
        const wx = c.x + ox * cs + oz * sn;
        const wz = c.z - ox * sn + oz * cs;
        this._e.set(c.wheelSpin, c.heading, 0);
        this._q.setFromEuler(this._e);
        this._v.set(wx, 0.42, wz);
        this._m.compose(this._v, this._q, this._s);
        const wi = i * WHEELS_PER_CAR + w;
        this.wheels.setMatrixAt(wi, this._m);
        this.hubs.setMatrixAt(wi, this._m);
      }
    }
    // Sembunyikan slot yang tidak terpakai.
    for (let i = n; i < MAX_CARS; i++) {
      this.body.setMatrixAt(i, this._zero);
      this.glass.setMatrixAt(i, this._zero);
      this.roof.setMatrixAt(i, this._zero);
      this.bumper.setMatrixAt(i, this._zero);
      this.frontLights.setMatrixAt(i, this._zero);
      this.rearLights.setMatrixAt(i, this._zero);
      this.lightBar.setMatrixAt(i, this._zero);
      for (let w = 0; w < 4; w++) {
        this.wheels.setMatrixAt(i * WHEELS_PER_CAR + w, this._zero);
        this.hubs.setMatrixAt(i * WHEELS_PER_CAR + w, this._zero);
      }
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.glass.instanceMatrix.needsUpdate = true;
    this.roof.instanceMatrix.needsUpdate = true;
    this.bumper.instanceMatrix.needsUpdate = true;
    this.wheels.instanceMatrix.needsUpdate = true;
    this.hubs.instanceMatrix.needsUpdate = true;
    this.frontLights.instanceMatrix.needsUpdate = true;
    this.rearLights.instanceMatrix.needsUpdate = true;
    this.lightBar.instanceMatrix.needsUpdate = true;
    if (this.lightBar.instanceColor) this.lightBar.instanceColor.needsUpdate = true;
  }
}

// Lalu lintas + mobil parkir.
export class Traffic {
  constructor(fleet, world) {
    this.fleet = fleet;
    this.world = world;
    this.cars = [];       // mobil lalu lintas yang bergerak
    this.parked = [];     // mobil parkir (bisa dicuri)
    this.playerCar = null; // mobil yang sedang dikendarai pemain
    this._spawnParked();
    this._spawnTraffic();
  }

  _rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  _spawnParked() {
    const r = this._rng(4242);
    const colors = [0xdddddd, 0x2a6fd2, 0xd22a2a, 0x2ad27a, 0xe8c25a, 0x888888, 0xff8c42, 0x7a4fd2];
    // Mobil starter milik pemain di dekat garasi.
    const starter = this.fleet.add({
      kind: 'parked', x: STARTER_CAR.x, z: STARTER_CAR.z, heading: STARTER_CAR.heading,
      speed: 0, targetSpeed: 0, color: STARTER_CAR.color, owned: STARTER_CAR.owned,
    });
    this.parked.push(starter);
    // Mobil parkir lain di tepi jalan.
    const spots = [];
    for (const line of WORLD.roadLines) {
      for (const t of [-140, -70, 0, 70, 140]) {
        spots.push({ x: line + 10.5, z: t + (r() - 0.5) * 20, heading: 0 });
        spots.push({ x: t + (r() - 0.5) * 20, z: line + 10.5, heading: Math.PI / 2 });
      }
    }
    for (let i = 0; i < 14; i++) {
      const s = spots[Math.floor(r() * spots.length)];
      const rec = this.fleet.add({
        kind: 'parked', x: s.x, z: s.z, heading: s.heading,
        speed: 0, targetSpeed: 0, color: colors[Math.floor(r() * colors.length)], owned: false,
      });
      this.parked.push(rec);
    }
  }

  _spawnTraffic() {
    const r = this._rng(777);
    const colors = [0xdddddd, 0x2a6fd2, 0xd22a2a, 0x2ad27a, 0xe8c25a, 0x888888, 0xff8c42];
    const lines = WORLD.roadLines;
    for (let i = 0; i < TRAFFIC.count; i++) {
      const vertical = r() < 0.5;
      const line = lines[Math.floor(r() * lines.length)];
      const along = -170 + r() * 340;
      const x = vertical ? line : along;
      const z = vertical ? along : line;
      const node = this._nearestNode(x, z);
      const rec = this.fleet.add({
        kind: 'traffic', x, z,
        heading: vertical ? (r() < 0.5 ? 0 : Math.PI) : (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        speed: TRAFFIC.speedMin + r() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
        targetSpeed: TRAFFIC.speedMin + r() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
        color: colors[Math.floor(r() * colors.length)], owned: false,
        node, next: this._pickNext(node, null),
      });
      this.cars.push(rec);
    }
  }

  _nearestNode(x, z) {
    let best = null, bd = 1e9;
    for (const nx of WORLD.roadLines) {
      for (const nz of WORLD.roadLines) {
        const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
        if (d < bd) { bd = d; best = { x: nx, z: nz }; }
      }
    }
    return best;
  }

  _pickNext(node, prev) {
    const opts = [];
    const lines = WORLD.roadLines;
    const ix = lines.indexOf(node.x), iz = lines.indexOf(node.z);
    if (ix > 0) opts.push({ x: lines[ix - 1], z: node.z });
    if (ix < lines.length - 1) opts.push({ x: lines[ix + 1], z: node.z });
    if (iz > 0) opts.push({ x: node.x, z: lines[iz - 1] });
    if (iz < lines.length - 1) opts.push({ x: node.x, z: lines[iz + 1] });
    const filtered = prev ? opts.filter((o) => o.x !== prev.x || o.z !== prev.z) : opts;
    const pool = filtered.length ? filtered : opts;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _angleTo(ax, az, bx, bz) {
    return Math.atan2(bx - ax, bz - az);
  }

  _turnToward(rec, targetHeading, dt, rate) {
    let diff = targetHeading - rec.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    rec.heading += step;
  }

  update(dt, playerCar) {
    for (const c of this.cars) {
      // Herding (dipakai alat screenshot): bila lane disetel, mobil
      // mengikuti garis lane itu, bukan graf simpul.
      if (c.lane) {
        c.speed += (c.targetSpeed - c.speed) * Math.min(1, dt * 2);
        const dir = c.lane.dir || 1;
        if (c.lane.vertical) {
          c.x = c.lane.line;
          c.z += dir * c.speed * dt;
          if (c.z > 182) { c.z = 182; c.lane.dir = -1; }
          if (c.z < -182) { c.z = -182; c.lane.dir = 1; }
          c.heading = dir >= 0 ? 0 : Math.PI;
        } else {
          c.z = c.lane.line;
          c.x += dir * c.speed * dt;
          if (c.x > 182) { c.x = 182; c.lane.dir = -1; }
          if (c.x < -182) { c.x = -182; c.lane.dir = 1; }
          c.heading = dir >= 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        continue;
      }
      // Menuju simpul berikutnya.
      const dx = c.next.x - c.x, dz = c.next.z - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        c.node = c.next;
        c.next = this._pickNext(c.node, c.node);
        continue;
      }
      const wantHeading = this._angleTo(c.x, c.z, c.next.x, c.next.z);
      this._turnToward(c, wantHeading, dt, 2.2);
      // Melambat bila mobil pemain tepat di depan.
      let target = c.targetSpeed;
      if (playerCar) {
        const px = playerCar.x - c.x, pz = playerCar.z - c.z;
        const pd = Math.hypot(px, pz);
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
        if (pd < TRAFFIC.slowAheadDist && (px * fx + pz * fz) / Math.max(pd, 0.01) > 0.7) {
          target = 0;
        }
      }
      c.speed += (target - c.speed) * Math.min(1, dt * 2);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      const fixed = this.world.resolveCollision(c.x, c.z, 2.2);
      c.x = fixed.x; c.z = fixed.z;
    }
  }

  // Mobil terdekat (parkir atau lalu lintas) dalam jarak d dari titik.
  nearestCar(x, z, d) {
    let best = null, bd = d;
    for (const c of [...this.parked, ...this.cars]) {
      const dd = Math.hypot(c.x - x, c.z - z);
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }

  // Mobil berhenti jadi milik pemain (keluar dari lalu lintas/parkir).
  claimCar(rec) {
    const i = this.cars.indexOf(rec);
    if (i >= 0) this.cars.splice(i, 1);
    const j = this.parked.indexOf(rec);
    if (j >= 0) this.parked.splice(j, 1);
    rec.kind = 'player';
    this.playerCar = rec;
    return rec;
  }

  // Mobil pemain ditinggalkan: kembali jadi mobil parkir di tempatnya.
  releaseCar(rec) {
    rec.kind = 'parked';
    rec.speed = 0;
    rec.targetSpeed = 0;
    if (this.playerCar === rec) this.playerCar = null;
    this.parked.push(rec);
  }
}
