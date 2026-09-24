// Shared core for audit-expo-mod-drift.mjs (diffs an existing native-link.json against upstream)
// and generate-native-link-draft.mjs (drafts a new one from the same introspection): resolve the
// plugin, run @expo/config-plugins' introspect mode, diff. Full rationale in the audit script.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Deliberately non-existent - every base-mod provider's read() falls back to config-plugins' own
// stock template on ENOENT in introspect mode, and write() early-returns under introspect
// regardless, so nothing could be created here even by accident.
export const STOCK_PROJECT_ROOT = join(
  import.meta.dirname,
  '..',
  '..',
  '.native-link-introspection-stock-template',
);

export function stockConfig() {
  return {
    name: 'canary',
    slug: 'canary',
    android: { package: 'com.symbiotenative.canary' },
    ios: { bundleIdentifier: 'com.symbiotenative.canary' },
    _internal: { projectRoot: STOCK_PROJECT_ROOT },
  };
}

// Collects {path, before, after} per differing leaf. Arrays compare by index, matching how these
// plugins mutate: they push onto the end, never reorder or remove, so an appended entry shows as a
// new trailing index with `before: undefined`.
export function diffValues(before, after, pathPrefix = []) {
  if (before === after) return [];
  const bothObjects = before && after && typeof before === 'object' && typeof after === 'object';
  if (!bothObjects) {
    return [{ path: pathPrefix.join('.'), before, after }];
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diffs = [];
  for (const key of keys) {
    diffs.push(...diffValues(before[key], after[key], [...pathPrefix, key]));
  }
  return diffs;
}

// Resolves the wrapped expo-* package's directory from the OWNING @symbiote-native package's own
// package.json (`packageDir`) - every wrapper declares its upstream package as a real dependency
// there (verified across all 17 wrapped packages), so no example app needs to depend on anything.
export function resolvePackageDir(packageDir, gradleProjectName) {
  const pkgReq = createRequire(join(packageDir, 'package.json'));
  try {
    return dirname(pkgReq.resolve(`${gradleProjectName}/package.json`));
  } catch {
    return null;
  }
}

export function resolvePlugin(packageDir, gradleProjectName) {
  const pkgDir = resolvePackageDir(packageDir, gradleProjectName);
  if (!pkgDir) return null;
  const appPluginPath = join(pkgDir, 'app.plugin.js');
  if (!existsSync(appPluginPath)) return null;

  const pkgJsonPath = join(pkgDir, 'package.json');
  // Anchored at the UPSTREAM package's own package.json, not the wrapper's: the plugin requires
  // @expo/config-plugins as its own dependency, which the wrapper doesn't necessarily have
  // reachable (confirmed: fails resolving from the wrapper's package.json, succeeds here).
  const configPlugins = createRequire(pkgJsonPath)('@expo/config-plugins');

  // Absolute-path requires bypass the package's "exports" map entirely (only bare/deep specifiers
  // are subject to it), so this works even when app.plugin.js's own target isn't exported.
  const mod = createRequire(pkgJsonPath)(appPluginPath);
  return { plugin: mod.default ?? mod, pkgDir, configPlugins };
}

export async function introspect(config, configPlugins, platforms) {
  const { compileModsAsync } = configPlugins;
  const compiled = await compileModsAsync(config, {
    projectRoot: STOCK_PROJECT_ROOT,
    platforms,
    introspect: true,
  });
  return compiled._internal?.modResults ?? {};
}

// `isIntrospective` lives on @expo/config-plugins' BaseMods provider maps, not on
// `config.mods[platform][modName]` (only the plugin's own wrapper until compileModsAsync
// re-wraps it) - reading `config.mods` wrongly flags most manifest/infoPlist mods.
export function findNonIntrospectableMods(config, configPlugins) {
  const providersByPlatform = {
    android: configPlugins.BaseMods.getAndroidModFileProviders(),
    ios: configPlugins.BaseMods.getIosModFileProviders(),
  };
  const found = [];
  for (const platform of Object.keys(config.mods ?? {})) {
    const providers = providersByPlatform[platform] ?? {};
    for (const modName of Object.keys(config.mods[platform] ?? {})) {
      if (!providers[modName]?.isIntrospective) found.push(`${platform}.${modName}`);
    }
  }
  return found;
}

// Runs a resolved plugin against the stock config and returns what both audit/generate scripts
// need: the diff, the non-introspectable mod list, and the raw introspected trees (the generator
// needs the raw `after` tree for full values, not just which paths changed).
export async function introspectPlugin({ plugin, configPlugins }) {
  const before = stockConfig();
  const after = plugin(stockConfig());
  const platforms = Object.keys(after.mods ?? {});
  const nonIntrospectable = findNonIntrospectableMods(after, configPlugins);
  const beforeResults = await introspect(before, configPlugins, platforms);
  const afterResults = await introspect(after, configPlugins, platforms);
  const diffs = diffValues(beforeResults, afterResults);
  return { diffs, nonIntrospectable, beforeResults, afterResults };
}
