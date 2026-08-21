// The Android RefreshControl WRAP, the one thing index.android.ts does differently. An Android
// ScrollView hosts exactly ONE child, so the RefreshControl cannot be a sibling of the content the
// way iOS allows — it becomes the PARENT and the scroll view nests inside it. React expresses that
// with cloneElement and Vue by re-invoking the VNode's type; Solid receives an element that is
// ALREADY a live engine node, so it nests it imperatively and writes the outer style onto it.
//
// Explicit `./index.android` import: Vitest has no Metro-style platform-extension resolution, and
// @symbiote-native/components' name table always resolves its iOS names here — so the wrapper's
// Fabric view name is 'PullToRefreshView' regardless of which platform file is under test.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { View } from '../view';
import { RefreshControl } from '../refresh-control';
import { ScrollView } from './index.android';

const ROOT_TAG = 820;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const REFRESH_WRAPPER = 'PullToRefreshView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function committed(viewName: string): IFakeNode {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && node.viewName === viewName) found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined) throw new Error(`no ${viewName} was committed`);
  return found;
}

describe('Solid ScrollView on Android with a RefreshControl', () => {
  describe('Positive', () => {
    // why: the whole reason a platform split exists. Left as a sibling, Android throws "addViewAt:
    // failed to insert view … at index 1" — a hard native crash the iOS build never sees.
    it('nests the scroll view INSIDE the refresh control', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView refreshControl={<RefreshControl refreshing={false} />}>
          <View testID="row" />
        </ScrollView>
      ));
      await tick();

      const wrapper = committed(REFRESH_WRAPPER);
      expect(wrapper.children.map(child => child.viewName)).toEqual([
        SCROLL_VIEW,
      ]);
      expect(
        wrapper.children[0]?.children.map(child => child.viewName),
      ).toEqual([CONTENT_VIEW]);
    });

    // why: RN splits the flattened style across the two boxes — LAYOUT props drive the outer
    // AndroidSwipeRefreshLayout frame, VISUAL props paint the inner scroll view. Dumping the whole
    // style on one of them either collapses the wrapper (no height to grow into) or paints the
    // background on the wrong box.
    it('routes the layout half onto the wrapper and the visual half onto the scroll view', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView
          style={{ flex: 1, backgroundColor: '#123456' }}
          refreshControl={<RefreshControl refreshing={false} />}
        >
          <View />
        </ScrollView>
      ));
      await tick();

      expect(committed(REFRESH_WRAPPER).props.flex).toBe(1);
      expect(committed(REFRESH_WRAPPER).props.backgroundColor).toBeUndefined();
      expect(committed(SCROLL_VIEW).props.backgroundColor).toBe('#123456');
      expect(committed(SCROLL_VIEW).props.flex).toBeUndefined();
    });

    // why: the real device bug this guards, found on the Vue adapter first. A class-only layout prop
    // is invisible to `style`, and routeProp resolves a class per-node at COMMIT time — long after
    // splitLayoutProps has already run. Splitting on `style` alone starves the wrapper of its layout
    // style and the whole scroll content becomes invisible on Android while iOS looks perfect.
    it('feeds the wrapper a layout prop that exists only on the class', async () => {
      registerRules([
        {
          tokens: ['screen'],
          specificity: [0, 1, 0],
          order: 0,
          style: { flex: 1 },
        },
      ]);
      mount(ROOT_TAG, () => (
        <ScrollView
          class="screen"
          refreshControl={<RefreshControl refreshing={false} />}
        >
          <View />
        </ScrollView>
      ));
      await tick();

      expect(committed(REFRESH_WRAPPER).props.flex).toBe(1);
      // Stripped from the inner view: layoutSplitStyle already folded the resolved class into
      // outer/inner, so forwarding the raw prop too would re-apply its LAYOUT half a second time.
      expect(committed(SCROLL_VIEW).props.flex).toBeUndefined();
    });

    // why: the inner scroll view must take the gesture BEFORE the refresh parent, or every drag
    // starts a refresh instead of scrolling.
    it('forces nestedScrollEnabled on the inner scroll view', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView
          nestedScrollEnabled={false}
          refreshControl={<RefreshControl refreshing={false} />}
        >
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committed(SCROLL_VIEW).props.nestedScrollEnabled).toBe(true);
    });
  });

  describe('Negative', () => {
    // why: with no RefreshControl the Android build must fall back to the plain single-child shape.
    // An unconditional wrapper would add a native view (and a gesture handler) to every ScrollView.
    it('adds no wrapper when no refreshControl is supplied', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView style={{ flex: 1 }}>
          <View />
        </ScrollView>
      ));
      await tick();

      expect(
        fabric.created.some(node => node.viewName === REFRESH_WRAPPER),
      ).toBe(false);
      // The full style stays on the scroll view when nothing splits it.
      expect(committed(SCROLL_VIEW).props.flex).toBe(1);
    });
  });
});
