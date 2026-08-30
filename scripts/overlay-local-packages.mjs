// scripts/check-bundle-framework-isolation.mjs needs each example's `node_modules` to hold
// THIS commit's build of every multi-framework packages/* package — not whatever version each
// example's package.json pins from the npm registry, or the check proves nothing about the
// change actually under review. core/engine and core/components ride along too: example source
// routinely drifts ahead of their last publish (see the `example-shared-package-staleness`
// rule), and without the overlay that source fails to even compile against the registry version.
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
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { publishablePackageEntries } from './lib/publishable-packages.mjs';

const REPO_ROOT = new URL('..', import.meta.url).pathname;
// The four CI bundles. Locally the same script doubles as the fast half of the dev loop — the one
// that skips the `file:` + `npm install` dance when a package gained no new dependency — and there
// the target is usually "every example I might open in a simulator", so the list is overridable:
//   node scripts/overlay-local-packages.mjs examples/solid examples/expo-vue-tsx
//   node scripts/overlay-local-packages.mjs --all
const CI_EXAMPLE_DIRS = [
  'examples/react',
  'examples/vue-sfc',
  'examples/svelte',
  'examples/angular',
];
// `--dry-run` prints the two lists — what would be overlaid, what would be left on its published
// build — and touches nothing. It exists because this script's ONLY effect is mutating an example's
// installed packages, so before it there was no way to check a change to it except by running it
// for real on somebody's example. That is not hypothetical: validating the skipped-packages line
// below moved `examples/solid`'s installed engine and components twice, while that example was a
// measurement arm. A tool whose whole job is to disturb an arm needs a way to be tested without
// disturbing one.
const DRY_RUN = process.argv.includes('--dry-run');
// `--keep-tarballs <dir>` copies each packed tarball out before the temp directory is deleted, so
// "what exactly went into the last slice" is answerable AFTER the fact. Without it the packs are
// made in a mkdtemp and removed in the `finally`, and the only record of a slice is the extracted
// folder — which the NEXT overlay overwrites. Measured 2026-08-30: a session holding a device
// binary saw Create move 12.8% with no mechanism, and could not tell whether its previous slice
// carried two fixes or a fortnight of core changes, because that tarball no longer existed. The
// question was decided another way, and the gap stayed. A build artifact that decides a
// measurement has to outlive the run that made it.
const KEEP_TARBALLS = resolveKeepTarballs(process.argv);
const FLAGS = new Set(['--dry-run', '--keep-tarballs']);
const EXAMPLE_DIRS = resolveExampleDirs(
  process.argv
    .slice(2)
    .filter(
      (argument, index, args) =>
        !FLAGS.has(argument) && args[index - 1] !== '--keep-tarballs',
    ),
);

function resolveKeepTarballs(argv) {
  const flagIndex = argv.indexOf('--keep-tarballs');
  if (flagIndex === -1) return undefined;
  const value = argv[flagIndex + 1];
  // A bare `--keep-tarballs` would otherwise swallow the next example dir as its value and then
  // silently overlay the CI four instead of the one the operator named.
  if (value === undefined || value.startsWith('--')) {
    throw new Error('--keep-tarballs needs a destination directory');
  }
  return join(REPO_ROOT, value);
}

function resolveExampleDirs(args) {
  if (args.length === 0) return CI_EXAMPLE_DIRS;
  if (args.includes('--all'))
    return readdirSync(join(REPO_ROOT, 'examples'), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `examples/${entry.name}`);
  return args;
}

function packTarball(pkgDir, destDir) {
  const output = execFileSync('pnpm', ['pack', '--pack-destination', destDir], {
    cwd: join(REPO_ROOT, pkgDir),
    encoding: 'utf8',
  });
  // pnpm pack prints other file listing lines before it; the tarball path is always last.
  const lines = output.trim().split('\n');
  return lines[lines.length - 1].trim();
}

