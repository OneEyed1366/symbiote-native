// Drafts packages/<pkg>/native-link.json from what the wrapped expo-* package's config plugin
// adds to a stock project (mechanism: lib/expo-mod-introspection.mjs, audit-expo-mod-drift.mjs
// header). android.modules instead comes from expo-module.config.json - see buildAndroidModules.

// ios.infoPlistKeys values and reviewedNonIntrospectableMods notes need a human to read upstream's
// wording/mod body for real, so both land as a "TODO: ..." string that eslint-rules/
// valid-native-link-manifest.js rejects - the draft stays loud until someone resolves it.

// optionalManifestBundles is never drafted: which options are policy-sensitive is only readable
// from the plugin's own option type, not from introspection (see main()'s printed hint below).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePackageDir, resolvePlugin, introspectPlugin } from './lib/expo-mod-introspection.mjs';

const TODO_REWORD = (upstreamDefault) => `TODO: reword (upstream default: ${JSON.stringify(upstreamDefault)})`;
const TODO_REVIEW_NOTE = "TODO: read the plugin's mod body and confirm what it does with default props";

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Handles both diff shapes an appended array entry can take: a per-index diff (existing base
// array, one new trailing index) or a whole-new-array diff (base has no such key at all, e.g.
// <service> - RN's template never ships one, so the entire array lands as a single diff).
function collectArrayAdditions(diffs, pathSuffixPattern) {
  const additions = [];
  for (const d of diffs) {
    if (!pathSuffixPattern.test(d.path) || d.after === undefined) continue;
    if (Array.isArray(d.after)) additions.push(...d.after);
    else additions.push(d.after);
  }
  return additions;
}

// A Name(...) argument is either a direct string literal or (e.g. expo-notifications'
// AndroidXNotificationsChannelsProvider) a reference to a `const val NAME = "..."` declared in
// the SAME file - resolve that indirection rather than emitting a wrong/missing nativeName.
export function extractNativeName(kotlinSource) {
  const direct = /\bName\(\s*"([^"]+)"\s*\)/.exec(kotlinSource);
  if (direct) return direct[1];
  const indirect = /\bName\(\s*(\w+)\s*\)/.exec(kotlinSource);
  if (indirect) {
    const constMatch = new RegExp(`const\\s+val\\s+${indirect[1]}\\s*(?::\\s*\\w+\\s*)?=\\s*"([^"]+)"`).exec(kotlinSource);
    if (constMatch) return constMatch[1];
  }
  return null;
}

export function buildAndroidModules(pkgDir, warnings) {
  const configPath = resolve(pkgDir, 'expo-module.config.json');
  if (!existsSync(configPath)) {
    warnings.push('no expo-module.config.json found - android.modules could not be derived, add it by hand');
    return [];
  }
  const importPaths = readJson(configPath).android?.modules ?? [];
  return importPaths.map((importPath) => {
    const className = importPath.split('.').at(-1);
    const kotlinPath = resolve(pkgDir, 'android/src/main/java', `${importPath.split('.').join('/')}.kt`);
    if (!existsSync(kotlinPath)) {
      warnings.push(`${importPath}: no source file at ${kotlinPath} - nativeName could not be derived`);
      return { importPath, className, nativeName: 'TODO: not found, read Name(...) by hand' };
    }
    const nativeName = extractNativeName(readFileSync(kotlinPath, 'utf8'));
    if (!nativeName) {
      warnings.push(`${importPath}: no Name(...) found in ${kotlinPath} - read it by hand`);
      return { importPath, className, nativeName: `TODO: not found in ${kotlinPath}` };
    }
    return { importPath, className, nativeName };
  });
}

function detectGradleProjectName(pkg, override) {
  if (override) return override;
  const deps = Object.keys(pkg.dependencies ?? {}).filter(
    (name) => name.startsWith('expo-') && name !== 'expo-modules-core',
  );
  if (deps.length === 1) return deps[0];
  if (deps.length === 0) {
    throw new Error('no expo-* dependency found in package.json - pass --gradle-project=<name>');
  }
  throw new Error(
    `multiple expo-* dependencies found (${deps.join(', ')}) - pass --gradle-project=<name>`,
  );
}

