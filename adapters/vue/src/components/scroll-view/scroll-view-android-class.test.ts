// Regression guard for a real bug found converting examples/vue-sfc to the SFC style compiler:
// on Android, when a ScrollView carries BOTH a `class` attribute and a `refreshControl`, the
// class-derived LAYOUT style (flex/height/gap/…) never reached the AndroidSwipeRefreshLayout
// wrapper — only `:style` did — so the wrapper collapsed to nothing and the whole scroll content
// became invisible on a real device (iOS was unaffected, no such wrapper exists there). Root
// cause and fix: shared.ts's `layoutSplitStyle` (userStyle merged with the resolved `class`
// style) now feeds splitLayoutProps instead of userStyle alone. Explicit `.android` import:
// Vitest has no Metro-style platform-extension resolution, unlike the app build.
//
// Unit under test: index.android.ts's `assemble` refreshControl-wrap branch, specifically the
// `splitLayoutProps(input.layoutSplitStyle)` call that feeds the outer AndroidSwipeRefreshLayout.
// splitLayoutProps itself (which props count as "layout") is shared @symbiote-native/components
// logic — not re-asserted here, only that layoutSplitStyle (class+style merged) is what reaches
// it, not userStyle alone.
//
// No Negative group: the class/style merge has no throwing path.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '../../render';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { RefreshControl } from '../refresh-control';
import { ScrollView } from './index.android';

const ROOT_TAG = 512;
// @symbiote-native/components' component-names always resolves its iOS names under Vitest (no Metro
// platform resolution), so the wrapper's Fabric view name is 'PullToRefreshView' regardless of
// which platform ScrollView assemble file is under test.
const REFRESH_WRAPPER_VIEW = 'PullToRefreshView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedRefreshWrapper(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === REFRESH_WRAPPER_VIEW) found = node;
  });
  expect(found, `a ${REFRESH_WRAPPER_VIEW} was committed`).toBeDefined();
  if (found === undefined)
    throw new Error('unreachable: refresh wrapper missing');
  return found;
}

function mountAndroidScrollView(props: Record<string, unknown>): Promise<void> {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h(
          ScrollView,
          {
            ...props,
            refreshControl: h(RefreshControl, { refreshing: false }),
          },
          { default: () => [h('symbiote-text')] },
        ),
    }),
  );
  return tick();
}

describe('Android ScrollView + RefreshControl class/style split', () => {
  describe('Positive (the AndroidSwipeRefreshLayout wrapper always receives the layout style)', () => {
    it('carries a class-derived layout prop onto the refresh wrapper, not just an explicit :style one', async () => {
      // why: the bug this file guards — a class-only layout prop (registered via the shared style
      // registry) is invisible to plain `userStyle`, so before the fix the wrapper never received
      // it and the whole scroll content collapsed on a real Android device.
      registerStyles({ grow: { flex: 1 } });
      await mountAndroidScrollView({ class: 'grow' });

      expect(committedRefreshWrapper().props.flex).toBe(1);
    });

    it('still applies an explicit :style layout prop (no class) onto the wrapper — the pre-fix path', async () => {
      // why: layoutSplitStyle must be additive to the existing :style contract, not a replacement
      // for it — the pre-fix behavior must keep working.
      await mountAndroidScrollView({ style: { flex: 1 } });

      expect(committedRefreshWrapper().props.flex).toBe(1);
    });

    it('merges class and :style layout props onto the wrapper, explicit :style winning on overlap', async () => {
      // why: RN's own class/inline-style precedence rule — the later, more specific :style value
      // must win over a class default on the same property, even after the two are merged for the
      // Android wrap.
      registerStyles({ grow: { flex: 1, height: 100 } });
      await mountAndroidScrollView({ class: 'grow', style: { height: 200 } });

      const wrapper = committedRefreshWrapper();
      expect(wrapper.props.flex).toBe(1);
      expect(wrapper.props.height).toBe(200);
    });
  });
});
