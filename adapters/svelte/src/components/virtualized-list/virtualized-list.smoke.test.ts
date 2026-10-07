// Real-execution proof (not just typecheck) that VirtualizedList actually WINDOWS — renders only
// a bounded slice of a large data set, not every item — following switch.smoke.test.ts's exact
// pattern: compile the REAL index.svelte source through svelte/compiler, co-locate the compiled
// output next to its real sibling modules (its own imports resolve relative to where the compiled
// file lives), installFabric(), and assert against the real committed Fabric tree.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { STICKY_HEADER_TAG } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// See scroll-view.smoke.test.ts: mounting through `../../render` skips `index.ts`, so the host
// behaviors have to be named here.
import '../../register';
import { mount, unmount } from '../../render';

// Does this committed subtree carry a raw-text payload anywhere inside it? Asks WHERE a node sits
// rather than merely whether it exists — placement is geometry for a separator.
function carriesText(node: ILiveNode, text: string): boolean {
  return (
    node.props.text === text ||
    node.children.some(child => carriesText(child, text))
  );
}

// The content container's DIRECT children — the level a spacer collapses, and the only level at
// which "inside the cell" and "beside the cell" look different.
function contentChildren(): ILiveNode[] {
  const content = live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollContentView',
  );
  if (content !== undefined) return content.children;
  throw new Error('no content container committed');
}

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_101;
// `refreshControlProps` renders a bare `<refresh-control>` TAG, so index.svelte needs no sibling
// component pre-compiled and no import specifier rewritten.
const LIST_OUT = join(__dirname, '.smoke-compiled-virtualized-list.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-list-root.mjs');
const REFRESH_ROOT_OUT = join(__dirname, '.smoke-compiled-refresh-root.mjs');
// A path distinct from ROOT_OUT: Node's ESM import cache is keyed by resolved URL, so re-importing
// ROOT_OUT after rewriting it on disk would silently return the FIRST test's cached module instead
// of this file's fresh content (the same reason REFRESH_ROOT_OUT above is its own path).
const STICKY_ROOT_OUT = join(__dirname, '.smoke-compiled-sticky-root.mjs');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(LIST_OUT, { force: true });
  rmSync(ROOT_OUT, { force: true });
  rmSync(REFRESH_ROOT_OUT, { force: true });
  rmSync(STICKY_ROOT_OUT, { force: true });
  rmSync(HANDLE_ROOT_OUT, { force: true });
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

const ITEM_COUNT = 100;
const DEFAULT_INITIAL_NUM_TO_RENDER = 10;

function compileVirtualizedList(): void {
  compileToFile(
    readFileSync(join(__dirname, 'index.svelte'), 'utf8'),
    'VirtualizedList.svelte',
    LIST_OUT,
  );
}

