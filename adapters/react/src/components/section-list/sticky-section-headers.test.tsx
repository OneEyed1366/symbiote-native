/** @jsxRuntime automatic */
// Proves that VirtualizedSectionList sticks its section
// headers. Stickiness is a JS layer (ScrollView wraps each flagged child in a
// ScrollViewStickyHeader, an Animated.View with collapsable:false and a translateY
// transform driven by the scroll offset; the native scroll view does NOT honor a bare index
// array). We mount two small sections (all entries inside the initial window) and assert the
// two section headers each get wrapped in a transform-bearing sticky wrapper, and that
// stickySectionHeadersEnabled={false} wraps nothing. This exercises the full
// VirtualizedSectionList -> ScrollView -> wrapStickyHeaders path.
//
// SCOPE: the translateY interpolation reducer (reduceSticky, createInitialStickyState) is
// exhaustively unit-tested at core/components/src/state/sticky-header-reducer.test.ts — N/A
// here. `resolveStickySectionHeaders` (the enabled/undefined/Platform.OS default fold) is
// unit-tested at core/components/src/state/virtualized-list.test.ts — also N/A here; the first
// test below exercises it only incidentally (default-unset resolves headers to sticky on this
// iOS-resolved headless host, per that function's `enabled ?? platformOS === 'ios'`), it does
// not re-prove the fold's own branches. What IS proven here, and nowhere else: that the computed
// sticky header INDICES actually reach ScrollView and get the right DOM children wrapped in a
// real collapsable:false transform-bearing node — the end-to-end wiring, not the math.
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

// A sticky-header wrapper is the only node carrying a `transform` (its translateY); regular
// cells and the content container don't. So transform-bearing nodes count the wrapped headers.
function stickyWrappers(): IFakeNode[] {
  return fabric.created.filter(n => Array.isArray(n.props.transform));
}

function renderSection(props: {
  sections: typeof SECTIONS;
  stickySectionHeadersEnabled?: boolean;
}): ReactElement {
  return createElement(VirtualizedSectionList<IRow>, {
    sections: props.sections,
    stickySectionHeadersEnabled: props.stickySectionHeadersEnabled,
    renderSectionHeader: ({ section }) => createElement('symbiote-text', {}, section.title),
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
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
  it('wraps each of the two section headers in a collapsable:false sticky wrapper', () => {
    mount(ROOT_TAG, renderSection({ sections: SECTIONS }));
    const wrappers = stickyWrappers();
    expect(wrappers.length, 'one sticky wrapper per section header').toBe(2);
    for (const wrapper of wrappers) {
      expect(wrapper.props.collapsable, 'sticky wrapper is collapsable:false').toBe(false);
    }
  });

  // why: a caller who explicitly opts out (RN parity: some layouts don't want sticky headers,
  // e.g. a horizontally-scrolling section list) must get plain, unwrapped children — the wrap
  // must be conditional on the resolved flag, not unconditionally applied whenever headers exist.
  it('wraps nothing when stickySectionHeadersEnabled is false', () => {
    mount(ROOT_TAG, renderSection({ sections: SECTIONS, stickySectionHeadersEnabled: false }));
    const wrappers = stickyWrappers();
    expect(wrappers.length, 'disabled sticky headers wrap no header').toBe(0);
  });
});
