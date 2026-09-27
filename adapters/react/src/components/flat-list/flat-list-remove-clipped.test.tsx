// FlatList's removeClippedSubviews, against RN's FlatList.js: the list ALWAYS sends it to its
// ScrollView, defaulting to `Platform.OS === 'android'` when the app sets none.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, Platform, mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

const ROOT_TAG = 33;

const data = ['a', 'b', 'c'];

function App(props: {
  removeClippedSubviews?: boolean;
  nestedScrollEnabled?: boolean;
  inverted?: boolean;
  style?: { transform: Array<{ rotate: string }> };
}): ReactElement {
  return createElement(FlatList<string>, {
    data,
    keyExtractor: (item: string) => item,
    renderItem: ({ item }: { item: string }) =>
      createElement('view', { key: item, style: { height: 10 } }),
    ...props,
  });
}

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function scrollPayload(): Record<string, unknown> {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no RCTScrollView created');
  return payloadOf(node.handle);
}

function withPlatformOS(os: string, run: () => void): void {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
}

describe('FlatList removeClippedSubviews (Positive — no throwing path)', () => {
  // why: RN sends `removeClippedSubviews ?? Platform.OS === 'android'` — false on iOS, explicitly.
  it('sends false on iOS when the app sets none', () => {
    mount(ROOT_TAG, createElement(App));
    expect(scrollPayload().removeClippedSubviews).toBe(false);
  });

  // why: Android clips off-screen rows by default in RN.
  it('sends true on Android when the app sets none', () => {
    withPlatformOS('android', () => {
      mount(ROOT_TAG, createElement(App));
      expect(scrollPayload().removeClippedSubviews).toBe(true);
    });
  });

  // why: an authored value always reaches the ScrollView.
  it('forwards an authored value on either platform', () => {
    mount(ROOT_TAG, createElement(App, { removeClippedSubviews: true }));
    expect(scrollPayload().removeClippedSubviews).toBe(true);
  });

  // why: RN's VirtualizedList spreads its props onto the ScrollView; a list nested in a vertical
  // scroller on Android scrolls only with nestedScrollEnabled.
  it('forwards nestedScrollEnabled to the scroll view', () => {
    mount(ROOT_TAG, createElement(App, { nestedScrollEnabled: true }));
    expect(scrollPayload().nestedScrollEnabled).toBe(true);
  });
});

describe('VirtualizedList isInvertedVirtualizedList (Positive — no throwing path)', () => {
  // why: VirtualizedList.js:1111 sends `isInvertedVirtualizedList: inverted`, which Android's
  // scroll view uses to move the scrollbar back after the `scale: -1` flip.
  it('tells the scroll view whether the list is inverted', () => {
    mount(ROOT_TAG, createElement(App, { inverted: true }));
    expect(scrollPayload().isInvertedVirtualizedList).toBe(true);
  });

  // why: RN composes `[inversionStyle, style]`, so the app's own transform wins over the flip.
  it('lets the app style override the inversion flip', () => {
    const transform = [{ rotate: '0deg' }];
    mount(
      ROOT_TAG,
      createElement(App, { inverted: true, style: { transform } }),
    );
    expect(scrollPayload().transform).toEqual(transform);
  });
});
