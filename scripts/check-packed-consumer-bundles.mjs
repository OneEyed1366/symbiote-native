// A publish artifact is only useful if a standalone npm consumer can install and bundle it.
// This matrix copies each framework example to a disposable directory, rewrites every direct
// @symbiote-native/* dependency to a freshly packed tarball from THIS checkout, runs the example's
// real type/AOT check, then creates production Metro bundles for both platforms. The sourcemaps are
// inspected for foreign-framework package files, and the installed adapter must itself appear in
// the graph — so a registry adapter can never make the check falsely green.
import { execFile, execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

export const INTERNAL_PREFIX = '@symbiote-native/';
export const KNOWN_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular', 'solid'];
export const PLATFORMS = ['ios', 'android'];

// Keyed by ARM, which is not the same thing as a framework: one adapter can have more than one
// canary, and `vue` has two. The key names the disposable directory and is what
// SYMBIOTE_CONSUMER_FRAMEWORKS selects on; the FRAMEWORK an arm belongs to is derived from its
// `adapter` (see `ownFrameworkOf`), because that is the only one of the two the foreign-file check
// may use. Keying the whole table on the framework is why `examples/vue-tsx` was in no CI list at
// all until 2026-09-10 — see scripts/lib/canary-examples.mjs.
export const FRAMEWORK_EXAMPLES = {
  react: {
    dir: 'examples/react',
    adapter: '@symbiote-native/react',
    verify: ['npm', ['exec', '--', 'tsc', '--noEmit']],
  },
  vue: {
    dir: 'examples/vue-sfc',
    adapter: '@symbiote-native/vue',
    verify: ['npm', ['run', 'typecheck']],
  },
  'vue-tsx': {
    dir: 'examples/vue-tsx',
    adapter: '@symbiote-native/vue',
    verify: ['npm', ['run', 'typecheck']],
  },
  svelte: {
    dir: 'examples/svelte',
    adapter: '@symbiote-native/svelte',
    verify: ['npm', ['run', 'typecheck']],
  },
  angular: {
    dir: 'examples/angular',
    adapter: '@symbiote-native/angular',
    verify: ['npm', ['run', 'ng:build']],
  },
  solid: {
    dir: 'examples/solid',
    adapter: '@symbiote-native/solid',
    verify: ['npm', ['run', 'typecheck']],
  },
};

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
];

