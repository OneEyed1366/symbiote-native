/** @jsxRuntime automatic */
// Proves the sticky-header force-mount fix (buildListPlan's forcedStickyCell/gapExtent):
// stock RN's VirtualizedList windows cell rendering to [first,last] but ALWAYS force-mounts
// the nearest sticky index below that window (VirtualizedList.js _ensureClosestStickyHeader),
// so a pinned section header stays mounted after scrolling carries its origin position off
// -screen. Before the fix, `buildListPlan` only ever emitted [first,last] and the header at
// index 0 was silently dropped from the child list the moment the window moved past it —
// destroyed and recreated (losing its measured layout, flickering) every time the window
// slid back over it. windowSize=1 zeroes the overscan so a modest scroll genuinely pushes
// index 0 out of [first,last], isolating the force-mount behavior from normal windowing.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface IRow {
  id: number;
}

const ROOT_TAG = 44;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const DATA: IRow[] = Array.from({ length: 20 }, (_unused, index) => ({ id: index }));

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Collect the text content of every rendered row so we can tell which cells are resident.
function renderedRows(nodes: IFakeNode[]): string[] {
  const rows: string[] = [];
  for (const node of nodes) {
    if (typeof node.props.text === 'string' && node.props.text.startsWith('row-')) {
      rows.push(node.props.text);
    }
    rows.push(...renderedRows(node.children));
  }
  return rows;
}

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'scroll view node found in committed tree').toBeDefined();
  if (node === undefined) throw new Error('unreachable: scroll view missing');
  return node;
}

// A sticky-header wrapper is the only node carrying a `transform` (its translateY); regular
// cells and the content container don't (same tell sticky-section-headers.test.tsx uses).
function collectStickyWrappers(nodes: IFakeNode[]): IFakeNode[] {
  const wrappers: IFakeNode[] = [];
  for (const node of nodes) {
    if (Array.isArray(node.props.transform)) wrappers.push(node);
    wrappers.push(...collectStickyWrappers(node.children));
  }
  return wrappers;
}

function App(): ReactElement {
  return createElement(VirtualizedList<IRow>, {
    data: DATA,
    getItem: (data, index) => (data as IRow[])[index],
    getItemCount: data => (data as IRow[]).length,
    keyExtractor: item => `k-${item.id}`,
    getItemLayout: (_data, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    // windowSize=1 => zero overscan, so [first,last] is a tight window around the viewport
    // and a scroll to the middle of the list genuinely evicts index 0.
    windowSize: 1,
    stickyHeaderIndices: [0, 10],
    renderItem: ({ item }) => createElement('symbiote-text', {}, `row-${item.id}`),
  });
}

describe('VirtualizedList force-mounts the sticky header below the window', () => {
  it('keeps the sticky index-0 cell mounted after scrolling its origin position off-window', () => {
    mount(ROOT_TAG, <App />);
    expect(fabric.committed.length, 'VirtualizedList committed').toBeGreaterThan(0);

    findScrollView(); // sanity: the inner ScrollView committed.
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });

    // Scroll so the window covers index 5 only (offsets[5..6] = 500..700 straddle
    // 550..650 with windowSize=1's zero overscan) — index 0 and its sticky section origin
    // are well outside [first,last].
    fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: 550 },
      contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
      layoutMeasurement: { width: 320, height: VIEWPORT },
    });

    const rows = renderedRows(fabric.committed);
    // The forced sticky cell: index 0 stays mounted even though it is far outside the
    // in-window range.
    expect(rows.includes('row-0'), 'sticky header at index 0 stays force-mounted').toBe(true);
    // Real windowing still holds for everything else: indices strictly between the forced
    // sticky cell and the window are NOT rendered.
    expect(rows.includes('row-1'), 'index 1 stays windowed out').toBe(false);
    expect(rows.includes('row-4'), 'index 4 stays windowed out').toBe(false);
    // The window itself is resident.
    expect(rows.includes('row-5') || rows.includes('row-6'), 'window cell resident').toBe(true);
  });

  it('wraps the forced cell in the sticky-header wrapper, same as an in-window sticky cell', () => {
    // ScrollView's own stickyHeaderIndices handling is pure JS (sticky-header.tsx): it wraps
    // the FLAGGED CHILD in a ScrollViewStickyHeader (a `collapsable:false`, transform-bearing
    // AnimatedView) rather than forwarding the raw index array to native. So the forced cell
    // must land at the child position `stickyChildPositions` reports, or it never gets wrapped.
    mount(ROOT_TAG, <App />);
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: 550 },
      contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
      layoutMeasurement: { width: 320, height: VIEWPORT },
    });

    const stickyWrappers = collectStickyWrappers(fabric.committed);
    expect(stickyWrappers.length, 'the forced sticky cell got wrapped').toBeGreaterThan(0);
    expect(
      stickyWrappers.some(wrapper => renderedRows([wrapper]).includes('row-0')),
      'row-0 (the forced cell) is inside a sticky wrapper',
    ).toBe(true);
  });
});
