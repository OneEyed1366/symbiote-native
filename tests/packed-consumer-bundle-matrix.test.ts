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
  MATRIX_EXAMPLES,
  ownFrameworkOf,
  packArgs,
  PLATFORMS,
  platformsOf,
  rewriteInternalDependencies,
} from '../scripts/check-packed-consumer-bundles.mjs';
import { canaryExampleNames } from '../scripts/lib/canary-examples.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('packed consumer bundle matrix', () => {
  // The expected set comes from disk: no audit notices a member missing from its own list
  it('runs one arm per canary example, on both native platforms', () => {
    const covered = Object.values(FRAMEWORK_EXAMPLES).map(example =>
      example.dir.replace('examples/', ''),
    );
    expect(covered.sort()).toEqual(canaryExampleNames());
    expect(PLATFORMS).toEqual(['ios', 'android']);
  });

  it('skips the lifecycle scripts only when they would just redo an AOT build on disk', () => {
    const plain = ['pack', '--pack-destination', '/out'];
    const skipping = ['--config.ignore-scripts=true', ...plain];
    const rebuildOnly = { scripts: { prepare: 'pnpm run ng:build' } };

    expect(packArgs(rebuildOnly, true, '/out')).toEqual(skipping);
    expect(packArgs(rebuildOnly, false, '/out')).toEqual(plain);
    expect(
      packArgs(
        { scripts: { prepare: 'node vendor.cjs && pnpm run ng:build' } },
        true,
        '/out',
      ),
    ).toEqual(plain);
    expect(
      packArgs(
        { scripts: { prepare: 'pnpm run ng:build', prepack: 'node emit.mjs' } },
        true,
        '/out',
      ),
    ).toEqual(plain);
    expect(packArgs({}, true, '/out')).toEqual(plain);
  });

  it('type-checks every expo example without bundling it', () => {
    const expoExamples = fs
      .readdirSync(path.join(REPO_ROOT, 'examples'))
      .filter(name => name.startsWith('expo-'));
    const typecheckOnly = Object.values(MATRIX_EXAMPLES).filter(
      example => 'isTypecheckOnly' in example,
    );

    expect(
      typecheckOnly.map(example => example.dir.replace('examples/', '')).sort(),
    ).toEqual(expoExamples.sort());
    expect(
      typecheckOnly.flatMap(example => platformsOf(example, PLATFORMS)),
    ).toEqual([]);
    expect(platformsOf(FRAMEWORK_EXAMPLES.react, PLATFORMS)).toEqual(PLATFORMS);
  });

  // `vue-tsx`'s arm key is not its framework, and only the derived value may reach the foreign-file
  // check — see `ownFrameworkOf`. Break-tested by passing the key instead: every
  // `navigation/build/vue/**` module in that bundle then reports as a leak.
  it('derives an arm own framework from its adapter, not from its key', () => {
    for (const [arm, example] of Object.entries(FRAMEWORK_EXAMPLES)) {
      expect(KNOWN_FRAMEWORKS).toContain(ownFrameworkOf(example));
      if (arm !== 'vue-tsx') expect(ownFrameworkOf(example)).toBe(arm);
    }
    expect(ownFrameworkOf(FRAMEWORK_EXAMPLES['vue-tsx'])).toBe('vue');
    expect(
      findForeignFrameworkLeaks(
        [
          '/tmp/app/node_modules/@symbiote-native/navigation/build/vue/index.js',
        ],
        [{ name: 'navigation', frameworks: KNOWN_FRAMEWORKS }],
        ownFrameworkOf(FRAMEWORK_EXAMPLES['vue-tsx']),
      ),
    ).toEqual([]);
  });

  it.each(Object.entries(MATRIX_EXAMPLES))(
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

  // The first checks prove the arm list is derived, the last one that no executable line names an
  // arm beside it, in an `exclude:` say. Comments are stripped: their prose names frameworks
  it('derives the CI matrix arms from this script, never a written-down list', () => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, '.github/workflows/checks.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      'arm: ${{ fromJSON(needs.gate.outputs.bundle-arms) }}',
    );
    expect(workflow).toContain('Object.keys(m.MATRIX_EXAMPLES)');
    const executable = workflow
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    const restated = Object.keys(MATRIX_EXAMPLES).filter(arm =>
      new RegExp(`\\b${arm}\\b`).test(executable),
    );
    expect(restated).toEqual([]);
  });
});
