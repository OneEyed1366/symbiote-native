// Ground truth for `transition:fade` and `animate:flip` against the real dom-shim: `fade` calls
// the bare global `getComputedStyle` and `Element.animate()` (patch-globals.ts + animation.ts);
// `flip` calls `node.getBoundingClientRect()` (element.ts). All three used to be missing outright.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { setShimAnimationsEnabled } from './dom-shim/animations-gate';

setShimAnimationsEnabled(true);

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_401;
const TMP_DIR = join(__dirname, '../build/__transition_smoke__');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// Same setTimeout-backed rAF as button-tag.test.ts's own composed-fade suite: the engine's/shim's
// animation drivers read requestAnimationFrame off the host at call time.
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
  pendingFrames.clear();
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frame(Date.now());
      }, 4);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

let compileCounter = 0;

async function compileComponent(
  source: string,
  name: string,
): Promise<Component> {
  const result = compile(source, {
    generate: 'client',
    filename: `${name}.svelte`,
    fragments: 'tree',
    css: 'external',
  });
  compileCounter += 1;
  const file = join(TMP_DIR, `${name}-${String(compileCounter)}.mjs`);
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error(`compiled ${name}.svelte produced no default export`);
  }
  const component: unknown = mod.default;
  if (typeof component !== 'function') {
    throw new Error(
      `compiled ${name}.svelte default export is not a component`,
    );
  }
  return component;
}

function appChildren(): ILiveNode[] {
  const wrapper = live.nodeOf(live.appRoot()).children[0];
  expect(wrapper, 'the root wrapper view committed').toBeDefined();
  return wrapper?.children ?? [];
}

describe('transition:/animate: directives against the DOM shim', () => {
  it('transition:fade animates opacity to 1 with no crash', async () => {
    // Svelte suppresses the INTRO transition on the very first paint (stock behavior), so the
    // block must start hidden and be shown afterwards for fade to actually engage.
    const Fader = await compileComponent(
      `<script>` +
        `import { fade } from 'svelte/transition';` +
        `let on = $state(false);` +
        `globalThis.__setFaderOn = (v) => { on = v; };` +
        `</script>` +
        `{#if on}<view p={{ testID: 'box' }} transition:fade={{ duration: 20 }}>` +
        `<text p={{}}>x</text></view>{/if}`,
      'Fader',
    );

    mount(ROOT_TAG, Fader, {});
    await tick();
    expect(appChildren()).toHaveLength(0);

    (globalThis as { __setFaderOn?: (v: boolean) => void }).__setFaderOn?.(
      true,
    );
    await wait(80);

    const box = appChildren()[0];
    expect(box).toBeDefined();
    expect(Number(box?.payload.opacity)).toBeCloseTo(1, 1);
  });

  it('animate:flip no longer throws on a keyed reorder', async () => {
    const Flipper = await compileComponent(
      `<script>` +
        `let items = $state(['a', 'b']);` +
        `globalThis.__setFlipItems = (value) => { items = value; };` +
        `</script>` +
        `{#each items as item (item)}` +
        `<view p={{ testID: item }} animate:flip><text p={{}}>{item}</text></view>` +
        `{/each}`,
      'Flipper',
    );

    mount(ROOT_TAG, Flipper, {});
    await tick();
    const setItems = (globalThis as { __setFlipItems?: (v: string[]) => void })
      .__setFlipItems;
    expect(typeof setItems).toBe('function');
    setItems?.(['b', 'a']);
    await wait(20);

    expect(appChildren().map(node => node.props.testID)).toEqual(['b', 'a']);
  });
});
