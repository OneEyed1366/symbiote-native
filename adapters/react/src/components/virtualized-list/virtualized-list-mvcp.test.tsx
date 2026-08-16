/** @jsxRuntime automatic */
// Co-located React-driven pipeline test, ported from the headless
// `virtualized-list-mvcp.smoke.tsx`. Proves two VirtualizedList feature-parity fixes:
//   1. maintainVisibleContentPosition (MVCP) is forwarded to the inner ScrollView node, so
//      Fabric anchors the visible cells. We walk the committed tree for the scroll view and
//      assert the prop landed (with minIndexForVisible bumped for a ListHeaderComponent).
//   2. scrollToIndex on an UNMEASURED target with no getItemLayout fires onScrollToIndexFailed
//      ({index, highestMeasuredFrameIndex, averageItemLength}) instead of silently scrolling
//      to an estimate, so NO scrollTo command is dispatched on that path.
// No simulator: a failure here is in the JS routing, not native.
//
// SCOPE:
// (1) is genuinely adapter-owned, not core: the ListHeaderComponent +1 bump and the
//     maintainVisibleContentPosition -> scrollProps.maintainVisibleContentPosition forwarding
//     both live directly in adapters/react/src/components/virtualized-list/index.ts (~line 734),
//     with no core/components counterpart — this test is that logic's only coverage.
// (2)'s NUMBERS (highestMeasuredFrameIndex/averageItemLength/the getItemLayout-vs-measured-
//     ceiling branch) are already unit-tested in core/components/src/state/
//     virtualized-list-reducer.test.ts ("scroll-to-index reports failure..." / "...resolves the
//     offset..." / "...resolves normally without getItemLayout when the target was measured") —
//     that part is N/A here (covered elsewhere). What THIS test proves instead is the WIRING: that
//     the imperative ref's scrollToIndex actually reaches the reducer, that its
//     fire-scroll-to-index-failed effect actually surfaces as a real onScrollToIndexFailed
//     callback, and that the failure path dispatches no native scrollTo command — none of which
//     the pure-reducer test can see.
//
// N/A (not exercised here, and not fabricated): the 'shift'/'autoscroll-top' MVCP scroll effects
// (a real prepend shifting an already-scrolled window) are called out as an acknowledged,
// undocumented-as-a-bug gap in virtualized-list-reducer.test.ts's own header comment — reaching
// them needs a genuine two-commit prepend across a virtualized window, which would require
// re-deriving computeWindow's own throttling arithmetic to set up, making the assertion restate
// the implementation rather than check it independently. Not re-attempted at the adapter level,
// where the same problem is strictly harder (real commits, not synthetic reducer inputs).
//
// No Negative group: the reducer this drives is total over its action union (reduceList's own
// header comment: "no default/throw... never a rejection"), and the adapter wiring around it adds
// no guard clause of its own — an unresolvable scrollToIndex reports a callback, it never throws.

import { createElement, createRef, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount, type IFlatListHandle } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

interface IScrollToIndexFailure {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
}

const ROOT_TAG = 41;
const MVCP_DATA = Array.from({ length: 20 }, (_unused, index) => ({ id: index }));
const FAIL_DATA = Array.from({ length: 100 }, (_unused, index) => ({ id: index }));

const listRef = createRef<IFlatListHandle>();
const failures: IScrollToIndexFailure[] = [];
const commands: ICommandCall[] = [];

// The shared harness slot doesn't record view commands; the fail-path case asserts that NO
// scrollTo is dispatched, so graft a recording `dispatchCommand` onto the live slot before
// any mount (the engine destructures it off the global on its first commit).
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
  failures.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

// Walk the committed tree; return the first node whose viewName looks like a scroll view.
function findScrollView(nodes: IFakeNode[]): IFakeNode | undefined {
  for (const node of nodes) {
    if (/scroll/i.test(node.viewName)) return node;
    const nested = findScrollView(node.children);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function MvcpApp(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: MVCP_DATA,
    keyExtractor: item => `k-${item.id}`,
    // A header occupies child 0, so RN bumps minIndexForVisible by 1 (1 -> 2).
    ListHeaderComponent: () => createElement('symbiote-text', {}, 'header'),
    maintainVisibleContentPosition: { minIndexForVisible: 1, autoscrollToTopThreshold: 10 },
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
  });
}

function FailPathApp(): ReactElement {
  return createElement(FlatList<{ id: number }>, {
    data: FAIL_DATA,
    keyExtractor: item => `k-${item.id}`,
    // No getItemLayout: cells are unmeasured in headless (no real onLayout), so a far
    // target has no resolvable offset.
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
    onScrollToIndexFailed: info => failures.push(info),
    ref: listRef,
  });
}

describe('VirtualizedList MVCP forwarding and scrollToIndex failure path (Positive)', () => {
  // why: native MVCP anchors by CHILD INDEX inside the ScrollView, but a ListHeaderComponent
  // occupies child 0 — if the adapter forwarded minIndexForVisible unbumped, native would anchor
  // one row too early (the header instead of the caller's intended first data row).
  it('forwards maintainVisibleContentPosition to the scroll view, bumping minIndexForVisible for the header', () => {
    mount(ROOT_TAG, <MvcpApp />);
    expect(fabric.committed.length, 'MVCP FlatList committed').toBeGreaterThan(0);

    const scrollView = findScrollView(fabric.committed);
    expect(scrollView, 'scroll view node found in committed tree').toBeDefined();

    const mvcp = scrollView!.props.maintainVisibleContentPosition;
    expect(typeof mvcp).toBe('object');
    expect(mvcp).not.toBeNull();

    const minIndex = Reflect.get(Object(mvcp), 'minIndexForVisible');
    const autoscroll = Reflect.get(Object(mvcp), 'autoscrollToTopThreshold');
    expect(minIndex, 'minIndexForVisible bumped 1->2 for the header').toBe(2);
    expect(autoscroll, 'autoscrollToTopThreshold passes through as 10').toBe(10);
  });

  // why: scrolling to a far, never-rendered index with no getItemLayout has no real offset to
  // scroll to — RN reports the failure to the caller (so it can retry after measuring more cells)
  // instead of silently jumping to a guessed offset, which would land the user somewhere wrong.
  it('fires onScrollToIndexFailed for an unmeasured cell and dispatches no scrollTo', () => {
    mount(ROOT_TAG, <FailPathApp />);
    expect(fabric.committed.length, 'fail-path FlatList committed').toBeGreaterThan(0);
    expect(listRef.current, 'fail-path FlatList ref attached').not.toBeNull();

    const scrollsBefore = commands.filter(c => c.name === 'scrollTo').length;
    listRef.current!.scrollToIndex({ index: 50, animated: true });
    const scrollsAfter = commands.filter(c => c.name === 'scrollTo').length;

    expect(failures.length, 'onScrollToIndexFailed fires once').toBe(1);
    expect(failures[0].index, 'failure index is 50').toBe(50);
    expect(typeof failures[0].highestMeasuredFrameIndex).toBe('number');
    expect(typeof failures[0].averageItemLength).toBe('number');
    // An unmeasured scrollToIndex must NOT dispatch scrollTo (an estimate).
    expect(scrollsAfter).toBe(scrollsBefore);
  });
});
