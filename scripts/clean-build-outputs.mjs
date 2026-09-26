// Wipes every tsc-emitted build/ tree and its .tsbuildinfo, so a build starts from nothing.

// `tsc --build` emits outputs but never REMOVES the output of a deleted source — the file stays,
// and `files: ["build"]` ships it forever. Invisible through CI (build/ is gitignored, the release
// runs on a clean checkout) but reaches a local `pnpm pack`, the everyday examples/* loop.

// DELETING build/ ALONE IS NOT ENOUGH: tsc reads .tsbuildinfo, concludes the project is up to date,
// and emits NOTHING — an empty build/ that looks like a successful one. Both go together, the same
// shape as removing node_modules/@symbiote-native/<pkg> without the lockfile also short-circuiting.

import { readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORKSPACE_ROOTS = ['core', 'adapters', 'packages'];
// build-ngc is Angular's AOT output with its own clean step inside each package's `ng:build`;
// wiping it here would just make that rebuild twice.
const OUTPUT_DIRS = ['build'];
// Bundled single-file outputs (packages/cli's rolldown `bundle.js`). Same argument as build/:
// gitignored, so CI always builds it fresh, but a local `pnpm pack` would happily ship whatever
// the last successful bundle left behind — including for a source file that no longer exists.
const OUTPUT_FILES = ['bundle.js'];

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
  for (const output of OUTPUT_FILES) {
    const target = join(dir, output);
    if (existsSync(target)) {
      rmSync(target, { force: true });
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
