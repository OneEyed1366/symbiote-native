// Configures GitHub Actions OIDC trusted publishing for every publishable
// @symbiote-native/* package, so CI (.github/workflows/release.yml) can publish
// them without an NPM_TOKEN. Each package needs its own per-package trust config
// on npm — a package that never got one fails CI publish with a misleading E404
// (npm returns 404, not 403, for a package the identity may not publish to).
//
// `npm trust github` requires the package to already exist on the registry —
// trust for a package with zero published versions fails, so this does a
// one-off `pnpm publish` first for any package npm has never seen, then trust.
//
// This only LOOPS the commands; both `pnpm publish` and `npm trust github` are
// interactive (OTP/browser confirm), so run from a real terminal, not CI:
//   pnpm run trust:publishers            # all publishable packages
//   pnpm run trust:publishers test-utils # just one (short or full name)
//   pnpm run trust:publishers --list     # preview the package list, run nothing
//
// Prereq: npm CLI >= 11.15.0.

import { execFileSync } from 'node:child_process';

// PINNED, on every npm call in this file. Nothing here may resolve its registry from config.
//
// This script's job is entirely on npmjs — it configures the OIDC trusted publisher a GitHub
// Actions run will use, and for a package that does not exist yet it performs the REAL first
// publish. None of that means anything against another registry.
//
// The hazard is not hypothetical and it is silent. `scripts/local-registry.mjs` points examples at
// a Verdaccio on localhost by writing `examples/<app>/.npmrc`, which this script never reads. But
// npm MERGES user config, so a single `@symbiote-native:registry=http://localhost:4873/` line in
// `~/.npmrc` — a natural thing to add by hand after reading `scripts/verdaccio/README.md` — would
// silently redirect every call below. `npm view` would then answer from the local registry and
// report an unpublished package as published (skipping the real first publish), or the publish
// itself would go to localhost and print success. A package would read as trusted-and-published
// while npmjs had never heard of it.
//
// One flag removes the whole class, so it is not worth reasoning about which config might be set.
const REGISTRY = ['--registry=https://registry.npmjs.org'];
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

// npm's `trust github --file` wants the bare filename, not the repo-relative
// path — passing the full path fails every package with "GitHub Actions
// workflow must be just a file not a path". The trust scope is still bound to
// wherever that filename lives inside .github/workflows/ on GitHub's side.
const WORKFLOW = 'release.yml';
const DEFAULT_REPO = 'OneEyed1366/symbiote-native';

const repoSlug = () => {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    }).trim();
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // no git remote — fall back to the known repo below
  }
  return DEFAULT_REPO;
};

const isPublished = name => {
  try {
    execFileSync('npm', ['view', name, 'version', ...REGISTRY], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
};

const args = process.argv.slice(2);
const listOnly = args.includes('--list') || args.includes('--dry-run');
const only = args.find(arg => !arg.startsWith('-'));

const repo = repoSlug();
let entries = publishablePackageEntries();
if (only) {
  entries = entries.filter(
    ({ name }) => name === only || name === `@symbiote-native/${only}`,
  );
}

if (entries.length === 0) {
  console.error(
    only
      ? `No publishable package matched "${only}".`
      : 'No publishable @symbiote-native/* packages found.',
  );
  process.exit(1);
}

console.log(`Trusted publisher: github → ${repo} (${WORKFLOW})`);
console.log(`Packages (${entries.length}):`);
for (const { name } of entries) console.log(`  - ${name}`);

if (listOnly) process.exit(0);

// npm login sessions expire fairly quickly; catching a stale session here
// gives one clear login prompt instead of every package in the loop below
// failing on the same raw npm auth error.
try {
  execFileSync('npm', ['whoami', ...REGISTRY], { stdio: 'pipe' });
} catch {
  console.log('No active npm session — running npm login...');
  execFileSync('npm', ['login', ...REGISTRY], { stdio: 'inherit' });
  try {
    execFileSync('npm', ['whoami', ...REGISTRY], { stdio: 'pipe' });
  } catch {
    console.error(
      'npm login did not produce an authenticated session — aborting.',
    );
    process.exit(1);
  }
}

console.log(
  '\nEach never-published package is packed then published, and every package',
);
console.log('needs `npm trust github` — both are interactive (OTP/browser).\n');

// Only `pnpm pack` resolves the manifest: it applies the publishConfig overlay (main/exports ->
// build/) and rewrites the `catalog:` / `workspace:*` specifiers 31 of these packages use into
// real versions. npm understands neither, so an npm-packed tarball is unusable.
//
// Only `npm publish` completes npm's browser 2FA flow. `pnpm publish` prints the auth URL, the
// approval succeeds, and the CLI waits forever — while npm's own commands, `npm trust` included,
// finish the identical flow against the identical registry through the identical proxy.
function publish(name, dir) {
  const packed = execFileSync(
    'pnpm',
    ['pack', '--pack-destination', tmpdir()],
    {
      cwd: dir,
      encoding: 'utf8',
    },
  );
  // pnpm prints the tarball path as the last non-empty line of stdout.
  const tarball = packed.trim().split('\n').filter(Boolean).pop();
  try {
    execFileSync(
      'npm',
      ['publish', tarball, '--access', 'public', ...REGISTRY],
      {
        stdio: 'inherit',
      },
    );
  } finally {
    rmSync(tarball, { force: true });
  }
}

const failed = [];
for (const { name, dir } of entries) {
  if (!isPublished(name)) {
    console.log(
      `=== publish ${name} (first publish — not yet on the registry) ===`,
    );
    try {
      publish(name, dir);
    } catch (error) {
      console.error(`  publish failed for ${name}: ${error.message}`);
      failed.push(name);
      continue;
    }
  }

  console.log(`=== npm trust github ${name} ===`);
  try {
    execFileSync(
      'npm',
      [
        ...REGISTRY,
        'trust',
        'github',
        name,
        '--file',
        WORKFLOW,
        '--repository',
        repo,
        '--allow-publish',
        '--yes',
      ],
      // stderr is piped so a 409 can be told apart from a real failure; stdout still
      // inherits, keeping npm's own auth prompts interactive.
      { stdio: ['inherit', 'inherit', 'pipe'] },
    );
  } catch (error) {
    const stderr = String(error.stderr ?? '');
    // npm answers 409 when the package already carries this trust config. Re-running the
    // script over a mostly-published repo hits it for every prior package, and treating
    // that as a failure buries the ones that genuinely broke.
    if (stderr.includes('E409') || stderr.includes('409 Conflict')) {
      console.log('  already configured, skipping');
      continue;
    }
    process.stderr.write(stderr);
    console.error(`  failed for ${name}: ${error.message}`);
    failed.push(name);
  }
}

console.log('\n---');
if (failed.length > 0) {
  console.error(`Failed (${failed.length}): ${failed.join(', ')}`);
  console.error(
    'Re-run for a single package with: pnpm run trust:publishers <name>',
  );
  process.exit(1);
}
console.log(
  `Done — trusted publisher configured for all ${entries.length} package(s).`,
);
