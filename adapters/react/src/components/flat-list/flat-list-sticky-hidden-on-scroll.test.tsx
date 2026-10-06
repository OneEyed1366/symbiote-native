/** @jsxRuntime automatic */
// RN's FlatList hands every ScrollView prop to its scroll view, `stickyHeaderHiddenOnScroll`
// included: the pin math is the core runner's, this proves the list forwards the flag

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 33;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function mountList(hiddenOnScroll: boolean | undefined): void {
  mount(
    ROOT_TAG,
    createElement(FlatList<{ id: number }>, {
      data: [{ id: 0 }, { id: 1 }],
      keyExtractor: item => `k-${item.id}`,
      renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
      stickyHeaderIndices: [0],
      stickyHeaderHiddenOnScroll: hiddenOnScroll,
    }),
  );
}

function scrollPayload(): Record<string, unknown> | undefined {
  const scroll = live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollView',
  );
  return scroll?.payload;
}

describe('FlatList stickyHeaderHiddenOnScroll', () => {
  it('reaches the scroll view', () => {
    mountList(true);
    expect(scrollPayload()?.stickyHeaderHiddenOnScroll).toBe(true);
  });

  it('stays off the scroll view when the app never set it', () => {
    mountList(undefined);
    expect(scrollPayload()).toBeDefined();
    expect(scrollPayload()?.stickyHeaderHiddenOnScroll).toBeUndefined();
  });
});
