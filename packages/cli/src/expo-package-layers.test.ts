import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXPO_PACKAGE_LAYERS,
  isExpoPackageLayerName,
} from './expo-package-layers.js';

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates',
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
