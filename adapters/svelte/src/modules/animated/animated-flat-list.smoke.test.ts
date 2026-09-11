// Real-compiled-source smoke test for `Animated.FlatList`, which IS `FlatList` — there is no
// wrapper. Proves an AnimatedValue in `style` survives the trip down the deepest component chain
// in this package and reaches the engine, which rasterizes it on the FIRST paint and repaints it
// per frame on the committed RCTScrollView. A list forwards `style` through four components
// before it becomes a host prop, so any link that copies or normalizes the bag would drop the
// node — this is where that would show.
//
// The compile chain: FlatList -> VirtualizedList -> View (refresh-control is a bare tag now, no
// sibling component to pre-compile). Every remaining link is pre-compiled to a co-located sibling
// `.mjs` with its specifier rewritten,
// the same technique flat-list.smoke.test.ts uses; the output names are unique to this file
// because Vitest runs suites concurrently.
//
// Scope note: FlatList's own surface (numColumns, viewability, RefreshControl) is covered by
// components/flat-list/flat-list.smoke.test.ts, and the value graph plus `bindAnimatedValue` by
// core/engine's own tests. This file's job is the Svelte delivery path only.
//
// No Negative group: no prop on this path rejects — a `style` holding nothing animated is simply
// published unchanged (`bindAnimatedValue` returns its input by identity).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// See scroll-view.smoke.test.ts: mounting through the render entry skips `index.ts`, so the host
// behaviors have to be named here.
import '../../register';
import { mount, unmount } from '../../render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}
// No NativeAnimatedTurboModule: isNativeAnimatedAvailable() stays false, so this exercises the
// plain JS-driven flush path exclusively (the everyday case before opting into useNativeDriver).
globalThis.nativeModuleProxy = undefined;

const ROOT_TAG = 91_107;
const COMPONENTS_DIR = join(__dirname, '..', '..', 'components');
const VIRTUALIZED_LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-animated-flat-list.mjs',
);
const FLAT_LIST_OUT = join(
  COMPONENTS_DIR,
  'flat-list',
  '.smoke-compiled-flat-list-for-animated.mjs',
);
const PARENT_OUT = join(__dirname, '.smoke-compiled-animated-flat-parent.mjs');

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  for (const out of [VIRTUALIZED_LIST_OUT, FLAT_LIST_OUT, PARENT_OUT]) {
    rmSync(out, { force: true });
  }
});

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

function compileRewritten(
  sourcePath: string,
  filename: string,
  outPath: string,
  rewrites: ReadonlyArray<[string, string]>,
): void {
  const result = compile(readFileSync(sourcePath, 'utf8'), {
    ...COMPILE_OPTIONS,
    filename,
  });
  let code = result.js.code;
  for (const [from, to] of rewrites) code = code.replace(from, to);
  writeFileSync(outPath, code);
}

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15) — a live-value assertion must walk the COMMITTED tree.
function findLive(
  node: IFakeNode,
  predicate: (n: IFakeNode) => boolean,
): IFakeNode | undefined {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findLive(child, predicate);
    if (found !== undefined) return found;
  }
  return undefined;
}

