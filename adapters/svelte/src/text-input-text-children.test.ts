// `TextInput.js:736-743`: a string inside `<text-input>` is its content, not an error
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const ROOT_TAG = 9_970;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Named for this suite alone, two suites sharing a compiled artifact race under a full run
const PROBE_OUT = join(__dirname, '.smoke-compiled-text-input-children.mjs');
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

beforeEach(() => fabric.reset());

afterAll(() => {
  unmount(ROOT_TAG);
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte <text-input> text children', () => {
  it('takes a string child as its content', async () => {
    writeFileSync(
      PROBE_OUT,
      compile('<text-input>hello World!</text-input>', {
        ...COMPILE_OPTIONS,
        filename: 'TextInputChildren.svelte',
      }).js.code,
    );
    const { default: Probe } = (await import(`file://${PROBE_OUT}`)) as {
      default: Component;
    };
    mount(ROOT_TAG, Probe, {});
    await tick();
    await tick();

    const input = fabric.find(one => one.viewName.includes('TextInput'));
    expect(input?.children.map(child => child.viewName)).toEqual([
      'RCTRawText',
    ]);
  });
});
