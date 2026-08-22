// Co-located Vue-driven virtualization test, the Vue twin of
// adapters/react/src/virtualized-list/*.test.tsx. Drives a FlatList (the thin convenience over
// VirtualizedList, exactly as the React twins do) on the shared fake Fabric slot and proves the
// windowing core: only a bounded window of cells is committed (never the full data) with
// leading/trailing spacers reserving the off-window extent, the window SHIFTS on a scroll-driven
// recommit, onViewableItemsChanged fires for the visible cells, and an imperative
// scrollToOffset / scrollToIndex lands as the native scrollTo view command. Vue reactivity is
// async, so each driving step is followed by a macrotask `tick` that drains the engine's
// coalesced commit and the post-flush watchers before the assert reads the committed tree.
//
// This file is the Vue ADAPTER's responsibility, not the shared reducer's: buildListPlan/
// buildWindow's own branch logic (window math, sticky-forced-cell selection, MVCP offset
// arithmetic) is proven once at core/components/src/state/virtualized-list.test.ts — closed there
// as `covered`, N/A here with that reason. What this file proves instead is that Vue's async,
// microtask-batched reactivity correctly DRIVES that shared logic end to end: props reach
// FlatList, a scroll/layout native event reaches the reducer, its output reaches the committed
// Fabric tree, and an imperative ref method reaches a real native command — the seam
// vue-adapter-reactivity's async-commit-timing gotcha warns can silently no-op if unwired.
//
// No Positive/Negative split: every scenario here is a Positive "the adapter wires this correctly"
// claim, including onScrollToIndexFailed — that's RN's own documented FAILURE CALLBACK contract
// (not a JS exception), so asserting it fires with no scrollTo dispatched is still a positive
// claim about correct behavior, not a throw/reject to catch.

import {
  defineComponent,
  h,
  ref,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FlatList,
  mount,
  unmount,
  type IFlatListHandle,
} from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// FlatList (over the generic VirtualizedList) is a GENERIC component, so its value is a generic
// construct signature that h()'s overloads can't resolve. These are runtime pipeline tests, not type
// tests, so drive it through a loose functional-component handle (sanctioned cast — generic-component
// limitation, test-only).
const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

type IViewToken = {
  key: string;
  index: number | null;
  isViewable: boolean;
};

const ROOT_TAG = 320;
const ITEM_COUNT = 1_000;
const ITEM_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
const CONTENT_HEIGHT = ITEM_COUNT * ITEM_HEIGHT;
const WINDOW_CEILING = ITEM_COUNT / 2;
const DEEP_ROW = 'row-900';
const DEEP_OFFSET = 900 * ITEM_HEIGHT;

type IRow = { id: number; label: string };
const DATA: IRow[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}));

function makeRows(startId: number, count: number): IRow[] {
  return Array.from({ length: count }, (_unused, offset) => ({
    id: startId + offset,
    label: `row-${startId + offset}`,
  }));
}

// onScrollToIndexFailed path: no getItemLayout, so cells stay unmeasured in headless (no real
// onLayout) and a far target has no resolvable offset (RN VirtualizedList.js:179-195).
type IScrollToIndexFailure = {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
};
const FAIL_COUNT = 100;
const FAIL_TARGET_INDEX = 50;
const FAIL_DATA: IRow[] = makeRows(0, FAIL_COUNT);
const failures: IScrollToIndexFailure[] = [];

// maintainVisibleContentPosition prepend anchor: a reactive data ref so a unit can prepend rows
// above the viewport and assert the compensating scroll. getItemLayout pins offsets deterministically,
// so the inserted extent (prepended count * ITEM_HEIGHT) is exact.
const MVCP_PREPEND_COUNT = 5;
const MVCP_SCROLL_OFFSET = 20_000;
const mvcpData = ref<IRow[]>(makeRows(0, ITEM_COUNT));

const commands: ICommandCall[] = [];

