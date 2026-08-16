// DIFFERENTIAL parity test: React (the reference adapter) vs Svelte, same list, same scroll
// scenario, comparing what each adapter FEEDS into the shared `reduceSticky` state machine.
//
// Why this shape. The sticky-header business logic is framework-agnostic and lives once in
// `@symbiote-native/components` (sticky-header-reducer.ts). So a sticky bug that reproduces on one
// adapter and not another CANNOT be in the reducer — it must be in that adapter's INPUTS. Device
// logs proved the reducer itself behaves (it commits a correct collision translateY), which is
// exactly why log-reading kept going in circles: the broken value is an input, not an output.
// This test pins the inputs side by side so the divergence is a diff, not an inference.
//
// The suspect input is `nextHeaderLayoutY` — the measured y of the NEXT sticky header down the
// list, the only thing telling a pinned header where it gets pushed off by the one behind it.
// React/Vue/Angular derive it in ONE shared place: ScrollView's wrapStickyHeaders() walks its own
// children as an indexable array (scroll-view/shared.ts -> sticky-header.tsx), and VirtualizedList
// merely forwards recomputed indices down (virtualized-list/index.ts:732). Svelte CANNOT do that —
// a Svelte component receives an opaque Snippet, not an inspectable child list (see
// scroll-view-sticky-context.ts's KNOWN GAP note) — so its VirtualizedList wraps each cell itself
// and hand-rolls the collision channel (a plain Map + a `stickyVersion` counter). That hand-rolled
// channel exists in no other adapter and is what this test exercises.
//
// Cross-adapter by design, not by accident: CLAUDE.md's <adapters_reach_full_feature_parity>
// defines parity as "proven by a parity check (smoke + prop-by-prop diff against the reference
// adapter)". `@symbiote-native/react` is therefore a devDependency here — test-only, never part of
// the published surface (package.json `files` ships `build` only).

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// The trace array must exist before the vi.mock factory below runs (vi.mock is hoisted above every
// import), which is what vi.hoisted is for.
const { trace, headerIds } = vi.hoisted(() => ({
  trace: [] as {
    adapter: string;
    kind: string;
    headerId: number;
    nextHeaderLayoutY: number | undefined;
  }[],
  // Identity map, NOT keyed by layoutY: every header's layoutY starts at 0, so a y-based key
  // silently merges two different headers into one bucket and hides exactly the divergence this
  // test exists to find.
  headerIds: new Map<object, number>(),
}));
let nextHeaderId = 0;

// Wrap the SHARED reducer so every call from either adapter records the inputs it was handed.
// Both adapters import `reduceSticky` from this exact specifier, so one mock covers both.
let currentAdapter = 'unknown';
vi.mock('@symbiote-native/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@symbiote-native/components')>();
  return {
    ...actual,
    reduceSticky: (
      state: Parameters<typeof actual.reduceSticky>[0],
      action: Parameters<typeof actual.reduceSticky>[1],
      inputs: Parameters<typeof actual.reduceSticky>[2],
    ) => {
      let headerId = headerIds.get(state);
      if (headerId === undefined) {
        nextHeaderId += 1;
        headerId = nextHeaderId;
        headerIds.set(state, headerId);
      }
      trace.push({
        adapter: currentAdapter,
        kind: action.kind,
        headerId,
        nextHeaderLayoutY: inputs.nextHeaderLayoutY,
      });
      return actual.reduceSticky(state, action, inputs);
    },
  };
});

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ITEM_HEIGHT = 100;
const ITEM_COUNT = 20;
const VIEWPORT = 600;
// Both indices must sit inside the INITIAL window (initialNumToRender=10), or the second header
// never mounts, never measures, and `nextHeaderLayoutY` stays legitimately undefined in EVERY
// adapter — which would make the comparison vacuous rather than differential.
const STICKY_INDICES = [0, 3, 6];
// Scrolls index 0's origin well past the top while keeping index 10 ahead of the window — the
// exact geometry where a pinned header must know its collision point.
const SCROLL_Y = 550;
const REACT_ROOT_TAG = 77_201;
const SVELTE_ROOT_TAG = 77_202;

const DATA = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({ id: index }));

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

// --- Svelte compile harness (same shape as virtualized-list.smoke.test.ts) --------------------
// No .svelte-aware loader is wired into this repo's Vitest, so every .svelte component in the
// tree is pre-compiled to a sibling .mjs, with static import specifiers rewritten to match.
const COMPONENTS_DIR = join(__dirname, '..');
const MODULES_ANIMATED_DIR = join(COMPONENTS_DIR, '..', 'modules', 'animated');
const REFRESH_CONTROL_OUT = join(COMPONENTS_DIR, '.parity-compiled-refresh-control.mjs');
const ANIMATED_VIEW_OUT = join(MODULES_ANIMATED_DIR, '.parity-compiled-animated-view.mjs');
const STICKY_HEADER_OUT = join(COMPONENTS_DIR, 'scroll-view', '.parity-compiled-sticky-header.mjs');
const LIST_OUT = join(__dirname, '.parity-compiled-virtualized-list.mjs');
const ROOT_OUT = join(__dirname, '.parity-compiled-list-root.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
  experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
} as const;