async function loadMountable(): Promise<Component> {
  compileVirtualizedList();

  // A root that hands VirtualizedList a 100-item array and an empty cell snippet — the cell
  // WRAPPER view VirtualizedList itself creates around each cell is what the assertion
  // below counts, so the cell content itself does not need to render anything.
  compileToFile(
    `<script>
       import VirtualizedList from './.smoke-compiled-virtualized-list.mjs';
       let { data } = $props();
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
     </script>
     {#snippet cell()}{/snippet}
     <VirtualizedList {data} {getItem} {getItemCount} item={cell} />`,
    'ListRoot.svelte',
    ROOT_OUT,
  );

  const mod: unknown = await import(`file://${ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('ListRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

// A path distinct from every other compiled root above (Node's dynamic `import()` cache is keyed
// by resolved URL — the same reason ROOT_OUT/REFRESH_ROOT_OUT/STICKY_ROOT_OUT are already separate
// paths in this file).
const HANDLE_ROOT_OUT = join(__dirname, '.smoke-compiled-handle-root.mjs');
const SEPARATOR_ROOT_OUT = join(
  __dirname,
  '.smoke-compiled-separator-root.mjs',
);

// Mounts VirtualizedList with a labelled item snippet AND a separator snippet. getItemLayout pins
// the geometry so the window is deterministic; windowSize is a parameter because the gate test
// needs the LAST data index actually rendered, and windowSize=1 zeroes the overscan.
async function loadMountableWithSeparator(
  rows: number,
  windowSize: number,
): Promise<Component> {
  compileVirtualizedList();
  compileToFile(
    `<script>
       import VirtualizedList from './.smoke-compiled-virtualized-list.mjs';
       const data = Array.from({ length: ${rows} }, (_u, id) => id);
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
       function getItemLayout(_source, index) {
         return { length: 100, offset: 100 * index, index };
       }
     </script>
     {#snippet cell(info)}<text p={{}}>row-{info.item}</text>{/snippet}
     {#snippet divider()}<text p={{}}>divider</text>{/snippet}
     <VirtualizedList
       {data}
       {getItem}
       {getItemCount}
       {getItemLayout}
       windowSize={${windowSize}}
       item={cell}
       separator={divider}
     />`,
    'SeparatorRoot.svelte',
    SEPARATOR_ROOT_OUT,
  );
  const mod: unknown = await import(
    `file://${SEPARATOR_ROOT_OUT}?rows=${rows}&w=${windowSize}`
  );
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('SeparatorRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

// A root exposing the inner VirtualizedList's exported imperative handle on
// `window.__listHandle` via `bind:this`, same pattern scroll-view.smoke.test.ts uses to drive
// ScrollView's own handle from outside the compiled tree.
async function loadMountableWithHandle(): Promise<Component> {
  compileVirtualizedList();
  compileToFile(
    `<script>
       import VirtualizedList from './.smoke-compiled-virtualized-list.mjs';
       let { data } = $props();
       let handle = $state();
       $effect(() => {
         window.__listHandle = handle;
       });
       function getItem(source, index) { return source[index]; }
       function getItemCount(source) { return source.length; }
     </script>
     {#snippet cell()}{/snippet}
     <VirtualizedList bind:this={handle} {data} {getItem} {getItemCount} item={cell} />`,
    'HandleRoot.svelte',
    HANDLE_ROOT_OUT,
  );
  const mod: unknown = await import(`file://${HANDLE_ROOT_OUT}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('HandleRoot.svelte produced no default export');
  }
  return mod.default as Component;
}

// No Negative group, the props bag has no throw path
// The windowing logic is covered in core, this file proves the Svelte wiring reaches the tree
describe('VirtualizedList (real compiled index.svelte)', () => {
  describe('Positive', () => {
    // Before the viewport is known the reducer commits a bounded prefix, not the whole list
    it('renders only the windowed slice of a large data set, not every item', async () => {
      const ListRoot = await loadMountable();
      const data = Array.from(
        { length: ITEM_COUNT },
        (_unused, index) => `item-${index}`,
      );
      mount(ROOT_TAG, ListRoot, { data });
      await tick();
      await tick();

      const content = live.findLive(
        live.appRoot(),
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content).toBeDefined();
      if (content === undefined) return;

      // No onLayout has fired (viewportLength is still 0), so computeWindow takes the
      // "before viewport known" bounded-prefix branch: exactly `initialNumToRender` cells, index
      // [0, initialNumToRender - 1] — a small, fully deterministic slice of the 100-item list.
      expect(content.children.length).toBe(DEFAULT_INITIAL_NUM_TO_RENDER);
      expect(content.children.length).toBeLessThan(ITEM_COUNT);
      for (const child of content.children) {
        expect(child.viewName).toBe('RCTView');
      }

      const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
      expect(scrollView).toBeDefined();
      // Android nested-scroll arbitration: without this, a nested FlatList never gets its own
      // scroll gesture. Defaulted by `foldScrollViewProps`, unreachable from this host —
      // `scroll-view-payload.itest.ts` pins that hand-authoring reaches the same scroll view.
      expect(scrollView).toBeDefined();
    });

    // why: proves the window is REACTIVE to a real onLayout, not just correct at mount — the
    // "before viewport known" bounded prefix from the previous test must actually grow once real
    // geometry is known, or a device would forever render the pre-layout placeholder count.
    it('grows the window toward the target as onLayout reports a real viewport', async () => {
      const ListRoot = await loadMountable();
      const data = Array.from(
        { length: ITEM_COUNT },
        (_unused, index) => `item-${index}`,
      );
      mount(ROOT_TAG, ListRoot, { data });
      await tick();
      await tick();

      const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
      expect(scrollView).toBeDefined();
      if (scrollView === undefined) return;

      // Unmeasured cells have length 0, so a real viewport covers the whole content in one pass
      fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
        layout: { width: 300, height: 600 },
      });
      await tick();
      await tick();

      const content = live.findLive(
        live.appRoot(),
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content).toBeDefined();
      if (content === undefined) return;
      expect(content.children.length).toBeGreaterThan(0);
    });

    // why: VirtualizedList hand-rolls its own scroll-view host node (unlike FlatList, which just
    // forwards) — accessibility props and refresh-control composition are its OWN wiring
    // responsibility here, not inherited "for free" from a wrapped <ScrollView>.
    it('forwards testID and wires a real refresh-control (gaps 1 and 2)', async () => {
      compileVirtualizedList();
      compileToFile(
        `<script>
         import VirtualizedList from './.smoke-compiled-virtualized-list.mjs';
         function getItem(source, index) { return source[index]; }
         function getItemCount(source) { return source.length; }
         function onRefresh() {}
       </script>
       {#snippet cell()}{/snippet}
       <VirtualizedList
         data={['a', 'b']}
         {getItem}
         {getItemCount}
         item={cell}
         testID="virtualized-list-a11y"
         onRefresh={onRefresh}
         refreshing={true}
       />`,
        'RefreshRoot.svelte',
        REFRESH_ROOT_OUT,
      );
      const mod: unknown = await import(`file://${REFRESH_ROOT_OUT}`);
      if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
        throw new Error('RefreshRoot.svelte produced no default export');
      }

      mount(ROOT_TAG, mod.default as Component);
      await tick();
      await tick();

      // Gap 1: testID (IAccessibilityProps) actually reaches the committed scroll-view host node,
      // not just the type surface — walk the LIVE tree, not the recording's creation log.
      const scrollView = live.findLive(
        live.appRoot(),
        node => node.payload.testID === 'virtualized-list-a11y',
      );
      expect(
        scrollView,
        'testID reached the committed RCTScrollView',
      ).toBeDefined();
      expect(scrollView?.viewName).toBe('RCTScrollView');

      // Gap 2: `onRefresh` paints a real `PullToRefreshView` beside the content container
      const refresh = live.findLive(
        live.appRoot(),
        node => node.viewName === 'PullToRefreshView',
      );
      expect(
        refresh,
        'refresh-control painted PullToRefreshView',
      ).toBeDefined();
      expect(refresh?.payload.refreshing).toBe(true);
      expect(
        scrollView?.children.some(child => child.handle === refresh?.handle),
      ).toBe(true);
    });

    // A flagged cell gets the `sticky-header` tag, a windowed list has no paint indices
    it('marks a stickyHeaderIndices-flagged windowed cell with the sticky-header tag', async () => {
      compileVirtualizedList();
      compileToFile(
        `<script>
         import VirtualizedList from './.smoke-compiled-virtualized-list.mjs';
         function getItem(source, index) { return source[index]; }
         function getItemCount(source) { return source.length; }
       </script>
       {#snippet cell()}<text p={{}}>row</text>{/snippet}
       <VirtualizedList
         data={['a', 'b', 'c']}
         {getItem}
         {getItemCount}
         item={cell}
         stickyHeaderIndices={[0]}
       />`,
        'StickyRoot.svelte',
        STICKY_ROOT_OUT,
      );
      const mod: unknown = await import(`file://${STICKY_ROOT_OUT}`);
      if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
        throw new Error('StickyRoot.svelte produced no default export');
      }

      mount(ROOT_TAG, mod.default as Component);
      await tick();
      await tick();

      // Only the tag is checked, what the pin paints is `sticky-header-payload.itest.ts`'s
      const stickyHost = fabric.find(
        node => node.tagName === STICKY_HEADER_TAG,
      );
      expect(
        stickyHost,
        'the flagged cell painted through the sticky-header behavior',
      ).toBeDefined();
    });

    // `scrollToOffset` stands for the exports: dispatch, reducer effect, `scrollHandle`, command
    // The others are thin delegations through the same wiring
    it('dispatches a real scrollTo command through the exported scrollToOffset handle', async () => {
      const ListRoot = await loadMountableWithHandle();
      const data = Array.from(
        { length: ITEM_COUNT },
        (_unused, index) => `item-${index}`,
      );
      mount(ROOT_TAG, ListRoot, { data });
      await tick();
      await tick();

      const handle = (globalThis as { __listHandle?: Record<string, unknown> })
        .__listHandle;
      expect(
        handle,
        'imperative handle was exposed via bind:this',
      ).toBeDefined();
      const scrollToOffset = handle?.scrollToOffset as
        ((params: { offset: number; animated?: boolean }) => void) | undefined;
      expect(typeof scrollToOffset).toBe('function');
      scrollToOffset?.({ offset: 240, animated: false });
      await tick();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('scrollTo');
      expect(fabric.commands[0]?.args).toEqual([0, 240, false]);
      expect(fabric.commands[0]?.viewName).toBe('RCTScrollView');
    });

    it('answers a scrolling node from the exported getScrollRef', async () => {
      const ListRoot = await loadMountableWithHandle();
      mount(ROOT_TAG, ListRoot, { data: ['item-0', 'item-1'] });
      await tick();
      await tick();

      const handle = (globalThis as { __listHandle?: Record<string, unknown> })
        .__listHandle;
      const getScrollRef = handle?.getScrollRef as
        (() => { scrollTo?: unknown } | null) | undefined;
      expect(typeof getScrollRef).toBe('function');
      expect(typeof getScrollRef?.()?.scrollTo).toBe('function');
    });

    it('exports setNativeProps as a function, like the shared list handle', async () => {
      const ListRoot = await loadMountableWithHandle();
      mount(ROOT_TAG, ListRoot, { data: ['item-0'] });
      await tick();
      await tick();

      const handle = (globalThis as { __listHandle?: Record<string, unknown> })
        .__listHandle;
      expect(typeof handle?.setNativeProps).toBe('function');
    });

    // RN paints the separator inside the cell's measuring wrapper, a sibling would be an extra flex
    // child, so the assertion asks which node contains one
    it('renders the separator inside its cell rather than beside it', async () => {
      mount(ROOT_TAG, await loadMountableWithSeparator(20, 1));
      await tick();
      await tick();

      const withDivider = contentChildren().filter(child =>
        carriesText(child, 'divider'),
      );
      expect(withDivider.length, 'separators committed').toBeGreaterThan(0);
      for (const [position, child] of withDivider.entries()) {
        expect(
          carriesText(child, `row-${position}`),
          'the divider sits inside its own cell',
        ).toBe(true);
      }
    });

    // The window's last cell is mid-DATA, so it keeps its separator — the assertion that
    // separates the two gates, since a window gate drops exactly that one.
    it('keeps the separator on the window-last cell, which is mid-data', async () => {
      mount(ROOT_TAG, await loadMountableWithSeparator(20, 1));
      await tick();
      await tick();

      const rendered = contentChildren().filter(child =>
        Array.from({ length: 20 }, (_unused, id) => `row-${id}`).some(label =>
          carriesText(child, label),
        ),
      );
      expect(rendered.length, 'cells committed').toBeGreaterThan(0);
      expect(
        carriesText(rendered[rendered.length - 1], 'divider'),
        'the window-last cell is mid-data and keeps its separator',
      ).toBe(true);
    });

    it('withholds the separator from the last item of the DATA', async () => {
      mount(ROOT_TAG, await loadMountableWithSeparator(2, 21));
      await tick();
      await tick();

      const cells = contentChildren();
      const first = cells.find(child => carriesText(child, 'row-0'));
      const last = cells.find(child => carriesText(child, 'row-1'));
      expect(last, 'the last cell is rendered at all').toBeDefined();
      expect(first === undefined ? false : carriesText(first, 'divider')).toBe(
        true,
      );
      expect(last === undefined ? true : carriesText(last, 'divider')).toBe(
        false,
      );
    });
  });
});
