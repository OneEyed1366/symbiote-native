// Real-compiled-source smoke test for Animated.SectionList: the AnimatedFlatList twin over the
// section surface. Proves the wrapper renders the real SectionList (so section flattening and the
// ScrollView shell come along), that an AnimatedValue in `style` is rasterized on the FIRST paint,
// and that the leaf binds to the host node behind the captured handle — `bind:this` on a list
// hands back an imperative surface, so only getScrollNode() (this adapter's resolveHostNode)
// reaches something setNativeProps can drive.
//
// Compile chain: AnimatedSectionList -> SectionList -> VirtualizedSectionList -> VirtualizedList
// -> RefreshControl + ScrollViewStickyHeader -> AnimatedView. Each link is pre-compiled to a
// co-located sibling `.mjs` with its specifier rewritten (flat-list.smoke.test.ts's technique);
// output names are unique to this file because Vitest runs suites concurrently.
//
// Scope note: the section-flattening logic is @symbiote-native/components' and is used, not
// re-verified, here. This file's job is the Animated-specific wiring only.
//
// No Negative group: AnimatedSectionList.svelte has no throwing/rejecting path — every prop rides
// the same open IAnimatedComponentProps bag as every other Animated.* component.

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
// plain JS-driven flush path exclusively.
globalThis.nativeModuleProxy = undefined;

const ROOT_TAG = 91_108;
const COMPONENTS_DIR = join(__dirname, '..', '..', 'components');
const REFRESH_CONTROL_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-refresh-control-for-animated-section-list.mjs',
);
const VIEW_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-view-for-animated-section-list.mjs',
);
const STICKY_HEADER_OUT = join(
  COMPONENTS_DIR,
  'scroll-view',
  '.smoke-compiled-sticky-header-for-animated-section-list.mjs',
);
const VIRTUALIZED_LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-list',
  '.smoke-compiled-virtualized-list-for-animated-section-list.mjs',
);
const VIRTUALIZED_SECTION_LIST_OUT = join(
  COMPONENTS_DIR,
  'virtualized-section-list',
  '.smoke-compiled-virtualized-section-list-for-animated.mjs',
);
const SECTION_LIST_OUT = join(
  COMPONENTS_DIR,
  'section-list',
  '.smoke-compiled-section-list-for-animated.mjs',
);
const PARENT_OUT = join(
  __dirname,
  '.smoke-compiled-animated-section-parent.mjs',
);

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
    VIRTUALIZED_SECTION_LIST_OUT,
    SECTION_LIST_OUT,
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
        "from '../.smoke-compiled-view-for-animated-section-list.mjs'",
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
        "from '../.smoke-compiled-refresh-control-for-animated-section-list.mjs'",
      ],
      [
        "from '../scroll-view/sticky-header.svelte'",
        "from '../scroll-view/.smoke-compiled-sticky-header-for-animated-section-list.mjs'",
      ],
    ],
  );
  compileRewritten(
    join(COMPONENTS_DIR, 'virtualized-section-list', 'index.svelte'),
    'VirtualizedSectionList.svelte',
    VIRTUALIZED_SECTION_LIST_OUT,
    [
      [
        "from '../virtualized-list/index.svelte'",
        "from '../virtualized-list/.smoke-compiled-virtualized-list-for-animated-section-list.mjs'",
      ],
    ],
  );
  compileRewritten(
    join(COMPONENTS_DIR, 'section-list', 'index.svelte'),
    'SectionList.svelte',
    SECTION_LIST_OUT,
    [
      [
        "from '../virtualized-section-list/index.svelte'",
        "from '../virtualized-section-list/.smoke-compiled-virtualized-section-list-for-animated.mjs'",
      ],
    ],
  );
}

