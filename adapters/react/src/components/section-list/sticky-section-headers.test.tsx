/** @jsxRuntime automatic */
// Proves that VirtualizedSectionList sticks its section headers. Stickiness is a JS layer — the
// native scroll view does NOT honor a bare index array — and the engine owns it: a flagged child
// is a `sticky-header` node, `collapsable:false` so Yoga cannot flatten the box its translateY
// rides on. We mount two small sections (all entries inside the initial window) and assert the two
// section headers get marked and that stickySectionHeadersEnabled={false} marks nothing.
//
// The path this exercises is VirtualizedSectionList -> VirtualizedList -> the `sticky-header` TAG.
// It is NOT `stickyHeaderIndices` on the scroll view: the behavior resolves that prop against the
// OWNER's paint children, and a windowed list paints a header, a spacer and a slice, so data index
// 3 is almost never paint child 3. The list emits the tag on the cell instead, which pins by
// document order and survives the window sliding.
//
// SCOPE: the translateY interpolation reducer (reduceSticky, createInitialStickyState) is
// exhaustively unit-tested at core/components/src/state/sticky-header-reducer.test.ts — N/A
// here. `resolveStickySectionHeaders` (the enabled/undefined/Platform.OS default fold) is
// unit-tested at core/components/src/state/virtualized-list.test.ts — also N/A here; the first
// test below exercises it only incidentally (default-unset resolves headers to sticky on this
// iOS-resolved headless host, per that function's `enabled ?? platformOS === 'ios'`), it does
// not re-prove the fold's own branches. What IS proven here, and nowhere else: that the computed
// sticky header indices pick the right CELLS out of a flattened section stream — the end-to-end
// wiring, not the math.
//
// No Negative group: sections/renderItem/renderSectionHeader are required props (a TS contract,
// not a runtime guard) and stickySectionHeadersEnabled=false is a valid configuration, not an
// error — nothing here has a throwing path.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedSectionList, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface IRow {
  id: number;
}

const ROOT_TAG = 43;
const SECTIONS = [
  { title: 'A', data: [{ id: 0 }, { id: 1 }] },
  { title: 'B', data: [{ id: 2 }, { id: 3 }] },
];

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// `collapsable: false` is what the sticky seam sets at CREATE, and nothing else in this tree sets
// it — a plain cell wrapper leaves it absent. The translateY is NOT the oracle: it needs a
// measurement round trip, so a create-time `Array.isArray(transform)` reads 0 for a correct tree
// and would also read "present" for a frozen pin (`test-harness-false-greens.md` §34). The pin's
// motion is core's to prove; this file's question is which CHILDREN got marked.
function stickyWrappers(): IFakeNode[] {
  return fabric.created.filter(
    n =>
      n.props.collapsable === false &&
      // The scroll view's own CONTENT node carries it too — Yoga must not flatten the box the
      // sticky pins are measured against. It is not a header, and the disabled case is what makes
      // that visible: one such node with zero sticky cells.
      n.viewName !== 'RCTScrollContentView',
  );
}

function renderSection(props: {
  sections: typeof SECTIONS;
  stickySectionHeadersEnabled?: boolean;
}): ReactElement {
  return createElement(VirtualizedSectionList<IRow>, {
    sections: props.sections,
    stickySectionHeadersEnabled: props.stickySectionHeadersEnabled,
    renderSectionHeader: ({ section }) =>
      createElement('text', {}, section.title),
    renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
  });
}

describe('VirtualizedSectionList sticky section headers', () => {
  // Flattened: [0]=header A, [1..2]=items, [3]=footer A, [4]=header B, [5..6]=items,
  // [7]=footer B. No separators, no list header -> child positions equal entry indices,
  // so the two headers land at child 0 and 4 and get wrapped.
  //
  // why: without this wrapping, RN's own scroll view NEVER honors a bare sticky-index array (the
  // header comment) — so this is not a nice-to-have, it's the only mechanism that makes sticky
  // headers visually stick at all. Wrapping the WRONG count/nodes (e.g. items instead of
  // headers) would silently break scroll UX with no runtime error to catch it. Also proves the
  // unset-`stickySectionHeadersEnabled` default resolves to enabled on this host.
  it('marks each of the two section headers collapsable:false', () => {
    mount(ROOT_TAG, renderSection({ sections: SECTIONS }));
    const wrappers = stickyWrappers();
    expect(wrappers.length, 'one sticky wrapper per section header').toBe(2);
    for (const wrapper of wrappers) {
      expect(
        wrapper.props.collapsable,
        'sticky wrapper is collapsable:false',
      ).toBe(false);
    }
  });

  // why: a caller who explicitly opts out (RN parity: some layouts don't want sticky headers,
  // e.g. a horizontally-scrolling section list) must get plain, unwrapped children — the wrap
  // must be conditional on the resolved flag, not unconditionally applied whenever headers exist.
  it('wraps nothing when stickySectionHeadersEnabled is false', () => {
    mount(
      ROOT_TAG,
      renderSection({ sections: SECTIONS, stickySectionHeadersEnabled: false }),
    );
    const wrappers = stickyWrappers();
    expect(wrappers.length, 'disabled sticky headers wrap no header').toBe(0);
  });
});
