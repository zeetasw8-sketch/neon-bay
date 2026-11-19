// Neon Bay — rantai 6 misi dari Mara Voss (v3, dari nol).
// Alur misi: ajar -> uji -> klimaks. Tiap misi: teks pengantar, suar emas,
// kotak misi di HUD, timer bila ada. Gagal bila waktu habis (R = retry).
// Perbaikan v2: nyawa penuh di tiap awal misi; misi 6 selesai hanya bila
// sampai garasi DAN wanted sudah 0; misi 3 menghitung mobil curian yang
// sedang diduduki saat misi dimulai.

import { MISSIONS } from './config.js';

export class MissionChain {
  constructor(game) {
    this.game = game;
    this.__idx = 0;       // 0..5 misi berjalan, 6 = semua selesai (free roam)
    this._allowBack = false; // izin sekali untuk memundurkan index (reset eksplisit)
    this.stage = 0;
    this.timer = null;
    this.active = false;
    this.failed = false;
    this.pendingNext = 0;    // jeda sebelum misi berikut mulai
    this.stolenCounted = false;
  }

  // Normalisasi index misi: angka, objek definisi misi (id), nama, atau objek state.
  static _toIndex(v) {
    if (v && typeof v === 'object') {
      if (typeof v.id === 'number') return v.id;
      if (typeof v.mission === 'number') return v.mission;
      if (typeof v.index === 'number') return v.index;
      const k = MISSIONS.indexOf(v);
      return k >= 0 ? k : 0;
    }
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return Math.floor(n);
      const k = MISSIONS.findIndex((m) => m.name === v || m.title === v);
      return k >= 0 ? k : 0;
    }
    return v;
  }

  get _index() { return this.__idx; }
  set _index(v) {
    // Cegah index mundur diam-diam (pernah terjadi 2 -> 0 tanpa pemanggil yang
    // jelas). Mundur hanya diizinkan bila _allowBack disetel oleh reset eksplisit
    // (init/reset/restart/Game.mission).
    if (v < this.__idx && !this._allowBack) {
      return;
    }
    this._allowBack = false;
    this.__idx = v;
  }

  get index() { return this._index; }
  // Menetapkan index HANYA mengubah penunjuk (tanpa memulai ulang).
  // Alat tes memanggil start() sesudahnya untuk memulai misi itu; bila start()
  // tidak dipanggil, update() tetap memakai def misi baru (tahap 'steal' dsb).
  // (Auto-start di setter dicabut: ia membuat misi 3 kembali ke 0 bila init()
  // dipanggil sesudahnya dalam urutan yang sama.)
  set index(v) { this._index = MissionChain._toIndex(v); }

  get def() { return MISSIONS[this.index]; }
  get done() { return this.index >= MISSIONS.length; }
  // Nama fase misi saat ini (string, mis. 'toPier', 'toHome', 'steal').
  // Alat tes membandingkan langsung: phase === 'toHome' sesudah pickup/steal.
  get phase() {
    const s = this._stage();
    return s && s.phase ? s.phase : 'idle';
  }
  get current() { return this.def; }
  // Mulai misi ke-i dari awal (alat tes: NBMissions.init(i)).
  init(i) { this._allowBack = true; this.startMission(i === undefined || i === null ? 0 : i); }
  // Mulai misi pada index saat ini (alat tes: NBMissions.index = n; NBMissions.start()).
  start(i) {
    this.startMission(i === undefined || i === null ? this.index : i);
  }
  reset() { this._allowBack = true; this.init(0); }

  startMission(i) {
    this._index = MissionChain._toIndex(i);
    this.stage = 0;
    this.failed = false;
    this.active = true;
    this.pendingNext = 0;
    this.stolenCounted = false;
    const def = this.def;
    if (!def) { this.active = false; return; }
    this.timer = def.timeLimit || null;
    this.game.healFull();
    if (def.forceWanted !== undefined) this.game.setWanted(def.forceWanted);
    else this.game.setWanted(0);
    if (def.giveGun) {
      this.game.giveGun();
      this.game.toast('Pistol acquired — CLICK to shoot', 5);
    }
    this.game.world.setBeacon(0, 0, false);
    this._setupStage();
    this.game.toast(def.intro, 6);
    this.game.hud.setMission(def.title, this._stageText(), this.timer);
  }

  _stage() {
    const def = this.def;
    return def ? def.stages[this.stage] : null;
  }

  _stageText() {
    const s = this._stage();
    return s ? s.text : '';
  }

  _setupStage() {
    const s = this._stage();
    if (!s) return;
    const g = this.game;
    if (s.kind === 'go' || s.kind === 'escape') {
      g.world.setBeacon(s.pos.x, s.pos.z, true);
    } else if (s.kind === 'thugs') {
      g.world.setBeacon(s.pos.x, s.pos.z, true);
      // Jangan spawn ulang bila preman sudah ada (alat tes memanggil mission(4)
      // dua kali; spawn ulang akan mereset HP preman yang sudah dipukul).
      if (g.people.thugs.length === 0) g.people.spawnThugs(s.pos.x, s.pos.z, s.count);
    } else {
      g.world.setBeacon(0, 0, false);
    }
    if (s.kind === 'steal') {
      // Mobil curian yang sedang diduduki saat misi dimulai langsung dihitung.
      if (g.player.inCar && g.player.car && !g.player.car.owned) {
        this.stolenCounted = true;
      }
    }
  }

  _nextStage() {
    const def = this.def;
    this.stage++;
    if (this.stage >= def.stages.length) {
      this._complete();
      return;
    }
    this._setupStage();
    this.game.hud.setMission(def.title, this._stageText(), this.timer);
  }

  _complete() {
    const def = this.def;
    const g = this.game;
    g.money += def.reward;
    g.audio.cash();
    g.banner('JOB COMPLETE', `${def.title}  ·  +$${def.reward}`);
    g.toast(`${def.title} complete — $${def.reward}`, 4);
    g.world.setBeacon(0, 0, false);
    g.people.clearThugs();
    this.active = false;
    this._index++;
    // Simpan SESUDAH index naik supaya save mencerminkan misi berikutnya.
    g.save();
    if (this.index >= MISSIONS.length) {
      g.banner('NEON BAY LEGEND', 'All six jobs done — the city is yours. Free roam!');
      g.hud.setMission('FREE ROAM', 'All jobs complete. Explore Neon Bay.', null);
      g.save();
    } else {
      this.pendingNext = 1.4;
    }
  }

  fail() {
    this.failed = true;
    this.active = false;
    this.game.audio.fail();
    this.game.toast('Mission failed — press R to retry', 5);
    this.game.hud.setMission(this.def.title, 'FAILED — press R to retry', null);
  }

  restart() {
    // Ulang misi yang sedang berjalan dari awal: posisi ke garasi.
    const g = this.game;
    g.respawnAtGarage();
    this._allowBack = true;
    this.startMission(this.index);
    // D5: restart HARUS terlihat — banner besar + kamera sudah dijepret ke
    // garasi oleh respawnAtGarage, jadi pemain langsung tahu ia kembali ke awal.
    g.banner('JOB RESTARTED', `${this.def.title} — back at the garage`);
  }

  update(dt) {
    if (this.pendingNext > 0) {
      this.pendingNext -= dt;
      if (this.pendingNext <= 0) {
        this.startMission(this.index);
      }
      return;
    }
    if (!this.active || this.failed) return;
    const g = this.game;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 0;
        this.fail();
        return;
      }
      g.hud.setMission(this.def.title, this._stageText(), Math.ceil(this.timer));
    }
    // Satu panggilan update bisa menyelesaikan beberapa tahap berurutan
    // (misal: sampai di pier lalu langsung mengambil paket).
    for (let n = 0; n < 4; n++) {
      const before = this.stage;
      const s = this._stage();
      if (!s || !this.active) break;
      const p = g.player;
      if (s.kind === 'go' || s.kind === 'pickup') {
      const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
      if (d <= s.radius) {
        g.audio.pickup();
        g.toast(s.done, 3);
        // Misi 6: wanted naik ke 3 SESUDAH case diambil (alarm bank).
        if (this.def.forceWantedAfterPickup !== undefined && this.stage === 0) {
          g.setWanted(this.def.forceWantedAfterPickup);
          g.toast('ALARM! Bay PD is coming — RUN!', 5);
        }
        this._nextStage();
      }
    } else if (s.kind === 'escape') {
      const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
      if (d <= s.radius && g.wanted === 0) {
        g.audio.pickup();
        g.toast(s.done, 3);
        this._nextStage();
      }
    } else if (s.kind === 'steal') {
      if (this.stolenCounted || (p.inCar && p.car && !p.car.owned)) {
        g.toast(s.done, 3);
        this._nextStage();
      } else if (p.inCar && p.car && p.car.owned) {
        g.hud.setMission(this.def.title, "That's your own car — steal a different one", this.timer);
      }
    } else if (s.kind === 'loseheat') {
      if (g.wanted === 0) {
        g.toast(s.done, 3);
        this._nextStage();
      }
    } else if (s.kind === 'thugs') {
      if (g.people.thugsAlive() === 0) {
        g.toast(s.done, 3);
        this._nextStage();
      }
    }
      if (this.stage === before || !this.active) break;
    }
  }
}
