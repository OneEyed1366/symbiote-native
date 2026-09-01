// Static tests for the expensive standalone-consumer matrix. The real CI command performs npm
// installs and Metro bundles; these assertions keep its coverage list and manifest rewriting from
// silently regressing before that slow gate even starts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  adapterReachedBundle,
  directInternalDependencies,
  findForeignFrameworkLeaks,
  FRAMEWORK_EXAMPLES,
  KNOWN_FRAMEWORKS,
  PLATFORMS,
  rewriteInternalDependencies,
} from '../scripts/check-packed-consumer-bundles.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('packed consumer bundle matrix', () => {
  it('covers all five adapters on both native platforms', () => {
    expect(Object.keys(FRAMEWORK_EXAMPLES)).toEqual(KNOWN_FRAMEWORKS);
    expect(PLATFORMS).toEqual(['ios', 'android']);
    expect(FRAMEWORK_EXAMPLES.solid.dir).toBe('examples/solid');
  });

  it.each(Object.entries(FRAMEWORK_EXAMPLES))(
    '%s consumes its own adapter directly',
    (framework, example) => {
      const manifest = JSON.parse(
        fs.readFileSync(
          path.join(REPO_ROOT, example.dir, 'package.json'),
          'utf8',
        ),
      );
      expect(directInternalDependencies(manifest)).toContain(example.adapter);
      expect(framework).toBeTruthy();
    },
  );

  it('rewrites every direct internal dependency to its tarball without touching externals', () => {
    const manifest = {
      dependencies: {
        '@symbiote-native/engine': '^0.3.0',
        react: '19.2.3',
      },
      devDependencies: {
        '@symbiote-native/css-parser': '^0.4.0',
        typescript: '~6.0.0',
      },
    };
    const rewritten = rewriteInternalDependencies(
      manifest,
      new Map([
        ['@symbiote-native/engine', '/tmp/engine.tgz'],
        ['@symbiote-native/css-parser', '/tmp/css-parser.tgz'],
      ]),
    );
    expect(rewritten).toEqual({
      dependencies: {
        '@symbiote-native/engine': 'file:/tmp/engine.tgz',
        react: '19.2.3',
      },
      devDependencies: {
        '@symbiote-native/css-parser': 'file:/tmp/css-parser.tgz',
        typescript: '~6.0.0',
      },
    });
    expect(manifest.dependencies['@symbiote-native/engine']).toBe('^0.3.0');
  });

  it('detects a foreign framework package file while accepting the current adapter', () => {
    const sources = [
      '/tmp/app/node_modules/@symbiote-native/solid/build/index.js',
      '/tmp/app/node_modules/@symbiote-native/navigation/build/solid/index.js',
      '/tmp/app/node_modules/@symbiote-native/navigation/build/vue/index.js',
    ];
    expect(adapterReachedBundle(sources, '@symbiote-native/solid')).toBe(true);
    expect(
      findForeignFrameworkLeaks(
        sources,
        [{ name: 'navigation', frameworks: KNOWN_FRAMEWORKS }],
        'solid',
      ),
    ).toEqual([
      {
        package: 'navigation',
        foreignFramework: 'vue',
        source:
          '/tmp/app/node_modules/@symbiote-native/navigation/build/vue/index.js',
      },
    ]);
  });
});