function buildManifestPermissions(diffs, warnings) {
  const elements = collectArrayAdditions(diffs, /\.uses-permission(\.\d+)?$/);
  const names = new Set();
  for (const element of elements) {
    const attrs = element?.$ ?? {};
    const extraKeys = Object.keys(attrs).filter((k) => k !== 'android:name');
    if (extraKeys.length > 0) {
      warnings.push(
        `permission ${attrs['android:name']} also carries ${extraKeys.join(', ')} ` +
          `(${extraKeys.map((k) => `${k}=${JSON.stringify(attrs[k])}`).join(', ')}) - ` +
          'manifestPermissions only stores the bare name, this qualifier is dropped. Verify ' +
          'whether that matters before shipping.',
      );
    }
    if (attrs['android:name']) names.add(attrs['android:name']);
  }
  return [...names].sort();
}

function buildManifestServices(diffs) {
  const elements = collectArrayAdditions(diffs, /\.application\.0\.service(\.\d+)?$/);
  return elements.map((element) => {
    const attrs = element?.$ ?? {};
    const service = { name: attrs['android:name'] };
    if (attrs['android:foregroundServiceType']) service.foregroundServiceType = attrs['android:foregroundServiceType'];
    if (attrs['android:exported'] === 'true') service.exported = true;
    const actions = (element['intent-filter'] ?? [])
      .flatMap((filter) => filter.action ?? [])
      .map((action) => action?.$?.['android:name'])
      .filter(Boolean);
    if (actions.length > 0) service.intentFilterActions = actions;
    return service;
  });
}

function buildManifestApplicationAttributes(diffs) {
  const attrs = {};
  const pattern = /\.application\.0\.\$\.(.+)$/;
  for (const d of diffs) {
    const match = pattern.exec(d.path);
    if (!match || d.after === undefined) continue;
    attrs[match[1]] = d.after;
  }
  return attrs;
}

function buildMainActivityConfigChanges(diffs) {
  const entry = diffs.find((d) => d.path.endsWith('.activity.0.$.android:configChanges'));
  if (!entry || typeof entry.before !== 'string' || typeof entry.after !== 'string') return [];
  const before = new Set(entry.before.split('|').filter(Boolean));
  return entry.after.split('|').filter((token) => token && !before.has(token));
}

function buildInfoPlistKeys(diffs) {
  const keys = {};
  const pattern = /^ios\.infoPlist\.([^.]+)$/;
  for (const d of diffs) {
    const match = pattern.exec(d.path);
    if (!match || typeof d.after !== 'string') continue;
    keys[match[1]] = TODO_REWORD(d.after);
  }
  return keys;
}

function buildInfoPlistArrayKeys(diffs) {
  const keys = {};
  const pattern = /^ios\.infoPlist\.([^.]+)$/;
  for (const d of diffs) {
    const match = pattern.exec(d.path);
    if (!match || !Array.isArray(d.after)) continue;
    keys[match[1]] = d.after;
  }
  return keys;
}

