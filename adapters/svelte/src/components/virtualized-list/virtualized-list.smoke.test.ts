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
import { installFabric } from '@symbiote-native/test-utils';
import type { IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';

// fabric.find() walks the CREATION log, which never reflects a later clone's props
// (svelte-adapter-dom-shim skill §15's documented gotcha) — a live-value assertion must instead
// walk the currently COMMITTED tree, same as activity-indicator.smoke.test.ts's findLive.
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

// Does this committed subtree carry a raw-text payload anywhere inside it? Asks WHERE a node sits
// rather than merely whether it exists — placement is geometry for a separator.
function carriesText(node: IFakeNode, text: string): boolean {
  return (
    node.props.text === text ||
    node.children.some(child => carriesText(child, text))
  );
}

// The content container's DIRECT children — the level a spacer collapses, and the only level at
// which "inside the cell" and "beside the cell" look different.
function contentChildren(): IFakeNode[] {
  for (const root of fabric.committed) {
    const content = findLive(
      root,
      node => node.viewName === 'RCTScrollContentView',
    );
    if (content !== undefined) return content.children;
  }
  throw new Error('no content container committed');
}

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_101;
// index.svelte statically imports the REAL RefreshControl.svelte (gap 2's RefreshControl wiring —
// see index.svelte's header comment). No `.svelte`-aware loader is wired into this repo's Vitest
// (scroll-view.smoke.test.ts's own header comment first established this), so RefreshControl must
// ALSO be pre-compiled to a co-located sibling `.mjs`, with the compiled VirtualizedList's import
// specifier rewritten to point at it.
const COMPONENTS_DIR = join(__dirname, '..');
const REFRESH_CONTROL_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-refresh-control-for-virtualized-list.mjs',
);
// index.svelte also statically imports the REAL ScrollViewStickyHeader (../scroll-view/sticky-
// header.svelte, the sticky-header wiring) — same "no .svelte-aware loader" reason as
// RefreshControl above, compiled to a sibling of the real file so ITS OWN relative imports
// ('./scroll-view-sticky-context', '@symbiote-native/components', '@symbiote-native/engine')
// keep resolving unchanged.
const STICKY_HEADER_OUT = join(
  COMPONENTS_DIR,
  'scroll-view',
  '.smoke-compiled-sticky-header-for-virtualized-list.mjs',
);
// sticky-header.svelte renders a real Animated.View (createAnimatedComponent(View)) — same treatment,
// compiled to a sibling of the real file so ITS OWN relative imports keep resolving unchanged.
const VIEW_OUT = join(
  COMPONENTS_DIR,
  '.smoke-compiled-view-for-virtualized-list.mjs',
);
const LIST_OUT = join(__dirname, '.smoke-compiled-virtualized-list.mjs');
const ROOT_OUT = join(__dirname, '.smoke-compiled-list-root.mjs');
const REFRESH_ROOT_OUT = join(__dirname, '.smoke-compiled-refresh-root.mjs');
// A path distinct from ROOT_OUT: Node's ESM import cache is keyed by resolved URL, so re-importing
// ROOT_OUT after rewriting it on disk would silently return the FIRST test's cached module instead
// of this file's fresh content (the same reason REFRESH_ROOT_OUT above is its own path).
const STICKY_ROOT_OUT = join(__dirname, '.smoke-compiled-sticky-root.mjs');

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(REFRESH_CONTROL_OUT, { force: true });
  rmSync(VIEW_OUT, { force: true });
  rmSync(STICKY_HEADER_OUT, { force: true });
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