function compileToFile(source: string, filename: string, outPath: string): void {
  writeFileSync(outPath, compile(source, { ...COMPILE_OPTIONS, filename }).js.code);
}

function compileSvelteList(): void {
  compileToFile(
    readFileSync(join(COMPONENTS_DIR, 'RefreshControl.svelte'), 'utf8'),
    'RefreshControl.svelte',
    REFRESH_CONTROL_OUT,
  );
  compileToFile(
    readFileSync(join(MODULES_ANIMATED_DIR, 'AnimatedView.svelte'), 'utf8'),
    'AnimatedView.svelte',
    ANIMATED_VIEW_OUT,
  );

  const stickyHeader = compile(
    readFileSync(join(COMPONENTS_DIR, 'scroll-view', 'sticky-header.svelte'), 'utf8'),
    { ...COMPILE_OPTIONS, filename: 'sticky-header.svelte' },
  ).js.code.replace(
    "from '../../modules/animated/AnimatedView.svelte'",
    "from '../../modules/animated/.parity-compiled-animated-view.mjs'",
  );
  writeFileSync(STICKY_HEADER_OUT, stickyHeader);

  const list = compile(readFileSync(join(__dirname, 'index.svelte'), 'utf8'), {
    ...COMPILE_OPTIONS,
    filename: 'VirtualizedList.svelte',
  })
    .js.code.replace(
      "from '../RefreshControl.svelte'",
      "from '../.parity-compiled-refresh-control.mjs'",
    )
    .replace(
      "from '../scroll-view/sticky-header.svelte'",
      "from '../scroll-view/.parity-compiled-sticky-header.mjs'",
    );
  writeFileSync(LIST_OUT, list);
}

async function loadSvelteRoot(): Promise<Component> {
  compileSvelteList();
  compileToFile(
    `<script>
       import VirtualizedList from './.parity-compiled-virtualized-list.mjs';
       let { data, stickyHeaderIndices, getItemLayout } = $props();
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
       function keyExtractor(item) { return 'k-' + item.id; }
     </script>
     {#snippet cell({ item })}<symbiote-text text={'row-' + item.id}></symbiote-text>{/snippet}
     <VirtualizedList {data} {getItem} {getItemCount} {keyExtractor} {getItemLayout}
       {stickyHeaderIndices} windowSize={1} item={cell} />`,
    'ParityListRoot.svelte',
    ROOT_OUT,
  );
  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ParityListRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

// --- Shared scenario --------------------------------------------------------------------------

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('scroll view missing from committed tree');
  return node;
}

// A sticky wrapper is the only node carrying a `transform` (its translateY) — the same tell the
// React-side forced-cell test uses.
function collectStickyWrappers(nodes: IFakeNode[]): IFakeNode[] {
  const wrappers: IFakeNode[] = [];
  for (const node of nodes) {
    if (Array.isArray(node.props.transform)) wrappers.push(node);
    wrappers.push(...collectStickyWrappers(node.children));
  }
  return wrappers;
}

// Which list index does this wrapper hold? Read it off the row text the cell renders, rather than
// from tree position — position shifts as spacers and the forced sticky cell come and go, and a
// wrong index would silently feed a wrong y into the collision map.
function stickyIndexOf(wrapper: IFakeNode): number | undefined {
  const stack = [wrapper];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    const text = node.props.text;
    if (typeof text === 'string' && text.startsWith('row-')) return Number(text.slice(4));
    stack.push(...node.children);
  }
  return undefined;
}

// Every mounted sticky header reports its true content y, exactly as a real onLayout does on mount
// and after each relayout. This is the ONLY way `nextHeaderLayoutY` ever becomes defined.
async function measureStickyHeaders(): Promise<void> {
  for (const wrapper of collectStickyWrappers(fabric.committed)) {
    const index = stickyIndexOf(wrapper);
    if (index === undefined) continue;
    fabric.fireEvent(wrapper.instanceHandle, 'topLayout', {
      layout: { x: 0, y: index * ITEM_HEIGHT, width: 320, height: ITEM_HEIGHT },
    });
  }
  await tick();
}

