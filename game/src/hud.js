// NEON BAY — HUD: cash, health, wanted stars, mission box, minimap, prompts.
'use strict';
const NBHud = {
  els: {},
  toastTimer: null,
  bannerTimer: null,

  init() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      hud: $('hud'), cashVal: $('cashVal'), healthFill: $('healthFill'),
      wanted: $('wanted'), missionTitle: $('missionTitle'), missionDesc: $('missionDesc'),
      missionTimer: $('missionTimer'), toast: $('toast'), prompt: $('prompt'),
      speedBox: $('speedBox'), speedVal: $('speedVal'), crosshair: $('crosshair'),
      minimap: $('minimap'), damageFlash: $('damageFlash'),
      menu: $('menu'), pause: $('pause'), endScreen: $('endScreen'),
      endTitle: $('endTitle'), endText: $('endText'),
      bigBanner: $('bigBanner'), bigBannerText: $('bigBannerText'), bigBannerSub: $('bigBannerSub'),
    };
  },

  showHud(on) { this.els.hud.classList.toggle('hidden', !on); },

  setCash(v) { this.els.cashVal.textContent = v.toLocaleString('en-US'); },
  setHealth(h, max) {
    this.els.healthFill.style.width = Math.max(0, (h / max) * 100) + '%';
  },
  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '<span class="dim">★</span>';
    this.els.wanted.innerHTML = s;
  },
  setMission(title, desc, timer) {
    this.els.missionTitle.textContent = title || '';
    this.els.missionDesc.textContent = desc || '';
    this.els.missionTimer.textContent = timer > 0 ? Math.ceil(timer) + 's' : '';
  },
  setMissionTimer(t) {
    this.els.missionTimer.textContent = t > 0 ? Math.ceil(t) + 's' : '';
  },
  setPrompt(text) {
    this.els.prompt.textContent = text || '';
    this.els.prompt.style.display = text ? 'block' : 'none';
  },
  setSpeed(mph, driving) {
    this.els.speedBox.classList.toggle('hidden', !driving);
    if (driving) this.els.speedVal.textContent = Math.round(mph);
  },
  setCrosshair(on) { this.els.crosshair.classList.toggle('hidden', !on); },
  flashDamage() {
    this.els.damageFlash.style.boxShadow = 'inset 0 0 90px 30px rgba(255,0,0,0.55)';
    setTimeout(() => { this.els.damageFlash.style.boxShadow = 'inset 0 0 90px 30px rgba(255,0,0,0)'; }, 160);
  },
  toast(text, seconds) {
    const el = this.els.toast;
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.style.opacity = '0'; }, (seconds || 3.5) * 1000);
  },
  banner(text, sub, seconds) {
    this.els.bigBannerText.textContent = text;
    this.els.bigBannerSub.textContent = sub || '';
    this.els.bigBanner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.els.bigBanner.classList.add('hidden'), (seconds || 2.6) * 1000);
  },

  drawMinimap(game) {
    const cv = this.els.minimap, g = cv.getContext('2d');
    const S = cv.width, B = NB_CONFIG.worldBound + 30;
    const toMap = (x, z) => [((x + B) / (2 * B)) * S, ((z + B) / (2 * B)) * S];
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#0d1526'; g.fillRect(0, 0, S, S);
    // sea
    g.fillStyle = '#1a5f8a';
    const [, seaY] = toMap(0, NB_CONFIG.seaZ);
    g.fillRect(0, seaY, S, S - seaY);
    // roads
    g.strokeStyle = '#5a5a66'; g.lineWidth = 5;
    for (const r of NBWorld.roadLines) {
      if (r.vertical) {
        const [x] = toMap(r.x, 0);
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke();
      } else {
        const [, y] = toMap(0, r.z);
        g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke();
      }
    }
    // garage
    const [gx, gy] = toMap(NB_CONFIG.garage.x, NB_CONFIG.garage.z);
    g.fillStyle = '#ffd94d'; g.fillRect(gx - 4, gy - 4, 8, 8);
    // mission target
    const def = NBMissions.active;
    if (def && def.target && NBMissions.phase === 'toTarget') {
      const [tx, ty] = toMap(def.target.x, def.target.z);
      g.fillStyle = '#ff2ea6';
      g.beginPath(); g.arc(tx, ty, 6, 0, Math.PI * 2); g.fill();
    } else if (def && (NBMissions.phase === 'toHome' || def.stealCar)) {
      g.fillStyle = '#ff2ea6';
      g.beginPath(); g.arc(gx, gy, 6, 0, Math.PI * 2); g.fill();
    }
    // traffic + police dots
    for (const c of NBVehicles.cars) {
      const [x, y] = toMap(c.mesh.position.x, c.mesh.position.z);
      g.fillStyle = '#d8d8d8'; g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    for (const c of NBPolice.cars) {
      const [x, y] = toMap(c.mesh.position.x, c.mesh.position.z);
      g.fillStyle = '#3b82ff'; g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
    }
    // player arrow (rotates with movement direction; canvas up = north = -z)
    const [px, py] = toMap(game.playerPos.x, game.playerPos.z);
    const arrowAng = game.inCar
      ? Math.atan2(Math.sin(game.playerHeading), -Math.cos(game.playerHeading))
      : -game.camYaw;
    g.save();
    g.translate(px, py);
    g.rotate(arrowAng);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.restore();
    // north tick
    g.fillStyle = '#fff'; g.font = 'bold 11px Arial'; g.fillText('N', S / 2 - 4, 12);
  },
};
