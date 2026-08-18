/** @jsxRuntime automatic */
// Co-located React test for VirtualizedSectionList's `getItemLayout`. Two things are pinned here,
// and only one of them is about the prop existing at all:
//
//   1. It reaches the inner VirtualizedList. Without it the list cannot know a cell's extent until
//      that cell has been measured, so a fast scroll outruns measurement and leaves blank windows.
//   2. It is called with the SECTIONS array, not the flattened entries. That is the parity point:
//      RN hands its inner list `data={this.props.sections}` (VirtualizedSectionList.js:216), while
//      ours streams entries, so the adapter wraps the callback. Passing entries through instead
//      would typecheck, render identically, and silently hand every consumer a different second
//      argument than React Native does - invisible until someone's arithmetic used it.
//
// The index space is asserted too: a flat entry index over header -> items -> footer per section,
// which is RN's own (two extra rows per section) as long as SectionSeparatorComponent is unset.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedSectionList, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 34;
const VIEWPORT_HEIGHT = 400;
const ROW_HEIGHT = 40;

interface IRow {
  id: number;
  label: string;
}

interface ISectionShape {
  title: string;
  data: readonly IRow[];
}

const SECTIONS: ISectionShape[] = [
  {
    title: 'Section A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'Section B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
];

// header + 2 items + footer, twice.
const ENTRY_COUNT = 8;

interface ILayoutCall {
  data: unknown;
  index: number;
}

let calls: ILayoutCall[] = [];

function App(): ReactElement {
  return createElement(VirtualizedSectionList<IRow>, {
    sections: SECTIONS,
    keyExtractor: (item: IRow) => `k-${item.id}`,
    getItemLayout: (data, index) => {
      calls.push({ data, index });
      return { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index };
    },
    renderSectionHeader: ({ section }: { section: ISectionShape }) =>
      createElement('symbiote-text', {}, `header:${section.title}`),
    renderSectionFooter: ({ section }: { section: ISectionShape }) =>
      createElement('symbiote-text', {}, `footer:${section.title}`),
    renderItem: ({ item }: { item: IRow }) => createElement('symbiote-text', {}, item.label),
  });
}

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  calls = [];
});
afterEach(() => unmount(ROOT_TAG));

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  expect(node, 'RCTScrollView was created').toBeDefined();
  if (node === undefined) throw new Error('unreachable: RCTScrollView missing');
  return node;
}

// The window stays at its initial bounded prefix until the list knows its viewport, so fire
// onLayout the way the sibling test does before asserting on what the list asked for.
function mountWithViewport(): void {
  mount(ROOT_TAG, <App />);
  const scrollView = findScrollView();
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
  });
}

describe('VirtualizedSectionList getItemLayout', () => {
  it('reaches the inner list instead of being dropped on the way through', () => {
    mountWithViewport();
    expect(calls.length).toBeGreaterThan(0);
  });

  it('is called with the sections array, matching React Native, not the flattened entries', () => {
    mountWithViewport();
    for (const call of calls) {
      expect(call.data).toBe(SECTIONS);
    }
  });

  it('is called with flat entry indices covering header, items and footer', () => {
    mountWithViewport();
    const indices = calls.map(call => call.index);
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(ENTRY_COUNT);
    }
    // The whole 8-entry stream fits the viewport, so the list asks past the first section - which
    // is what proves the index is the FLAT one and not a section-relative index reset per section.
    expect(Math.max(...indices)).toBeGreaterThan(SECTIONS[0].data.length);
  });
});
