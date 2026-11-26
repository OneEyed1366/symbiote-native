// Each arm installs tarballs packed from THIS checkout into a copy of one example and type-checks
// it. A canary is then bundled for both platforms: its sourcemap must hold the installed adapter,
// so a registry copy cannot pass, and no file of a foreign framework
import { execFile, execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import { createLimiter } from './lib/create-limiter.mjs';
import { parseJson, readJsonFile } from './lib/parse-json.mjs';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';

export const INTERNAL_PREFIX = '@symbiote-native/';
export const KNOWN_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular', 'solid'];
export const PLATFORMS = ['ios', 'android'];

// Keyed by ARM, which is not the same thing as a framework: one adapter can have more than one
// canary, and `vue` has two. The key names the disposable directory; the FRAMEWORK an arm belongs
// to is derived from its `adapter` (see `ownFrameworkOf`) — the one the foreign-file check may use.
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

// Only the expo examples import the Expo wrappers, so their type check is what reads those types
const EXPO_EXAMPLES = {
  'expo-react': {
    dir: 'examples/expo-react',
    adapter: '@symbiote-native/react',
    verify: ['npm', ['exec', '--', 'tsc', '--noEmit']],
    isTypecheckOnly: true,
  },
  'expo-vue-sfc': {
    dir: 'examples/expo-vue-sfc',
    adapter: '@symbiote-native/vue',
    verify: ['npm', ['run', 'typecheck']],
    isTypecheckOnly: true,
  },
  'expo-vue-tsx': {
    dir: 'examples/expo-vue-tsx',
    adapter: '@symbiote-native/vue',
    verify: ['npm', ['run', 'typecheck']],
    isTypecheckOnly: true,
  },
  'expo-svelte': {
    dir: 'examples/expo-svelte',
    adapter: '@symbiote-native/svelte',
    verify: ['npm', ['run', 'typecheck']],
    isTypecheckOnly: true,
  },
  'expo-angular': {
    dir: 'examples/expo-angular',
    adapter: '@symbiote-native/angular',
    verify: ['npm', ['run', 'ng:build']],
    isTypecheckOnly: true,
  },
  'expo-solid': {
    dir: 'examples/expo-solid',
    adapter: '@symbiote-native/solid',
    verify: ['npm', ['run', 'typecheck']],
    isTypecheckOnly: true,
  },
};

export const MATRIX_EXAMPLES = { ...FRAMEWORK_EXAMPLES, ...EXPO_EXAMPLES };

export function platformsOf(example, platforms) {
  return example.isTypecheckOnly ? [] : platforms;
}

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

// Retried: parallel fetches of one install can race in the npm cache and raise ENOTEMPTY
// `--legacy-peer-deps`: resolving the peers of all five adapters can crash npm (npm/cli#4828)
async function installWithCacheRetry(cwd, env, cacheDir, attemptsLeft = 3) {
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
  } catch (error) {
    const isCacheRace =
      error instanceof Error && /ENOTEMPTY.*_cacache/s.test(error.message);
    if (!isCacheRace || attemptsLeft === 1) throw error;
    // A bare retry can hit the same half-written entry, so npm repopulates the cache from scratch
    rmSync(cacheDir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
    await installWithCacheRetry(cwd, env, cacheDir, attemptsLeft - 1);
  }
}

// The async twin of `run`, so arms overlap. Output is captured, as `processExample` prints
// one block per arm and live output of several arms would interleave
async function runAsync(command, args, options = {}) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      encoding: options.encoding ?? 'utf8',
      // The 1 MB default is too small for the output of npm install, `tsc` and `ng:build`
      maxBuffer: options.maxBuffer ?? 256 * 1_024 * 1_024,
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

// Each framework's npm install needs its OWN cache directory — npm's cacache isn't safe for two
// installs writing the same cache root concurrently (see the ENOTEMPTY comment above). Without a
// cacheRoot the cache dies with the disposable matrix dir; CI passes SYMBIOTE_NPM_CACHE_ROOT.
export function npmCacheDirFor(exampleRoot, framework, cacheRoot) {
  if (cacheRoot) return join(cacheRoot, framework);
  return join(exampleRoot, '.npm-cache');
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

// From the adapter, not the arm key: they differ for `vue-tsx`, and `findForeignFrameworkLeaks`
// given the key would report every Vue file of that bundle as foreign
export function ownFrameworkOf(example) {
  return example.adapter.slice(INTERNAL_PREFIX.length);
}

function holdsFrameworkFile(source, packageName, framework) {
  const packageRoot = `/@symbiote-native/${packageName}/`;
  return ['src', 'build', 'build-ngc'].some(buildDir =>
    source.includes(`${packageRoot}${buildDir}/${framework}/`),
  );
}

export function findForeignFrameworkLeaks(
  sources,
  multiFrameworkPackages,
  ownFramework,
) {
  return sources.flatMap(rawSource => {
    const source = normalizedPath(rawSource);
    return multiFrameworkPackages.flatMap(pkg =>
      pkg.frameworks
        .filter(
          framework =>
            framework !== ownFramework &&
            holdsFrameworkFile(source, pkg.name, framework),
        )
        .map(foreignFramework => ({
          package: pkg.name,
          foreignFramework,
          source: rawSource,
        })),
    );
  });
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

// A `prepare` that is only `ng:build` would redo the `build-ngc` already on disk, so it is skipped
// Anything more, a `prepack` or codegen vendoring, makes files the tarball needs
export function packArgs(manifest, hasAngularBuild, packDirectory) {
  const { prepare, prepack } = manifest.scripts ?? {};
  const pack = ['pack', '--pack-destination', packDirectory];
  const isRebuildOnly =
    prepare === 'pnpm run ng:build' && prepack === undefined;
  return isRebuildOnly && hasAngularBuild
    ? ['--config.ignore-scripts=true', ...pack]
    : pack;
}

// Packs that still run scripts cost ~0.5 GB each in `ng:build`, so they are capped at one per core
// The ~70 uncapped packs of an expo arm would likely outgrow a runner's memory, not measured there
async function packPackages(names, packDirectory) {
  const entries = new Map(
    publishablePackageEntries().map(entry => [entry.name, entry]),
  );
  const tarballs = new Map();
  const limitPack = createLimiter(availableParallelism());
  await Promise.all(
    names.map(async name => {
      const entry = entries.get(name);
      if (entry === undefined)
        throw new Error(`${name} is not publishable from this checkout`);
      const cwd = join(REPO_ROOT, entry.dir);
      const args = packArgs(
        readJsonFile(join(cwd, 'package.json')),
        existsSync(join(cwd, 'build-ngc')),
        packDirectory,
      );
      const output = await limitPack(() => runAsync('pnpm', args, { cwd }));
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
    const manifest = readJsonFile(join(REPO_ROOT, entry.dir, 'package.json'));
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
    const installed = readJsonFile(installedPath);
    const packed = parseJson(
      run('tar', ['-xOf', tarballs.get(name), 'package/package.json']),
      `the packed manifest of ${name}`,
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
    return readJsonFile(sourcemap).sources;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

// Kept apart so `processExample` reads as install, type check, bundle
// A cache per arm: two `npm install` writing one cache root at once raise ENOTEMPTY
async function installConsumer({ framework, example, manifest }, matrix) {
  const root = join(matrix.matrixRoot, framework);
  copyTrackedExample(example.dir, root);
  const cacheDir = npmCacheDirFor(
    root,
    framework,
    process.env.SYMBIOTE_NPM_CACHE_ROOT,
  );
  mkdirSync(cacheDir, { recursive: true });
  const environment = { ...matrix.npmEnvironment, npm_config_cache: cacheDir };
  const rewritten = rewriteInternalDependencies(manifest, matrix.tarballs);
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify(rewritten, null, 2)}\n`,
  );
  rmSync(join(root, 'package-lock.json'), { force: true });

  await installWithCacheRetry(root, environment, cacheDir);
  verifyInstalledTarballs(
    root,
    directInternalDependencies(manifest),
    matrix.tarballs,
  );
  return { root, environment };
}

// One platform bundle must hold this arm's adapter and no file of a foreign framework
async function checkBundle(root, platform, arm, multiFrameworkPackages) {
  const { framework, example } = arm;
  const sources = await bundleSources(root, platform);
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
  return sources.length;
}

// Kept apart so the timing and the log flush of `processExample` read in one glance
async function runArm(arm, matrix, log) {
  const { framework, example } = arm;
  const consumer = await installConsumer(arm, matrix);
  const [verifyCommand, verifyArgs] = example.verify;
  log.push(
    `${framework}: running ${verifyCommand} ${verifyArgs.join(' ')} ...`,
  );
  await runAsync(verifyCommand, verifyArgs, {
    cwd: consumer.root,
    env: verifyCommand === 'npm' ? consumer.environment : process.env,
  });

  await Promise.all(
    platformsOf(example, matrix.platforms).map(async platform => {
      const moduleCount = await checkBundle(
        consumer.root,
        platform,
        arm,
        matrix.multiFrameworkPackages,
      );
      log.push(
        `${framework}/${platform}: ok (${moduleCount} modules, current adapter, no foreign framework)`,
      );
    }),
  );
}

// The log is printed as one block per arm, so concurrent arms do not interleave
async function processExample(arm, matrix) {
  const { framework } = arm;
  const startedAt = Date.now();
  const log = [`${framework}: installing fresh tarball consumer ...`];
  try {
    await runArm(arm, matrix, log);
    const seconds = (Date.now() - startedAt) / 1_000;
    log.push(`${framework}: done in ${seconds.toFixed(1)}s`);
    console.log(log.join('\n'));
  } catch (error) {
    // Printed before the rethrow, or the output of the other arms buries how far this one got
    console.log(log.join('\n'));
    throw error;
  }
}

function selectedArms() {
  return selectedValues(
    'SYMBIOTE_CONSUMER_FRAMEWORKS',
    Object.keys(MATRIX_EXAMPLES),
  ).map(framework => {
    const example = MATRIX_EXAMPLES[framework];
    const manifest = readJsonFile(join(REPO_ROOT, example.dir, 'package.json'));
    return { framework, example, manifest };
  });
}

// pnpm hands its children a setting of its own, which npm does not know and warns about
function consumerNpmEnvironment() {
  const environment = { ...process.env };
  delete environment.npm_config_manage_package_manager_versions;
  return environment;
}

async function runMatrix(arms, platforms, matrixRoot) {
  const packDirectory = join(matrixRoot, 'tarballs');
  mkdirSync(packDirectory);
  const packageNames = [
    ...new Set(arms.flatMap(arm => directInternalDependencies(arm.manifest))),
  ].sort();

  console.log(
    `Packing ${packageNames.length} direct consumer package(s): ${packageNames.join(', ')}`,
  );
  const matrix = {
    tarballs: await packPackages(packageNames, packDirectory),
    multiFrameworkPackages: discoverMultiFrameworkPackages(),
    npmEnvironment: consumerNpmEnvironment(),
    platforms,
    matrixRoot,
  };

  // Not `Promise.all`: the caller's cleanup would run while other arms still write under
  // `matrixRoot`, and its ENOTEMPTY would replace the real error of the failed arm
  const settled = await Promise.allSettled(
    arms.map(arm => processExample(arm, matrix)),
  );
  const failures = settled
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${failures.length} of ${arms.length} framework(s) failed`,
    );
  }
}

async function main() {
  const arms = selectedArms();
  const platforms = selectedValues('SYMBIOTE_CONSUMER_PLATFORMS', PLATFORMS);
  const matrixRoot = mkdtempSync(join(tmpdir(), 'symbiote-consumer-matrix-'));

  try {
    await runMatrix(arms, platforms, matrixRoot);
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
