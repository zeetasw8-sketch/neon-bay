// Neon Bay — entrypoint: copies game/ and screenshots/ from this repository
// to the output directory and writes dossier.json with the kit's
// buildDossier. Runs on plain Node (standard library only), no network,
// no build step. Written for the v3 rebuild.
//
// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files, in all, or a path under game/ over 1000 bytes).

import { buildDossier } from './vendor/makefun-game.ts';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoDir = process.cwd();
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

await mkdir(outDir, { recursive: true });
await cp(path.join(repoDir, 'game'), path.join(outDir, 'game'), { recursive: true });
await cp(path.join(repoDir, 'screenshots'), path.join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
await writeFile(path.join(outDir, 'dossier.json'), dossier);

console.log('Neon Bay entry written to ' + outDir);
