import { transformSync } from '@babel/core';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { relabelForUpstream } from './relabel-for-upstream';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKLETS_APP = join(HERE, 'fixtures', 'worklets-app');
const PLAIN_APP = join(HERE, 'fixtures', 'plain-app');

const WORKLET_SOURCE =
  "export const step = (n) => { 'worklet'; return n + 1; };";

function compileAs(params: {
  filename: string;
  src: string;
  plugins?: unknown;
}) {
  const plugins = Array.isArray(params.plugins) ? params.plugins : [];
  return transformSync(params.src, {
    cwd: WORKLETS_APP,
    filename: params.filename,
    babelrc: false,
    plugins,
  });
}

function paramsFor(projectRoot: string) {
  return {
    filename: join(projectRoot, 'screens', 'Home.vue'),
    src: '<template />',
    options: { projectRoot, dev: true },
    plugins: [],
  };
}

describe('relabelForUpstream', () => {
  it('hands upstream the compiled source under the filename with the extension added', () => {
    const relabeled = relabelForUpstream(
      paramsFor(PLAIN_APP),
      'export {}',
      '.tsx',
    );

    expect(relabeled.src).toBe('export {}');
    expect(relabeled.filename).toBe(join(PLAIN_APP, 'screens', 'Home.vue.tsx'));
  });

  it('keeps every other param upstream was given', () => {
    const params = paramsFor(PLAIN_APP);

    const relabeled = relabelForUpstream(params, 'export {}', '.tsx');

    expect(relabeled.options).toBe(params.options);
  });

  it('turns source maps off for the worklets plugin the app lists, keeping the options it gave', () => {
    const resolved = createRequire(join(WORKLETS_APP, 'x.js')).resolve(
      'react-native-worklets/plugin',
    );

    const relabeled = relabelForUpstream(
      paramsFor(WORKLETS_APP),
      'export {}',
      '.tsx',
    );

    expect(relabeled.plugins).toEqual([
      [resolved, { strictGlobal: true, disableSourceMaps: true }],
    ]);
  });

  it('adds no plugin when the app does not list the worklets plugin', () => {
    const relabeled = relabelForUpstream(
      paramsFor(PLAIN_APP),
      'export {}',
      '.tsx',
    );

    expect(relabeled.plugins).toEqual([]);
  });

  it('lets the worklets plugin compile a worklet under a name that is not on disk', () => {
    const relabeled = relabelForUpstream(
      paramsFor(WORKLETS_APP),
      WORKLET_SOURCE,
      '.tsx',
    );

    const compiled = compileAs(relabeled);

    expect(compiled?.code).toContain('__workletHash');
  });

  it('shows the worklets plugin failing to read that name when nothing turns its source maps off', () => {
    const untouched = {
      ...paramsFor(WORKLETS_APP),
      src: WORKLET_SOURCE,
      filename: `${paramsFor(WORKLETS_APP).filename}.tsx`,
    };

    expect(() => compileAs(untouched)).toThrow(/ENOENT/);
  });

  it('adds no plugin when the transform was given no project root', () => {
    const relabeled = relabelForUpstream(
      { filename: 'Home.vue', src: '<template />' },
      'export {}',
      '.tsx',
    );

    expect(relabeled.plugins).toBeUndefined();
  });
});
