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
  readFileSync,
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
// of packages/* (see the `example-shared-package-staleness` rule) — overlay them too.
//
// ADAPTERS ARE IN NOW, by prefix rather than by name. They were excluded on the reasoning that an
// adapter overlay "swaps in code the example's own package.json doesn't pin yet, so it needs the
// full `file:` dance" — and that was never the criterion this file itself states two paragraphs
// down, which is about DEPENDENCIES, not about what a manifest pins. The list also contradicted the
// prose: `adapters/angular` sat in it. Measured 2026-09-01 across every adapter x example pair that
// has the adapter installed, 12 of 13 satisfy the subset rule outright; the one that does not is
// `expo-vue-sfc`, missing `@vue/babel-plugin-jsx`.
//
// A prefix, not five names: the most recently added adapter is the one every hand-written list
// omits (`.claude/rules/adapter-parity-audit.md`, "Check Solid last and separately"), and this
// script was itself one of the three instances that rule records. The sixth adapter joins the day
// its folder exists.
//
// And the subset rule is now CHECKED PER EXAMPLE AT RUN TIME (`missingDependencies` below) rather
// than encoded in a list somebody has to remember to prune. The comment that used to live here
// said the condition "expires whenever either side gains a dependency, in both directions" and
// then asked the reader to re-verify by hand — which is a rule that decays between readings. The
// check cannot decay, and it names the missing package instead of silently doing the wrong thing.
//
// core/css-parser stays out for a different reason that is NOT about dependencies: nothing CI
// checks reads the parser's own output, so widening this buys drift-reduction at the cost of
// changing what CI tests, and that trade wants a green run behind it.
const OVERLAY_ONLY = new Set(['core/engine', 'core/components']);

// The criterion, enforced instead of trusted. A folder swap never touches package-lock.json, so a
// dependency the example does not already have installed is simply ABSENT after the swap — and the
// failure lands at Metro time, in a bundle, as a missing module nobody connects to an overlay that
// printed `Done`.
function missingDependencies(pkg, exampleDir) {
  const manifest = JSON.parse(
    readFileSync(join(REPO_ROOT, pkg.dir, 'package.json'), 'utf8'),
  );
  const packageDir = join(
    REPO_ROOT,
    exampleDir,
    'node_modules',
    ...pkg.name.split('/'),
  );
  // Resolved the way NODE resolves, not by looking in one place. npm NESTS a dependency inside the
  // depending package's own `node_modules` whenever nothing at the root anchors a version — which
  // is the normal state for every `packages/expo-*` wrapper here (CLAUDE.md records the 2.2GB
  // consequence). A root-only check reported `expo-sensors` and two dozen siblings as missing and
  // cut the plan from 34 packages to 13, all of them installed and fine. Caught only because the
  // `--all` dry run covers wrappers; the adapter-only probe that motivated this check has no
  // nested dependencies and looked clean.
  const isInstalled = name =>
    existsSync(join(packageDir, 'node_modules', ...name.split('/'))) ||
    existsSync(join(REPO_ROOT, exampleDir, 'node_modules', ...name.split('/')));
  return Object.keys(manifest.dependencies ?? {}).filter(
    name => !isInstalled(name),
  );
}

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

// Computed ONCE and read by both the dry path and the real one. The two must not each work out
// what would happen — this file already records why (`--dry-run` exists so a tool whose only job is
// to perturb a measurement arm can be checked without perturbing one), and a dry run that computes
// its own answer starts lying exactly where it is trusted.
function buildPlan(localPackages) {
  const plan = [];
  const blockedByDependency = [];
  for (const pkg of localPackages) {
    const targetDirs = [];
    for (const exampleDir of EXAMPLE_DIRS) {
      const targetDir = join(
        REPO_ROOT,
        exampleDir,
        'node_modules',
        ...pkg.name.split('/'),
      );
      // Not installed here at all — this example does not use the package. Silent by design:
      // examples/bare-rn deliberately depends on nothing of ours, so every package misses it.
      if (!existsSync(targetDir)) continue;
      const missing = missingDependencies(pkg, exampleDir);
      if (missing.length > 0) {
        // Named, and skipped rather than half-done. Overlaying anyway installs a build whose
        // dependency is absent, which fails at Metro time as a missing module — long after this
        // script printed `Done`, with nothing tying the two together.
        blockedByDependency.push(
          `${pkg.name} -> ${exampleDir} (needs ${missing.join(', ')})`,
        );
        continue;
      }
      targetDirs.push(targetDir);
    }
    if (targetDirs.length > 0) plan.push({ pkg, targetDirs });
  }
  return { plan, blockedByDependency };
}

function reportBlocked(blockedByDependency) {
  if (blockedByDependency.length === 0) return;
  console.log(
    `NOT overlaid, dependency missing in the example: ${blockedByDependency.join('; ')}`,
  );
  console.log(
    'A folder swap installs no dependencies — run the full `file:` dance for those, or `npm install` the missing package first.',
  );
}

function main() {
  const allPackages = publishablePackageEntries();
  const isOverlaid = entry =>
    entry.dir.startsWith('packages/') ||
    entry.dir.startsWith('adapters/') ||
    OVERLAY_ONLY.has(entry.dir);
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
  const { plan, blockedByDependency } = buildPlan(localPackages);
  if (DRY_RUN) {
    console.log(
      `DRY RUN — nothing written. Would overlay ${plan.length} package(s) into: ${EXAMPLE_DIRS.join(', ')}`,
    );
    // NAMED, not just counted. A count reads as coverage, and the package a session has spent the
    // day changing is the one it needs to see in this list — the same reason `reportSkipped` exists.
    console.log(plan.map(({ pkg }) => `  ${pkg.name}`).join('\n'));
    reportSkipped(skipped);
    reportBlocked(blockedByDependency);
    return;
  }
  const packDestination = mkdtempSync(join(tmpdir(), 'symbiote-overlay-pack-'));

  try {
    for (const { pkg, targetDirs } of plan) {
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
    `Done — this commit's build of ${plan.length} package(s) is installed in: ${EXAMPLE_DIRS.join(', ')}`,
  );
  reportSkipped(skipped);
  reportBlocked(blockedByDependency);
}

main();
