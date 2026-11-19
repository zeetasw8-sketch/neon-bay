// Neon Bay — HUD + minimap + menu (v3, dari nol).
// DOM hanya ditulis ulang bila nilainya berubah (hemat layout).
// Minimap digambar ulang tiap 150 ms, bukan tiap frame.

import { WORLD } from './config.js';

export class Hud {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      money: $('money'), healthFill: $('healthFill'), healthText: $('healthText'),
      stars: $('stars'), missionBox: $('missionBox'), missionTitle: $('missionTitle'),
      missionText: $('missionText'), missionTimer: $('missionTimer'),
      speedo: $('speedo'), speedVal: $('speedVal'), crosshair: $('crosshair'),
      minimap: $('minimap'), toast: $('toast'), prompt: $('prompt'), hint: $('controlsHint'),
      banner: $('banner'), bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'),
      menu: $('menu'), menuTitle: $('menuTitle'), menuStory: $('menuStory'),
      startBtn: $('startBtn'), btnStart: $('btnStart'), playGame: $('playGame'),
      continueBtn: $('continueBtn'), howBtn: $('howBtn'),
      howBox: $('howBox'), howCloseBtn: $('howCloseBtn'),
      pauseMenu: $('pauseMenu'), resumeBtn: $('resumeBtn'), btnResume: $('btnResume'), restartBtn: $('restartBtn'),
      saveQuitBtn: $('saveQuitBtn'), muteBtn: $('muteBtn'),
      deadScreen: $('deadScreen'), deadText: $('deadText'), deadOkBtn: $('deadOkBtn'),
      bustedScreen: $('bustedScreen'), bustedText: $('bustedText'), bustedOkBtn: $('bustedOkBtn'),
      flash: $('damageFlash'),
    };
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this._last = {};
    this._toastTimer = null;
    this._bannerTimer = null;
    this._mapTimer = 0;
    this._flashCount = 0;
    this._flashLast = 0;
  }

  _set(key, el, value) {
    if (!el || this._last[key] === value) return;
    this._last[key] = value;
    el.textContent = value;
  }

  setMoney(n) { this._set('money', this.el.money, '$' + Math.floor(n).toLocaleString('en-US')); }

  setHealth(hp, max) {
    const pct = Math.max(0, Math.min(100, Math.round((hp / max) * 100)));
    if (this._last.hp !== pct) {
      this._last.hp = pct;
      if (this.el.healthFill) this.el.healthFill.style.width = pct + '%';
      this._set('hpText', this.el.healthText, 'HEALTH ' + pct);
    }
  }

  setWanted(n) {
    const s = '★'.repeat(n) + '☆'.repeat(5 - n);
    this._set('stars', this.el.stars, s);
    if (this.el.stars) this.el.stars.classList.toggle('hot', n > 0);
  }

  setMission(title, text, timer) {
    this._set('mTitle', this.el.missionTitle, title);
    this._set('mText', this.el.missionText, text);
    const t = timer === null || timer === undefined ? '' : Math.max(0, Math.ceil(timer)) + 's';
    this._set('mTimer', this.el.missionTimer, t);
  }

  setSpeed(mph, show) {
    if (!this.el.speedo) return;
    this.el.speedo.style.display = show ? 'block' : 'none';
    if (show) this._set('speed', this.el.speedVal, Math.round(mph) + ' mph');
  }

  setPrompt(text) {
    if (!this.el.prompt) return;
    const show = !!text;
    this.el.prompt.style.display = show ? 'block' : 'none';
    if (show) this._set('prompt', this.el.prompt, text);
  }

  setCrosshair(show) {
    if (this.el.crosshair) this.el.crosshair.style.display = show ? 'block' : 'none';
  }

  toast(text, seconds = 4) {
    if (!this.el.toast) return;
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.el.toast.style.display = 'none';
    }, seconds * 1000);
  }

  banner(title, sub, seconds = 3) {
    if (!this.el.banner) return;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.style.display = 'block';
    if (this._bannerTimer) clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      this.el.banner.style.display = 'none';
    }, seconds * 1000);
  }

  flashDamage() {
    // Maks 3 flash besar per detik (aksesibilitas).
    const now = performance.now();
    if (now - this._flashLast > 333) this._flashCount = 0;
    this._flashLast = now;
    if (this._flashCount >= 3) return;
    this._flashCount++;
    if (!this.el.flash) return;
    this.el.flash.style.opacity = '0.45';
    setTimeout(() => { this.el.flash.style.opacity = '0'; }, 120);
  }

  showMenu(saveInfo) {
    if (!this.el.menu) return;
    this.el.menu.style.display = 'flex';
    if (this.el.continueBtn) {
      this.el.continueBtn.style.display = saveInfo ? 'block' : 'none';
      if (saveInfo) {
        this.el.continueBtn.textContent =
          `CONTINUE — $${saveInfo.money} · JOB ${Math.min(saveInfo.mission + 1, 6)} OF 6`;
      }
    }
  }
  hideMenu() { if (this.el.menu) this.el.menu.style.display = 'none'; }
  showPause() { if (this.el.pauseMenu) this.el.pauseMenu.style.display = 'flex'; }
  hidePause() { if (this.el.pauseMenu) this.el.pauseMenu.style.display = 'none'; }
  showDead(fine) {
    if (!this.el.deadScreen) return;
    this.el.deadText.textContent = `WASTED — the city took $${fine} off you.`;
    this.el.deadScreen.style.display = 'flex';
  }
  showBusted(fine) {
    if (!this.el.bustedScreen) return;
    this.el.bustedText.textContent = `BUSTED — Bay PD fined you $${fine}.`;
    this.el.bustedScreen.style.display = 'flex';
  }
  hideEndScreens() {
    if (this.el.deadScreen) this.el.deadScreen.style.display = 'none';
    if (this.el.bustedScreen) this.el.bustedScreen.style.display = 'none';
  }

  // Minimap bundar: jalan, laut, landmark, target misi, mobil, polisi, pemain.
  updateMinimap(dt, game) {
    this._mapTimer -= dt;
    if (this._mapTimer > 0 || !this.mapCtx) return;
    this._mapTimer = 0.15;
    const ctx = this.mapCtx;
    const S = 168, R = 84, C = S / 2;
    const scale = (S / 2 - 6) / 210; // dunia -210..210 -> lingkaran
    const px = (x) => C + x * scale;
    const py = (z) => C + z * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#232833';
    ctx.fillRect(0, 0, S, S);
    // Laut + pasir di selatan (z besar = bawah).
    ctx.fillStyle = '#1d4e6b';
    ctx.fillRect(0, py(208), S, S - py(208));
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, py(182), S, py(208) - py(182));
    // Jalan.
    ctx.strokeStyle = '#565b68';
    ctx.lineWidth = 5;
    for (const line of WORLD.roadLines) {
      ctx.beginPath(); ctx.moveTo(px(line), py(-182)); ctx.lineTo(px(line), py(208)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px(-182), py(line)); ctx.lineTo(px(182), py(line)); ctx.stroke();
    }
    // Landmark: garasi emas, bank biru, rumah sakit putih.
    const mark = (x, z, color, size) => {
      ctx.fillStyle = color;
      ctx.fillRect(px(x) - size / 2, py(z) - size / 2, size, size);
    };
    mark(0, 120, '#ffd76a', 8);
    mark(-70, -70, '#4d8fd2', 8);
    mark(140, 140, '#ffffff', 8);
    // Target misi (berdenyut emas).
    if (game.missionTarget) {
      const pulse = 4 + 2 * Math.sin(performance.now() / 200);
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(px(game.missionTarget.x), py(game.missionTarget.z), pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mobil lalu lintas (abu-abu), polisi (biru/merah).
    ctx.fillStyle = '#9aa0ad';
    for (const c of game.trafficCars) {
      ctx.fillRect(px(c.x) - 1.5, py(c.z) - 1.5, 3, 3);
    }
    for (let i = 0; i < game.policeCars.length; i++) {
      const c = game.policeCars[i];
      ctx.fillStyle = (Math.floor(performance.now() / 300) + i) % 2 === 0 ? '#ff2222' : '#2266ff';
      ctx.fillRect(px(c.x) - 2, py(c.z) - 2, 4, 4);
    }
    // Pemain: panah putih searah heading.
    const p = game.player;
    ctx.save();
    ctx.translate(px(p.x), py(p.z));
    ctx.rotate(Math.PI - p.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Lingkaran tepi + utara.
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, R - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', C, 14);
  }
}
