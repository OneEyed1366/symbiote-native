// The local-registry half of the dev loop: publish this working tree's build of a
// `@symbiote-native/*` package to a Verdaccio running on localhost, and point an example at it.

// Replaces the documented `.tarballs/*.tgz` loop (<examples_vs_dot_examples> in CLAUDE.md), which
// leaves machine-local install state inside a TRACKED manifest. Here the manifest keeps its
// ordinary public version literal; only a gitignored `.npmrc` says where it resolves from.

// npm has NO registry fallback chain — a configured registry that's unreachable is a hard failure,
// not a fall-through to npmjs — so the pointer stays untracked: a clone has no `.npmrc` and
// resolves from npmjs as normal. Opting in is this script; opting out is `off`.

// npm's lockfile still short-circuits: publishing new bytes under the SAME version and running
// `npm install` prints `up to date` and keeps the old copy. `refresh` wipes `node_modules`/
// `package-lock.json` for a full install; a targeted install trusts the rest is consistent.

// `pod install` is still owed afterwards: replacing a package folder deletes
// `@symbiote-native/splash-screen/.rn-bootsplash/`, which the podspec vendors at pod-install time.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { listSvelteFiles } from './copy-svelte-sources.mjs';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';
import {
  declaredAmong,
  isUnchanged,
  isUntouched,
  movedSince,
  newestMtimeMs,
  readStamps,
  withDependents,
  writeStamps,
} from './lib/registry-stamps.mjs';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
const REGISTRY = 'http://localhost:4873';
const REGISTRY_HOST = '//localhost:4873/';
const SCOPE = '@symbiote-native';
// Gitignored. A token for an anonymous-publish registry bound to loopback is not a secret, but it
// is machine state and has no business in a tracked file.
const TOKEN_FILE = join(REPO_ROOT, 'scripts', 'verdaccio', 'token');
// Gitignored like the token: what the registry last received, per package
const STAMPS_FILE = join(REPO_ROOT, 'scripts', 'verdaccio', 'stamps.json');
// Lives in an example's `node_modules`, so wiping it also wipes the claim of what it holds
const INSTALLED_FILE = '.symbiote-installed.json';
const USER = 'symbiote-dev';
const IMAGE = 'verdaccio/verdaccio';
const CONTAINER = 'verdaccio';
const STORAGE_VOLUME = 'verdaccio-storage';