// core/engine and core/components are framework-agnostic and every example depends on them
// directly, so example source can drift ahead of their last publish the same way it drifts ahead
// of packages/* (see the `example-shared-package-staleness` rule) — overlay them too. Adapters
// (adapters/react, /vue, /svelte, /angular) stay OUT of this list: an adapter overlay would swap in
// code the example's OWN package.json doesn't pin yet, so it needs the full `file:` tarball dance.
//
// The real test for any candidate is narrower than "does it have dependencies", and core/css-parser
// is the worked example. It was excluded when it GAINED `lightningcss` — a folder swap never
// touches package-lock.json, so a dependency the example does not already have is simply missing.
// That condition expired: measured 2026-08-23, packed and installed dependency sets are identical
// (`@react-native/metro-babel-transformer` + `lightningcss`) and `lightningcss` is already hoisted
// in every example, so a swap there now installs nothing new. It stays out anyway — nothing CI
// checks depends on the parser's own output, so widening the list buys drift-reduction at the cost
// of changing what CI tests, and that trade wants a green run behind it.
//
// So the rule, for whoever revisits this: **a folder swap is safe exactly when the packed
// package's dependency set is a SUBSET of what the example already has installed** — and that is
// per-package and expires whenever either side gains a dependency, in both directions. Check it,
// do not inherit the verdict:
//   node -p "JSON.stringify(require('./<pkg>/package.json').dependencies)"
//   node -p "JSON.stringify(require('./examples/<app>/node_modules/<name>/package.json').dependencies)"
const OVERLAY_ONLY = new Set([
  'core/engine',
  'core/components',
  'adapters/angular',
]);

// Printed at the END of a real run, not where it is computed. The exclusion above `OVERLAY_ONLY` is
// deliberate, but a run that reports N correct packages and `Done` reads as full coverage — and the
// package a session has spent the day changing is usually an adapter, i.e. exactly one of the ones
// left on its registry build. Measured 2026-08-23: a Svelte packaging round lost a cycle to this,
// and the only symptom was a subpath missing from the installed adapter. At the top of the output it
// scrolls away behind ~200 lines of pack noise; the operator reads the tail.
function reportSkipped(skipped) {
  if (skipped.length === 0) return;
  console.log(
    `NOT overlaid, still on their published build: ${skipped
      .map(entry => entry.dir)
      .join(', ')}`,
  );
  console.log(
    'Changed one of those? It needs the full `file:` tarball dance — .claude/rules/example-shared-package-staleness.md',
  );
}

function main() {
  const allPackages = publishablePackageEntries();
  const isOverlaid = entry =>
    entry.dir.startsWith('packages/') || OVERLAY_ONLY.has(entry.dir);
  const localPackages = allPackages.filter(isOverlaid);
  // Named at RUN TIME, not just explained in a comment up top. The exclusion is deliberate, but a
  // run that reports six correct packages and `Done` reads as full coverage — and the package a
  // session has spent the day changing is usually an adapter, i.e. exactly the one left on its
  // registry build. Measured 2026-08-23: a Svelte packaging round lost a cycle to this, and the
  // only symptom was a subpath missing from the installed adapter.
  //
  // Same family as `.claude/rules/test-harness-false-greens.md` §6 — believe the details, not the
  // summary — except here the details did not exist until this line.
  const skipped = allPackages.filter(entry => !isOverlaid(entry));
  if (DRY_RUN) {
    console.log(
      `DRY RUN — nothing written. Would overlay ${localPackages.length} package(s) into: ${EXAMPLE_DIRS.join(', ')}`,
    );
    reportSkipped(skipped);
    return;
  }
  const packDestination = mkdtempSync(join(tmpdir(), 'symbiote-overlay-pack-'));

  try {
    for (const pkg of localPackages) {
      const targetDirs = EXAMPLE_DIRS.map(exampleDir =>
        join(REPO_ROOT, exampleDir, 'node_modules', ...pkg.name.split('/')),
      ).filter(existsSync);
      if (targetDirs.length === 0) continue;

      console.log(
        `Overlaying ${pkg.name} into ${targetDirs.length} example(s) ...`,
      );
      const tarballPath = packTarball(pkg.dir, packDestination);
      if (KEEP_TARBALLS !== undefined) {
        mkdirSync(KEEP_TARBALLS, { recursive: true });
        cpSync(tarballPath, join(KEEP_TARBALLS, basename(tarballPath)));
      }
      // A fresh directory per package, not `--one-top-level` (a GNU-tar-only flag bsdtar — the
      // default `tar` on macOS — rejects): the tarball already nests everything under `package/`,
      // so a plain extract into an empty directory needs no renaming.
      const extractDir = mkdtempSync(
        join(tmpdir(), 'symbiote-overlay-extract-'),
      );
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

  // Names the targets rather than claiming "every example". The default list is the CI FOUR, and
  // `examples/solid` is not in it — so the old wording read as full coverage right after silently
  // leaving one of the five benchmark columns on a stale engine, which is a measurement that lies
  // rather than fails. Pass the dir explicitly (or --all) when the run is a dev-loop overlay.
  console.log(
    `Done — this commit's build of ${localPackages.length} package(s) is installed in: ${EXAMPLE_DIRS.join(', ')}`,
  );
  reportSkipped(skipped);
}

main();
