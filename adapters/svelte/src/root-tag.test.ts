// The tag of the surface a component is rendered into, the Svelte twin of RN's `RootTagContext`
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { useRootTag } from './runes/use-root-tag';
import { mount, unmount } from './render';

// RN sets both before any app code runs, a bare vitest sandbox has neither
if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const FIRST_TAG = 90_470;
const SECOND_TAG = 90_471;
const TMP_DIR = join(__dirname, '../build/__root_tag__');
const fabric = installRecordingFabric();

// The compiled component reads the tag through this hook during its own init, as an app would
const seen: number[] = [];
Object.assign(globalThis, {
  readRootTag: (): void => {
    seen.push(useRootTag());
  },
});

let compileCounter = 0;

async function readerComponent(): Promise<Component> {
  const { js } = compile('<script>readRootTag();</script>', {
    generate: 'client',
    filename: 'Reader.svelte',
    fragments: 'tree',
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `reader-${String(compileCounter)}.mjs`);
  writeFileSync(file, js.code);
  const mod: { default: Component } = await import(`file://${file}`);
  return mod.default;
}

beforeEach(() => {
  fabric.reset();
  seen.length = 0;
  mkdirSync(TMP_DIR, { recursive: true });
});
afterEach(() => {
  unmount(FIRST_TAG);
  unmount(SECOND_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('useRootTag', () => {
  it('carries the tag a component is mounted under', async () => {
    mount(FIRST_TAG, await readerComponent());

    expect(seen).toEqual([FIRST_TAG]);
  });

  it('answers each surface with its own tag', async () => {
    mount(FIRST_TAG, await readerComponent());
    mount(SECOND_TAG, await readerComponent());

    expect(seen).toEqual([FIRST_TAG, SECOND_TAG]);
  });

  it('throws outside a component, as svelte contexts do', () => {
    expect(() => useRootTag()).toThrow(/lifecycle_outside_component/);
  });
});