function normalizedPath(value) {
  return value.split(sep).join('/');
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: options.encoding ?? 'utf8',
      stdio: options.stdio ?? 'pipe',
    });
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    throw new Error(
      [
        `${command} ${args.join(' ')} failed in ${options.cwd ?? process.cwd()}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
      { cause: error },
    );
  }
}

// npm's cacache fans out internally: one `npm install` fetches/hashes many packages in parallel
// inside a single process, and its tmp-then-rename cache writes race each other on that
// same-process concurrency, not only across processes. Per-framework cache isolation
// (`frameworkNpmCache` below) kills the cross-framework race this script used to have; it can't
// kill this one, since it's entirely inside one `npm install`. Observed 2026-09-13: ENOTEMPTY on
// `_cacache/content-v2/**` even with isolated caches. Upstream npm/cacache bug, not fixable here -
// retry with a wiped cache, the documented workaround for this failure shape.
//
// `--legacy-peer-deps`: navigation/slider/splash-screen each list all five adapters as peers, so
// an example installing just one still makes npm auto-resolve the other four off the registry.
// That 5-way peer graph triggers arborist's own backtracking crash (`Cannot read properties of
// null (reading 'edgesOut')`, npm/cli#4828 - non-deterministic, hit react only on 2026-09-14).
// This check only needs the tarball to install and bundle, not real peer enforcement, so skipping
// peer resolution removes the trigger instead of hoping a retry dodges it.
async function installWithCacheRetry(cwd, env, cacheDir, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await runAsync(
        'npm',
        [
          'install',
          '--package-lock=false',
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
          '--legacy-peer-deps',
        ],
        { cwd, env },
      );
      return;
    } catch (error) {
      const isCacheRace =
        error instanceof Error && /ENOTEMPTY.*_cacache/s.test(error.message);
      if (!isCacheRace || attempt === attempts) throw error;
      // A failed rmdir mid-write can leave the cache half-consistent; a bare retry can hit the
      // same stuck entry, so wipe and let npm repopulate it from scratch.
      rmSync(cacheDir, { recursive: true, force: true });
      mkdirSync(cacheDir, { recursive: true });
    }
  }
}

// Non-blocking counterpart of `run`, so independent frameworks can install/verify/bundle
// concurrently instead of one at a time (execFileSync blocks the whole event loop, so wrapping it
// in Promise.all buys nothing — only an async child process yields the loop while it waits on I/O).
// `stdio: 'inherit'` isn't available here (execFile always captures), which is a wash: every arm
// writing 'inherit' at once would interleave into unreadable output anyway. Captured
// output is instead surfaced by the caller, attributed to its framework, only on failure or once
// the step completes — see `processExample`'s `log` array below.
async function runAsync(command, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: options.encoding ?? 'utf8',
      // Default maxBuffer (1 MB) is sized for a captured call, not for npm install / tsc / ng:build
      // output that used to bypass it entirely via stdio: 'inherit'.
      maxBuffer: options.maxBuffer ?? 256 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr : '';
    throw new Error(
      [
        `${command} ${args.join(' ')} failed in ${options.cwd ?? process.cwd()}`,
        stdout,
        stderr,
      ]
        .filter(Boolean)
        .join('\n'),
      { cause: error },
    );
  }
}

export function directInternalDependencies(manifest) {
  const names = new Set();
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name.startsWith(INTERNAL_PREFIX)) names.add(name);
    }
  }
  return [...names].sort();
}

export function rewriteInternalDependencies(manifest, tarballs) {
  const rewritten = structuredClone(manifest);
  const missing = [];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = rewritten[field];
    if (dependencies === undefined) continue;
    for (const name of Object.keys(dependencies)) {
      if (!name.startsWith(INTERNAL_PREFIX)) continue;
      const tarball = tarballs.get(name);
      if (tarball === undefined) {
        missing.push(name);
        continue;
      }
      dependencies[name] = `file:${tarball}`;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `No fresh tarball for: ${[...new Set(missing)].sort().join(', ')}`,
    );
  }
  return rewritten;
}

// The framework an arm belongs to, derived from the adapter it consumes rather than from its own
// key. The two agree for every single-canary arm and DIVERGE for `vue-tsx`, whose adapter is
// `@symbiote-native/vue` — and only this value may reach `findForeignFrameworkLeaks`, which
// compares by identity. Handing it the arm key instead would report every legitimate
// `.../navigation/build/vue/index.js` in that bundle as a foreign-framework leak: a guaranteed red
// on a correct build.
export function ownFrameworkOf(example) {
  return example.adapter.slice(INTERNAL_PREFIX.length);
}

export function findForeignFrameworkLeaks(
  sources,
  multiFrameworkPackages,
  ownFramework,
) {
  const leaks = [];
  for (const rawSource of sources) {
    const source = normalizedPath(rawSource);
    for (const pkg of multiFrameworkPackages) {
      const pkgRoot = `/@symbiote-native/${pkg.name}/`;
      if (!source.includes(pkgRoot)) continue;
      for (const foreignFramework of pkg.frameworks) {
        if (foreignFramework === ownFramework) continue;
        const foreign = ['src', 'build', 'build-ngc'].some(buildDir =>
          source.includes(`${pkgRoot}${buildDir}/${foreignFramework}/`),
        );
        if (foreign) {
          leaks.push({
            package: pkg.name,
            foreignFramework,
            source: rawSource,
          });
        }
      }
    }
  }
  return leaks;
}

export function adapterReachedBundle(sources, adapterName) {
  const packagePath = `/node_modules/${adapterName}/`;
  return sources.some(source => normalizedPath(source).includes(packagePath));
}

function selectedValues(envName, allowed) {
  const raw = process.env[envName]?.trim();
  if (!raw) return allowed;
  const requested = raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const unknown = requested.filter(value => !allowed.includes(value));
  if (unknown.length > 0) {
    throw new Error(
      `${envName} contains unsupported values: ${unknown.join(', ')}`,
    );
  }
  return requested;
}

function copyTrackedExample(exampleDir, destination) {
  const output = run('git', ['ls-files', '-z', '--', exampleDir], {
    cwd: REPO_ROOT,
    encoding: 'buffer',
  });
  const files = output.toString().split('\0').filter(Boolean);
  if (files.length === 0) throw new Error(`${exampleDir} has no tracked files`);
  for (const file of files) {
    const target = join(destination, relative(exampleDir, file));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(REPO_ROOT, file), target);
  }
}

// Each `pnpm pack` writes its own uniquely-named tarball into the shared packDirectory, so nothing
// here is mutable shared state - safe to run concurrently. Measured 2026-09-14: 13 packages,
// 21.4s sequential -> 7.6s in parallel on an 8-core machine (three of these - navigation, slider,
// splash-screen - run a full Angular AOT compile as a prepack side effect and dominate either way).
async function packPackages(names, packDirectory) {
  const entries = new Map(
    publishablePackageEntries().map(entry => [entry.name, entry]),
  );
  const tarballs = new Map();
  await Promise.all(
    names.map(async name => {
      const entry = entries.get(name);
      if (entry === undefined)
        throw new Error(`${name} is not publishable from this checkout`);
      const output = await runAsync(
        'pnpm',
        ['pack', '--pack-destination', packDirectory],
        { cwd: join(REPO_ROOT, entry.dir) },
      );
      const finalLine = output.trim().split('\n').at(-1)?.trim();
      if (!finalLine)
        throw new Error(`pnpm pack returned no tarball path for ${name}`);
      const tarball = resolve(join(REPO_ROOT, entry.dir), finalLine);
      if (!existsSync(tarball))
        throw new Error(`pnpm pack did not create ${tarball}`);
      tarballs.set(name, tarball);
    }),
  );
  return tarballs;
}

function discoverMultiFrameworkPackages() {
  const packages = [];
  for (const entry of publishablePackageEntries()) {
    if (!entry.dir.startsWith('packages/')) continue;
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, entry.dir, 'package.json'), 'utf8'),
    );
    const exportKeys = Object.keys(manifest.exports ?? {});
    const frameworks = KNOWN_FRAMEWORKS.filter(framework =>
      exportKeys.includes(`./${framework}`),
    );
    if (frameworks.length >= 2) {
      packages.push({
        name: manifest.name.replace(INTERNAL_PREFIX, ''),
        frameworks,
      });
    }
  }
  return packages;
}

function verifyInstalledTarballs(exampleRoot, names, tarballs) {
  for (const name of names) {
    const installedPath = join(
      exampleRoot,
      'node_modules',
      ...name.split('/'),
      'package.json',
    );
    if (!existsSync(installedPath))
      throw new Error(`${name} was not installed in ${exampleRoot}`);
    const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
    const packed = JSON.parse(
      run('tar', ['-xOf', tarballs.get(name), 'package/package.json']),
    );
    if (JSON.stringify(installed) !== JSON.stringify(packed)) {
      throw new Error(
        `${name} in ${exampleRoot} is not the freshly packed manifest`,
      );
    }
  }
  const duplicateEngines = run(
    'find',
    [
      'node_modules',
      '-path',
      '*/@symbiote-native/engine/package.json',
      '-print',
    ],
    { cwd: exampleRoot },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  if (duplicateEngines.length !== 1) {
    throw new Error(
      `${exampleRoot} installed ${duplicateEngines.length} engine copies:\n` +
        duplicateEngines.join('\n'),
    );
  }
}