async function scrollTo(y: number): Promise<void> {
  fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y },
    contentSize: { width: 320, height: ITEM_HEIGHT * ITEM_COUNT },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
  await tick();
  // A scroll can mount/unmount headers (windowing + the forced sticky cell), so re-measure: on a
  // device every freshly mounted header fires its own onLayout.
  await measureStickyHeaders();
}

// The collision input each header currently holds, keyed by which header it is (its own measured
// y). Comparing this per step is robust to the adapters' different reactivity granularity — React
// batches, Svelte is fine-grained, so raw call-sequence equality would be noise, not signal.
function collisionInputsByHeader(adapter: string): Record<string, number | undefined> {
  const latest: Record<string, number | undefined> = {};
  for (const entry of trace) {
    if (entry.adapter === adapter) latest[`header#${entry.headerId}`] = entry.nextHeaderLayoutY;
  }
  return latest;
}

// Walks a list far enough that index 0 leaves the render window (becoming the forced sticky cell),
// collides with the next header, then scrolls back — the exact path the device bug follows.
const SCROLL_STEPS = [0, 150, 350, 650, 950, 650, 250, 0];

async function runScrollScenario(): Promise<Record<string, number | undefined>[]> {
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
  await measureStickyHeaders();

  const snapshots: Record<string, number | undefined>[] = [];
  for (const y of SCROLL_STEPS) {
    await scrollTo(y);
    snapshots.push(collisionInputsByHeader(currentAdapter));
  }
  return snapshots;
}

beforeEach(() => {
  fabric.reset();
  trace.length = 0;
});

afterEach(() => {
  for (const path of [
    REFRESH_CONTROL_OUT,
    ANIMATED_VIEW_OUT,
    STICKY_HEADER_OUT,
    LIST_OUT,
    ROOT_OUT,
  ]) {
    rmSync(path, { force: true });
  }
});

// Header ids are per-adapter and assigned in first-seen order, so `header#1` means "the first
// header this adapter drove" on both sides and the snapshots are actually comparable.
function resetHeaderIds(): void {
  headerIds.clear();
  nextHeaderId = 0;
}

async function reactSnapshots(): Promise<Record<string, number | undefined>[]> {
  currentAdapter = 'react';
  resetHeaderIds();
  const react = await import('@symbiote-native/react');
  react.mount(
    REACT_ROOT_TAG,
    createElement(react.VirtualizedList<(typeof DATA)[number]>, {
      data: DATA,
      getItem: (data, index) => (data as typeof DATA)[index],
      getItemCount: data => (data as typeof DATA).length,
      keyExtractor: item => `k-${item.id}`,
      getItemLayout: (_data, index) => ({
        length: ITEM_HEIGHT,
        offset: ITEM_HEIGHT * index,
        index,
      }),
      windowSize: 1,
      stickyHeaderIndices: STICKY_INDICES,
      renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    }),
  );
  await tick();
  const snapshots = await runScrollScenario();
  react.unmount(REACT_ROOT_TAG);
  return snapshots;
}

async function svelteSnapshots(): Promise<Record<string, number | undefined>[]> {
  currentAdapter = 'svelte';
  resetHeaderIds();
  const ListRoot = await loadSvelteRoot();
  const { mount, unmount } = await import('../../render');
  mount(SVELTE_ROOT_TAG, ListRoot, {
    data: DATA,
    stickyHeaderIndices: STICKY_INDICES,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
  });
  await tick();
  await tick();
  const snapshots = await runScrollScenario();
  unmount(SVELTE_ROOT_TAG);
  return snapshots;
}

describe('sticky collision input parity: Svelte vs the React reference', () => {
  it('React (reference) keeps supplying a collision point across the whole scroll path', async () => {
    const snapshots = await reactSnapshots();
    expect(snapshots.length).toBe(SCROLL_STEPS.length);
    // Sanity that the scenario is not vacuous: the reference adapter really does establish a
    // collision point at some point along the path.
    expect(
      snapshots.some(step => Object.values(step).some(value => value !== undefined)),
      'React established a defined nextHeaderLayoutY somewhere along the scroll path',
    ).toBe(true);
  });

  it('Svelte feeds the shared reducer the SAME collision inputs at every scroll step', async () => {
    const react = await reactSnapshots();
    fabric.reset();
    trace.length = 0;
    const svelte = await svelteSnapshots();

    // THE DIFFERENTIAL ASSERTION. `reduceSticky` is shared and already proven correct on device;
    // if these snapshots diverge, the defect is definitively in Svelte's hand-rolled collision
    // channel (VirtualizedList's headerLayoutYs Map + stickyVersion counter), not in sticky logic.
    for (const [step, y] of SCROLL_STEPS.entries()) {
      expect(svelte[step], `collision inputs after scrolling to y=${y} (step ${step})`).toEqual(
        react[step],
      );
    }
  });
});