// The shared harness slot does not record view commands; the imperative cases assert the scrollTo
// command, which the engine destructures off the live global slot on its first commit, so graft a
// recording dispatchCommand before any mount.
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const viewableBatches: IViewToken[][] = [];

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
  viewableBatches.length = 0;
  failures.length = 0;
  mvcpData.value = makeRows(0, ITEM_COUNT);
});
afterEach(() => unmount(ROOT_TAG));

const listRef = ref<IFlatListHandle | null>(null);

function makeList(
  extra: Record<string, unknown>,
  extraSlots: Record<string, unknown> = {},
): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          ref: listRef,
          data: DATA,
          keyExtractor: (item: IRow) => `k-${item.id}`,
          getItemLayout: (_data: unknown, index: number) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          }),
          ...extra,
        },
        {
          item: ({ item }: { item: IRow }) => [
            h('symbiote-text', {}, item.label),
          ],
          ...extraSlots,
        },
      ),
  });
}

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function collectRowLabels(): Set<string> {
  const labels = new Set<string>();
  walk(fabric.committed, node => {
    const text = node.props.text;
    if (typeof text === 'string' && text.startsWith('row-')) labels.add(text);
  });
  return labels;
}

function findInCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

// Does this committed subtree carry a raw-text payload anywhere inside it? Asks WHERE a node sits
// rather than merely whether it exists — placement is geometry for a separator.
function carriesText(node: IFakeNode, text: string): boolean {
  return (
    node.props.text === text ||
    node.children.some(child => carriesText(child, text))
  );
}

// A spacer is the ONLY childless RCTView carrying a numeric height: it reserves the off-window
// extent. Cell wrappers always hold their content child, so they never match.
function isSpacer(node: IFakeNode): boolean {
  return (
    node.viewName === 'RCTView' &&
    node.children.length === 0 &&
    typeof node.props.height === 'number' &&
    node.props.height > 0
  );
}

// The committed cells + spacers sit in document order under the scroll content view, so the
// leading spacer is the FIRST child and the trailing spacer is the LAST.
function contentChildren(): IFakeNode[] {
  const content = findInCommitted(n => n.viewName === 'RCTScrollContentView');
  expect(content, 'scroll content view committed').toBeDefined();
  if (content === undefined)
    throw new Error('unreachable: RCTScrollContentView missing');
  return content.children;
}

function hasLeadingSpacer(): boolean {
  const children = contentChildren();
  return children.length > 0 && isSpacer(children[0]);
}

function hasTrailingSpacer(): boolean {
  const children = contentChildren();
  return children.length > 0 && isSpacer(children[children.length - 1]);
}

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'an RCTScrollView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: RCTScrollView missing');
  return node;
}

function scrollTo(handle: unknown, offsetY: number): void {
  fabric.fireEvent(handle, 'topScroll', {
    contentOffset: { x: 0, y: offsetY },
    contentSize: { width: 320, height: CONTENT_HEIGHT },
    layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
  });
}

async function mountWithComponent(
  component: ReturnType<typeof defineComponent>,
): Promise<IFakeNode> {
  mount(ROOT_TAG, component);
  await tick();
  const scrollView = findScrollView();
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
  await tick();
  return scrollView;
}

async function mountWithViewport(
  extra: Record<string, unknown> = {},
  extraSlots: Record<string, unknown> = {},
): Promise<IFakeNode> {
  return mountWithComponent(makeList(extra, extraSlots));
}