export function buildDraft(diffs, nonIntrospectable, gradleProjectName, pkgDir, warnings) {
  const draft = {
    android: {
      gradleProjectName,
      modules: buildAndroidModules(pkgDir, warnings),
    },
  };

  const manifestPermissions = buildManifestPermissions(diffs, warnings);
  if (manifestPermissions.length > 0) draft.android.manifestPermissions = manifestPermissions;

  const manifestServices = buildManifestServices(diffs);
  if (manifestServices.length > 0) draft.android.manifestServices = manifestServices;

  const manifestApplicationAttributes = buildManifestApplicationAttributes(diffs);
  if (Object.keys(manifestApplicationAttributes).length > 0)
    draft.android.manifestApplicationAttributes = manifestApplicationAttributes;

  const mainActivityConfigChanges = buildMainActivityConfigChanges(diffs);
  if (mainActivityConfigChanges.length > 0) draft.android.mainActivityConfigChanges = mainActivityConfigChanges;

  const infoPlistKeys = buildInfoPlistKeys(diffs);
  const infoPlistArrayKeys = buildInfoPlistArrayKeys(diffs);
  if (Object.keys(infoPlistKeys).length > 0 || Object.keys(infoPlistArrayKeys).length > 0) {
    draft.ios = {};
    if (Object.keys(infoPlistKeys).length > 0) draft.ios.infoPlistKeys = infoPlistKeys;
    if (Object.keys(infoPlistArrayKeys).length > 0) draft.ios.infoPlistArrayKeys = infoPlistArrayKeys;
  }

  if (nonIntrospectable.length > 0) {
    draft.reviewedNonIntrospectableMods = nonIntrospectable.map((mod) => ({ mod, note: TODO_REVIEW_NOTE }));
  }

  return draft;
}

export async function main() {
  const args = process.argv.slice(2);
  const pkgArg = args.find((a) => !a.startsWith('--'));
  const gradleOverride = args.find((a) => a.startsWith('--gradle-project='))?.replace('--gradle-project=', '');
  if (!pkgArg) {
    console.error('usage: node scripts/generate-native-link-draft.mjs <package-dir-name> [--gradle-project=<name>]');
    process.exit(1);
  }

  const packageDir = resolve('packages', pkgArg);
  const packageJsonPath = resolve(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(`${packageJsonPath} does not exist`);
    process.exit(1);
  }
  const nativeLinkPath = resolve(packageDir, 'native-link.json');
  if (existsSync(nativeLinkPath)) {
    console.error(`${nativeLinkPath} already exists - this tool never overwrites, delete it first if you want a fresh draft`);
    process.exit(1);
  }

  const pkg = readJson(packageJsonPath);
  let gradleProjectName;
  try {
    gradleProjectName = detectGradleProjectName(pkg, gradleOverride);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const pkgDir = resolvePackageDir(packageDir, gradleProjectName);
  if (!pkgDir) {
    console.error(`${gradleProjectName} is not resolvable from ${packageJsonPath} - is it installed?`);
    process.exit(1);
  }

  const warnings = [];
  const loaded = resolvePlugin(packageDir, gradleProjectName);
  let diffs = [];
  let nonIntrospectable = [];
  if (loaded) {
    ({ diffs, nonIntrospectable } = await introspectPlugin(loaded));
  } else {
    console.log(
      `${gradleProjectName} ships no config plugin (no app.plugin.js) - manifest/plist fields ` +
        'cannot be drafted. Check its own bundled android/src/main/AndroidManifest.xml by hand: ' +
        'a permission declared there auto-merges via Gradle regardless of native-link.json, so ' +
        'only write manifestPermissions for something it genuinely needs but does not ship.',
    );
  }

  const draft = buildDraft(diffs, nonIntrospectable, gradleProjectName, pkgDir, warnings);
  writeFileSync(nativeLinkPath, JSON.stringify(draft, null, 2) + '\n');
  console.log(`Wrote ${nativeLinkPath}`);

  console.log('\nStill needs a human, before this file is real:');
  if (draft.android.modules.length === 0) console.log('  - android.modules is empty - see the warning above/below for why');
  if (draft.ios?.infoPlistKeys) console.log('  - ios.infoPlistKeys values are upstream\'s generic default wording - reword to match this app');
  if (draft.reviewedNonIntrospectableMods) console.log('  - reviewedNonIntrospectableMods notes are placeholders - read each mod body for real');
  if (loaded) console.log(`  - check ${loaded.pkgDir}/plugin (or plugin/build) for option flags this generator can't see - anything conditional on non-default props needs an optionalManifestBundles entry instead`);
  for (const warning of warnings) console.log(`  - ${warning}`);

  console.log(`\nRun: npx eslint ${nativeLinkPath} - it will keep failing until every TODO above is resolved.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