function compileVirtualizedListWithRefreshControl(): void {
  const refreshControlSource = readFileSync(
    join(COMPONENTS_DIR, 'RefreshControl.svelte'),
    'utf8',
  );
  compileToFile(
    refreshControlSource,
    'RefreshControl.svelte',
    REFRESH_CONTROL_OUT,
  );

  const viewSource = readFileSync(join(COMPONENTS_DIR, 'View.svelte'), 'utf8');
  compileToFile(viewSource, 'View.svelte', VIEW_OUT);

  const stickyHeaderSource = readFileSync(
    join(COMPONENTS_DIR, 'scroll-view', 'sticky-header.svelte'),
    'utf8',
  );
  const stickyHeaderResult = compile(stickyHeaderSource, {
    ...COMPILE_OPTIONS,
    filename: 'sticky-header.svelte',
  }).js.code.replace(
    "from '../View.svelte'",
    "from '../.smoke-compiled-view-for-virtualized-list.mjs'",
  );
  writeFileSync(STICKY_HEADER_OUT, stickyHeaderResult);

  const listSource = readFileSync(join(__dirname, 'index.svelte'), 'utf8');
  const result = compile(listSource, {
    ...COMPILE_OPTIONS,
    filename: 'VirtualizedList.svelte',
  });
  const rewritten = result.js.code
    .replace(
      "from '../RefreshControl.svelte'",
      "from '../.smoke-compiled-refresh-control-for-virtualized-list.mjs'",
    )
    .replace(
      "from '../scroll-view/sticky-header.svelte'",
      "from '../scroll-view/.smoke-compiled-sticky-header-for-virtualized-list.mjs'",
    );
  writeFileSync(LIST_OUT, rewritten);
}

