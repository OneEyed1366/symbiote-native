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
// React derives it from an INDEX MAP: ScrollView's wrapStickyHeaders() walks its own children as an
// indexable array (scroll-view/shared.ts -> sticky-header.tsx), and VirtualizedList forwards the
// recomputed indices down (virtualized-list/index.ts:732).
//
// Svelte derives it from DOCUMENT ORDER, and that is what this test now exercises. Its cells carry
// the `sticky-header` TAG, so the pin is the engine's ScrollView host behavior: the owner keeps its
// registered headers in tree order and each one's collision point is simply the next entry's
// measured y — no index, and nothing to renumber when a list windows. Two unrelated derivations
// feeding one shared reducer is exactly the shape a differential test is for.
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
import { STICKY_HEADER_Z_INDEX } from '@symbiote-native/components';
// Svelte's headers ARE the engine's sticky behavior now, so the registration is what this file
// measures — without it the tag commits inert and the Svelte arm traces nothing at all. The
// registry is global, so React's own ScrollView wrapper also picks up a content node here; that is
// invisible to this test, which reads reducer INPUTS and finds headers by their pin transform.
import '../../register';

// The trace array must exist before the vi.mock factory below runs (vi.mock is hoisted above every
// import), which is what vi.hoisted is for.
const { trace } = vi.hoisted(() => ({
  trace: [] as {
    adapter: string;
    kind: string;
    // The header's own MEASURED y, which is `index * ITEM_HEIGHT` in this scenario and therefore
    // the one identity both adapters can agree on. Entries from an unmeasured header are dropped
    // rather than keyed, because every header's layoutY starts at 0 and a y-key would merge them.
    //
    // NOT the reducer state's object identity, which is what this used to key on. Svelte's headers
    // are engine nodes driven by the ScrollView host behavior, and the behavior allocates a fresh
    // runtime per NODE — so windowing churn hands out twice as many state objects as React's
    // component instances do, and a first-seen-order id numbers the same header differently on the
    // two sides. The quantity under test is per-HEADER, not per-instance.
    layoutY: number;
    nextHeaderLayoutY: number | undefined;
  }[],
}));

// Wrap the SHARED reducer so every call from either adapter records the inputs it was handed.
//
// The SOURCE module, not the `@symbiote-native/components` barrel, and that is what makes one mock
// cover both sides now: React's adapter reaches `reduceSticky` through the barrel, while Svelte's
// headers are driven by the ENGINE's sticky behavior, which imports the reducer by a relative
// path. Both resolve to this one file, so the barrel's re-export is the mock too.
let currentAdapter = 'unknown';
vi.mock(
  '../../../../../core/components/src/state/sticky-header-reducer',
  async importOriginal => {
    const actual =
      await importOriginal<
        typeof import('../../../../../core/components/src/state/sticky-header-reducer')
      >();
    return {
      ...actual,
      reduceSticky: (
        state: Parameters<typeof actual.reduceSticky>[0],
        action: Parameters<typeof actual.reduceSticky>[1],
        inputs: Parameters<typeof actual.reduceSticky>[2],
      ) => {
        const result = actual.reduceSticky(state, action, inputs);
        // Read the y AFTER the call: a 'layout' action is what makes the header measurable at all,
        // and the reducer records it in place.
        if (result.state.measured) {
          trace.push({
            adapter: currentAdapter,
            kind: action.kind,
            layoutY: result.state.layoutY,
            nextHeaderLayoutY: inputs.nextHeaderLayoutY,
          });
        }
        return result;
      },
    };
  },
);

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
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

const DATA = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
}));

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// --- Svelte compile harness (same shape as virtualized-list.smoke.test.ts) --------------------
// No .svelte-aware loader is wired into this repo's Vitest, so every .svelte component in the
// tree is pre-compiled to a sibling .mjs, with static import specifiers rewritten to match.
const LIST_OUT = join(__dirname, '.parity-compiled-virtualized-list.mjs');
const ROOT_OUT = join(__dirname, '.parity-compiled-list-root.mjs');

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
  writeFileSync(
    outPath,
    compile(source, { ...COMPILE_OPTIONS, filename }).js.code,
  );
}

