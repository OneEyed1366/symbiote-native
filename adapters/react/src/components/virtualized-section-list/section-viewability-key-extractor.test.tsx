/** @jsxRuntime automatic */
// RN #46588: with `onViewableItemsChanged` the section's `keyExtractor` also got section objects

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedSectionList, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 36;

type IRow = { nested: { id: string } };
type ISectionShape = {
  title: string;
  data: readonly IRow[];
  keyExtractor: (item: IRow) => string;
};

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function showViewport(): void {
  const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
  if (scrollView === undefined) throw new Error('RCTScrollView missing');
  fabric.fireEvent(scrollView.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: 400 },
  });
}

describe('a section keyExtractor with onViewableItemsChanged', () => {
  it('only ever sees the section items', () => {
    const seen: unknown[] = [];
    const sections: ISectionShape[] = [
      {
        title: 'S',
        data: [{ nested: { id: 'a' } }, { nested: { id: 'b' } }],
        keyExtractor: item => {
          seen.push(item);
          return item.nested.id;
        },
      },
    ];
    function App(): ReactElement {
      return createElement(VirtualizedSectionList<IRow>, {
        sections,
        keyExtractor: (item: IRow) => item.nested.id,
        onViewableItemsChanged: () => undefined,
        renderItem: ({ item }: { item: IRow }) =>
          createElement('text', {}, `row:${item.nested.id}`),
      });
    }

    mount(ROOT_TAG, <App />);
    showViewport();

    expect(live.texts(live.appRoot())).toContain('row:a');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every(item => 'nested' in Object(item))).toBe(true);
  });
});