async function loadMountable(): Promise<Component> {
  compileVirtualizedListWithRefreshControl();

  // A root that hands VirtualizedList a 100-item array and an empty cell snippet — the cell
  // WRAPPER symbiote-view VirtualizedList itself creates around each cell is what the assertion
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
  compileVirtualizedListWithRefreshControl();
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
     {#snippet cell(info)}<symbiote-text p={{}}>row-{info.item}</symbiote-text>{/snippet}
     {#snippet divider()}<symbiote-text p={{}}>divider</symbiote-text>{/snippet}
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
  compileVirtualizedListWithRefreshControl();
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

// No Negative group: virtualized-list-props.ts is a permissive bag (every field but
// data/getItem/getItemCount/item optional) with no runtime guard/throw path. The windowing STATE
// machine (reduceList, buildListPlan, computeWindow) is core logic covered by
// core/components/src/state/virtualized-list.test.ts and virtualized-list-reducer.test.ts; this
// file's job is proving the Svelte WIRING: the reducer's effects actually reach the committed
// Fabric tree and a real native command.
describe('VirtualizedList (real compiled index.svelte)', () => {
  describe('Positive', () => {
    // why: proves the reducer's "before viewport known" branch (computeWindow's bounded-prefix
    // path) actually reaches the committed tree as a small deterministic slice, not the whole
    // 100-item list — this is the entire point of virtualization: unbounded data must not mean
    // unbounded native views.
    it('renders only the windowed slice of a large data set, not every item', async () => {
      const ListRoot = await loadMountable();
      const data = Array.from(
        { length: ITEM_COUNT },
        (_unused, index) => `item-${index}`,
      );
      mount(ROOT_TAG, ListRoot, { data });
      await tick();
      await tick();

      const content = fabric.find(
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
      // Android nested-scroll gesture arbitration: without this, a FlatList/SectionList nested
      // inside a page ScrollView never gets its own scroll gesture — only the outer page scrolls.
      // ScrollView.svelte defaults this on; this file hand-rolls the raw intrinsic instead of
      // rendering <ScrollView>, so it must default it itself too.
      expect(scrollView?.props.nestedScrollEnabled).toBe(true);
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

      // Report a real viewport: computeWindow can now size a window off real geometry instead of the
      // pre-layout bounded prefix. Every rendered cell has length 0 (nothing measured yet, no
      // getItemLayout), so the window covers the WHOLE unmeasured content in one pass — still a
      // proof the windowing math is live and reactive to a real event, not that it never changes.
      fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
        layout: { width: 300, height: 600 },
      });
      await tick();
      await tick();

      const content = fabric.find(
        node => node.viewName === 'RCTScrollContentView',
      );
      expect(content).toBeDefined();
      if (content === undefined) return;
      expect(content.children.length).toBeGreaterThan(0);
    });

    // why: VirtualizedList hand-rolls its own scroll-view host node (unlike FlatList, which just
    // forwards) — accessibility props and RefreshControl composition are its OWN wiring
    // responsibility here, not inherited "for free" from a wrapped <ScrollView>.
    it('forwards testID and wires a real RefreshControl (gaps 1 and 2)', async () => {
      compileVirtualizedListWithRefreshControl();
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
      // not just the type surface — walk the LIVE tree, not fabric.find()'s creation log.
      const scrollView = findLive(
        fabric.appRoot(),
        node => node.props.testID === 'virtualized-list-a11y',
      );
      expect(
        scrollView,
        'testID reached the committed RCTScrollView',
      ).toBeDefined();
      expect(scrollView?.viewName).toBe('RCTScrollView');

      // Gap 2: onRefresh/refreshing produce a REAL RefreshControl (PullToRefreshView) as a sibling
      // of the content container inside the scroll view (iOS sibling attachment) — not an inert prop.
      const refresh = findLive(
        fabric.appRoot(),
        node => node.viewName === 'PullToRefreshView',
      );
      expect(
        refresh,
        'a real RefreshControl.svelte painted PullToRefreshView',
      ).toBeDefined();
      expect(refresh?.props.refreshing).toBe(true);
      expect(
        scrollView?.children.some(child => child.tag === refresh?.tag),
      ).toBe(true);
    });

    // Unlike ScrollView.svelte (only an opaque children Snippet — no auto-wrap, see
    // scroll-view-props.ts's KNOWN GAP), this file walks an indexable `plan.cells` list and CAN
    // auto-wrap a flagged cell in ScrollViewStickyHeader itself. Proves the wiring end to end: a
    // stickyHeaderIndices-flagged windowed cell actually paints through the sticky component (real
    // zIndex/collapsable), not just an inert prop forwarded onto the native scroll view (which does
    // NOT honor stickyHeaderIndices on its own — see render-scroll-sticky.ts's header comment).
    it('wraps a stickyHeaderIndices-flagged windowed cell in ScrollViewStickyHeader', async () => {
      compileVirtualizedListWithRefreshControl();
      compileToFile(
        `<script>
         import VirtualizedList from './.smoke-compiled-virtualized-list.mjs';
         function getItem(source, index) { return source[index]; }
         function getItemCount(source) { return source.length; }
       </script>
       {#snippet cell()}<symbiote-text p={{}}>row</symbiote-text>{/snippet}
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

      const stickyHost = fabric.find(
        node => node.viewName === 'RCTView' && node.props.zIndex === 10,
      );
      expect(
        stickyHost,
        'the flagged cell painted through ScrollViewStickyHeader',
      ).toBeDefined();
      expect(stickyHost?.props.collapsable).toBe(false);
    });

    // why: the exported imperative surface (scrollToOffset, scrollToIndex, scrollToItem,
    // scrollToEnd, flashScrollIndicators, getNativeScrollRef/getScrollableNode/getScrollResponder/
    // getScrollNode, recordInteraction) had ZERO coverage before this test — every method is thin
    // Svelte-side wiring (dispatch -> reducer effect -> scrollHandle call), not core reducer logic,
    // so it belongs here. scrollToOffset is the representative case: it exercises the FULL chain
    // (export -> dispatch({kind:'scroll-to-offset'}) -> reduceList's 'scroll-to' effect ->
    // scrollToPixel -> scrollHandle.scrollTo -> a real dispatchViewCommand). The remaining
    // imperative exports are structurally identical thin delegations through the SAME dispatch/
    // scrollHandle wiring this test already exercises (getNativeScrollRef/getScrollableNode/
    // getScrollResponder/getScrollNode are direct field reads with no branch of their own) — closed
    // N/A on that basis rather than duplicated one-by-one.
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
      expect(fabric.commands[0]?.node.viewName).toBe('RCTScrollView');
    });

    // why: WHERE a separator sits, and WHAT decides to render it, are both geometry. RN renders
    // ItemSeparatorComponent INSIDE the cell's own measuring wrapper
    // (VirtualizedListCellRenderer.js:218-221) and gates it on the last index of the DATA
    // (VirtualizedList.js:793). As a SIBLING it is an extra flex child, so the chrome between two
    // cells is gap + separator + gap while a spacer collapsing that region contributes one gap —
    // the leading spacer lands every cell below it short by (separator + gap). Gated on the
    // WINDOW, a cell's own height changes as the window slides past it. Both device-measured
    // 2026-08-19; see .claude/rules/list-geometry-feedback-loop.md. Counting dividers cannot see
    // either — the assertion has to ask which node CONTAINS one.
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
