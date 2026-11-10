// `layout-conformance` as a tag through the real Svelte compiler. Labels are `id`, folded to
// `nativeID`, since the compiler lowercases a `testID` attribute on a tag
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import './register';
import { mount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Named for this suite alone, two suites sharing a compiled artifact race under a full run
const PROBE_OUT = join(__dirname, '.smoke-compiled-layout-conformance-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const SOURCE = `
<layout-conformance id="lc" mode="strict">
  <view id="inner" />
</layout-conformance>
`;

const ROOT_TAG = 9_980;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: the layout-conformance tag', () => {
  it('commits a LayoutConformance with its mode and its children', async () => {
    writeFileSync(
      PROBE_OUT,
      compile(SOURCE, {
        ...COMPILE_OPTIONS,
        filename: 'LayoutConformanceTag.svelte',
      }).js.code,
    );
    // Node caches a dynamic import by resolved path, a fresh query string runs the new module
    const { default: Probe } = (await import(
      `file://${PROBE_OUT}?arm=${ROOT_TAG}`
    )) as { default: Component };
    mount(ROOT_TAG, Probe, {});
    await tick();
    await tick();
    await tick();

    const wrapper = live.findLive(
      live.appRoot(),
      node => node.payload.nativeID === 'lc',
    );
    const inner = live.findLive(
      live.appRoot(),
      node => node.payload.nativeID === 'inner',
    );

    expect(wrapper?.viewName).toBe('LayoutConformance');
    expect(wrapper?.payload.mode).toBe('strict');
    expect(wrapper?.children).toHaveLength(1);
    expect(inner?.viewName).toBe('RCTView');
    expect(inner).toBeDefined();
  });
});
