// Neon Bay — entrypoint. Copies game/ and screenshots/ into the output
// directory (MAKEFUN_OUTPUT_DIR, outside the grader) and writes the
// dossier.json the make.fun gate reads, built from the live repo by the
// kit's dossier builder.
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function main() {
  var repo = resolve('.');
  var out = resolve(process.env.MAKEFUN_OUTPUT_DIR || 'out');
  mkdirSync(out, { recursive: true });
  cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
  if (existsSync(join(repo, 'screenshots'))) {
    cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
  var dossier = buildDossier(repo, {
    text_max_bytes: 1572864, // 1.5 MiB
    screenshots: { max: 4, max_bytes: 262144 } // 4 shots, 256 KiB each
  });
  // buildDossier returns the canonical JSON as bytes (a Uint8Array):
  // write them raw, do not JSON.stringify them (that would explode
  // every byte into an object key).
  writeFileSync(join(out, 'dossier.json'), dossier);
  console.log('wrote ' + join(out, 'dossier.json'));
}

main();
