// scripts/check-bundle-framework-isolation.mjs needs each example's `node_modules` to hold
// THIS commit's build of every multi-framework packages/* package — not whatever version each
// example's package.json pins from the npm registry, or the check proves nothing about the
// change actually under review.
//
// Deliberately does NOT touch examples/*/package.json or package-lock.json: the documented local
// dev loop (<examples_vs_dot_examples> in CLAUDE.md) re-points the dependency at a `file:`
// tarball, which is the right move for a developer's own working tree but leaves the manifest
// modified — exactly the kind of stray diff that is easy to forget and commit by accident. CI's
// checkout is disposable, but the same script doubles as a local sanity-check tool, so it stays
// non-mutating on tracked files either way: `npm install` first (against whatever the committed
// manifest says, to resolve the full transitive tree — react-native, the wrapped native module,
// everything a registry install would pull in), then this script REPLACES the CONTENTS of each
// already-installed `node_modules/@symbiote-native/<pkg>` folder with a fresh `pnpm pack` of the
// real source — same effect as the file: dance, zero tracked-file mutation.
//
// `pnpm pack` (never `npm pack` — skips the publishConfig build-artifact swap, see
// <examples_vs_dot_examples>) needs each package's `build/` (and `build-ngc/` for Angular) to
// already exist — run `pnpm run prepublish-build` first.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
const EXAMPLE_DIRS = ['examples/react', 'examples/vue-sfc', 'examples/svelte', 'examples/angular'];

function packTarball(pkgDir, destDir) {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', destDir], {
    cwd: join(REPO_ROOT, pkgDir),
    encoding: 'utf8',
  });
  // pnpm pack prints other file listing lines before it; the tarball path is always last.
  const lines = output.trim().split('\n');
  return lines[lines.length - 1].trim();
}

function main() {
  const multiFrameworkPackages = publishablePackageEntries().filter(entry =>
    entry.dir.startsWith('packages/'),
  );
  const packDestination = mkdtempSync(join(tmpdir(), 'symbiote-overlay-pack-'));

  try {
    for (const pkg of multiFrameworkPackages) {
      const targetDirs = EXAMPLE_DIRS.map(exampleDir =>
        join(REPO_ROOT, exampleDir, 'node_modules', ...pkg.name.split('/')),
      ).filter(existsSync);
      if (targetDirs.length === 0) continue;

      console.log(`Overlaying ${pkg.name} into ${targetDirs.length} example(s) ...`);
      const tarballPath = packTarball(pkg.dir, packDestination);
      // A fresh directory per package, not `--one-top-level` (a GNU-tar-only flag bsdtar — the
      // default `tar` on macOS — rejects): the tarball already nests everything under `package/`,
      // so a plain extract into an empty directory needs no renaming.
      const extractDir = mkdtempSync(join(tmpdir(), 'symbiote-overlay-extract-'));
      try {
        execFileSync('tar', ['-xzf', tarballPath, '-C', extractDir]);
        for (const targetDir of targetDirs) {
          rmSync(targetDir, { recursive: true, force: true });
          cpSync(join(extractDir, 'package'), targetDir, { recursive: true });
        }
      } finally {
        rmSync(extractDir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(packDestination, { recursive: true, force: true });
  }

  console.log("Done — every example now runs this commit's build of packages/*.");
}

main();
