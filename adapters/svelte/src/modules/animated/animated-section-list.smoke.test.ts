// Real-compiled-source smoke test for `Animated.SectionList`, which IS `SectionList` — there is
// no wrapper. The animated-flat-list twin over the section surface: an AnimatedValue in `style`
// must survive five components' worth of forwarding and reach the engine, which rasterizes it on
// the FIRST paint and repaints per frame on the committed RCTScrollView.
//
// Compile chain: SectionList -> VirtualizedSectionList -> VirtualizedList -> RefreshControl +
// ScrollViewStickyHeader -> View. Each link is pre-compiled to a co-located sibling `.mjs` with
// its specifier rewritten (flat-list.smoke.test.ts's technique); output names are unique to this
// file because Vitest runs suites concurrently.
//
// Scope note: the section-flattening logic is @symbiote-native/components' and is used, not
// re-verified, here. This file's job is the Svelte delivery path only.
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
// plain JS-driven flush path exclusively.
globalThis.nativeModuleProxy = undefined;

const ROOT_TAG = 91_108;
const COMPONENTS_DIR = join(__dirname, '..', '..', 'components');
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
    readFileSync(
      join(COMPONENTS_DIR, 'virtualized-list', 'index.svelte'),
      'utf8',
    ),
    'VirtualizedList.svelte',
    VIRTUALIZED_LIST_OUT,
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
       let { sections, style } = $props();
       let handle = $state();
       $effect(() => {
         window.__animatedSectionHandle = handle;
       });
     </script>
     {#snippet cell({ item })}<text p={{ text: item }}></text>{/snippet}
     <SectionList bind:this={handle} {sections} {style} item={cell} />`,
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
  // why: the control for the two animated cases below. They read one prop off one node, which a
  // list that rendered nothing at all would also satisfy vacuously; this pins the ScrollView shell
  // and the flattened section stream first, so a red animated case means the VALUE is missing
  // rather than the tree.
  it('renders the real SectionList shape', async () => {
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

  // why: a per-frame write goes through the engine's own targeted setNativeProps commit, never a
  // Svelte re-render, so nothing above re-runs to correct a leaf bound to the wrong object. The
  // repaint is what says the subscription landed on the committed host node. `bind:this` is read
  // alongside it because a list hands back an IMPERATIVE handle, and an animated style must not
  // cost the caller that surface.
  it('repaints on setValue while still exposing the list handle', async () => {
    const AnimatedSectionParent = await loadParent();
    const opacity = new AnimatedValue(0.45);

    mount(ROOT_TAG, AnimatedSectionParent, { sections, style: { opacity } });
    await tick();
    await tick();

    const handle = Reflect.get(globalThis, '__animatedSectionHandle');
    expect(
      isSectionHandle(handle),
      'SectionList still forwards its handle via bind:this under an animated style',
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