async function bundleSources(exampleRoot, platform) {
  const outputDir = mkdtempSync(join(tmpdir(), 'symbiote-consumer-bundle-'));
  const bundle = join(outputDir, `${platform}.js`);
  const sourcemap = join(outputDir, `${platform}.map`);
  try {
    await runAsync(
      join(exampleRoot, 'node_modules/.bin/react-native'),
      [
        'bundle',
        '--entry-file',
        'index.js',
        '--platform',
        platform,
        '--dev',
        'false',
        '--bundle-output',
        bundle,
        '--sourcemap-output',
        sourcemap,
        '--reset-cache',
      ],
      { cwd: exampleRoot },
    );
    return JSON.parse(readFileSync(sourcemap, 'utf8')).sources;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

// One arm's full pipeline (install -> verify -> bundle both platforms), run concurrently with
// every other arm's — each works in its own disposable directory, so nothing here is shared
// mutable state. Output is captured (see runAsync) and printed as one block per arm once the whole
// pipeline finishes, so concurrent arms don't interleave their logs.
async function processExample(
  framework,
  example,
  manifest,
  tarballs,
  multiFrameworkPackages,
  platforms,
  npmEnvironment,
  matrixRoot,
) {
  const log = [];
  const started = Date.now();
  try {
    const exampleRoot = join(matrixRoot, framework);
    copyTrackedExample(example.dir, exampleRoot);
    // Own cache per framework, never the matrix-wide one: npm's cacache does content-addressable
    // writes (tmp-then-rename into content-v2/<algo>/<first two hex chars>/...) that are NOT safe
    // for two `npm install` processes writing into the SAME cache root at once — a concurrent
    // rmdir/mkdir race on a shared bucket directory throws ENOTEMPTY. Every framework already runs
    // its own `npm install` concurrently (see the Promise.all in main()); a shared
    // `npm_config_cache` was the one piece of mutable state that comment didn't account for.
    const frameworkNpmCache = join(exampleRoot, '.npm-cache');
    mkdirSync(frameworkNpmCache, { recursive: true });
    const frameworkNpmEnvironment = {
      ...npmEnvironment,
      npm_config_cache: frameworkNpmCache,
    };
    const directPackages = directInternalDependencies(manifest);
    const rewritten = rewriteInternalDependencies(manifest, tarballs);
    writeFileSync(
      join(exampleRoot, 'package.json'),
      `${JSON.stringify(rewritten, null, 2)}\n`,
    );
    rmSync(join(exampleRoot, 'package-lock.json'), { force: true });

    log.push(`${framework}: installing fresh tarball consumer ...`);
    await installWithCacheRetry(
      exampleRoot,
      frameworkNpmEnvironment,
      frameworkNpmCache,
    );
    verifyInstalledTarballs(exampleRoot, directPackages, tarballs);

    const [verifyCommand, verifyArgs] = example.verify;
    log.push(
      `${framework}: running ${verifyCommand} ${verifyArgs.join(' ')} ...`,
    );
    await runAsync(verifyCommand, verifyArgs, {
      cwd: exampleRoot,
      env: verifyCommand === 'npm' ? frameworkNpmEnvironment : process.env,
    });

    await Promise.all(
      platforms.map(async platform => {
        const sources = await bundleSources(exampleRoot, platform);
        if (!adapterReachedBundle(sources, example.adapter)) {
          throw new Error(
            `${framework}/${platform} did not bundle ${example.adapter}; ` +
              'the matrix may be validating registry or dead code instead of this adapter',
          );
        }
        const leaks = findForeignFrameworkLeaks(
          sources,
          multiFrameworkPackages,
          ownFrameworkOf(example),
        );
        if (leaks.length > 0) {
          const details = leaks
            .map(
              leak =>
                `${leak.package}: ${leak.foreignFramework} file reached ${framework}/${platform}\n` +
                `  ${leak.source}`,
            )
            .join('\n');
          throw new Error(details);
        }
        log.push(
          `${framework}/${platform}: ok (${sources.length} modules, current adapter, no foreign framework)`,
        );
      }),
    );

    log.push(
      `${framework}: done in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
    console.log(log.join('\n'));
  } catch (error) {
    // Flush whatever progress this framework logged before failing — Promise.all rejects on the
    // first error, and without this the other four frameworks' concurrent output can bury it.
    if (log.length > 0) console.log(log.join('\n'));
    throw error;
  }
}

async function main() {
  const frameworks = selectedValues(
    'SYMBIOTE_CONSUMER_FRAMEWORKS',
    Object.keys(FRAMEWORK_EXAMPLES),
  );
  const platforms = selectedValues('SYMBIOTE_CONSUMER_PLATFORMS', PLATFORMS);
  const matrixRoot = mkdtempSync(join(tmpdir(), 'symbiote-consumer-matrix-'));
  const packDirectory = join(matrixRoot, 'tarballs');
  mkdirSync(packDirectory);
  // Base env for every framework's npm calls; each gets its OWN npm_config_cache override inside
  // processExample, never a shared one — see the comment there.
  const npmEnvironment = { ...process.env };
  // pnpm injects its own setting into child processes; npm does not recognize it and warns on
  // every install/run. It has no bearing on the standalone consumer, so do not forward it.
  delete npmEnvironment.npm_config_manage_package_manager_versions;

  try {
    const selectedExamples = frameworks.map(framework => [
      framework,
      FRAMEWORK_EXAMPLES[framework],
    ]);
    const manifests = new Map(
      selectedExamples.map(([framework, example]) => [
        framework,
        JSON.parse(
          readFileSync(join(REPO_ROOT, example.dir, 'package.json'), 'utf8'),
        ),
      ]),
    );
    const packageNames = [
      ...new Set(
        [...manifests.values()].flatMap(manifest =>
          directInternalDependencies(manifest),
        ),
      ),
    ].sort();

    console.log(
      `Packing ${packageNames.length} direct consumer package(s): ${packageNames.join(', ')}`,
    );
    const tarballs = await packPackages(packageNames, packDirectory);
    const multiFrameworkPackages = discoverMultiFrameworkPackages();

    // Every framework works in its own disposable directory (npm cache included — see
    // processExample), so running them concurrently turns wall time from "sum of all five" into
    // "roughly the slowest one" instead of needing to serialize.
    //
    // allSettled, not all: Promise.all rejects the instant the FIRST framework fails while the
    // others keep running in the background (nothing cancels them). The finally block below then
    // rmSync's the whole matrixRoot immediately on that rejection, which races an in-progress
    // sibling's own npm/cacache writes under that same root — the real cause of the "ENOTEMPTY on
    // _cacache" this script kept hitting even after per-framework cache isolation (782d2cdc) and a
    // wipe-and-retry (3bd62461). Worse, a throw from `finally` replaces whatever the `try` was
    // rejecting with, so the ENOTEMPTY from that race was masking each framework's real error.
    // Waiting for every framework to settle before cleanup removes the race outright.
    const settled = await Promise.allSettled(
      selectedExamples.map(([framework, example]) =>
        processExample(
          framework,
          example,
          manifests.get(framework),
          tarballs,
          multiFrameworkPackages,
          platforms,
          npmEnvironment,
          matrixRoot,
        ),
      ),
    );
    const failures = settled
      .filter(result => result.status === 'rejected')
      .map(result => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} of ${selectedExamples.length} framework(s) failed`,
      );
    }

    console.log('\nAll packed consumer bundles passed.');
  } finally {
    if (process.env.SYMBIOTE_KEEP_CONSUMER_MATRIX === '1') {
      console.log(`Keeping consumer matrix at ${matrixRoot}`);
    } else {
      rmSync(matrixRoot, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
