// packages/{slider,navigation,...} ship ONE npm package per third-party native view, with a
// subpath per framework (./react, ./vue, ./svelte, ./angular) so the wrapper is written once
// and reachable from every adapter (<adapters_reach_full_feature_parity>). Metro only bundles
// what a real import reaches — an app on one framework should never carry another framework's
// slice of these packages — but nothing has enforced that beyond code review. A shared barrel
// re-exporting a foreign subpath, or a `core/` file importing one directly, would leak silently:
// every headless signal (tsc, vitest) stays green, because the leak only exists in the bundle
// Metro actually produces.
//
// This builds one real `react-native bundle` per framework example (with a sourcemap) and reads
// the sourcemap's `sources` list — the literal file paths Metro resolved into the graph — for any
// file under a FOREIGN framework's src/build folder of a multi-framework package. A module path
// never lies about what Metro pulled in; a symbol-name grep would rot the moment someone renames
// a class or restructures a barrel.
//
// Needs each example's own `npm install` already done (node_modules/.bin/react-native present) —
// this does not install anything itself. Slow (one Metro bundle per framework, ~10-60s each), so
// it is a standalone script (`pnpm run check:bundle-isolation`), not wired into `test`/`lint`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
const KNOWN_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular', 'solid'];

// One buildable example per framework this repo currently ships a canary for. A framework with
// no example here yet (solid, still L1) is skipped, not failed — nothing to bundle against.
const FRAMEWORK_EXAMPLES = {
  react: 'examples/react',
  vue: 'examples/vue-sfc',
  svelte: 'examples/svelte',
  angular: 'examples/angular',
};

function discoverMultiFrameworkPackages() {
  const packages = [];
  for (const entry of publishablePackageEntries()) {
    if (!entry.dir.startsWith('packages/')) continue;
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, entry.dir, 'package.json'), 'utf8'));
    const exportKeys = Object.keys(manifest.exports ?? {});
    const frameworks = KNOWN_FRAMEWORKS.filter(framework => exportKeys.includes(`./${framework}`));
    if (frameworks.length >= 2) {
      packages.push({ name: manifest.name.replace('@symbiote-native/', ''), frameworks });
    }
  }
  return packages;
}

function buildBundleSources(framework, exampleDir) {
  const absoluteDir = join(REPO_ROOT, exampleDir);
  const reactNativeBinary = join(absoluteDir, 'node_modules/.bin/react-native');
  if (!existsSync(reactNativeBinary)) {
    throw new Error(`react-native CLI not installed — run \`npm install\` in ${exampleDir} first`);
  }

  // examples/angular's index.js imports from ./build/angular/src/App, produced by the ngc AOT
  // compile (`ng:build`) — a gitignored artifact, unlike the other examples' plain TS/SFC entries
  // that Metro transforms on the fly. Bundling before this step fails with a module-not-found on
  // the very first import.
  if (framework === 'angular') {
    execFileSync('npm', ['run', 'ng:build'], { cwd: absoluteDir, stdio: 'pipe' });
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'symbiote-bundle-isolation-'));
  const bundleOutput = join(tmpDir, 'bundle.js');
  const sourcemapOutput = join(tmpDir, 'bundle.map');
  try {
    execFileSync(
      reactNativeBinary,
      [
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        'ios',
        '--dev',
        'false',
        '--bundle-output',
        bundleOutput,
        '--sourcemap-output',
        sourcemapOutput,
        '--reset-cache',
      ],
      { cwd: absoluteDir, stdio: 'pipe' },
    );
    return JSON.parse(readFileSync(sourcemapOutput, 'utf8')).sources;
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function findForeignFrameworkLeaks(sources, multiFrameworkPackages, ownFramework) {
  const leaks = [];
  for (const source of sources) {
    for (const pkg of multiFrameworkPackages) {
      const pkgRoot = `/@symbiote-native/${pkg.name}/`;
      if (!source.includes(pkgRoot)) continue;
      for (const foreignFramework of pkg.frameworks) {
        if (foreignFramework === ownFramework) continue;
        const isForeignFrameworkFile = ['src', 'build', 'build-ngc'].some(buildDir =>
          source.includes(`${pkgRoot}${buildDir}/${foreignFramework}/`),
        );
        if (isForeignFrameworkFile) leaks.push({ package: pkg.name, foreignFramework, source });
      }
    }
  }
  return leaks;
}

function main() {
  const multiFrameworkPackages = discoverMultiFrameworkPackages();
  if (multiFrameworkPackages.length === 0) {
    console.log('No multi-framework packages under packages/ — nothing to check.');
    return;
  }
  console.log(
    `Checking ${multiFrameworkPackages.length} multi-framework package(s): ` +
      multiFrameworkPackages.map(pkg => pkg.name).join(', '),
  );

  let hasFailure = false;
  for (const [framework, exampleDir] of Object.entries(FRAMEWORK_EXAMPLES)) {
    if (!existsSync(join(REPO_ROOT, exampleDir))) continue;
    process.stdout.write(`  ${framework} (${exampleDir}) ... `);

    let sources;
    try {
      sources = buildBundleSources(framework, exampleDir);
    } catch (error) {
      hasFailure = true;
      console.log('FAIL (bundle build errored)');
      console.error(String(error.stderr ?? error.message));
      continue;
    }

    const leaks = findForeignFrameworkLeaks(sources, multiFrameworkPackages, framework);
    if (leaks.length === 0) {
      console.log(`ok (${sources.length} modules, no foreign-framework code)`);
      continue;
    }
    hasFailure = true;
    console.log(`FAIL (${leaks.length} foreign-framework file(s) reached this bundle)`);
    for (const leak of leaks) {
      console.error(
        `    ${leak.package}: a ${leak.foreignFramework}-only file reached the ${framework} bundle\n` +
          `      ${leak.source}`,
      );
    }
  }

  if (hasFailure) {
    console.error(
      "\nA multi-framework package under packages/ leaked another framework's code into a " +
        'single-framework bundle. Check for a barrel re-exporting a foreign subpath, or a ' +
        'shared core/ file importing one directly.',
    );
    process.exitCode = 1;
    return;
  }
  console.log('\nAll frameworks stay isolated.');
}

main();
