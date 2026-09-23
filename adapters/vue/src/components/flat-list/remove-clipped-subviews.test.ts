// FlatList's removeClippedSubviews, against RN's FlatList.js: the list ALWAYS sends it to its
// ScrollView, defaulting to `Platform.OS === 'android'` when the app sets none.

import {
  defineComponent,
  h,
  type FunctionalComponent,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlatList, Platform, mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

// Generic-component limitation (see flat-list.test.ts): drive FlatList through a loose functional
// handle rather than the typed construct signature h() can't resolve imperatively.
const FlatListHost = FlatList as unknown as FunctionalComponent<
  Record<string, unknown>
>;

const ROOT_TAG = 516;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function mountFlatList(props: Record<string, unknown>): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          FlatListHost,
          { data: ['a', 'b'], ...props },
          { item: ({ item }: { item: string }) => [h('text', {}, item)] },
        ),
    }),
  );
  return tick();
}

function scrollPayload(): Record<string, unknown> {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no RCTScrollView created');
  return payloadOf(node.handle);
}

async function withPlatformOS(
  os: string,
  run: () => Promise<void>,
): Promise<void> {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  try {
    await run();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
}

describe('Vue FlatList removeClippedSubviews (Positive — no throwing path)', () => {
  // why: RN sends `removeClippedSubviews ?? Platform.OS === 'android'` — false on iOS, explicitly.
  it('sends false on iOS when the app sets none', async () => {
    await mountFlatList({});
    expect(scrollPayload().removeClippedSubviews).toBe(false);
  });

  // why: Android clips off-screen rows by default in RN.
  it('sends true on Android when the app sets none', async () => {
    await withPlatformOS('android', async () => {
      await mountFlatList({});
      expect(scrollPayload().removeClippedSubviews).toBe(true);
    });
  });

  // why: an authored value always reaches the ScrollView.
  it('forwards an authored value', async () => {
    await mountFlatList({ removeClippedSubviews: true });
    expect(scrollPayload().removeClippedSubviews).toBe(true);
  });

  // why: RN's VirtualizedList spreads its props onto the ScrollView; a list nested in a vertical
  // scroller on Android scrolls only with nestedScrollEnabled.
  it('forwards nestedScrollEnabled to the scroll view', async () => {
    await mountFlatList({ nestedScrollEnabled: true });
    expect(scrollPayload().nestedScrollEnabled).toBe(true);
  });
});

describe('Vue VirtualizedList inversion (Positive — no throwing path)', () => {
  // why: VirtualizedList.js:1111 sends `isInvertedVirtualizedList: inverted` for Android's scrollbar.
  it('tells the scroll view whether the list is inverted', async () => {
    await mountFlatList({ inverted: true });
    expect(scrollPayload().isInvertedVirtualizedList).toBe(true);
  });

  // why: RN composes `[inversionStyle, style]`, so the app's own transform wins over the flip.
  it('lets the app style override the inversion flip', async () => {
    const transform = [{ rotate: '0deg' }];
    await mountFlatList({ inverted: true, style: { transform } });
    expect(scrollPayload().transform).toEqual(transform);
  });
});
