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

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

// npm's `trust github --file` wants the bare filename, not the repo-relative
// path — passing the full path fails every package with "GitHub Actions
// workflow must be just a file not a path". The trust scope is still bound to
// wherever that filename lives inside .github/workflows/ on GitHub's side.
const WORKFLOW = 'release.yml';
const DEFAULT_REPO = 'OneEyed1366/symbiote-native';

const repoSlug = () => {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // no git remote — fall back to the known repo below
  }
  return DEFAULT_REPO;
};

const isPublished = (name) => {
  try {
    execFileSync('npm', ['view', name, 'version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

const args = process.argv.slice(2);
const listOnly = args.includes('--list') || args.includes('--dry-run');
const only = args.find((arg) => !arg.startsWith('-'));

const repo = repoSlug();
let entries = publishablePackageEntries();
if (only) {
  entries = entries.filter(({ name }) => name === only || name === `@symbiote-native/${only}`);
}

if (entries.length === 0) {
  console.error(only ? `No publishable package matched "${only}".` : 'No publishable @symbiote-native/* packages found.');
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
  execFileSync('npm', ['whoami'], { stdio: 'pipe' });
} catch {
  console.log('No active npm session — running npm login...');
  execFileSync('npm', ['login'], { stdio: 'inherit' });
  try {
    execFileSync('npm', ['whoami'], { stdio: 'pipe' });
  } catch {
    console.error('npm login did not produce an authenticated session — aborting.');
    process.exit(1);
  }
}

console.log('\nEach never-published package needs a one-off `pnpm publish`, then every');
console.log('package needs `npm trust github` — both are interactive (OTP/browser).\n');

const failed = [];
for (const { name, dir } of entries) {
  if (!isPublished(name)) {
    console.log(`=== pnpm publish ${name} (first publish — not yet on the registry) ===`);
    try {
      execFileSync('pnpm', ['publish'], { cwd: dir, stdio: 'inherit' });
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
      ['trust', 'github', name, '--file', WORKFLOW, '--repository', repo, '--allow-publish', '--yes'],
      { stdio: 'inherit' },
    );
  } catch (error) {
    console.error(`  failed for ${name}: ${error.message}`);
    failed.push(name);
  }
}

console.log('\n---');
if (failed.length > 0) {
  console.error(`Failed (${failed.length}): ${failed.join(', ')}`);
  console.error('Re-run for a single package with: pnpm run trust:publishers <name>');
  process.exit(1);
}
console.log(`Done — trusted publisher configured for all ${entries.length} package(s).`);
