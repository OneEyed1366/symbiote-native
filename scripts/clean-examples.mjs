// Wipes reproducible install/build artifacts under examples/*: CMake's incremental
// android/app/.cxx build never garbage-collects stale objects, so repeated builds only grow it.

import { readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXAMPLES_ROOT = 'examples';
const TARGETS = [
  'node_modules',
  'ios/Pods',
  'ios/build',
  'android/build',
  'android/.gradle',
  'android/app/build',
  'android/app/.cxx',
];

function exampleDirs() {
  if (!existsSync(EXAMPLES_ROOT)) return [];
  return readdirSync(EXAMPLES_ROOT)
    .map(name => join(EXAMPLES_ROOT, name))
    .filter(dir => statSync(dir).isDirectory());
}

let removed = 0;
for (const dir of exampleDirs()) {
  for (const target of TARGETS) {
    const path = join(dir, target);
    if (existsSync(path)) {
      rmSync(path, { recursive: true, force: true });
      removed += 1;
    }
  }
}

console.log(`Cleaned ${removed} example build/install artifact(s).`);
