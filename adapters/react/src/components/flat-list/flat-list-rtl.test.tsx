/** @jsxRuntime automatic */
// In RTL a horizontal list counts from the right edge: the scroll view reports x from the left, so
// x = 0 is the END of the data. Content length comes from the scroll view's content layout

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/react';
import { I18nManager } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 37;
const CELL = 100;
const VIEWPORT = 300;
const COUNT = 60;
const CONTENT = CELL * COUNT;
const DATA = Array.from({ length: COUNT }, (_unused, index) => ({ id: index }));

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

function renderedRows(): string[] {
  const rows: string[] = [];
  live.walkLive(live.appRoot(), node => {
    const text = node.payload.text;
    if (typeof text === 'string' && text.startsWith('row-')) rows.push(text);
  });
  return rows;
}

function scrollNode(): ILiveNode {
  const node = live.findLive(
    live.appRoot(),
    candidate => candidate.viewName === 'RCTScrollView',
  );
  if (node === undefined) throw new Error('no scroll view committed');
  return node;
}

function contentNode(): ILiveNode {
  const node = live.findLive(
    live.appRoot(),
    candidate => candidate.viewName === 'RCTScrollContentView',
  );
  if (node === undefined) throw new Error('no content view committed');
  return node;
}

function mountList(): void {
  mount(
    ROOT_TAG,
    createElement(FlatList<{ id: number }>, {
      data: DATA,
      horizontal: true,
      keyExtractor: item => `k-${item.id}`,
      getItemLayout: (_data, index) => ({
        length: CELL,
        offset: CELL * index,
        index,
      }),
      renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
    }),
  );
  fabric.fireEvent(scrollNode().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: VIEWPORT, height: 40 },
  });
  fabric.fireEvent(contentNode().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: CONTENT, height: 40 },
  });
}

function scrollTo(x: number): void {
  fabric.fireEvent(scrollNode().instanceHandle, 'topScroll', {
    contentOffset: { x, y: 0 },
    contentSize: { width: CONTENT, height: 40 },
    layoutMeasurement: { width: VIEWPORT, height: 40 },
  });
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  I18nManager.isRTL = false;
});

describe('a horizontal FlatList in RTL', () => {
  it('reads x = 0 as the end of the data', () => {
    I18nManager.isRTL = true;
    mountList();

    scrollTo(0);

    const rows = renderedRows();
    expect(rows.includes('row-59')).toBe(true);
    expect(rows.includes('row-30')).toBe(false);
  });

  it('reads the same event from the left in LTR', () => {
    I18nManager.isRTL = false;
    mountList();

    scrollTo(0);

    const rows = renderedRows();
    expect(rows.includes('row-0')).toBe(true);
    expect(rows.includes('row-59')).toBe(false);
  });
});