function exampleDirs() {
  return execFileSync('ls', ['-d', join(REPO_ROOT, 'examples')], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .flatMap(dir =>
      execFileSync('ls', [dir], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .map(name => join('examples', name)),
    )
    .filter(dir => existsSync(join(REPO_ROOT, dir, 'package.json')));
}

async function isRegistryUp() {
  try {
    const response = await fetch(`${REGISTRY}/-/ping`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Created once and reused. Verdaccio's config grants anonymous publish, but the npm CLI refuses to
// even attempt a publish without SOME token configured for the host — so the token exists to
// satisfy npm, not the registry.
async function ensureToken() {
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, 'utf8').trim();
  // A first run registers and gets a token, a later run on a registry that knows the user gets
  // `username is already registered` and logs in with the same PUT under basic auth
  // That happens once the token file is gone while the storage survived, e.g. after `git clean`
  const body = JSON.stringify({
    name: USER,
    password: USER,
    type: 'user',
    roles: [],
    date: new Date().toISOString(),
  });
  const url = `${REGISTRY}/-/user/org.couchdb.user:${USER}`;
  const headers = { 'content-type': 'application/json' };
  let response = await fetch(url, { method: 'PUT', headers, body });
  let payload = await response.json();
  if (typeof payload.token !== 'string') {
    const basic = Buffer.from(`${USER}:${USER}`).toString('base64');
    response = await fetch(url, {
      method: 'PUT',
      headers: { ...headers, authorization: `Basic ${basic}` },
      body,
    });
    payload = await response.json();
  }
  if (typeof payload.token !== 'string') {
    throw new Error(`could not obtain a token: ${JSON.stringify(payload)}`);
  }
  writeFileSync(TOKEN_FILE, `${payload.token}\n`);
  return payload.token;
}

// `publishablePackageEntries()` yields { name, dir } and nothing else, so the version is read here
// rather than assumed to be on the entry — an `entry.version` of `undefined` would silently install
// `@symbiote-native/engine@undefined`, which npm resolves as the `undefined` DIST-TAG and fails with
// a message about a tag rather than a version.
function versionOf(entry) {
  return JSON.parse(
    readFileSync(join(REPO_ROOT, entry.dir, 'package.json'), 'utf8'),
  ).version;
}

const npmrcFor = token =>
  `# Written by scripts/local-registry.mjs — gitignored, machine-local, safe to delete.\n` +
  `# Removing this file returns the example to the public registry with no other change.\n` +
  `${SCOPE}:registry=${REGISTRY}/\n` +
  `${REGISTRY_HOST}:_authToken=${token}\n`;

async function commandOn(targets) {
  const token = await ensureToken();
  for (const dir of targets) {
    writeFileSync(join(REPO_ROOT, dir, '.npmrc'), npmrcFor(token));
    console.log(`  ${dir}/.npmrc -> ${REGISTRY}`);
  }
  console.log(
    `\n${targets.length} example(s) now resolve ${SCOPE}/* locally. Publish with:\n` +
      `  node scripts/local-registry.mjs publish core/engine core/components\n` +
      `then refresh each example:\n` +
      `  node scripts/local-registry.mjs refresh ${targets[0] ?? 'examples/react'}`,
  );
}

function commandOff(targets) {
  for (const dir of targets) {
    const path = join(REPO_ROOT, dir, '.npmrc');
    if (!existsSync(path)) continue;
    rmSync(path);
    console.log(`  removed ${dir}/.npmrc`);
  }
  console.log(
    '\nBack on the public registry. `npm install` in an example now resolves from npmjs.',
  );
}

async function isInRegistry(name, version) {
  try {
    const response = await fetch(
      `${REGISTRY}/${name.replace('/', '%2f')}/${version}`,
      { signal: AbortSignal.timeout(2000) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

function entryFor(entries, dir) {
  const entry = entries.find(candidate => candidate.dir === dir);
  if (entry === undefined) {
    throw new Error(`${dir} is not a publishable package`);
  }
  return entry;
}

const execFileAsync = promisify(execFile);
const DRY_RUN_PARALLELISM = 8;

// Runs `task` over `items` a batch at a time, so the processes it starts stay few
async function inBatches(items, size, task) {
  if (items.length === 0) return [];
  const head = await Promise.all(items.slice(0, size).map(task));
  return [...head, ...(await inBatches(items.slice(size), size, task))];
}

// What each package holds now, and whether the registry already has exactly that
function planPublish(selected, stamps, isForced) {
  return inBatches(selected, DRY_RUN_PARALLELISM, async entry => {
    const version = versionOf(entry);
    const stamp = stamps[entry.name];
    const isHeldInRegistry = await isInRegistry(entry.name, version);
    const newest = newestMtimeMs(join(REPO_ROOT, entry.dir));
    if (!isForced && isHeldInRegistry && isUntouched(stamp, version, newest)) {
      return { entry, current: stamp, isHeld: true };
    }
    // The integrity `npm pack` would ship: equal for equal contents, and cheap unlike a real pack
    const { stdout } = await execFileAsync(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts'],
      { cwd: join(REPO_ROOT, entry.dir) },
    );
    const current = { version, integrity: JSON.parse(stdout)[0].integrity };
    const isHeld = !isForced && isUnchanged(stamp, current, isHeldInRegistry);
    return { entry, current, isHeld };
  });
}

// npm refuses to publish over an existing version and the loop republishes one many times a day
// Verdaccio allows it through `unpublish: $all`, so every publish is an unpublish first
function publishEntry(entry, version, token) {
  const packageDir = join(REPO_ROOT, entry.dir);
  // Only `pnpm pack` applies the `publishConfig` swap and resolves `workspace:*`, never `npm pack`
  const packOutput = execFileSync(
    'pnpm',
    ['pack', '--pack-destination', packageDir],
    { cwd: packageDir, encoding: 'utf8' },
  );
  // pnpm prints the tarball name, not a path, and npm resolves a bare name against the cwd
  const tarball = join(
    packageDir,
    basename(packOutput.trim().split('\n').pop().trim()),
  );
  const npmArgs = [
    `--registry=${REGISTRY}`,
    `--${REGISTRY_HOST}:_authToken=${token}`,
  ];
  try {
    execFileSync(
      'npm',
      ['unpublish', `${entry.name}@${version}`, '--force', ...npmArgs],
      { stdio: 'ignore' },
    );
  } catch {
    // Not published here yet, the normal state on a first run
  }
  execFileSync('npm', ['publish', tarball, ...npmArgs], { stdio: 'ignore' });
  rmSync(tarball, { force: true });
}

// Folders the JS build does not read, so a write there is no edit that calls for a rebuild
// Native sources reach the example through the tarball, not through the build
const NOT_BUILD_INPUTS = ['node_modules', 'build', 'build-ngc', 'cpp', 'android', 'ios'];

function runPnpm(args) {
  execFileSync('pnpm', args, { cwd: REPO_ROOT, stdio: 'inherit' });
}

// Packages with a source newer than the last sync of them, or never synced, and their dependents
// A dependent is rebuilt too, since its declarations are derived from the types it imports
function packagesToBuild(entries, stamps) {
  const moved = entries.filter(({ name, dir }) => {
    const stamp = stamps[name];
    return (
      typeof stamp?.at !== 'number' ||
      newestMtimeMs(join(REPO_ROOT, dir), NOT_BUILD_INPUTS) > stamp.at
    );
  });
  const dependenciesByName = Object.fromEntries(
    entries.map(({ name, dir }) => {
      const manifest = JSON.parse(
        readFileSync(join(REPO_ROOT, dir, 'package.json'), 'utf8'),
      );
      const declared = {
        ...manifest.dependencies,
        ...manifest.peerDependencies,
        ...manifest.devDependencies,
      };
      return [name, Object.keys(declared)];
    }),
  );
  const names = withDependents(
    moved.map(({ name }) => name),
    dependenciesByName,
  );
  return entries.filter(({ name }) => names.includes(name));
}

// The cheap steps always run. The Svelte declarations (every package, ~30 s) need a changed package
// that holds a `.svelte` file, and `ng:build` (~35 s over all) runs only for the changed packages
function buildChanged(changed, isFast) {
  ['typecheck', 'fix-esm-extensions', 'copy-svelte-sources'].forEach(step =>
    runPnpm(['run', step]),
  );
  const hasSvelte = changed.some(
    ({ dir }) => listSvelteFiles(join(REPO_ROOT, dir, 'src')).length > 0,
  );
  if (hasSvelte && !isFast) runPnpm(['run', 'emit-svelte-declarations']);
  if (changed.length > 0 && !isFast) {
    const filters = changed.flatMap(({ name }) => ['--filter', name]);
    runPnpm([...filters, '--if-present', 'run', 'ng:build']);
  }
  runPnpm(['--filter', './{core,adapters,packages}/*', '--if-present', 'run', 'build']);
}

// The build runs here, since `pnpm pack` ships what sits in `build/`
// `--full` rebuilds everything clean, `--fast` skips the Svelte declarations and `ng:build`
async function commandPublish(dirs, { isFull = false, isFast = false } = {}) {
  const entries = publishablePackageEntries();
  const stamps = readStamps(STAMPS_FILE);
  if (isFull) {
    console.log('building everything (pnpm run prepublish-build) ...');
    runPnpm(['run', 'prepublish-build']);
  } else {
    const changed = packagesToBuild(entries, stamps);
    console.log(`building ${changed.length} package(s): changed sources and their dependents ...`);
    buildChanged(changed, isFast);
  }
  // Files written by the build are not edits, so the stamp time is taken once it is done
  const builtAt = Date.now();
  const named = dirs.length > 0 ? dirs : entries.map(entry => entry.dir);
  const selected = named.map(dir => entryFor(entries, dir));
  const plan = await planPublish(selected, stamps, isFull || dirs.length > 0);
  const token = await ensureToken();
  const published = [];
  const failed = [];
  // The label is printed before the work, since a package can take seconds and a silent run reads
  // as a hang
  plan.forEach(({ entry, current, isHeld }, index) => {
    const label = `[${String(index + 1).padStart(2)}/${plan.length}]`;
    process.stdout.write(`  ${label} ${entry.name}@${current.version} ... `);
    if (isHeld) {
      stamps[entry.name] = { ...current, at: builtAt };
      console.log('unchanged');
      return;
    }
    try {
      publishEntry(entry, current.version, token);
      stamps[entry.name] = { ...current, at: builtAt };
      published.push({ name: entry.name, version: current.version });
      console.log('published');
    } catch (error) {
      // Collected, not thrown: one failed package must not hide the rest, nor vanish from the end
      console.log('FAILED');
      failed.push(`${entry.name} (${error.message.split('\n')[0]})`);
    }
  });
  writeStamps(STAMPS_FILE, stamps);
  const heldCount = plan.length - published.length - failed.length;
  console.log(`\n${published.length} published, ${heldCount} unchanged`);
  if (failed.length > 0) {
    console.log(`\nFAILED to publish ${failed.length}:`);
    for (const line of failed) console.log(`  ${line}`);
    console.log('\nCheck the build output above for a type error.');
    process.exitCode = 1;
  }
}

// Written once an install has finished, so a killed refresh leaves the old claim and is redone
function recordInstalled(exampleRoot) {
  const modules = join(exampleRoot, 'node_modules');
  const installed = Object.fromEntries(
    Object.entries(readStamps(STAMPS_FILE))
      .filter(([name]) => existsSync(join(modules, name)))
      .map(([name, stamp]) => [name, stamp.integrity]),
  );
  writeStamps(join(modules, INSTALLED_FILE), installed);
}

// The repair for the lockfile short-circuit and any drift of `node_modules` from the manifest
// Wiping both `node_modules` and `package-lock.json` is the one repair that leaves no stale bytes
function refreshFully(exampleRoot) {
  rmSync(join(exampleRoot, 'node_modules'), { recursive: true, force: true });
  rmSync(join(exampleRoot, 'package-lock.json'), { force: true });
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: exampleRoot,
    stdio: 'inherit',
  });
  recordInstalled(exampleRoot);
}

// The moved packages this example declares, or `null` when only a full install is safe
// That is the case with nothing installed yet and with a moved package reached only transitively
// Moved means the stamped bytes differ from what the example recorded, not what this run published
function declaredChanges(exampleRoot) {
  const modules = join(exampleRoot, 'node_modules');
  if (!existsSync(modules)) return null;
  const changed = movedSince(
    readStamps(STAMPS_FILE),
    readStamps(join(modules, INSTALLED_FILE)),
  );
  const manifest = JSON.parse(
    readFileSync(join(exampleRoot, 'package.json'), 'utf8'),
  );
  const declared = declaredAmong(
    manifest,
    changed.map(item => item.name),
  );
  const isTransitiveOnly = changed.some(
    ({ name }) => !declared.includes(name) && existsSync(join(modules, name)),
  );
  return isTransitiveOnly
    ? null
    : changed.filter(({ name }) => declared.includes(name));
}

// By default every example is reinstalled from a clean `node_modules`
// Incremental replaces only the packages that moved since the example last installed them, and a
// failed targeted install falls back to a clean one
function commandRefresh(targets, { isIncremental = false } = {}) {
  targets.forEach((dir, index) => {
    console.log(`\n  [${index + 1}/${targets.length}] ${dir}`);
    const exampleRoot = join(REPO_ROOT, dir);
    const packages = isIncremental ? declaredChanges(exampleRoot) : null;
    if (packages === null) {
      refreshFully(exampleRoot);
      console.log(`  ${dir}: reinstalled from a clean node_modules`);
      return;
    }
    if (packages.length === 0) {
      console.log(`  ${dir}: nothing it declares has changed`);
      return;
    }
    try {
      // `--no-save` keeps the tracked manifest as it is, an explicit version defeats the lockfile
      const specs = packages.map(({ name, version }) => `${name}@${version}`);
      execFileSync(
        'npm',
        ['install', '--no-save', '--no-audit', '--no-fund', ...specs],
        { cwd: exampleRoot, stdio: 'inherit' },
      );
      recordInstalled(exampleRoot);
      console.log(`  ${dir}: replaced ${packages.length} package(s)`);
    } catch {
      console.log(`  ${dir}: targeted install failed, reinstalling cleanly`);
      refreshFully(exampleRoot);
    }
  });
}

// Everything a new machine needs, idempotent: a second run is a no-op that reports the same state
// It does not install docker or start colima, since a script that starts a VM surprises people
async function commandSetup() {
  try {
    execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      stdio: 'ignore',
    });
  } catch {
    throw new Error(
      'docker is not reachable. Start your engine first (colima start, or Docker Desktop), then re-run.',
    );
  }

  const running = execFileSync(
    'docker',
    ['ps', '-a', '--filter', `name=^${CONTAINER}$`, '--format', '{{.State}}'],
    { encoding: 'utf8' },
  ).trim();

  if (running === '') {
    console.log(`pulling ${IMAGE} ...`);
    execFileSync('docker', ['pull', IMAGE], { stdio: 'inherit' });
    console.log(`creating container ${CONTAINER} ...`);
    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        CONTAINER,
        // Survives a machine restart, which is the difference between a tool you use and a tool you
        // remember to start.
        '--restart',
        'unless-stopped',
        '-p',
        '4873:4873',
        // A NAMED VOLUME, not a bind mount into the repo: verdaccio runs as uid 10001 and a
        // host-owned directory it cannot write to fails at first publish, well after this script
        // reported success.
        '-v',
        `${STORAGE_VOLUME}:/verdaccio/storage`,
        '-v',
        `${join(REPO_ROOT, 'scripts', 'verdaccio', 'config.yaml')}:/verdaccio/conf/config.yaml:ro`,
        IMAGE,
      ],
      { stdio: 'ignore' },
    );
  } else if (running === 'running') {
    console.log(`container ${CONTAINER} already running`);
  } else {
    console.log(`starting existing container ${CONTAINER} ...`);
    execFileSync('docker', ['start', CONTAINER], { stdio: 'ignore' });
  }

  await waitForRegistry();
  await ensureToken();
  console.log(`\nregistry ${REGISTRY} is up, token stored.\n`);
  console.log('Next:');
  console.log('  pnpm run registry:publish core/engine core/components');
  console.log('  pnpm run registry:on examples/react');
  console.log('  pnpm run registry:refresh examples/react');
  console.log("  (then `pod install` in that example's ios/)");
}

const MS_PER_SECOND = 1_000;
const REGISTRY_POLL_ATTEMPTS = 30;
const REGISTRY_POLL_MS = 500;

// Polled rather than slept: a cold container answers in about two seconds, a warm one at once
async function waitForRegistry(attempt = 0) {
  if (await isRegistryUp()) return;
  if (attempt >= REGISTRY_POLL_ATTEMPTS) {
    throw new Error(
      `container is up but ${REGISTRY} never answered, check \`docker logs ${CONTAINER}\``,
    );
  }
  await new Promise(resolve => setTimeout(resolve, REGISTRY_POLL_MS));
  return waitForRegistry(attempt + 1);
}

// The loop, end to end: publish what changed, point the examples at the registry, pull it in
// `--full` cleans, publishes everything and reinstalls every example from scratch
async function commandSync(targets, options) {
  const startedAt = Date.now();
  await commandPublish([], options);
  console.log('\npointing examples at the registry ...');
  await commandOn(targets);
  console.log('\nrefreshing examples ...');
  commandRefresh(targets, { isIncremental: !options.isFull });
  const seconds = Math.round((Date.now() - startedAt) / MS_PER_SECOND);
  console.log(`\nsync took ${seconds}s`);
}

async function commandStatus() {
  const up = await isRegistryUp();
  console.log(`registry ${REGISTRY}: ${up ? 'up' : 'DOWN'}`);
  if (!up) {
    console.log(
      '  start it with: docker start verdaccio  (or see scripts/verdaccio/config.yaml)',
    );
  }
  for (const dir of exampleDirs()) {
    const path = join(REPO_ROOT, dir, '.npmrc');
    const pointed =
      existsSync(path) && readFileSync(path, 'utf8').includes(REGISTRY);
    console.log(`  ${pointed ? 'local ' : 'npmjs '} ${dir}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = {
    isFull: args.includes('--full'),
    isFast: args.includes('--fast'),
  };
  const rest = args.filter(arg => !arg.startsWith('--'));
  const targets = rest.length > 0 ? rest : exampleDirs();
  switch (command) {
    case 'on':
      return commandOn(targets);
    case 'off':
      return commandOff(targets);
    case 'publish':
      return commandPublish(rest, options);
    case 'sync':
      return commandSync(targets, options);
    case 'refresh':
      return commandRefresh(targets);
    case 'setup':
      return commandSetup();
    case 'status':
    case undefined:
      return commandStatus();
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

await main();
