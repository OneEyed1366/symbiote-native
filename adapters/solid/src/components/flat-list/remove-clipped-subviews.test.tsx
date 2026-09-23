// FlatList's removeClippedSubviews, against RN's FlatList.js: the list ALWAYS sends it to its
// ScrollView, defaulting to `Platform.OS === 'android'` when the app sets none.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Platform } from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import '../../register';
import { FlatList } from './index';

const ROOT_TAG = 824;

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function scrollPayload(): Record<string, unknown> {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no RCTScrollView created');
  return payloadOf(node.handle);
}

async function mountList(removeClippedSubviews?: boolean): Promise<void> {
  mount(ROOT_TAG, () => (
    <FlatList<string>
      data={['a', 'b']}
      removeClippedSubviews={removeClippedSubviews}
      renderItem={info => <text>{info().item}</text>}
    />
  ));
  await tick();
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

describe('Solid FlatList removeClippedSubviews (Positive — no throwing path)', () => {
  // why: RN sends `removeClippedSubviews ?? Platform.OS === 'android'` — false on iOS, explicitly.
  it('sends false on iOS when the app sets none', async () => {
    await mountList();
    expect(scrollPayload().removeClippedSubviews).toBe(false);
  });

  // why: Android clips off-screen rows by default in RN.
  it('sends true on Android when the app sets none', async () => {
    await withPlatformOS('android', async () => {
      await mountList();
      expect(scrollPayload().removeClippedSubviews).toBe(true);
    });
  });

  // why: an authored value always reaches the ScrollView.
  it('forwards an authored value', async () => {
    await mountList(true);
    expect(scrollPayload().removeClippedSubviews).toBe(true);
  });

  // why: RN's VirtualizedList spreads its props onto the ScrollView; a list nested in a vertical
  // scroller on Android scrolls only with nestedScrollEnabled.
  it('forwards nestedScrollEnabled to the scroll view', async () => {
    mount(ROOT_TAG, () => (
      <FlatList<string>
        data={['a', 'b']}
        nestedScrollEnabled
        renderItem={info => <text>{info().item}</text>}
      />
    ));
    await tick();
    expect(scrollPayload().nestedScrollEnabled).toBe(true);
  });
});

const appTransform = [{ rotate: '0deg' }];

async function mountInverted(): Promise<void> {
  mount(ROOT_TAG, () => (
    <FlatList<string>
      data={['a', 'b']}
      inverted
      style={{ transform: appTransform }}
      renderItem={info => <text>{info().item}</text>}
    />
  ));
  await tick();
}

describe('Solid VirtualizedList inversion (Positive — no throwing path)', () => {
  // why: VirtualizedList.js:1111 sends `isInvertedVirtualizedList: inverted` for Android's scrollbar.
  it('tells the scroll view whether the list is inverted', async () => {
    await mountInverted();
    expect(scrollPayload().isInvertedVirtualizedList).toBe(true);
  });

  // why: RN composes `[inversionStyle, style]`, so the app's own transform wins over the flip.
  it('lets the app style override the inversion flip', async () => {
    await mountInverted();
    expect(scrollPayload().transform).toEqual(appTransform);
  });
});