async function loadParent(): Promise<Component> {
  compileChain();

  // window.__animatedSectionHandle mirrors scroll-view.smoke.test.ts's trick: expose the bind:this
  // ref outside the compiled tree so the test can drive the imperative handle from outside.
  compileToFile(
    `<script>
       import SectionList from '../../components/section-list/.smoke-compiled-section-list-for-animated.mjs';
       import { createAnimatedComponent } from './create-animated-component';
       const AnimatedSectionList = createAnimatedComponent(SectionList);
       let { sections, style } = $props();
       let handle = $state();
       $effect(() => {
         window.__animatedSectionHandle = handle;
       });
     </script>
     {#snippet cell({ item })}<symbiote-text p={{ text: item }}></symbiote-text>{/snippet}
     <AnimatedSectionList bind:this={handle} {sections} {style} item={cell} />`,
    'AnimatedSectionParent.svelte',
    PARENT_OUT,
  );

  const mod: unknown = await import(`file://${PARENT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('AnimatedSectionParent.svelte produced no default export');
  }
  return mod.default as Component;
}

// The handle's true shape is only known at runtime (the compiled parent's $effect writes it), so
// narrow with a guard rather than an `as` cast.
function isSectionHandle(
  value: unknown,
): value is { scrollToLocation: unknown; getScrollNode: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'scrollToLocation' in value &&
    'getScrollNode' in value
  );
}

const sections = [
  { key: 'a', data: ['a-0', 'a-1', 'a-2'] },
  { key: 'b', data: ['b-0', 'b-1', 'b-2'] },
];

describe('Animated.SectionList (real compiled source) (Positive)', () => {
  // why: wrapping the real SectionList (rather than hand-authoring a reduced one) is the design
  // claim — only the real one brings the ScrollView shell and the flattened section stream, so
  // asserting both the native shape and that real cells landed is what distinguishes a wrap from
  // a look-alike. <adapters_reach_full_feature_parity>.
  it('renders the real SectionList shape through the wrapper', async () => {
    const AnimatedSectionParent = await loadParent();
    mount(ROOT_TAG, AnimatedSectionParent, { sections });
    await tick();
    await tick();

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
      'RCTScrollView came from the real SectionList chain, not a duplicate',
    ).toBeDefined();
    const content = fabric.find(
      node => node.viewName === 'RCTScrollContentView',
    );
    expect(content).toBeDefined();
    expect(content?.children.length).toBeGreaterThan(0);
    expect(
      fabric.find(node => node.props.text === 'a-0'),
      'a real section item cell was painted',
    ).toBeDefined();
  });

  // why: the FIRST paint must already carry the rasterized value, not zero/undefined — a list
  // mounting mid-animation would otherwise flash at the wrong opacity before the first frame.
  it('rasterizes an animated style prop on the first paint', async () => {
    const AnimatedSectionParent = await loadParent();
    const opacity = new AnimatedValue(0.45);

    mount(ROOT_TAG, AnimatedSectionParent, { sections, style: { opacity } });
    await tick();
    await tick();

    expect(liveScrollView().props.opacity).toBe(0.45);
  });

  // why: `bind:this` on a list captures its IMPERATIVE handle, never the host node, so the leaf
  // must be bound through getScrollNode() (this adapter's resolveHostNode). Binding the handle
  // itself type-checks as far as the wrapper is concerned but leaves setNativeProps with nothing
  // to drive — the frame silently never lands. Asserting the repaint is what catches that.
  it('binds the leaf to the host node behind the handle, so setValue repaints', async () => {
    const AnimatedSectionParent = await loadParent();
    const opacity = new AnimatedValue(0.45);

    mount(ROOT_TAG, AnimatedSectionParent, { sections, style: { opacity } });
    await tick();
    await tick();

    const handle = Reflect.get(globalThis, '__animatedSectionHandle');
    expect(
      isSectionHandle(handle),
      'AnimatedSectionList forwards the SectionList handle via bind:this',
    ).toBe(true);
    if (!isSectionHandle(handle)) return;

    const hostNode = handle.getScrollNode();
    expect(hostNode).not.toBeNull();
    expect(
      hostNode !== null &&
        typeof hostNode === 'object' &&
        'scrollToLocation' in hostNode,
      'getScrollNode() unwrapped the handle rather than handing it back',
    ).toBe(false);

    opacity.setValue(0.9);
    await tick();

    expect(liveScrollView().props.opacity).toBe(0.9);
  });
});