describe('Vue VirtualizedList virtualization on the engine', () => {
  // why: a 1000-row list committing all 1000 native views would defeat the entire point of
  // virtualization (memory/paint cost). The adapter must hand the reducer's bounded window
  // through to the real committed Fabric tree, not just hold it in Vue reactive state.
  it('windows to a bounded prefix with a trailing spacer and no leading spacer at the top', async () => {
    await mountWithViewport();

    const labels = collectRowLabels();
    expect(labels.size, 'item rows committed').toBeGreaterThan(0);
    expect(labels.size, 'window far smaller than the full data').toBeLessThan(
      WINDOW_CEILING,
    );
    expect(labels.has('row-0'), 'first row present at the top').toBe(true);
    expect(labels.has(DEEP_ROW), 'a deep row is absent at the top').toBe(false);
    // At the top the leading extent is 0 (no leading spacer); the trailing spacer reserves the
    // off-window content below.
    expect(hasLeadingSpacer(), 'no leading spacer at the top').toBe(false);
    expect(
      hasTrailingSpacer(),
      'a trailing spacer reserves the content below',
    ).toBe(true);
  });

  // why: this is the recommit path, not just the initial mount — a native `topScroll` event has
  // to reach the reducer through Vue's microtask-batched commit and produce a NEW committed tree,
  // proving the adapter re-drives the shared window logic on every scroll, not only once at mount.
  // why: WHERE a separator sits, and WHAT decides to render it, are both geometry. RN renders
  // ItemSeparatorComponent INSIDE the cell's own measuring wrapper
  // (VirtualizedListCellRenderer.js:218-221) and gates it on the last index of the DATA
  // (VirtualizedList.js:793). As a SIBLING it is an extra flex child, so the chrome between two
  // cells is gap + separator + gap while a spacer collapsing that region contributes one gap — the
  // leading spacer lands every cell below it short by (separator + gap). Gated on the WINDOW, a
  // cell's own height changes as the window slides past it. Both were device-measured 2026-08-19 as
  // the list jumping mid-scroll; see .claude/rules/list-geometry-feedback-loop.md.
  it('renders the separator inside its cell rather than beside it', async () => {
    await mountWithViewport(
      {},
      {
        separator: () => [h('symbiote-text', {}, 'divider')],
      },
    );

    const withDivider = contentChildren().filter(child =>
      carriesText(child, 'divider'),
    );
    expect(withDivider.length, 'separators committed').toBeGreaterThan(0);
    // A sibling separator shows up here as a child carrying the divider and no row label.
    for (const [position, child] of withDivider.entries()) {
      expect(
        carriesText(child, `row-${position}`),
        'the divider sits inside its own cell',
      ).toBe(true);
    }
  });

  // why: the window's last cell is mid-DATA, so it keeps its separator. This is the assertion that
  // separates the two gates — under a window gate that cell is exactly the one that loses it.
  it('keeps the separator on the window-last cell, which is mid-data', async () => {
    await mountWithViewport(
      {},
      {
        separator: () => [h('symbiote-text', {}, 'divider')],
      },
    );

    const rendered = contentChildren().filter(child =>
      DATA.some(row => carriesText(child, row.label)),
    );
    expect(rendered.length, 'cells committed').toBeGreaterThan(0);
    expect(
      carriesText(rendered[rendered.length - 1], 'divider'),
      'the window-last cell is mid-data and keeps its separator',
    ).toBe(true);
  });

  it('withholds the separator from the last item of the DATA', async () => {
    const two = makeRows(0, 2);
    await mountWithViewport(
      { data: two },
      {
        separator: () => [h('symbiote-text', {}, 'divider')],
      },
    );

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

  it('shifts the window and grows a leading spacer when scrolled deep', async () => {
    const scrollView = await mountWithViewport();
    scrollTo(scrollView.instanceHandle, DEEP_OFFSET);
    await tick();

    const labels = collectRowLabels();
    expect(labels.size, 'window stays bounded after scroll').toBeLessThan(
      WINDOW_CEILING,
    );
    expect(labels.has(DEEP_ROW), 'the deep row is now resident').toBe(true);
    expect(labels.has('row-0'), 'early rows fell out of the window').toBe(
      false,
    );
    // A leading spacer now reserves the off-window content scrolled past above — it was absent at
    // the top.
    expect(
      hasLeadingSpacer(),
      'a leading spacer grew after scrolling deep',
    ).toBe(true);
  });

  // why: onViewableItemsChanged is a user-supplied prop callback, not a DOM/native event — the
  // adapter has to invoke it itself from the reducer's viewability computation. A wiring gap here
  // means analytics/impression tracking silently never fires, with no type error to catch it.
  it('fires onViewableItemsChanged for the visible cells', async () => {
    await mountWithViewport({
      onViewableItemsChanged: (info: { viewableItems: IViewToken[] }) => {
        viewableBatches.push(info.viewableItems);
      },
    });

    expect(
      viewableBatches.length,
      'onViewableItemsChanged fired',
    ).toBeGreaterThan(0);
    const latest = viewableBatches[viewableBatches.length - 1];
    expect(latest.length, 'some items are viewable').toBeGreaterThan(0);
    expect(
      latest.some(token => token.index === 0 && token.isViewable),
      'row 0 is reported viewable at the top',
    ).toBe(true);
  });

  // why: scrollToOffset/scrollToIndex are the IMPERATIVE ref-handle half of the component's
  // contract (vue-adapter-reactivity's identity/timing gotcha: a native command dispatched before
  // the node is committed silently no-ops). Proving it reaches a real dispatchCommand call, with
  // the right args in the right order, is the only way to catch that class of regression.
  it('routes an imperative scrollToOffset through the native scrollTo command', async () => {
    await mountWithViewport();
    expect(listRef.value, 'FlatList handle attached').not.toBeNull();

    listRef.value!.scrollToOffset({ offset: 200, animated: true });
    listRef.value!.scrollToOffset({ offset: 80, animated: false });
    const scrolls = commands.filter(c => c.name === 'scrollTo');
    expect(scrolls.length, 'two scrollTo commands').toBe(2);

    expect(scrolls[0].args[0]).toBe(0);
    expect(scrolls[0].args[1]).toBe(200);
    expect(scrolls[0].args[2]).toBe(true);
    expect(scrolls[1].args[1]).toBe(80);
    expect(scrolls[1].args[2]).toBe(false);
  });

  // why: scrollToIndex is a distinct public method from scrollToOffset with its own index->offset
  // resolution step (via getItemLayout) before it reaches the same native command — a regression
  // that broke only the index path would slip past the offset test above.
  it('routes an imperative scrollToIndex through scrollTo at the measured offset', async () => {
    await mountWithViewport();
    expect(listRef.value, 'FlatList handle attached').not.toBeNull();

    listRef.value!.scrollToIndex({ index: 5, animated: true });
    const scrolls = commands.filter(c => c.name === 'scrollTo');
    expect(scrolls.length, 'one scrollTo from scrollToIndex').toBe(1);
    // getItemLayout pins index 5 at offset 5 * ITEM_HEIGHT.
    expect(scrolls[0].args[1]).toBe(5 * ITEM_HEIGHT);
    expect(scrolls[0].args[2]).toBe(true);
  });
});

// Sticky force-mount: the RN _ensureClosestStickyHeader twin (buildListPlan's forcedStickyCell).
// 20 uniform rows, sticky origins at [0, 10] — mirrors the core buildListPlan repro
// (virtualized-list.test.ts's `describe('buildListPlan', ...)`) that reproduced the on-device bug
// where a pinned section header got destroyed/recreated once scrolling carried its origin index out
// of [first,last]. windowSize:1 collapses the overscan to 0, so the window is exactly the viewport —
// small enough to genuinely push both sticky origins out of [first,last].
const STICKY_ITEM_COUNT = 20;
const STICKY_CELL_HEIGHT = 100;
const STICKY_VIEWPORT = 100;
const STICKY_DATA: IRow[] = makeRows(0, STICKY_ITEM_COUNT);

function makeStickyList(): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          ref: listRef,
          data: STICKY_DATA,
          keyExtractor: (item: IRow) => `k-${item.id}`,
          getItemLayout: (_data: unknown, index: number) => ({
            length: STICKY_CELL_HEIGHT,
            offset: STICKY_CELL_HEIGHT * index,
            index,
          }),
          stickyHeaderIndices: [0, 10],
          windowSize: 1,
        },
        {
          item: ({ item }: { item: IRow }) => [
            h('symbiote-text', {}, item.label),
          ],
        },
      ),
  });
}

