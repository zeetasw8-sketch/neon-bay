// Neon Bay — the entrypoint that hands the game in to make.fun.
// It copies this repository's game/ and screenshots/ beside this file
// into the output directory, then writes dossier.json with the kit's
// dossier builder. Node 22, standard library only; outside the
// grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// The output folder is created first so the copies below always land.
mkdirSync(outDir, { recursive: true });

// The whole game, exactly as it sits in the repository.
cpSync(join(repoRoot, "game"), join(outDir, "game"), { recursive: true });

// The screenshots, when they exist (the cover is the first by name).
mkdirSync(join(outDir, "screenshots"), { recursive: true });
if (existsSync(join(repoRoot, "screenshots"))) {
  cpSync(join(repoRoot, "screenshots"), join(outDir, "screenshots"), {
    recursive: true,
  });
}

// The judge's view of the entry: the dossier the kit's builder writes
// from the copied game and screenshots, capped the way the gate caps it.
const dossierText = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, "dossier.json"), dossierText);
