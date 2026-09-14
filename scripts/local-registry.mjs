// The local-registry half of the dev loop: publish this working tree's build of a
// `@symbiote-native/*` package to a Verdaccio running on localhost, and point an example at it.
//
// WHAT PROBLEM THIS REPLACES. The documented loop (<examples_vs_dot_examples> in CLAUDE.md)
// re-points an example's manifest at a `.tarballs/*.tgz`. It works, and it leaves machine-local
// install state inside a TRACKED file — measured 2026-09-01, six manifests and five lockfiles were
// dirty with it at once, and the only thing standing between that and a commit is somebody
// remembering. Here the manifest keeps its ordinary public version literal and never changes; only
// a gitignored `.npmrc` says where that version resolves from.
//
// THE FALLBACK, which is the whole reason this shape was chosen. npm has NO registry fallback
// chain: a configured registry that is unreachable is a hard failure, not a quiet fall-through to
// npmjs. So a tracked pointer at localhost would break every clone that does not run Verdaccio. It
// is not tracked, a clone has no `.npmrc`, and the manifest's public version resolves from npmjs
// exactly as it does today. Opting in is this script; opting out is `off`.
//
// WHAT IT DOES NOT FIX, measured rather than assumed. npm's lockfile still short-circuits: publish
// new bytes under the SAME version, run a plain `npm install`, and npm prints `up to date` and
// leaves the old copy in place — the identical failure the `file:` dance has, and the reason
// CLAUDE.md tells you to delete both the lockfile and the folder. `refresh` below does exactly
// that: wipes `node_modules` and `package-lock.json`, then a full install. A targeted
// `npm install <pkg>@<version>` is faster but trusts that the rest of an example's `node_modules`
// is already consistent — device-observed 2026-09-13, an interrupted manual reinstall left
// `node_modules` on a stale build with no lockfile at all, and a targeted install would have
// layered on top of that instead of fixing it.
//
// And `pod install` is still owed afterwards, for the reason CLAUDE.md gives: replacing a package
// folder deletes `@symbiote-native/splash-screen/.rn-bootsplash/`, which the podspec vendors at
// pod-install time.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
const REGISTRY = 'http://localhost:4873';
const REGISTRY_HOST = '//localhost:4873/';
const SCOPE = '@symbiote-native';
// Gitignored. A token for an anonymous-publish registry bound to loopback is not a secret, but it
// is machine state and has no business in a tracked file.
const TOKEN_FILE = join(REPO_ROOT, 'scripts', 'verdaccio', 'token');
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
  // One endpoint, two outcomes. A first run REGISTERS and gets a token back; a later run on a
  // registry that already knows the user gets `username is already registered` and no token, so it
  // has to LOG IN instead — the same PUT carrying basic auth. Registering and logging in look like
  // one operation to `npm adduser` and are two here, and the second only shows up once the token
  // file has been deleted while the registry's storage survived, which is the normal state after a
  // `git clean` or a fresh clone against a running container.
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

