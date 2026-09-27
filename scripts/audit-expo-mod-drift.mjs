// Detects drift between what an upstream expo-* config plugin would do to a native project and
// what native-link.json / our example manifests actually carry.

// expo prebuild never runs in this bare-RN repo, so native-link.json is the only thing standing
// between "upstream added a mod" and a silently broken port. Found this way three times: media-
// library's READ_MEDIA_*, tracking-transparency's AD_ID, expo-localization's activity changes.

// Runs the real installed compiled plugin through @expo/config-plugins' own
// compileModsAsync(config, {introspect: true}) - the same safe-evaluation mode `expo config
// --type introspect` uses. An earlier hand-rolled TS tokenizer version missed arbitrary JS.

// Diffed against Expo's own stock template, not our examples: projectRoot points at a
// nonexistent dir so every base-mod provider falls back to its built-in template and can't
// write. Reproducible regardless of example state; reconciling the diff stays a manual step.

// The plugin's compiled JS resolves directly from its owning @symbiote-native/<pkg> package's
// own dependencies - no example app needs to exist for this to run.

// Introspection covers only idempotent mods: androidManifest, infoPlist, entitlements, strings,
// colors, styles, gradleProperties, podfileProperties. xcodeproj/appDelegate/podfile/dangerous
// mods aren't idempotent and are stripped - those need a one-time manual source read.

// That read is recorded in native-link.json's reviewedNonIntrospectableMods (validated by
// eslint-rules/valid-native-link-manifest.js), keyed on the exact ${platform}.${modName} string
// this tool prints. Untracked = a blocking UNREVIEWED failure, not a soft reminder.

// Every diff is a real structural change made with default props (no app.json in this repo).
// Flagged unless present in the reviewed baseline, keyed on (package, path) - imprecise only if
// the upstream plugin changes what it writes at that exact path, exactly when re-review is wanted.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { publishablePackageEntries } from './lib/publishable-packages.mjs';
import { resolvePlugin, introspectPlugin } from './lib/expo-mod-introspection.mjs';

const BASELINE_PATH = join(import.meta.dirname, 'expo-mod-audit-baseline.json');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return new Set();
  return new Set(readJson(BASELINE_PATH).map((e) => `${e.package}::${e.path}`));
}

export { diffValues } from './lib/expo-mod-introspection.mjs';

async function auditPackage({ name, dir }, baseline) {
  const nativeLinkPath = join(dir, 'native-link.json');
  if (!existsSync(nativeLinkPath)) return null;
  const nativeLink = readJson(nativeLinkPath);
  const gradleProjectName = nativeLink.android?.gradleProjectName;
  if (!gradleProjectName) return null;

  const loaded = resolvePlugin(resolve(dir), gradleProjectName);
  if (!loaded) return { name, skipped: 'upstream ships no config plugin (no app.plugin.js)' };

  let result;
  try {
    result = await introspectPlugin(loaded);
  } catch (err) {
    return { name, skipped: `plugin threw or introspection failed: ${err.message}` };
  }
  const { diffs: rawDiffs, nonIntrospectable } = result;

  // A non-introspectable mod can only be signed off by a human reading the plugin's mod body.
  // That sign-off lives in native-link.json's reviewedNonIntrospectableMods, not the drift
  // baseline below: "did anyone ever look", not "does the default output match a prior look".
  const reviewed = new Set(
    (nativeLink.reviewedNonIntrospectableMods ?? []).map((entry) => entry.mod),
  );
  const unreviewedMods = nonIntrospectable.filter((mod) => !reviewed.has(mod));
  const reviewedMods = nonIntrospectable.filter((mod) => reviewed.has(mod));

  const diffs = rawDiffs.filter((d) => !baseline.has(`${name}::${d.path}`));

  return { name, diffs, unreviewedMods, reviewedMods };
}

// --accept writes every unbaselined diff into the baseline with a placeholder verdict and stops -
// that's a TODO marker, not a judgment call the tool can make (covered/auto-merged/real gap is a
// human's call; see the diffs printed above). --dry-run previews without touching the file.
function writeAcceptedBaseline(results, dryRun) {
  const existing = existsSync(BASELINE_PATH) ? readJson(BASELINE_PATH) : [];
  const additions = [];
  for (const r of results.filter(Boolean)) {
    for (const d of r.diffs ?? []) {
      additions.push({ package: r.name, path: d.path, verdict: 'TODO: needs review' });
    }
  }
  if (!additions.length) {
    console.log('\nNothing new to accept.');
    return;
  }
  console.log(`\n${dryRun ? '(dry-run) would add' : 'Adding'} ${additions.length} baseline entr${additions.length === 1 ? 'y' : 'ies'}:`);
  for (const a of additions) console.log(`  ${a.package}::${a.path}`);
  if (dryRun) return;
  const merged = [...existing, ...additions];
  writeFileSync(BASELINE_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Wrote ${BASELINE_PATH} — fill in each "TODO: needs review" verdict by hand.`);
}

export async function main() {
  const args = process.argv.slice(2);
  const filter = args.find((a) => a.startsWith('--package='))?.replace('--package=', '');
  const accept = args.includes('--accept');
  const dryRun = args.includes('--dry-run');
  const baseline = loadBaseline();
  const entries = publishablePackageEntries()
    .filter((e) => e.dir.startsWith('packages/'))
    .filter((e) => !filter || e.name.includes(filter));

  const results = [];
  for (const entry of entries) {
    results.push(await auditPackage(entry, baseline));
  }

  let hasFailure = false;
  for (const r of results.filter(Boolean)) {
    if (r.skipped) continue;
    if (!r.diffs.length && !r.unreviewedMods.length && !r.reviewedMods.length) continue;
    console.log(`\n${r.name}`);
    for (const d of r.diffs) {
      hasFailure = true;
      console.log(`  DRIFT ${d.path}`);
      console.log(`    before: ${JSON.stringify(d.before)}`);
      console.log(`    after:  ${JSON.stringify(d.after)}`);
    }
    for (const mod of r.unreviewedMods) {
      hasFailure = true;
      console.log(`  UNREVIEWED non-introspectable mod: ${mod}`);
      console.log(
        `    add {"mod": "${mod}", "note": "..."} to native-link.json's ` +
          '"reviewedNonIntrospectableMods" once a human has read the plugin\'s mod body',
      );
    }
    for (const mod of r.reviewedMods) {
      console.log(`  reviewed non-introspectable mod: ${mod}`);
    }
  }

  if (accept) {
    writeAcceptedBaseline(results, dryRun);
    process.exit(0);
  }

  const skipped = results.filter((r) => r?.skipped);
  if (skipped.length) {
    console.log('\nSkipped:');
    for (const r of skipped) console.log(`  ${r.name}: ${r.skipped}`);
  }
  if (!hasFailure) {
    console.log('\nNo unreviewed structural drift found.');
  }
  process.exit(hasFailure ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
