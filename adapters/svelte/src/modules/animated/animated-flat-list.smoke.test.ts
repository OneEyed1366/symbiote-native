// Real-compiled-source smoke test for Animated.FlatList: proves it WRAPS the real
// FlatList.svelte (so windowing, the ScrollView shell and the whole imperative handle come along)
// rather than a reduced duplicate, that an AnimatedValue in `style` is already rasterized on the
// FIRST paint, and that the leaf binds to the underlying host node — the handle captured by
// `bind:this` is an imperative surface, so only getScrollNode() (this adapter's resolveHostNode)
// reaches something setNativeProps can drive.
//
// The compile chain is the deepest in this package: AnimatedFlatList -> FlatList ->
// VirtualizedList -> RefreshControl + ScrollViewStickyHeader -> AnimatedView. Every link is
// pre-compiled to a co-located sibling `.mjs` with its specifier rewritten, the same technique
// flat-list.smoke.test.ts and animated-scroll-view.smoke.test.ts already use; the output names are
// unique to this file because Vitest runs suites concurrently.
//
// Scope note: FlatList's own surface (numColumns, viewability, RefreshControl) is covered by
// components/flat-list/flat-list.smoke.test.ts, and the value graph by core/engine's own tests.
// This file's job is the narrower Animated-specific wiring.
//
// No Negative group: AnimatedFlatList.svelte has no throwing/rejecting path — every prop rides the
// same open IAnimatedComponentProps bag as every other Animated.* component.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { AnimatedValue } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
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
const REFRESH_CONTROL_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-refresh-control-for-animated-flat-list.mjs',
);
const VIEW_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-view-for-animated-flat-list.mjs',
);
const STICKY_HEADER_OUT = join(
  COMPONENTS_DIR,
  'scroll-view',
  '.smoke-compiled-sticky-header-for-animated-flat-list.mjs',
);
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
  for (const out of [
    REFRESH_CONTROL_OUT,
    VIEW_OUT,
    STICKY_HEADER_OUT,
    VIRTUALIZED_LIST_OUT,
    FLAT_LIST_OUT,
    PARENT_OUT,
  ]) {
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
    readFileSync(join(COMPONENTS_DIR, 'RefreshControl.svelte'), 'utf8'),
    'RefreshControl.svelte',
    REFRESH_CONTROL_OUT,
  );
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8'),
    'View.svelte',
    VIEW_OUT,
  );
  compileRewritten(
    join(COMPONENTS_DIR, 'scroll-view', 'sticky-header.svelte'),
    'sticky-header.svelte',
    STICKY_HEADER_OUT,
    [
      [
        "from '../View.svelte'",
        "from '../.smoke-compiled-view-for-animated-flat-list.mjs'",
      ],
    ],
  );
  compileRewritten(
    join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
    'VirtualizedList.svelte',
    VIRTUALIZED_LIST_OUT,
    [
      [
        "from '../RefreshControl.svelte'",
        "from '../.smoke-compiled-refresh-control-for-animated-flat-list.mjs'",
      ],
      [
        "from '../scroll-view/sticky-header.svelte'",
        "from '../scroll-view/.smoke-compiled-sticky-header-for-animated-flat-list.mjs'",
      ],
    ],
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
       import { createAnimatedComponent } from './create-animated-component';
       const AnimatedFlatList = createAnimatedComponent(FlatList);
       let { data, style } = $props();
       let handle = $state();
       $effect(() => {
         window.__animatedFlatHandle = handle;
       });
     </script>
     {#snippet cell({ item })}<symbiote-text p={{ text: item }}></symbiote-text>{/snippet}
     <AnimatedFlatList bind:this={handle} {data} {style} item={cell} />`,
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
  // why: wrapping the real FlatList (rather than hand-authoring a reduced list) is the whole
  // design claim — only the real one brings the ScrollView shell AND the windowing, so asserting
  // both the native shape and that the slice is windowed is what distinguishes a wrap from a
  // look-alike. <adapters_reach_full_feature_parity>.
  it('renders the real windowed FlatList shape through the wrapper', async () => {
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

  // why: `bind:this` on a list captures its IMPERATIVE handle, never the host node, so the leaf
  // must be bound through getScrollNode() (this adapter's resolveHostNode). Binding the handle
  // itself type-checks as far as the wrapper is concerned but leaves setNativeProps with nothing
  // to drive — the frame silently never lands. Asserting the repaint is what catches that.
  it('binds the leaf to the host node behind the handle, so setValue repaints', async () => {
    const AnimatedFlatParent = await loadParent();
    const opacity = new AnimatedValue(0.35);

    mount(ROOT_TAG, AnimatedFlatParent, { data, style: { opacity } });
    await tick();
    await tick();

    const handle = Reflect.get(globalThis, '__animatedFlatHandle');
    expect(
      isFlatHandle(handle),
      'AnimatedFlatList forwards the FlatList handle via bind:this',
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