// pack -> unpublish -> publish. The unpublish is not optional: npm refuses to publish over an
// existing version ("You cannot publish over the previously published versions"), and the dev loop
// republishes one version many times a day. Verdaccio allows it because this config sets
// `unpublish: $all`; real npm does not, which is half of why this is not a dist-tag on npmjs.
//
// `pnpm pack` ships whatever is already sitting in `build/` — most packages have no `prepack`
// build step of their own (only svelte and angular do), so without this, publishing after an edit
// with no manual `pnpm run prepublish-build` first silently republishes STALE or EMPTY bytes: no
// error, a tarball that installs fine, and an example that measures last week's code. Building
// here, always, closes that gap instead of documenting it as a step to remember.
async function commandPublish(dirs) {
  const token = await ensureToken();
  console.log('building a fresh package tree (pnpm run prepublish-build) ...');
  execFileSync('pnpm', ['run', 'prepublish-build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  const entries = publishablePackageEntries();
  // No argument means EVERY publishable package. Naming them was the default because publishing is
  // the slow half, but a list you have to remember is a list that goes stale mid-loop — and the
  // package you forget is the one you spent the day changing, which is the same failure the overlay
  // script's `reportSkipped` exists for.
  const selected = dirs.length > 0 ? dirs : entries.map(entry => entry.dir);
  const failed = [];
  // Progress is printed BEFORE the work, not after it. `pnpm pack` runs each package's own build
  // and takes seconds; with a completion-only line a 30-package run shows one header and then
  // nothing for minutes, which reads as a hang and gets killed — observed 2026-09-01. The step
  // that is CURRENTLY running is the only one worth naming, because it is the one that can wedge.
  let done = 0;
  for (const dir of selected) {
    const entry = entries.find(candidate => candidate.dir === dir);
    if (entry === undefined) {
      throw new Error(`${dir} is not a publishable package`);
    }
    done += 1;
    const label = `[${String(done).padStart(2)}/${selected.length}]`;
    try {
      const packageDir = join(REPO_ROOT, entry.dir);
      const version = versionOf(entry);
      process.stdout.write(`  ${label} ${entry.name}@${version} ... `);
      // `pnpm pack`, never `npm pack` — the latter skips the publishConfig build-artifact swap and
      // leaves `workspace:*` in peerDependencies (<examples_vs_dot_examples>).
      const packOutput = execFileSync(
        'pnpm',
        ['pack', '--pack-destination', packageDir],
        { cwd: packageDir, encoding: 'utf8' },
      );
      // `pnpm pack` prints the tarball NAME, not a path, whatever `--pack-destination` says — so
      // rejoin it. Passed straight to npm it resolves against the process cwd (the repo root) and the
      // publish dies with a bare exit 254 and no stderr at all.
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
        // Not yet published here — the normal state on a first run.
      }
      execFileSync('npm', ['publish', tarball, ...npmArgs], {
        stdio: 'ignore',
      });
      rmSync(tarball, { force: true });
      console.log('published');
    } catch (error) {
      console.log('FAILED');
      // Collected rather than thrown. One unbuilt package must not abandon the other thirty-three
      // — but it must also not vanish: a run that reports success while a package silently stayed
      // on its old build is the measurement-that-lies failure this repo keeps paying for.
      failed.push(`${entry.name} (${error.message.split('\n')[0]})`);
    }
  }
  if (failed.length > 0) {
    console.log(`\nFAILED to publish ${failed.length}:`);
    for (const line of failed) console.log(`  ${line}`);
    console.log(
      '\nThe build ran fresh just before this — check the build output above for a type error.',
    );
    process.exitCode = 1;
  }
}

// The repair for the lockfile short-circuit described in this file's header — and for any other
// way an example's `node_modules` can drift out of sync with its manifest (a killed install, a
// half-applied `rm -rf`). Wiping both `node_modules` and `package-lock.json` before a full
// `npm install` is the only repair that cannot leave stale bytes behind; a targeted
// `npm install <pkg>@<version>` is faster but assumes the rest of the tree is already correct.
function commandRefresh(targets) {
  let done = 0;
  for (const dir of targets) {
    done += 1;
    console.log(`\n  [${done}/${targets.length}] ${dir}`);
    const exampleRoot = join(REPO_ROOT, dir);
    rmSync(join(exampleRoot, 'node_modules'), { recursive: true, force: true });
    rmSync(join(exampleRoot, 'package-lock.json'), { force: true });
    execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: exampleRoot,
      stdio: 'inherit',
    });
    console.log(`  ${dir}: reinstalled from a clean node_modules`);
  }
}

// Everything a new machine needs, idempotent: run it twice and the second run is a no-op that
// reports the same state. Deliberately does NOT install docker or start colima — those are the
// user's own machine setup, and a script that silently starts a VM is a script that surprises
// somebody mid-measurement.
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
  } else if (running !== 'running') {
    console.log(`starting existing container ${CONTAINER} ...`);
    execFileSync('docker', ['start', CONTAINER], { stdio: 'ignore' });
  } else {
    console.log(`container ${CONTAINER} already running`);
  }

  // Polled rather than slept: the container answers in about two seconds cold and much faster warm,
  // and a fixed sleep is either a wasted wait or a flake.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isRegistryUp()) {
      await ensureToken();
      console.log(`\nregistry ${REGISTRY} is up, token stored.\n`);
      console.log('Next:');
      console.log('  pnpm run registry:publish core/engine core/components');
      console.log('  pnpm run registry:on examples/react');
      console.log('  pnpm run registry:refresh examples/react');
      console.log("  (then `pod install` in that example's ios/)");
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    `container is up but ${REGISTRY} never answered — check \`docker logs ${CONTAINER}\``,
  );
}

// The loop, end to end, with no list to remember: publish everything, point every example at the
// registry, pull the new bytes into every one of them. `pod install` is still yours.
async function commandSync(targets) {
  console.log('publishing every package ...');
  await commandPublish([]);
  console.log('\npointing examples at the registry ...');
  await commandOn(targets);
  console.log('\nrefreshing examples ...');
  commandRefresh(targets);
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
  const [command, ...rest] = process.argv.slice(2);
  const targets = rest.length > 0 ? rest : exampleDirs();
  switch (command) {
    case 'on':
      return commandOn(targets);
    case 'off':
      return commandOff(targets);
    case 'publish':
      return commandPublish(rest);
    case 'sync':
      return commandSync(targets);
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
