// Wipes every tsc-emitted build/ tree and its .tsbuildinfo, so a build starts from nothing.
//
// WHY this exists: `tsc --build` emits outputs but never REMOVES the output of a source that was
// deleted. The file simply stays, and `files: ["build"]` then ships it forever. Measured
// 2026-08-19: 12 packages still carried build/{react,vue,svelte}/index.js months after the commit
// that deleted those source barrels, and adapters/solid shipped a deleted component plus two
// forgotten probe files inside a `pnpm pack` tarball.
//
// It cannot reach npm through CI — build/ is gitignored and the release runs on a clean checkout —
// but it DOES reach a local `pnpm pack`, which is the everyday loop for examples/* (see CLAUDE.md's
// <examples_vs_dot_examples>). So a locally packed tarball silently differed from a released one:
// the exact class of "works on my machine" this repo pays most for.
//
// DELETING build/ ALONE IS NOT ENOUGH, and the failure is silent in the worst direction: tsc reads
// .tsbuildinfo, concludes every project is up to date, and emits NOTHING — leaving an empty build/
// that looks like a successful build. Both go, together. Same shape as the examples' stale-install
// trap, where removing node_modules/@symbiote-native/<pkg> without the lockfile also short-circuits.

import { readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_ROOTS = ['core', 'adapters', 'packages'];
// build-ngc is Angular's AOT output with its own clean step inside each package's `ng:build`;
// wiping it here would just make that rebuild twice.
const OUTPUT_DIRS = ['build'];

function packageDirs() {
  return WORKSPACE_ROOTS.flatMap(root => {
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .map(name => join(root, name))
      .filter(dir => statSync(dir).isDirectory());
  });
}

let removed = 0;
for (const dir of packageDirs()) {
  for (const output of OUTPUT_DIRS) {
    const target = join(dir, output);
    if (existsSync(target)) {
      rmSync(target, { recursive: true, force: true });
      removed += 1;
    }
  }
  // The other half. Without it the rebuild emits nothing at all.
  const info = join(dir, 'tsconfig.tsbuildinfo');
  if (existsSync(info)) {
    rmSync(info, { force: true });
    removed += 1;
  }
}

console.log(`Cleaned ${removed} build output(s) and build-info file(s).`);
