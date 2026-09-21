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
  ownFrameworkOf,
  PLATFORMS,
  rewriteInternalDependencies,
} from '../scripts/check-packed-consumer-bundles.mjs';
import { canaryExampleNames } from '../scripts/lib/canary-examples.mjs';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('packed consumer bundle matrix', () => {
  // Read the expected set off DISK, never from a written-down list. This assertion used to be
  // `Object.keys(FRAMEWORK_EXAMPLES) === KNOWN_FRAMEWORKS`, which is not a coverage check at all:
  // both sides were hand-written, both said "five", and `examples/vue-tsx` — a sixth canary with
  // no arm — satisfied it. No audit detects a member absent from the list being audited
  // (`.claude/rules/adapter-parity-audit.md`), so the next example has to join by existing.
  it('runs one arm per canary example, on both native platforms', () => {
    const covered = Object.values(FRAMEWORK_EXAMPLES).map(example =>
      example.dir.replace('examples/', ''),
    );
    expect(covered.sort()).toEqual(canaryExampleNames());
    expect(PLATFORMS).toEqual(['ios', 'android']);
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

  // The workflow runs one RUNNER per arm now, and a `strategy.matrix` is precisely the shape that
  // invites a second copy of the arm names — the mistake that left `examples/vue-tsx` in no CI list
  // for a year. Both halves are needed: the first says the list is derived, the second says no
  // EXECUTABLE line quietly re-states it. Comments are stripped first because the prose around the
  // job names these frameworks on purpose, and a guard that forbids explaining itself is one
  // somebody deletes.
  //
  // Break-tested in two directions, because the first attempt caught only one: replacing the
  // expression with a literal list fires the first assertion, and adding a `- arm: solid` exclude
  // BESIDE the expression fires the second. The original spelling of the second half — matching
  // `- solid\n` / quoted forms — passed that exclude and would have let the list back in one
  // `exclude:` at a time.
  it('derives the CI matrix arms from this script, never a written-down list', () => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, '.github/workflows/checks.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      'arm: ${{ fromJSON(needs.gate.outputs.bundle-arms) }}',
    );
    const executable = workflow
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    const restated = Object.keys(FRAMEWORK_EXAMPLES).filter(arm =>
      new RegExp(`\\b${arm}\\b`).test(executable),
    );
    expect(restated).toEqual([]);
  });
});
