import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXPO_PACKAGE_LAYERS,
  expoPackagesWithOptionalManifestBundles,
  isExpoPackageLayerName,
} from './expo-package-layers.js';

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates',
);

// Two levels up from packages/cli/src/ lands on packages/ — every EXPO_PACKAGE_LAYERS entry's
// own package lives at packages/<id>, a sibling of cli in this workspace.
const packagesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

describe('isExpoPackageLayerName', () => {
  it('recognizes every registered layer id', () => {
    for (const layer of EXPO_PACKAGE_LAYERS) {
      expect(isExpoPackageLayerName(layer.id)).toBe(true);
    }
  });

  it('rejects a name that is not in the registry', () => {
    expect(isExpoPackageLayerName('not-a-real-package')).toBe(false);
  });
});

// Each registry entry promises a dependency-only layer template exists at the exact path
// add-layers.ts's generic branch and generate.ts's loop both read from — a registry entry with no
// matching template would render nothing and silently no-op instead of installing the package.
describe('every EXPO_PACKAGE_LAYERS entry has a matching template fragment', () => {
  it.each(EXPO_PACKAGE_LAYERS)(
    '$id ships templates/layers/$id/package.json.fragment.json',
    layer => {
      const fragmentPath = path.join(
        templatesRoot,
        'layers',
        layer.id,
        'package.json.fragment.json',
      );
      expect(fs.existsSync(fragmentPath)).toBe(true);

      const fragment: unknown = JSON.parse(
        fs.readFileSync(fragmentPath, 'utf8'),
      );
      if (
        typeof fragment !== 'object' ||
        fragment === null ||
        !('dependencies' in fragment)
      ) {
        throw new Error(`${fragmentPath} has no "dependencies" field`);
      }
      expect(fragment.dependencies).toMatchObject({
        [layer.symbiotePackage]: expect.any(String),
      });
    },
  );
});

// Each registry entry's `optionalManifestBundles` is hand-maintained data, duplicated from the
// package's own native-link.json so `add`/`new` can offer to grant it before install (see its own
// comment in expo-package-layers.ts) — this is what keeps the copy from silently drifting.
describe("optionalManifestBundles matches each package's own native-link.json", () => {
  it.each(EXPO_PACKAGE_LAYERS)('$id', layer => {
    const manifestPath = path.join(packagesRoot, layer.id, 'native-link.json');
    let realBundles: unknown[] = [];
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        android?: { optionalManifestBundles?: unknown[] };
      };
      realBundles = manifest.android?.optionalManifestBundles ?? [];
    }

    expect(layer.optionalManifestBundles ?? []).toEqual(realBundles);
  });
});

describe('expoPackagesWithOptionalManifestBundles', () => {
  // why: `add --audio --battery` installed two packages, but only audio has something to grant —
  // the hint must name exactly what was actually just installed, not every layer that ever could.
  it('returns only the selected layers that declare an optional manifest bundle', () => {
    expect(
      expoPackagesWithOptionalManifestBundles(new Set(['audio', 'battery'])),
    ).toEqual([EXPO_PACKAGE_LAYERS.find(layer => layer.id === 'audio')]);
  });

  it('returns nothing when none of the selected layers has one', () => {
    expect(
      expoPackagesWithOptionalManifestBundles(new Set(['battery', 'sensors'])),
    ).toEqual([]);
  });

  it('returns nothing for an empty selection', () => {
    expect(expoPackagesWithOptionalManifestBundles(new Set())).toEqual([]);
  });
});
