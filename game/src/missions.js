// Neon Bay — the six-job chain from fixer Mara Voss.
// Each job has stages: reach a target, then (for the pickup and the
// bank job) bring something home. The bank pickup stands outside the
// bank's front door, the garage counts as home from any side, and the
// sixth job only completes when the player reaches the garage with
// wanted already at zero. Job 4 hides the beacon (the arrow still
// points at the garage) and Job 5 spawns three thugs in a wide arc.

import { THREE } from "./three-shim.js";
import { WORLD, MISSIONS, COMBAT } from "./config.js";

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

function makeThugMesh(scene) {
  // A thug: dark clothes, a red bandana across the head.
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc99a7a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x3a2a2a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22242e });
  const band = new THREE.MeshBasicMaterial({ color: 0xd42a2a });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), band);
  bandana.position.y = 1.72;
  group.add(bandana);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.38), shirt);
  torso.position.y = 1.0;
  torso.castShadow = true;
  group.add(torso);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.34), pants);
  legs.position.y = 0.33;
  group.add(legs);
  scene.add(group);
  return group;
}

export function spawnThugs(G, scene) {
  // Clear any old thugs first.
  for (const t of G.thugs) scene.remove(t.mesh);
  G.thugs = [];
  const c = MISSIONS[4].target;
  // An arc opening toward the player (who comes from the north):
  // left, centre and right, spread 5 m apart, south of the target.
  const offsets = [
    { x: -COMBAT.thugSpread, z: 3 },
    { x: 0, z: 6 },
    { x: COMBAT.thugSpread, z: 3 },
  ];
  for (const o of offsets) {
    const mesh = makeThugMesh(scene);
    const x = c.x + o.x;
    const z = c.z + o.z;
    mesh.position.set(x, 0, z);
    G.thugs.push({
      mesh,
      x,
      z,
      heading: Math.PI,
      hp: COMBAT.thugHp,
      hitTimer: 0,
    });
  }
}

export function placeThugs(G, spots) {
  spots.forEach((s, i) => {
    const t = G.thugs[i];
    if (!t) return;
    t.x = s.x;
    t.z = s.z;
    t.hp = COMBAT.thugHp;
    t.mesh.visible = true;
    t.mesh.position.set(s.x, 0, s.z);
  });
}

export function startMission(G, i) {
  const m = MISSIONS[i];
  if (!m) return;
  G.missionIndex = i;
  G.missionStage = 0;
  G.missionFailed = false;
  G.missionTimer = m.timer;
  G.mission = m;
  if (m.key === "escape") {
    G.setWanted(m.startWanted || 2);
  }
  if (m.key === "fight") {
    G.hasPistol = true;
    spawnThugs(G, G.scene);
    G.showToast("Pistol acquired");
  }
  G.hud.showDialogue(m.intro, m.title);
  G.showToast(m.title);
  updateMissionTarget(G);
}

export function restartMission(G) {
  // Back to the garage, the job reset to its first stage, the intro
  // played again. This is a real restart, never a resume in disguise.
  const m = MISSIONS[G.missionIndex];
  if (!m) return;
  G.exitCar(true);
  G.player.x = WORLD.garage.x;
  G.player.z = WORLD.garage.z + 14;
  G.player.heading = Math.PI; // face south, toward the first beacon
  G.player.mesh.position.set(G.player.x, 0, G.player.z);
  G.camYaw = Math.PI;
  G.camPitch = 0.32;
  G.health = 100;
  G.missionFailed = false;
  startMission(G, G.missionIndex);
  G.hud.showBanner("JOB RESTARTED");
  G.saveGame();
}

