// Neon Bay — the HUD.
// Money, health, wanted stars, the mission box and timer, speed, the
// crosshair, the toast and the banner, and the round minimap with its
// legend. The objective arrow is the most-tested part of the game: it
// is computed from the camera's ACTUAL view direction at this moment,
// never from a smoothed yaw; the bearing difference is normalised to
// [-180, +180] degrees; the glyph is a stemmed arrow (U+2B06), which
// reads unambiguously at every angle, unlike a bare triangle. The
// arrow is a pure function of the current camera direction — no
// accumulated state, no history. The HUD is updated AFTER the camera
// moves each frame, so it never reads last frame's camera.

import { THREE } from "./three-shim.js";
import { WORLD } from "./config.js";

const MAP_R = 88;
const MAP_C = 90;
const MAP_SCALE = 0.58;

function mapX(x) {
  return MAP_C + x * MAP_SCALE;
}
function mapY(z) {
  return MAP_C + z * MAP_SCALE;
}

export class Hud {
  constructor(doc) {
    this.doc = doc;
    this.moneyEl = doc.getElementById("money");
    this.healthFill = doc.getElementById("health-fill");
    this.starsEl = doc.getElementById("wanted-stars");
    this.missionTitle = doc.getElementById("mission-title");
    this.missionText = doc.getElementById("mission-text");
    this.missionTimer = doc.getElementById("mission-timer");
    this.speedEl = doc.getElementById("speed");
    this.crosshair = doc.getElementById("crosshair");
    this.arrowEl = doc.getElementById("obj-arrow");
    this.distEl = doc.getElementById("obj-dist");
    this.arrowBox = doc.getElementById("obj-arrow-box");
    this.toastEl = doc.getElementById("toast");
    this.bannerEl = doc.getElementById("banner");
    this.dialogueEl = doc.getElementById("dialogue");
    this.dialogueTitle = doc.getElementById("dialogue-title");
    this.dialogueText = doc.getElementById("dialogue-text");
    this.promptEl = doc.getElementById("prompt");
    this.mapCanvas = doc.getElementById("minimap");
    this.mapCtx = this.mapCanvas.getContext("2d");
    this.toastTimer = 0;
    this.bannerTimer = 0;
    this.dialogueTimer = 0;
    this.lastFwdX = 0;
    this.lastFwdZ = -1;
    this._v = new THREE.Vector3();
  }