function compileSvelteList(): void {
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
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
     {#snippet cell({ item })}<text p={{ text: 'row-' + item.id }}></text>{/snippet}
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
  if (node === undefined)
    throw new Error('scroll view missing from committed tree');
  return node;
}

// A sticky wrapper is the only node carrying `STICKY_HEADER_Z_INDEX`, and both sides write it from
// the SAME shared constant — React's sticky-header.tsx and the engine's sticky behavior.
//
// NOT the `transform`, which is what this used to look for. A translateY appears only once a
// header has been measured AND pinned, and on the engine path the behavior registers in
// `attachAfterCommit`, one commit after the node lands. So a transform probe cannot see a
// freshly-committed engine-driven header at all, and the first measure round found nothing on the
// Svelte side while finding both headers on React's — a shape oracle reporting an adapter
// difference that is really the probe's (`.claude/rules/adapter-parity-audit.md`, "Phrase a parity
// oracle as a CAPABILITY"). On a device every mounted view gets an onLayout whether or not it has
// been pinned yet, which is what the zIndex tell reproduces.
function collectStickyWrappers(nodes: IFakeNode[]): IFakeNode[] {
  const wrappers: IFakeNode[] = [];
  for (const node of nodes) {
    if (node.props.zIndex === STICKY_HEADER_Z_INDEX) wrappers.push(node);
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
    if (typeof text === 'string' && text.startsWith('row-'))
      return Number(text.slice(4));
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
  // Two turns: the first drains the coalesced cross-talk flush (React's ScrollView batches a burst
  // of header layouts into one handoff), the second lets the resulting state land.
  await tick();
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
function collisionInputsByHeader(
  adapter: string,
): Record<string, number | undefined> {
  const latest: Record<string, number | undefined> = {};
  for (const entry of trace) {
    if (entry.adapter === adapter)
      latest[`header@y=${entry.layoutY}`] = entry.nextHeaderLayoutY;
  }
  return latest;
}

// Walks a list far enough that index 0 leaves the render window (becoming the forced sticky cell),
// collides with the next header, then scrolls back — the exact path the device bug follows.
const SCROLL_STEPS = [0, 150, 350, 650, 950, 650, 250, 0];

async function runScrollScenario(): Promise<
  Record<string, number | undefined>[]
> {
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
  for (const path of [LIST_OUT, ROOT_OUT]) {
    rmSync(path, { force: true });
  }
});

async function reactSnapshots(): Promise<Record<string, number | undefined>[]> {
  currentAdapter = 'react';
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
      renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
    }),
  );
  await tick();
  const snapshots = await runScrollScenario();
  react.unmount(REACT_ROOT_TAG);
  return snapshots;
}

async function svelteSnapshots(): Promise<
  Record<string, number | undefined>[]
> {
  currentAdapter = 'svelte';
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

// This whole file is a DIFFERENTIAL regression group, not classic Positive/Negative — there is no
// throw/reject contract here (both adapters' props are permissive bags). The product rule under
// test is cross-adapter parity: <adapters_reach_full_feature_parity> (CLAUDE.md) requires the
// SAME collision math to see the SAME inputs regardless of which adapter derives them, since the
// state machine itself (reduceSticky) is shared and already proven correct on device. The
// expectation for the Svelte side comes from React's OWN measured behavior in this same run, not
// from reading Svelte's implementation back — so this is real differential evidence, not a
// tautology.
describe('sticky collision input parity: Svelte vs the React reference', () => {
  // why: a sanity gate on the scenario itself — if React (the adapter this test trusts as ground
  // truth) never establishes a defined collision point, the whole comparison is vacuous and a
  // "parity" pass downstream would prove nothing.
  it('React (reference) keeps supplying a collision point across the whole scroll path', async () => {
    const snapshots = await reactSnapshots();
    expect(snapshots.length).toBe(SCROLL_STEPS.length);
    expect(
      snapshots.some(step =>
        Object.values(step).some(value => value !== undefined),
      ),
      'React established a defined nextHeaderLayoutY somewhere along the scroll path',
    ).toBe(true);
  });

  // why: THE differential assertion, and what it now proves is that DOCUMENT ORDER answers the
  // collision question identically to an index map. Svelte's headers are engine nodes carrying the
  // `sticky-header` tag; React's are components fed a recomputed index list. If the per-step inputs
  // diverge, the defect is in one of those two derivations and not in the shared reducer.
  it('Svelte feeds the shared reducer the SAME collision inputs at every scroll step', async () => {
    const react = await reactSnapshots();
    fabric.reset();
    trace.length = 0;
    const svelte = await svelteSnapshots();

    for (const [step, y] of SCROLL_STEPS.entries()) {
      expect(
        svelte[step],
        `collision inputs after scrolling to y=${y} (step ${step})`,
      ).toEqual(react[step]);
    }
  });
});