function liveScrollView(): IFakeNode {
  const node = findLive(fabric.appRoot(), n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no RCTScrollView committed');
  return node;
}

function compileChain(): void {
  compileToFile(
    readFileSync(
      join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    'VirtualizedList.svelte',
    VIRTUALIZED_LIST_OUT,
  );
  compileRewritten(
    join(COMPONENTS_DIR, 'flat-list', 'index.svelte'),
    'FlatList.svelte',
    FLAT_LIST_OUT,
    [
      [
        "from '../virtualized-list/index.svelte'",
        "from '../virtualized-list/.smoke-compiled-virtualized-list-for-animated-flat-list.mjs'",
      ],
    ],
  );
}

async function loadParent(): Promise<Component> {
  compileChain();

  // window.__animatedFlatHandle mirrors scroll-view.smoke.test.ts's trick: expose the bind:this
  // ref outside the compiled tree so the test can drive the imperative handle from outside.
  compileToFile(
    `<script>
       import FlatList from '../../components/flat-list/.smoke-compiled-flat-list-for-animated.mjs';
       let { data, style } = $props();
       let handle = $state();
       $effect(() => {
         window.__animatedFlatHandle = handle;
       });
     </script>
     {#snippet cell({ item })}<text p={{ text: item }}></text>{/snippet}
     <FlatList bind:this={handle} {data} {style} item={cell} />`,
    'AnimatedFlatParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('AnimatedFlatParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// The handle's true shape is only known at runtime (the compiled parent's $effect writes it), so
// narrow with a guard rather than an `as` cast.
function isFlatHandle(
  value: unknown,
): value is { scrollToOffset: unknown; getScrollNode: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scrollToOffset' in value &&
    'getScrollNode' in value
  );
}

const ITEM_COUNT = 40;
const DEFAULT_INITIAL_NUM_TO_RENDER = 10;
const data = Array.from(
  { length: ITEM_COUNT },
  (_unused, index) => `row-${index}`,
);

describe('Animated.FlatList (real compiled source) (Positive)', () => {
  // why: the control for the two animated cases below. They read one prop off one node, which a
  // list that rendered nothing at all would also satisfy vacuously; this pins the ScrollView shell
  // and the windowed slice first, so a red animated case means the VALUE is missing rather than
  // the tree.
  it('renders the real windowed FlatList shape', async () => {
    const AnimatedFlatParent = await loadParent();
    mount(ROOT_TAG, AnimatedFlatParent, { data });
    await tick();
    await tick();

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
      'RCTScrollView came from the real FlatList/VirtualizedList, not a duplicate',
    ).toBeDefined();
    const content = fabric.find(
      node => node.viewName === 'RCTScrollContentView',
    );
    expect(content).toBeDefined();
    expect(content?.children.length).toBe(DEFAULT_INITIAL_NUM_TO_RENDER);
  });

  // why: the FIRST paint must already carry the rasterized value, not zero/undefined — a list
  // mounting mid-animation would otherwise flash at the wrong opacity before the first frame.
  it('rasterizes an animated style prop on the first paint', async () => {
    const AnimatedFlatParent = await loadParent();
    const opacity = new AnimatedValue(0.35);

    mount(ROOT_TAG, AnimatedFlatParent, { data, style: { opacity } });
    await tick();
    await tick();

    expect(liveScrollView().props.opacity).toBe(0.35);
  });

  // why: a per-frame write goes through the engine's own targeted setNativeProps commit, never a
  // Svelte re-render, so nothing above re-runs to correct a leaf bound to the wrong object. The
  // repaint is what says the subscription landed on the committed host node. `bind:this` is read
  // alongside it because a list hands back an IMPERATIVE handle, and an animated style must not
  // cost the caller that surface.
  it('repaints on setValue while still exposing the list handle', async () => {
    const AnimatedFlatParent = await loadParent();
    const opacity = new AnimatedValue(0.35);

    mount(ROOT_TAG, AnimatedFlatParent, { data, style: { opacity } });
    await tick();
    await tick();

    const handle = Reflect.get(globalThis, '__animatedFlatHandle');
    expect(
      isFlatHandle(handle),
      'FlatList still forwards its handle via bind:this under an animated style',
    ).toBe(true);
    if (!isFlatHandle(handle)) return;

    const hostNode = handle.getScrollNode();
    expect(hostNode).not.toBeNull();
    expect(
      hostNode !== null &&
        typeof hostNode === 'object' &&
        'scrollToOffset' in hostNode,
      'getScrollNode() unwrapped the handle rather than handing it back',
    ).toBe(false);

    opacity.setValue(0.8);
    await tick();

    expect(liveScrollView().props.opacity).toBe(0.8);
  });
});