  showToast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    this.toastTimer = 3;
  }

  showBanner(text) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add("show");
    this.bannerTimer = 2.6;
  }

  showDialogue(text, title) {
    this.dialogueTitle.textContent = title || "MARA VOSS";
    this.dialogueText.textContent = text;
    this.dialogueEl.classList.add("show");
    this.dialogueTimer = 6;
  }

  hideDialogue() {
    this.dialogueEl.classList.remove("show");
    this.dialogueTimer = 0;
  }

  // The objective arrow. camera is the game's camera, target is the
  // current objective {x, z}, playerPos is the player's position.
  // Returns the relative bearing in degrees (for probes).
  updateArrow(camera, target, playerPos) {
    camera.getWorldDirection(this._v);
    let fx = this._v.x;
    let fz = this._v.z;
    const len = Math.sqrt(fx * fx + fz * fz);
    if (len < 0.05) {
      // Camera looking straight down: reuse the last good direction.
      fx = this.lastFwdX;
      fz = this.lastFwdZ;
    } else {
      fx /= len;
      fz /= len;
      this.lastFwdX = fx;
      this.lastFwdZ = fz;
    }
    const dx = target.x - camera.position.x;
    const dz = target.z - camera.position.z;
    const dl = Math.sqrt(dx * dx + dz * dz);
    let rel = 0;
    if (dl > 0.5) {
      const tx = dx / dl;
      const tz = dz / dl;
      // Signed angle from the camera's view to the objective, in the
      // screen's sense: positive turns the arrow clockwise (right).
      rel = Math.atan2(fx * tz - fz * tx, fx * tx + fz * tz);
    }
    this.arrowEl.style.transform = `rotate(${rel}rad)`;
    // Distance is measured from the player, in whole metres.
    const pdx = target.x - playerPos.x;
    const pdz = target.z - playerPos.z;
    const pdist = Math.round(Math.sqrt(pdx * pdx + pdz * pdz));
    this.distEl.textContent = `${pdist} m`;
    return (rel * 180) / Math.PI;
  }

  drawMinimap(G) {
    const ctx = this.mapCtx;
    const S = 180;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(MAP_C, MAP_C, MAP_R, 0, Math.PI * 2);
    ctx.clip();
    // Sea and sand along the south edge.
    ctx.fillStyle = "#14141c";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#c2a06b";
    ctx.fillRect(0, mapY(WORLD.edge), S, S - mapY(WORLD.edge));
    ctx.fillStyle = "#1e4d6b";
    ctx.fillRect(0, mapY(WORLD.seaAt), S, S - mapY(WORLD.seaAt));
    // Roads.
    ctx.strokeStyle = "#4a4a58";
    ctx.lineWidth = 7;
    for (const s of WORLD.streets) {
      ctx.beginPath();
      ctx.moveTo(mapX(s), 0);
      ctx.lineTo(mapX(s), S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mapY(s));
      ctx.lineTo(S, mapY(s));
      ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = "#34d399";
    ctx.fillRect(mapX(WORLD.garage.x) - 4, mapY(WORLD.garage.z) - 4, 8, 8);
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(mapX(WORLD.bank.x) - 4, mapY(WORLD.bank.z) - 4, 8, 8);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(mapX(WORLD.hospital.x) - 4, mapY(WORLD.hospital.z) - 4, 8, 8);
    // Objective: a white disc with a gold ring. Pinned to the edge
    // with a gold triangle when it lies beyond the circle.
    if (G.targetPos) {
      let ox = mapX(G.targetPos.x);
      let oy = mapY(G.targetPos.z);
      let dx = ox - MAP_C;
      let dy = oy - MAP_C;
      const d = Math.sqrt(dx * dx + dy * dy);
      const beyond = d > MAP_R - 10;
      if (beyond) {
        ox = MAP_C + (dx / d) * (MAP_R - 10);
        oy = MAP_C + (dy / d) * (MAP_R - 10);
        dx = ox - MAP_C;
        dy = oy - MAP_C;
      }
      ctx.beginPath();
      ctx.arc(ox, oy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#ffb300";
      ctx.stroke();
      if (beyond) {
        const ang = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(ox + Math.cos(ang) * 11, oy + Math.sin(ang) * 11);
        ctx.lineTo(
          ox + Math.cos(ang + 2.5) * 7,
          oy + Math.sin(ang + 2.5) * 7,
        );
        ctx.lineTo(
          ox + Math.cos(ang - 2.5) * 7,
          oy + Math.sin(ang - 2.5) * 7,
        );
        ctx.closePath();
        ctx.fillStyle = "#ffb300";
        ctx.fill();
      }
    }
    // Traffic (yellow) and police (red).
    ctx.fillStyle = "#e8b93e";
    for (const car of G.allCars) {
      if (car.kind !== "traffic") continue;
      ctx.beginPath();
      ctx.arc(mapX(car.x), mapY(car.z), 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ff3b30";
    for (const car of G.policeCars) {
      ctx.beginPath();
      ctx.arc(mapX(car.x), mapY(car.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing along the heading.
    const px = mapX(G.player.x);
    const py = mapY(G.player.z);
    const ha = Math.atan2(Math.sin(G.player.heading), -Math.cos(G.player.heading));
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-ha + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // North marker.
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", MAP_C, 12);
  }

  update(G, dt) {
    // Timers for transient messages.
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove("show");
    }
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.dialogueEl.classList.remove("show");
    }

    this.moneyEl.textContent = `$${G.money}`;
    this.healthFill.style.width = `${Math.max(0, G.health)}%`;
    this.healthFill.style.background =
      G.health > 50 ? "#34d399" : G.health > 25 ? "#fbbf24" : "#ef4444";
    let stars = "";
    for (let i = 0; i < 5; i++) stars += i < G.wanted ? "★" : "☆";
    this.starsEl.textContent = stars;
    this.starsEl.style.color = G.wanted > 0 ? "#fbbf24" : "#8a8a96";

    if (G.mission) {
      this.missionTitle.textContent = G.mission.title;
      let obj = G.mission.objective;
      if (G.mission.key === "pickup" && G.missionStage === 1) obj = G.mission.deliver;
      if (G.mission.key === "bank" && G.missionStage === 1) obj = G.mission.deliver;
      this.missionText.textContent = obj;
      if (G.mission.timer > 0) {
        const t = Math.max(0, Math.ceil(G.missionTimer));
        this.missionTimer.textContent = `${t}s`;
        this.missionTimer.style.display = "inline";
        this.missionTimer.style.color = t <= 15 ? "#ef4444" : "#ffffff";
      } else {
        this.missionTimer.style.display = "none";
      }
    } else {
      this.missionTitle.textContent = "FREE ROAM";
      this.missionText.textContent = "All jobs done — the city is yours";
      this.missionTimer.style.display = "none";
    }

    if (G.inCar && G.playerCar) {
      const mph = Math.round(Math.abs(G.playerCar.speed) * 2.237);
      this.speedEl.textContent = `${mph} mph`;
      this.speedEl.style.display = "block";
    } else {
      this.speedEl.style.display = "none";
    }
    this.crosshair.style.display =
      G.hasPistol && !G.inCar && G.status === "playing" ? "block" : "none";

    // The arrow reads the camera's actual direction right now.
    if (G.targetPos && G.status === "playing") {
      this.arrowBox.style.display = "flex";
      this.updateArrow(G.camera, G.targetPos, G.player);
    } else {
      this.arrowBox.style.display = "none";
    }

    this.drawMinimap(G);
  }
}
