// Text.svelte must apply a prop that CHANGES after mount.
//
// It did not, and nothing caught it. `ShimElement`'s `p` setter diffs the incoming bag against the
// one it stored last time; Text handed it the live `rest_props` proxy, so every pass compared that
// object with ITSELF, found zero changed keys, and dropped the update. Children still rendered, so
// the component looked alive — only non-children props were frozen at their mount values.
//
// Found 2026-08-19 while replacing the six hand-authored Animated components with one generic
// wrap: the old `AnimatedText` happened to pass a fresh `$derived` object and dodged it, the wrap
// does not, so `Animated.Text` would have regressed into the bug. Fix is `View.svelte`'s shape —
// `const bag = $derived({ ...rest })`.
//
// There was no text.smoke.test.ts at all, which is why a break this broad survived. This file is
// that gap closed, narrowly: one prop, changed once, read off the COMMITTED tree.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_733;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// Own filenames, not shared with any other suite: Vitest runs test FILES concurrently and Node's
// import() caches by path (.claude/rules/smoke-compiled-artifact-collisions.md).
const TEXT_OUT = join(__dirname, '.smoke-compiled-text-for-prop-update.mjs');
const PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-text-prop-update-parent.mjs',
);

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

function compileToFile(
  source: string,
  filename: string,
  outPath: string,
): void {
  const result = compile(source, { ...COMPILE_OPTIONS, filename });
  writeFileSync(outPath, result.js.code);
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TEXT_OUT, { force: true });
  rmSync(PARENT_OUT, { force: true });
});

// The LIVE tree. fabric.find() reads the creation log, which never reflects a later clone — the
// exact read that would make this test pass on the broken code (symbiote-engine-core §8).
function committed(testID: string): IFakeNode | undefined {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(fabric.committed);
}

async function loadParent(): Promise<Component> {
  compileToFile(
    readFileSync(join(__dirname, 'Text.svelte'), 'utf8'),
    'Text.svelte',
    TEXT_OUT,
  );
  // `register` hands the test the parent's own setter, which is the smallest way to drive a
  // post-mount change without a press lifecycle in the way.
  compileToFile(
    `<script>
       import Text from './.smoke-compiled-text-for-prop-update.mjs';
       let { register } = $props();
       let lines = $state(1);
       register((next) => { lines = next; });
     </script>
     <Text testID="probe" numberOfLines={lines}>hello</Text>`,
    'Parent.svelte',
    PARENT_OUT,
  );
  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('Parent.svelte produced no default export');
  }
  const parent = mod.default;
  if (typeof parent !== 'function') {
    throw new Error('Parent.svelte default export is not a component');
  }
  return parent;
}

describe('Text.svelte prop updates (real compiled source)', () => {
  it('applies a prop that changes after mount', async () => {
    let setLines: ((next: number) => void) | undefined;
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, {
      register: (setter: (next: number) => void) => {
        setLines = setter;
      },
    });
    await tick();
    await tick();

    expect(committed('probe')?.props.numberOfLines).toBe(1);

    setLines?.(3);
    await tick();
    await tick();

    // Broken: still 1 — the bag proxy compared equal to itself and nothing was applied.
    expect(committed('probe')?.props.numberOfLines).toBe(3);
  });
  // why: RN sets ellipsizeMode unconditionally (Text.js:291). Without it native falls back to
  // `clip`, and a clamped Text cuts mid-word with no ellipsis — device-observed on
  // examples/svelte before resolveTextProps existed. The assertion is on the COMMITTED node
  // because that is what Fabric actually received.
  it("carries RN's Text defaults through to the committed node", async () => {
    const Parent = await loadParent();
    mount(ROOT_TAG, Parent, { register: () => {} });
    await tick();
    await tick();

    const node = committed('probe');
    expect(node?.props.ellipsizeMode).toBe('tail');
    expect(node?.props.allowFontScaling).toBe(true);
  });
});
