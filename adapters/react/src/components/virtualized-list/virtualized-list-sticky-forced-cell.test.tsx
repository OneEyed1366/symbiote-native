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
import { STICKY_HEADER_TAG } from '@symbiote-native/components';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
  type ILiveNode,
} from '@symbiote-native/test-utils';

type IRow = {
  id: number;
};

const ROOT_TAG = 44;
const SCROLLED_OFFSET = 1_450;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const DATA: IRow[] = Array.from({ length: 20 }, (_unused, index) => ({
  id: index,
}));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// RESIDENCY is the whole subject, so every walk here descends the LIVE child links from the scroll
// view down. A recording keeps every node it ever saw created, so a windowed-out cell is still in
// the record — searching the record instead would report index 1 as resident forever.
function descendantsOf(handle: ISymbioteNode): ISymbioteNode[] {
  return childrenOf(handle).flatMap(child => [child, ...descendantsOf(child)]);
}

// Collect the text content of every rendered row so we can tell which cells are resident.
function renderedRows(handle: ISymbioteNode): string[] {
  const rows: string[] = [];
  for (const node of descendantsOf(handle)) {
    const text = fabric.find(one => one.handle === node)?.props.text;
    if (typeof text === 'string' && text.startsWith('row-')) rows.push(text);
  }
  return rows;
}

function findScrollView(): IAuthoredNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'the scroll view was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: scroll view missing');
  return node;
}

function firstText(node: ILiveNode): string | undefined {
  if (typeof node.payload.text === 'string') return node.payload.text;
  for (const child of node.children) {
    const found = firstText(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

// The row each `sticky-header` wrapper holds
// The tag the engine was told is the oracle, the `translateY` needs a measurement round trip
function stickyRows(): Array<string | undefined> {
  const rows: Array<string | undefined> = [];
  live.walkLive(live.appRoot(), node => {
    if (node.tagName === STICKY_HEADER_TAG) rows.push(firstText(node));
  });
  return rows;
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
    // The initial region [0, 1] is retained by RN's scroll-to-top optimization, header 10 is not
    initialNumToRender: 2,
    windowSize: 1,
    stickyHeaderIndices: [0, 10],
    renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
  });
}

describe('VirtualizedList force-mounts the sticky header below the window', () => {
  it('keeps the sticky index-0 cell mounted after scrolling its origin position off-window', () => {
    mount(ROOT_TAG, <App />);
    findScrollView(); // sanity: the inner ScrollView was created.
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });

    // The window covers indices 14 and 15 (1400..1600 straddle 1450..1550 at zero overscan)
    // so sticky header 10 is far outside [first,last]
    fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: SCROLLED_OFFSET },
      contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
      layoutMeasurement: { width: 320, height: VIEWPORT },
    });

    const rows = renderedRows(findScrollView().handle);
    // The forced sticky cell stays mounted far outside the in-window range
    expect(
      rows.includes('row-10'),
      'sticky header at index 10 stays force-mounted',
    ).toBe(true);
    // Indices strictly between the forced cell and the window are NOT rendered
    expect(rows.includes('row-11'), 'index 11 stays windowed out').toBe(false);
    expect(rows.includes('row-13'), 'index 13 stays windowed out').toBe(false);
    // The retained initial region and the window itself are resident
    expect(rows.includes('row-0'), 'initial region retained').toBe(true);
    expect(
      rows.includes('row-14') || rows.includes('row-15'),
      'window cell resident',
    ).toBe(true);
  });

  it('wraps the forced cell in the sticky-header wrapper, same as an in-window sticky cell', () => {
    // A cell the app flagged sticky is wrapped in the `sticky-header` tag, the forced one too
    mount(ROOT_TAG, <App />);
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
      contentOffset: { x: 0, y: SCROLLED_OFFSET },
      contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
      layoutMeasurement: { width: 320, height: VIEWPORT },
    });

    expect(
      stickyRows(),
      'forced and retained headers are both wrapped',
    ).toEqual(['row-0', 'row-10']);
  });
});