describe('Vue VirtualizedList sticky header force-mount', () => {
  // why: regression coverage for the same on-device bug the Angular twin
  // (virtualized-list-sticky-forced-cell.test.ts) and the core buildListPlan repro guard — a
  // pinned section header must stay mounted once scrolling carries its origin index out of
  // [first,last], or it gets destroyed/recreated (losing layout, flickering) every time the
  // window slides back over it. Proven here specifically through Vue's own commit path, since
  // the reducer producing forcedStickyCell is already proven correct at the core layer.
  it('keeps the nearest sticky header resident once the window scrolls past its origin index', async () => {
    mount(ROOT_TAG, makeStickyList());
    await tick();
    const scrollView = findScrollView();
    fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: STICKY_VIEWPORT },
    });
    await tick();

    // Scroll to offset 500: with windowSize:1 (zero overscan) the window collapses to [5,5],
    // clear of both sticky origins (0 and 10). Only the force-mount keeps row-0 resident.
    fabric.fireEvent(scrollView.instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: 500 },
      contentSize: {
        width: 320,
        height: STICKY_CELL_HEIGHT * STICKY_ITEM_COUNT,
      },
      layoutMeasurement: { width: 320, height: STICKY_VIEWPORT },
    });
    await tick();

    const labels = collectRowLabels();
    expect(
      labels.has('row-5'),
      'the in-window cell at the scroll position is resident',
    ).toBe(true);
    expect(
      labels.has('row-0'),
      'the force-mounted sticky header stays resident off-window',
    ).toBe(true);
    expect(
      labels.has('row-10'),
      'the other sticky index (not the nearest one below the window) is not force-mounted',
    ).toBe(false);
  });
});