// Where the arrow and the beacon point right now.
export function currentTarget(G) {
  const m = G.mission;
  if (!m) return { x: WORLD.garage.x, z: WORLD.garage.z };
  if (m.key === "pickup") {
    return G.missionStage === 0
      ? { x: WORLD.pier.x, z: WORLD.pier.z }
      : { x: WORLD.garage.x, z: WORLD.garage.z };
  }
  if (m.key === "delivery") return { x: WORLD.buyer.x, z: WORLD.buyer.z };
  if (m.key === "steal") {
    if (G.missionStage === 0) {
      // Point at the nearest stealable car.
      let best = null;
      let bestD = 1e9;
      for (const car of G.allCars) {
        if (car.kind === "police") continue;
        if (car.owned) continue;
        if (car === G.playerCar) continue;
        const d = dist2(G.player.x, G.player.z, car.x, car.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      return best ? { x: best.x, z: best.z } : { x: WORLD.garage.x, z: WORLD.garage.z };
    }
    return { x: WORLD.garage.x, z: WORLD.garage.z };
  }
  if (m.key === "escape") return { x: WORLD.garage.x, z: WORLD.garage.z };
  if (m.key === "fight") return { x: MISSIONS[4].target.x, z: MISSIONS[4].target.z };
  if (m.key === "bank") {
    return G.missionStage === 0
      ? { x: WORLD.bankPickup.x, z: WORLD.bankPickup.z }
      : { x: WORLD.garage.x, z: WORLD.garage.z };
  }
  return { x: WORLD.garage.x, z: WORLD.garage.z };
}

export function updateMissionTarget(G) {
  const t = currentTarget(G);
  G.targetPos = t;
  // Job 4 hides the beacon (the escape is about losing the heat, not
  // following a column), but the arrow keeps pointing at the garage.
  const hideBeacon = G.mission && G.mission.key === "escape";
  G.world.setBeacon(t.x, t.z, !hideBeacon);
}

function completeMission(G) {
  const m = G.mission;
  if (!m) return;
  G.money += m.reward;
  G.audio.missionComplete();
  G.hud.showBanner(`${m.title} — COMPLETE  +$${m.reward}`);
  G.showToast(`+$${m.reward} — ${m.name} done`);
  G.saveGame();
  const next = G.missionIndex + 1;
  if (next >= MISSIONS.length) {
    G.missionIndex = MISSIONS.length;
    G.mission = null;
    G.world.setBeacon(0, 0, false);
    G.hud.showBanner("NEON BAY LEGEND — free roam");
    G.hud.showDialogue(
      "All six jobs done, Dex. The city is yours now. Drive anywhere. The legend of Neon Bay.",
      "FREE ROAM",
    );
    return;
  }
  startMission(G, next);
}

function failMission(G, reason) {
  if (G.missionFailed) return;
  G.missionFailed = true;
  G.hud.showBanner(`MISSION FAILED — ${reason}`);
  G.showToast("Press R to retry the job");
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m || G.status !== "playing") return;
  if (G.missionFailed) return;

  // Timed jobs count down; running out fails the job.
  if (m.timer > 0) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) {
      G.missionTimer = 0;
      failMission(G, "time ran out");
      return;
    }
  }

  const px = G.player.x;
  const pz = G.player.z;

  if (m.key === "pickup") {
    if (G.missionStage === 0) {
      if (dist2(px, pz, WORLD.pier.x, WORLD.pier.z) < WORLD.objectiveRadius) {
        G.missionStage = 1;
        G.audio.pickup();
        G.showToast("Package picked up — bring it home");
        updateMissionTarget(G);
      }
    } else if (dist2(px, pz, WORLD.garage.x, WORLD.garage.z) < WORLD.garageRadius) {
      completeMission(G);
    }
    return;
  }

  if (m.key === "delivery") {
    if (dist2(px, pz, WORLD.buyer.x, WORLD.buyer.z) < WORLD.objectiveRadius) {
      completeMission(G);
    }
    return;
  }

  if (m.key === "steal") {
    if (G.missionStage === 0) {
      if (G.inCar && G.playerCar && !G.playerCar.owned) {
        G.missionStage = 1;
        G.showToast("Stolen — bring it to the garage");
        updateMissionTarget(G);
      }
    } else if (
      G.inCar &&
      dist2(px, pz, WORLD.garage.x, WORLD.garage.z) < WORLD.garageRadius
    ) {
      completeMission(G);
    }
    return;
  }

  if (m.key === "escape") {
    if (G.wanted <= 0) completeMission(G);
    return;
  }

  if (m.key === "fight") {
    const alive = G.thugs.filter((t) => t.hp > 0).length;
    if (alive === 0) completeMission(G);
    return;
  }

  if (m.key === "bank") {
    if (G.missionStage === 0) {
      if (dist2(px, pz, WORLD.bankPickup.x, WORLD.bankPickup.z) < WORLD.bankPickupRadius) {
        G.missionStage = 1;
        G.setWanted(3);
        G.audio.pickup();
        G.hud.showBanner("CASE GRABBED — LOSE THE HEAT");
        G.showToast("3★ wanted — lose the heat, then get home");
        updateMissionTarget(G);
      }
    } else if (
      G.wanted <= 0 &&
      dist2(px, pz, WORLD.garage.x, WORLD.garage.z) < WORLD.garageRadius
    ) {
      completeMission(G);
    }
  }
}
