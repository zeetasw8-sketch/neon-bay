// Neon Bay — HUD (v5 rebuild). All DOM: mission box, objective guide,
// toast, money/stars/health, speed, minimap, legend, prompt, banner, menus.
// The objective arrow is a pure function of the CURRENT camera direction
// (from _camPos to the player), never of a smoothed or averaged yaw, and
// this update runs AFTER the camera moves each tick.

import { NB_CONFIG as C, wrapAngle, dist2d, clamp } from './config.js';

const MAP_R = 84; // minimap circle radius, px
const MAP_SCALE = MAP_R / C.worldHalf; // 0.3717 px per metre
const MAP_CLAMP = MAP_R - 10; // objective marker clamps to this radius

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const hud = {
    _els: {},
    _lastMap: 0,
    _toastUntil: 0,
    _bannerUntil: 0,
    _lastFlash: 0,
    _cache: {},

    init() {
      const ids = ['missionBox', 'missionTitle', 'missionText', 'missionTimer',
        'toast', 'objGuide', 'objArrow', 'objDist', 'money', 'stars',
        'healthFill', 'healthText', 'speedo', 'speedVal', 'minimap',
        'mapLegend', 'prompt', 'controlsHint', 'crosshair', 'damageFlash',
        'banner', 'bannerTitle', 'bannerText', 'menu', 'pauseMenu',
        'deathScreen', 'deathTitle', 'deathText', 'howBox', 'btnContinue'];
      for (const id of ids) this._els[id] = $(id);
      // The objective guide is a block element (the fix probe reads display).
      if (this._els.objGuide) this._els.objGuide.style.display = 'block';
    },

    _setText(el, v) {
      if (!el) return;
      if (this._cache[el.id] !== v) { this._cache[el.id] = v; el.textContent = v; }
    },

    setMission(title, text, timer) {
      this._setText(this._els.missionTitle, title);
      this._setText(this._els.missionText, text);
      this.setMissionTimer(timer);
    },

    setMissionTimer(t) {
      const v = t > 0 ? `${Math.ceil(t)}s` : '';
      this._setText(this._els.missionTimer, v);
    },

    setMoney(cash) {
      this._setText(this._els.money, `$${cash}`);
    },

    setWanted(n) {
      let s = '';
      for (let i = 0; i < C.maxWanted; i++) s += i < n ? '★' : '☆';
      this._setText(this._els.stars, s);
    },

    setHealth(hp, max) {
      const pct = clamp(hp / max, 0, 1) * 100;
      if (this._els.healthFill) this._els.healthFill.style.width = `${pct}%`;
      this._setText(this._els.healthText, `${Math.ceil(hp)}`);
    },

    toast(text, seconds) {
      const el = this._els.toast;
      if (!el) return;
      el.textContent = text;
      el.style.display = 'block';
      this._toastUntil = performance.now() + (seconds || 3) * 1000;
    },

    showBanner(title, text) {
      const el = this._els.banner;
      if (!el) return;
      this._setText(this._els.bannerTitle, title);
      this._setText(this._els.bannerText, text || '');
      el.style.display = 'block';
      this._bannerUntil = performance.now() + 3500;
    },

    flashDamage() {
      const now = performance.now();
      if (now - this._lastFlash < 333) return; // at most 3 flashes a second
      this._lastFlash = now;
      const el = this._els.damageFlash;
      if (!el) return;
      el.style.opacity = '0.45';
      setTimeout(() => { el.style.opacity = '0'; }, 120);
    },

    showMenu(show, hasSave) {
      if (this._els.menu) this._els.menu.style.display = show ? 'flex' : 'none';
      if (this._els.btnContinue) this._els.btnContinue.style.display = hasSave ? 'block' : 'none';
    },

    showPause(show) {
      if (this._els.pauseMenu) this._els.pauseMenu.style.display = show ? 'flex' : 'none';
    },

    showDeath(show, title, text) {
      if (!this._els.deathScreen) return;
      if (show) {
        this._setText(this._els.deathTitle, title);
        this._setText(this._els.deathText, text);
      }
      this._els.deathScreen.style.display = show ? 'flex' : 'none';
    },

    // The objective arrow: bearing to the objective minus the camera's
    // ACTUAL view bearing (from _camPos to the player), wrapped to +-180.
    // No history, no smoothing — a pure function of this frame's camera.
    update(game, dt) {
      const now = performance.now();
      if (this._els.toast && now > this._toastUntil) this._els.toast.style.display = 'none';
      if (this._els.banner && now > this._bannerUntil) this._els.banner.style.display = 'none';

      // --- objective guide ---
      const obj = game.world.objectivePos();
      const guide = this._els.objGuide;
      if (guide && game.state === 'playing' && game.missions.active) {
        const px = game.playerPos.x, pz = game.playerPos.z;
        const bearing = Math.atan2(obj.x - px, obj.z - pz);
        const cdx = px - game._camPos.x, cdz = pz - game._camPos.z;
        const viewBearing = (cdx * cdx + cdz * cdz) > 0.25
          ? Math.atan2(cdx, cdz)
          : game._camYawSmooth;
        const rel = wrapAngle(bearing - viewBearing);
        const rot = -rel * 180 / Math.PI;
        if (this._els.objArrow) this._els.objArrow.style.transform = `rotate(${rot.toFixed(1)}deg)`;
        const d = Math.round(dist2d(px, pz, obj.x, obj.z));
        this._setText(this._els.objDist, `${d} m`);
        guide.style.display = 'block';
      } else if (guide) {
        guide.style.display = 'none';
      }

      // --- speed ---
      if (this._els.speedo) {
        if (game.inCar && game.vehicles.playerCar) {
          const mph = Math.round(Math.abs(game.vehicles.playerCar.speed) * 2.237);
          this._setText(this._els.speedVal, `${mph}`);
          this._els.speedo.style.display = 'block';
        } else {
          this._els.speedo.style.display = 'none';
        }
      }

      // --- crosshair: only when armed and on foot ---
      if (this._els.crosshair) {
        this._els.crosshair.style.display = (game.hasGun && !game.inCar && game.state === 'playing') ? 'block' : 'none';
      }

      // --- car prompt ---
      if (this._els.prompt) {
        if (game.state === 'playing' && !game.inCar) {
          const car = game.vehicles.nearestCar(px0(game), pz0(game), C.enterRadius);
          if (car) {
            const d = Math.round(dist2d(game.playerPos.x, game.playerPos.z, car.mesh.position.x, car.mesh.position.z));
            this._setText(this._els.prompt, `Press E to steal car — ${d}m`);
            this._els.prompt.style.display = 'block';
          } else {
            this._els.prompt.style.display = 'none';
          }
        } else {
          this._els.prompt.style.display = 'none';
        }
      }

      // --- minimap, redrawn at most every 150 ms ---
      if (now - this._lastMap > 150) {
        this._lastMap = now;
        this._drawMinimap(game);
      }
    },

    _drawMinimap(game) {
      const cv = this._els.minimap;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
      const toMap = (x, z) => [cx + x * MAP_SCALE, cy + z * MAP_SCALE];
      ctx.clearRect(0, 0, W, H);
      // Sea + beach along the south edge.
      ctx.fillStyle = '#0d3b5c';
      ctx.fillRect(0, cy + 175 * MAP_SCALE, W, H);
      ctx.fillStyle = '#8a6f4d';
      ctx.fillRect(0, cy + 168 * MAP_SCALE, W, cy + 175 * MAP_SCALE - (cy + 168 * MAP_SCALE));
      // City disc.
      ctx.beginPath();
      ctx.arc(cx, cy, MAP_R, 0, Math.PI * 2);
      ctx.fillStyle = '#12141a';
      ctx.fill();
      ctx.save();
      ctx.clip();
      // Roads.
      ctx.strokeStyle = '#3a3d47';
      ctx.lineWidth = 14 * MAP_SCALE;
      for (const L of C.roadLines) {
        const [x0] = toMap(L, 0);
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke();
        const [, z0] = toMap(0, L);
        ctx.beginPath(); ctx.moveTo(0, z0); ctx.lineTo(W, z0); ctx.stroke();
      }
      // Blocks.
      ctx.fillStyle = '#1e212a';
      for (const bx of [-140, -70, 0, 70, 140]) {
        for (const bz of [-140, -70, 0, 70, 140]) {
          const [x, z] = toMap(bx - 28, bz - 28);
          ctx.fillRect(x, z, 56 * MAP_SCALE, 56 * MAP_SCALE);
        }
      }
      // Garage (green), bank (blue), hospital (red cross).
      const [gx, gz] = toMap(C.garage.x, C.garage.z);
      ctx.fillStyle = '#2e7d4f';
      ctx.fillRect(gx - 4, gz - 4, 8, 8);
      const [bx2, bz2] = toMap(C.bank.x, C.bank.z);
      ctx.fillStyle = '#2a6aff';
      ctx.fillRect(bx2 - 4, bz2 - 4, 8, 8);
      const [hx, hz] = toMap(C.hospital.x, C.hospital.z);
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(hx - 1.5, hz - 5, 3, 10);
      ctx.fillRect(hx - 5, hz - 1.5, 10, 3);
      // Traffic dots.
      ctx.fillStyle = '#c8c8c8';
      for (const c of game.vehicles.cars) {
        const [x, z] = toMap(c.mesh.position.x, c.mesh.position.z);
        ctx.fillRect(x - 1, z - 1, 2, 2);
      }
      // Police dots.
      ctx.fillStyle = '#ff5252';
      for (const c of game.police.cars) {
        const [x, z] = toMap(c.mesh.position.x, c.mesh.position.z);
        ctx.beginPath(); ctx.arc(x, z, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // Objective: big white circle + gold ring, CLAMPED to the edge so a
      // far objective is never clipped away (the round-2 root cause).
      const obj = game.world.objectivePos();
      if (game.missions.active) {
        const ox = obj.x * MAP_SCALE, oz = obj.z * MAP_SCALE;
        const d = Math.hypot(ox, oz);
        const cd = d > MAP_CLAMP ? MAP_CLAMP : d;
        const ux = d > 0 ? ox / d : 0, uz = d > 0 ? oz / d : 0;
        const mx = cx + ux * cd, my = cy + uz * cd;
        const pulse = 6 + Math.sin(performance.now() / 300) * 1.5;
        ctx.beginPath(); ctx.arc(mx, my, pulse + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffb300'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        if (d > MAP_CLAMP) {
          // Small gold triangle pointing outward, past the edge.
          ctx.fillStyle = '#ffb300';
          ctx.beginPath();
          ctx.moveTo(cx + ux * (MAP_R - 2), cy + uz * (MAP_R - 2));
          ctx.lineTo(cx + ux * (MAP_R - 9) - uz * 4, cy + uz * (MAP_R - 9) + ux * 4);
          ctx.lineTo(cx + ux * (MAP_R - 9) + uz * 4, cy + uz * (MAP_R - 9) - ux * 4);
          ctx.closePath(); ctx.fill();
        }
      }
      // Player arrow (gold), pointing along the heading.
      const [px2, pz2] = toMap(game.playerPos.x, game.playerPos.z);
      const h = game.player.heading;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.moveTo(px2 + Math.sin(h) * 6, pz2 + Math.cos(h) * 6);
      ctx.lineTo(px2 + Math.sin(h + 2.5) * 5, pz2 + Math.cos(h + 2.5) * 5);
      ctx.lineTo(px2 + Math.sin(h - 2.5) * 5, pz2 + Math.cos(h - 2.5) * 5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // Rim + north.
      ctx.beginPath(); ctx.arc(cx, cy, MAP_R, 0, Math.PI * 2);
      ctx.strokeStyle = '#555a66'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#e8e8e8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('N', cx - 4, cy - MAP_R + 12);
    },
  };
  return hud;
}

function px0(game) { return game.playerPos.x; }
function pz0(game) { return game.playerPos.z; }
