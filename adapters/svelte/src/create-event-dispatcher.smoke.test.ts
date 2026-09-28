// createEventDispatcher builds its event via `new CustomEvent(...)` (svelte's
// `create_custom_event`). patch-globals.ts now installs a real CustomEvent while mounted; this
// proves a listened-to dispatch reaches the parent instead of throwing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_402;
const TMP_DIR = join(__dirname, '../build/__dispatch_smoke__');
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => mkdirSync(TMP_DIR, { recursive: true }));
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('createEventDispatcher against the DOM shim', () => {
  it('reaches a parent on:ping listener via the patched CustomEvent', async () => {
    const childFile = join(TMP_DIR, 'Child.mjs');
    writeFileSync(
      childFile,
      compile(
        `<script>` +
          `import { createEventDispatcher } from 'svelte';` +
          `const dispatch = createEventDispatcher();` +
          `globalThis.__fireDispatch = () => dispatch('ping', 'pong');` +
          `</script>` +
          `<view p={{}} />`,
        { ...COMPILE_OPTIONS, filename: 'Child.svelte' },
      ).js.code,
    );

    const received: unknown[] = [];
    Object.assign(globalThis, {
      __receiveDispatch: (detail: unknown) => received.push(detail),
    });

    const parentFile = join(TMP_DIR, 'Parent.mjs');
    writeFileSync(
      parentFile,
      compile(
        `<script>import Child from '${childFile}';</script>` +
          `<Child on:ping={(e) => globalThis.__receiveDispatch(e.detail)} />`,
        { ...COMPILE_OPTIONS, filename: 'Parent.svelte' },
      ).js.code,
    );
    const { default: Parent } = (await import(`file://${parentFile}`)) as {
      default: Component;
    };

    mount(ROOT_TAG, Parent, {});
    await tick();

    const fire = (globalThis as { __fireDispatch?: () => void }).__fireDispatch;
    expect(() => fire?.()).not.toThrow();
    expect(received).toEqual(['pong']);
  });
});