// A list whose data is the reactive mvcpData ref, so a unit can prepend rows and trigger the MVCP
// anchor watcher. minIndexForVisible 0 anchors row k-0; no autoscrollToTopThreshold so the watcher
// takes the offset-adjust branch (not the autoscroll-to-top branch).
function makeMvcpList(): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          data: mvcpData.value,
          keyExtractor: (item: IRow) => `k-${item.id}`,
          getItemLayout: (_data: unknown, index: number) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          }),
          maintainVisibleContentPosition: { minIndexForVisible: 0 },
        },
        {
          item: ({ item }: { item: IRow }) => [
            h('symbiote-text', {}, item.label),
          ],
        },
      ),
  });
}

// A list WITHOUT getItemLayout (cells stay unmeasured headless) that records onScrollToIndexFailed.
function makeFailList(): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup: () => () =>
      h(
        FlatListHost,
        {
          ref: listRef,
          data: FAIL_DATA,
          keyExtractor: (item: IRow) => `k-${item.id}`,
          onScrollToIndexFailed: (info: IScrollToIndexFailure) =>
            failures.push(info),
        },
        {
          item: ({ item }: { item: IRow }) => [
            h('symbiote-text', {}, item.label),
          ],
        },
      ),
  });
}

describe('Vue VirtualizedList maintainVisibleContentPosition and scrollToIndex failure', () => {
  // why: minIndexForVisible has to account for a #header slot the caller never counts in its own
  // index space (the header occupies committed child 0) — an unadjusted pass-through would anchor
  // the wrong row the moment a header is present, breaking RN's native MVCP semantics.
  it('forwards maintainVisibleContentPosition to the scroll view, bumping minIndexForVisible for the header', async () => {
    await mountWithViewport(
      {
        maintainVisibleContentPosition: {
          minIndexForVisible: 1,
          autoscrollToTopThreshold: 10,
        },
      },
      // A #header slot occupies child 0, so RN bumps minIndexForVisible by 1 (1 -> 2).
      { header: () => [h('symbiote-text', {}, 'header')] },
    );

    // Read from the COMMITTED tree (the clones): fabric.find returns the createNode node whose props
    // can be stale after clone-on-write; the latest maintainVisibleContentPosition rides the clone.
    const scrollView = findInCommitted(n => /scroll/i.test(n.viewName));
    expect(scrollView, 'scroll view committed').toBeDefined();
    if (scrollView === undefined)
      throw new Error('unreachable: scroll view missing');

    const mvcp = scrollView.props.maintainVisibleContentPosition;
    expect(
      typeof mvcp,
      'maintainVisibleContentPosition forwarded as an object',
    ).toBe('object');
    expect(mvcp).not.toBeNull();
    expect(
      Reflect.get(Object(mvcp), 'minIndexForVisible'),
      'minIndexForVisible bumped 1->2 for the header',
    ).toBe(2);
    expect(
      Reflect.get(Object(mvcp), 'autoscrollToTopThreshold'),
      'autoscrollToTopThreshold passes through as 10',
    ).toBe(10);
  });

  // why: native MVCP only compensates for content it can see; content prepended INTO the leading
  // spacer (still off-window) is invisible to it, so the adapter's JS-side reactive watcher must
  // dispatch a compensating instant scrollTo itself, or the visually-anchored row jumps on prepend.
  it('shifts the scroll offset to keep the anchored row put when rows are prepended above the window', async () => {
    const scrollView = await mountWithComponent(makeMvcpList());
    scrollTo(scrollView.instanceHandle, MVCP_SCROLL_OFFSET);
    await tick();

    // Prepend rows with fresh ids ABOVE the viewport: the anchored row k-0 moves down by the
    // prepended count, into the leading spacer the native MVCP cannot see, so the JS shift fires.
    mvcpData.value = [
      ...makeRows(ITEM_COUNT, MVCP_PREPEND_COUNT),
      ...mvcpData.value,
    ];
    await tick();

    const scrolls = commands.filter(c => c.name === 'scrollTo');
    expect(scrolls.length, 'MVCP dispatches one compensating scrollTo').toBe(1);
    expect(scrolls[0].args[0], 'x stays 0 for a vertical list').toBe(0);
    // The leading spacer grew by MVCP_PREPEND_COUNT * ITEM_HEIGHT, so the offset shifts by exactly
    // that to keep the anchored row visually pinned.
    expect(scrolls[0].args[1], 'offset shifted by the prepended extent').toBe(
      MVCP_SCROLL_OFFSET + MVCP_PREPEND_COUNT * ITEM_HEIGHT,
    );
    // The JS correction is instant, never animated (RN getDerivedStateFromProps).
    expect(scrolls[0].args[2], 'the MVCP correction is instant').toBe(false);
  });

  // why: RN's documented contract for an unresolvable scrollToIndex is the onScrollToIndexFailed
  // callback, never a fabricated best-guess scroll — dispatching an estimated scrollTo instead
  // would silently land the viewport somewhere wrong with no signal to the caller that it failed.
  it('fires onScrollToIndexFailed for an unmeasured cell and dispatches no scrollTo', async () => {
    mount(ROOT_TAG, makeFailList());
    await tick();
    expect(listRef.value, 'fail-path FlatList handle attached').not.toBeNull();
    if (listRef.value === null)
      throw new Error('unreachable: FlatList handle missing');

    const scrollsBefore = commands.filter(c => c.name === 'scrollTo').length;
    listRef.value.scrollToIndex({ index: FAIL_TARGET_INDEX, animated: true });
    const scrollsAfter = commands.filter(c => c.name === 'scrollTo').length;

    expect(failures.length, 'onScrollToIndexFailed fires once').toBe(1);
    expect(failures[0].index, 'failure index is the requested 50').toBe(
      FAIL_TARGET_INDEX,
    );
    expect(typeof failures[0].highestMeasuredFrameIndex).toBe('number');
    expect(typeof failures[0].averageItemLength).toBe('number');
    // An unmeasured scrollToIndex must NOT dispatch a fabricated scrollTo (an estimate).
    expect(scrollsAfter, 'no scrollTo on the failure path').toBe(scrollsBefore);
  });
});
