import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IExpoPackageLayer } from './expo-package-layers.js';
import {
  applyBundle,
  discoveredBundlesFromLayers,
  discoverOptionalBundles,
  filterBundlesForLayer,
} from './grant-bundles.js';

const ANDROID_MANIFEST_PATH = [
  'android',
  'app',
  'src',
  'main',
  'AndroidManifest.xml',
] as const;

// Mirrors @symbiote-native/expo-modules-link's own test fixture shape — applyBundle is a thin
// wrapper over that package's patchers, so the manifest it edits looks the same.
const ANDROID_MANIFEST_FIXTURE = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET" />

  <application
    android:name=".MainApplication"
    android:allowBackup="false">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>
`;

function makeAppRootWithManifest(): string {
  const root = mkdtempSync(join(tmpdir(), 'symbiote-cli-grant-test-'));
  mkdirSync(join(root, ...ANDROID_MANIFEST_PATH.slice(0, -1)), {
    recursive: true,
  });
  writeFileSync(join(root, ...ANDROID_MANIFEST_PATH), ANDROID_MANIFEST_FIXTURE);
  return root;
}

function makeAppRootWithPackage(
  packageName: string,
  manifest: unknown,
): string {
  const root = mkdtempSync(join(tmpdir(), 'symbiote-cli-grant-test-'));
  const packageDir = join(root, 'node_modules', ...packageName.split('/'));
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(packageDir, 'native-link.json'), JSON.stringify(manifest));
  return root;
}

describe('discoverOptionalBundles', () => {
  // why: a package the developer has NOT installed can't offer anything to grant — discovery is
  // scoped to what's actually reachable from the app's own node_modules, not a hardcoded list.
  it("finds a bundle declared by an installed package's native-link.json", () => {
    const appRoot = makeAppRootWithPackage('@symbiote-native/location', {
      android: {
        optionalManifestBundles: [
          {
            id: 'background',
            label: 'Background location tracking',
            warning:
              'Requesting ACCESS_BACKGROUND_LOCATION triggers Play Console policy review.',
            nextSteps: 'Pass foregroundService to startLocationUpdatesAsync.',
            manifestPermissions: [
              'android.permission.ACCESS_BACKGROUND_LOCATION',
            ],
          },
        ],
      },
    });

    expect(discoverOptionalBundles(appRoot)).toEqual([
      {
        packageName: '@symbiote-native/location',
        bundle: {
          id: 'background',
          label: 'Background location tracking',
          warning:
            'Requesting ACCESS_BACKGROUND_LOCATION triggers Play Console policy review.',
          nextSteps: 'Pass foregroundService to startLocationUpdatesAsync.',
          manifestPermissions: [
            'android.permission.ACCESS_BACKGROUND_LOCATION',
          ],
        },
      },
    ]);
  });

  // why: a package can offer more than one policy-sensitive capability (e.g. audio's own
  // "recording" bundle alongside a future one) — the schema is a named list specifically so both
  // surface, not just the first.
  it('finds every bundle a package declares, not just the first', () => {
    const appRoot = makeAppRootWithPackage('@symbiote-native/audio', {
      android: {
        optionalManifestBundles: [
          {
            id: 'recording',
            label: 'Background audio recording',
            warning:
              'Requesting FOREGROUND_SERVICE_MICROPHONE triggers Play Console review.',
            nextSteps: 'Set allowsBackgroundRecording via setAudioModeAsync.',
            manifestPermissions: [
              'android.permission.FOREGROUND_SERVICE_MICROPHONE',
            ],
          },
          {
            id: 'another',
            label: 'Another capability',
            warning: 'why',
            nextSteps: 'what',
          },
        ],
      },
    });

    expect(discoverOptionalBundles(appRoot).map(d => d.bundle.id)).toEqual([
      'recording',
      'another',
    ]);
  });

  // why: an installed package with no optional bundle at all (e.g. sensors) must not fabricate
  // one — an empty result means "nothing to grant here", not an error.
  it('returns nothing for a package that declares no optional bundle', () => {
    const appRoot = makeAppRootWithPackage('@symbiote-native/sensors', {
      android: { gradleProjectName: 'expo-sensors', modules: [] },
    });

    expect(discoverOptionalBundles(appRoot)).toEqual([]);
  });

  // why: `grant` with no argument must offer everything installed, from every package that has
  // something — not just the first one found.
  it('collects bundles from multiple installed packages, keeping their package names apart', () => {
    const root = mkdtempSync(join(tmpdir(), 'symbiote-cli-grant-test-'));
    for (const [packageName, bundleId] of [
      ['@symbiote-native/location', 'background'],
      ['@symbiote-native/audio', 'recording'],
    ] as const) {
      const packageDir = join(root, 'node_modules', ...packageName.split('/'));
      mkdirSync(packageDir, { recursive: true });
      writeFileSync(
        join(packageDir, 'native-link.json'),
        JSON.stringify({
          android: {
            optionalManifestBundles: [
              { id: bundleId, label: bundleId, warning: 'w', nextSteps: 'n' },
            ],
          },
        }),
      );
    }

    expect(
      discoverOptionalBundles(root).map(d => [d.packageName, d.bundle.id]),
    ).toEqual([
      ['@symbiote-native/audio', 'recording'],
      ['@symbiote-native/location', 'background'],
    ]);
  });
});

describe('applyBundle', () => {
  // why: granting a bundle means the app's own AndroidManifest.xml ends up with the exact
  // permission and service the developer just opted into — that's the whole point of `grant`.
  it("writes the bundle's permissions and services into the app's AndroidManifest.xml", () => {
    const appRoot = makeAppRootWithManifest();

    applyBundle(appRoot, {
      id: 'recording',
      label: 'Background audio recording',
      warning: 'w',
      nextSteps: 'n',
      manifestPermissions: ['android.permission.FOREGROUND_SERVICE_MICROPHONE'],
      manifestServices: [
        {
          name: 'expo.modules.audio.service.AudioRecordingService',
          foregroundServiceType: 'microphone',
        },
      ],
    });

    const content = readFileSync(
      join(appRoot, ...ANDROID_MANIFEST_PATH),
      'utf8',
    );
    expect(content).toMatch(
      /<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" \/>/,
    );
    expect(content).toMatch(
      /<service android:name="expo\.modules\.audio\.service\.AudioRecordingService" android:exported="false" android:foregroundServiceType="microphone" \/>/,
    );
  });

  // why: running `grant` twice for the same bundle (developer re-runs it, or `new`/`add` offers
  // it again later) must not duplicate lines — same idempotency guarantee as every other patcher.
  it('is a no-op the second time it grants the same bundle', () => {
    const appRoot = makeAppRootWithManifest();
    const bundle = {
      id: 'background',
      label: 'Background location tracking',
      warning: 'w',
      nextSteps: 'n',
      manifestPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
    };

    applyBundle(appRoot, bundle);
    const afterFirst = readFileSync(
      join(appRoot, ...ANDROID_MANIFEST_PATH),
      'utf8',
    );

    applyBundle(appRoot, bundle);
    expect(readFileSync(join(appRoot, ...ANDROID_MANIFEST_PATH), 'utf8')).toBe(
      afterFirst,
    );
  });

  // why: a bundle with only permissions and no services (location's "background" bundle) must
  // not blow up trying to touch <application> for a service it doesn't declare.
  it('applies a permissions-only bundle without touching <application>', () => {
    const appRoot = makeAppRootWithManifest();
    const before = readFileSync(
      join(appRoot, ...ANDROID_MANIFEST_PATH),
      'utf8',
    );

    applyBundle(appRoot, {
      id: 'background',
      label: 'Background location tracking',
      warning: 'w',
      nextSteps: 'n',
      manifestPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
    });

    const after = readFileSync(join(appRoot, ...ANDROID_MANIFEST_PATH), 'utf8');
    expect(after).toMatch(
      /<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" \/>/,
    );
    expect(after.includes('<service')).toBe(before.includes('<service'));
  });
});

describe('filterBundlesForLayer', () => {
  const LOCATION_BUNDLE = {
    packageName: '@symbiote-native/location',
    bundle: { id: 'background', label: 'l', warning: 'w', nextSteps: 'n' },
  };
  const AUDIO_BUNDLE = {
    packageName: '@symbiote-native/audio',
    bundle: { id: 'recording', label: 'l', warning: 'w', nextSteps: 'n' },
  };
  const DISCOVERED = [LOCATION_BUNDLE, AUDIO_BUNDLE];

  // why: `grant` with no layer offers everything installed — that's the whole "just show me
  // what I can grant" use case.
  it('returns every discovered bundle when no layer filter is given', () => {
    expect(filterBundlesForLayer(DISCOVERED, undefined)).toEqual(DISCOVERED);
  });

  // why: `grant location` should match by the package's short name, the way a developer types
  // it — not the full scoped specifier.
  it('matches a layer name against the package name with the scope stripped', () => {
    expect(filterBundlesForLayer(DISCOVERED, 'location')).toEqual([
      LOCATION_BUNDLE,
    ]);
  });

  // why: a typo or a package that isn't installed must not silently return everything — that
  // would grant the wrong thing.
  it('returns nothing for a layer that matches no installed package', () => {
    expect(filterBundlesForLayer(DISCOVERED, 'sqlite')).toEqual([]);
  });
});

describe('discoveredBundlesFromLayers', () => {
  const AUDIO_LAYER: IExpoPackageLayer = {
    id: 'audio',
    label: 'Audio',
    symbiotePackage: '@symbiote-native/audio',
    optionalManifestBundles: [
      { id: 'recording', label: 'l', warning: 'w', nextSteps: 'n' },
    ],
  };
  const BATTERY_LAYER: IExpoPackageLayer = {
    id: 'battery',
    label: 'Battery',
    symbiotePackage: '@symbiote-native/battery',
  };

  // why: `add`/`new` know which packages were just selected before anything is installed — this
  // flattens the registry's own bundle data into the exact shape resolveGrantSelection/applyBundle
  // already consume, so they don't need a second code path for "not installed yet".
  it("flattens each selected layer's bundles, tagged with its package name", () => {
    expect(discoveredBundlesFromLayers([AUDIO_LAYER])).toEqual([
      {
        packageName: '@symbiote-native/audio',
        bundle: AUDIO_LAYER.optionalManifestBundles?.[0],
      },
    ]);
  });

  it('skips a layer with no optional manifest bundle', () => {
    expect(discoveredBundlesFromLayers([BATTERY_LAYER])).toEqual([]);
  });

  it('returns nothing for an empty layer list', () => {
    expect(discoveredBundlesFromLayers([])).toEqual([]);
  });
});
