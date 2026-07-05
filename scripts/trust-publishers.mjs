// Configures GitHub Actions OIDC trusted publishing for every publishable
// @symbiote-native/* package, so CI (.github/workflows/release.yml) can publish
// them without an NPM_TOKEN. Each package needs its own per-package trust config
// on npm — a package that never got one fails CI publish with a misleading E404
// (npm returns 404, not 403, for a package the identity may not publish to).
//
// This only LOOPS the command; `npm trust github` is still interactive — it needs
// an OTP/browser confirm per package, so run it from a real terminal, not CI:
//   pnpm run trust:publishers            # all publishable packages
//   pnpm run trust:publishers test-utils # just one (short or full name)
//   pnpm run trust:publishers --list     # preview the package list, run nothing
//
// Prereqs: npm CLI >= 11.15.0, and each package must already exist on the
// registry (do one manual authenticated publish first).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW = '.github/workflows/release.yml';
const PACKAGE_GROUPS = ['core', 'adapters', 'packages'];
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

const publishablePackages = () => {
  const names = [];
  for (const group of PACKAGE_GROUPS) {
    if (!existsSync(group)) continue;
    for (const entry of readdirSync(group, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(group, entry.name, 'package.json');
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (!pkg.private && typeof pkg.name === 'string' && pkg.name.startsWith('@symbiote-native/')) {
        names.push(pkg.name);
      }
    }
  }
  return names.sort();
};

const args = process.argv.slice(2);
const listOnly = args.includes('--list') || args.includes('--dry-run');
const only = args.find((arg) => !arg.startsWith('-'));

const repo = repoSlug();
let packages = publishablePackages();
if (only) {
  packages = packages.filter((name) => name === only || name === `@symbiote-native/${only}`);
}

if (packages.length === 0) {
  console.error(only ? `No publishable package matched "${only}".` : 'No publishable @symbiote-native/* packages found.');
  process.exit(1);
}

console.log(`Trusted publisher: github → ${repo} (${WORKFLOW})`);
console.log(`Packages (${packages.length}):`);
for (const name of packages) console.log(`  - ${name}`);

if (listOnly) process.exit(0);

console.log('\nEach package needs an interactive OTP/browser confirm.\n');

const failed = [];
for (const name of packages) {
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
console.log(`Done — trusted publisher configured for all ${packages.length} package(s).`);
