/** @jsxRuntime automatic */
// RN keeps a viewport of cells around the last focused one mounted (`_lastFocusedCellKey`), so
// tabbing around a focused item, or a focused input, survives the window moving away

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
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

const ROOT_TAG = 47;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const DATA: IRow[] = Array.from({ length: 20 }, (_unused, index) => ({
  id: index,
}));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function descendantsOf(handle: ISymbioteNode): ISymbioteNode[] {
  return childrenOf(handle).flatMap(child => [child, ...descendantsOf(child)]);
}

// The live walk, a recording keeps every node it ever saw and would call a gone cell resident
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

function scrollTo(offset: number): void {
  fabric.fireEvent(findScrollView().instanceHandle, 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: ITEM_HEIGHT * DATA.length },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
}

// The text node holding a row, its event bubbles up to the cell around it
function textNodeOf(row: string): ILiveNode {
  const found = live.findLive(live.appRoot(), node =>
    node.children.some(child => child.payload.text === row),
  );
  if (found === undefined) throw new Error(`no node holds ${row}`);
  return found;
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
    initialNumToRender: 2,
    windowSize: 1,
    renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
  });
}

describe('VirtualizedList keeps the focused cell mounted', () => {
  it('holds a viewport around it after the window moves away', () => {
    mount(ROOT_TAG, <App />);
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    scrollTo(800);
    expect(renderedRows(findScrollView().handle)).toContain('row-8');

    fabric.fireEvent(textNodeOf('row-8').instanceHandle, 'topFocus', {});
    scrollTo(1_500);

    const rows = renderedRows(findScrollView().handle);
    expect(rows, 'the focused cell stays').toContain('row-8');
    expect(rows, 'a viewport either side stays').toContain('row-7');
    expect(rows, 'the rest of the old window goes').not.toContain('row-5');
  });

  it('retains nothing when no cell was ever focused', () => {
    mount(ROOT_TAG, <App />);
    fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    scrollTo(800);
    scrollTo(1_500);

    expect(renderedRows(findScrollView().handle)).not.toContain('row-8');
  });
});
