// Solid twin of adapters/react's scroll-view tests and adapters/vue's. Drives REAL compiled Solid
// JSX (the vitest `solid` project runs the same babel-preset-solid options the app-facing
// babel-preset.cjs pins) through the universal renderer into the fake Fabric slot: the nested
// scroll-view/content-view shape, the per-axis intrinsics, the class-name contentContainerStyle, the
// imperative handle, the synthesized onContentSizeChange, and the iOS sibling RefreshControl.
//
// Two cases have no counterpart in the React file and exist because Solid's lifecycle is the one
// thing NOT shared with it: a component body runs ONCE, and `insert` REPLACES instead of diffing.
// "A later prop change still reaches the host node" and "it reaches it as a re-prop on the SAME
// node, not a rebuilt one" are real, silently-breakable claims here rather than tautologies, and the
// createNode counter is the only headless line between the two.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { View } from '../view';
import { RefreshControl } from '../refresh-control';
import { ScrollView } from './index';
import type { IScrollViewHandle } from './index';

const ROOT_TAG = 817;
const SCROLL_VIEW = 'RCTScrollView';
const CONTENT_VIEW = 'RCTScrollContentView';
const REFRESH_CONTROL = 'PullToRefreshView';
const MARKER = 'scroll-child';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
});
afterEach(() => unmount(ROOT_TAG));

// The created node's props are frozen at first commit (clone-on-write hands back a new object), so
// anything asserted after an update has to be read off the live committed tree.
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

function committedOrUndefined(viewName: string): IFakeNode | undefined {
  try {
    return committed(viewName);
  } catch {
    return undefined;
  }
}

describe('Solid ScrollView on the engine', () => {
  describe('Positive', () => {
    // why: RN's ScrollView is a NESTED pair — the scroll view pans a single content view that holds
    // the children. A flat tree looks identical in JS and simply does not scroll on a device, and on
    // Android a second direct child of the scroll view is an outright addViewAt crash.
    it('commits the nested scroll-view / content-view pair with the children inside the content', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView>
          <View testID={MARKER} />
        </ScrollView>
      ));
      await tick();

      const scroll = committed(SCROLL_VIEW);
      expect(scroll.children).toHaveLength(1);
      const content = scroll.children[0];
      expect(content?.viewName).toBe(CONTENT_VIEW);
      expect(content?.children[0]?.props.testID).toBe(MARKER);
    });

    // why: the content view is a layout-only view that Android Fabric flattens away, hoisting the
    // cells up as DIRECT children of the scroll view — which hosts exactly one. RN pins its own
    // content view the same way.
    it('keeps the content view un-flattened with collapsable false', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView>
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committed(CONTENT_VIEW).props.collapsable).toBe(false);
    });

    // why: `flexDirection: 'row'` on the content is what makes the single content child a MAIN-axis
    // item, so Yoga sizes it to its content width and there is something to scroll. Without it the
    // child is stretched to the viewport and a horizontal ScrollView never scrolls.
    it('lays the content out along the scroll axis when horizontal', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView horizontal>
          <View />
        </ScrollView>
      ));
      await tick();

      expect(committed(CONTENT_VIEW).props.flexDirection).toBe('row');
      // Forwarded even though Android has a dedicated horizontal ViewManager: it is load-bearing on
      // iOS, where it flips RCTScrollView's own axis.
      expect(committed(SCROLL_VIEW).props.horizontal).toBe(true);
    });

    // why: contentContainerStyle accepting only a style object silently dropped a class name, and
    // the resolved style must land on the CONTENT container, never the outer view that pans it.
    it('resolves a contentContainerStyle class name onto the content view alone', async () => {
      registerStyles({ padded: { padding: 20 } });
      mount(ROOT_TAG, () => (
        <ScrollView contentContainerStyle="padded">
          <View />
        </ScrollView>
      ));
      await tick();

      expect(committed(CONTENT_VIEW).props.padding).toBe(20);
      expect(committed(SCROLL_VIEW).props.padding).toBeUndefined();
    });

    // why: `scrollTo` is a native view COMMAND, not a prop, so it needs the node's committed Fabric
    // handle. This adapter commits on a microtask, so the node has no handle when the handle is
    // handed out — only the lazy getter inside buildScrollViewHandle makes the later call land.
    it('drives the imperative handle onto the scroll node', async () => {
      let scroller: IScrollViewHandle | undefined;
      mount(ROOT_TAG, () => (
        <ScrollView
          ref={handle => {
            scroller = handle;
          }}
        >
          <View />
        </ScrollView>
      ));
      await tick();

      scroller?.scrollTo({ x: 5, y: 40, animated: false });
      scroller?.scrollToEnd({ animated: true });
      scroller?.flashScrollIndicators();

      expect(fabric.commands.map(command => command.commandName)).toEqual([
        'scrollTo',
        'scrollToEnd',
        'flashScrollIndicators',
      ]);
      expect(fabric.commands[0]?.args).toEqual([5, 40, false]);
      expect(fabric.commands[1]?.args).toEqual([true]);
      expect(fabric.commands[0]?.node.viewName).toBe(SCROLL_VIEW);
    });

    // why: the handle is captured at setup, long before the node exists. An eager `getNode` capture
    // would freeze `null` and every command would silently no-op — the failure mode the lazy getter
    // in buildScrollViewHandle exists for.
    it('reports the live scroll node through getScrollNode after the commit', async () => {
      let scroller: IScrollViewHandle | undefined;
      mount(ROOT_TAG, () => (
        <ScrollView
          ref={handle => {
            scroller = handle;
          }}
        >
          <View />
        </ScrollView>
      ));
      await tick();

      expect(scroller?.getScrollNode()).not.toBeNull();
    });

    // why: RN synthesizes onContentSizeChange from the CONTENT view's onLayout, which Yoga re-fires
    // on every layout pass. Without the dedupe an app handler that measures or sets state runs on
    // every pass, which is how a layout loop starts.
    it('synthesizes onContentSizeChange from the content layout and dedupes an unchanged size', async () => {
      const sizes: Array<[number, number]> = [];
      mount(ROOT_TAG, () => (
        <ScrollView
          onContentSizeChange={(width, height) => {
            sizes.push([width, height]);
          }}
        >
          <View />
        </ScrollView>
      ));
      await tick();

      const content = committed(CONTENT_VIEW);
      const layout = { layout: { x: 0, y: 0, width: 100, height: 200 } };
      fabric.fireEvent(content.instanceHandle, 'topLayout', layout);
      fabric.fireEvent(content.instanceHandle, 'topLayout', layout);
      fabric.fireEvent(content.instanceHandle, 'topLayout', {
        layout: { x: 0, y: 0, width: 100, height: 260 },
      });

      expect(sizes).toEqual([
        [100, 200],
        [100, 260],
      ]);
    });

    // why: onContentSizeChange is pure JS, not a ViewConfig prop — leaking it onto the native bag
    // crashes Android's folly::dynamic serializer the moment it tries to stringify a function. The
    // sticky props are the same class of leak in the other direction: native ignores them, so
    // forwarding is a silent no-op that hides the missing JS implementation.
    it('never forwards its JS-only props onto the native bag', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView
          onContentSizeChange={() => {}}
          stickyHeaderIndices={[0]}
          invertStickyHeaders
        >
          <View />
        </ScrollView>
      ));
      await tick();

      const props = committed(SCROLL_VIEW).props;
      expect('onContentSizeChange' in props).toBe(false);
      expect('stickyHeaderIndices' in props).toBe(false);
      expect('invertStickyHeaders' in props).toBe(false);
      expect('contentContainerStyle' in props).toBe(false);
    });

    // why: 'normal'/'fast' resolve to DIFFERENT friction constants per platform (iOS glides longer),
    // and native reads a NUMBER. Passing the string through leaves momentum scrolling at the native
    // default and the difference is invisible except on a device.
    it('resolves a named decelerationRate to its numeric constant', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView decelerationRate="fast">
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committed(SCROLL_VIEW).props.decelerationRate).toBe(0.99);
    });

    // why: RN defaults nested scrolling ON. Android needs the flag for a scrollable nested inside
    // another to scroll at all, so an unset prop must arrive as `true`, not as absent.
    it('defaults nestedScrollEnabled to true and honours an explicit false', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView>
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committed(SCROLL_VIEW).props.nestedScrollEnabled).toBe(true);
      unmount(ROOT_TAG);
      fabric.reset();

      mount(ROOT_TAG, () => (
        <ScrollView nestedScrollEnabled={false}>
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committed(SCROLL_VIEW).props.nestedScrollEnabled).toBe(false);
    });

    // why: maintainVisibleContentPosition anchors against the metrics of MOUNTED cell views, and
    // Android Fabric flattens layout-only cells away — so the native helper has nothing to anchor to
    // and the list jumps on prepend. RN keeps the cells real with collapsableChildren on the content
    // container. iOS never flattens, so this is invisible until an Android device.
    it('keeps the content cells un-flattened for maintainVisibleContentPosition', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView maintainVisibleContentPosition={{ minIndexForVisible: 0 }}>
          <View />
        </ScrollView>
      ));
      await tick();

      expect(committed(CONTENT_VIEW).props.collapsableChildren).toBe(false);
      // The prop itself is a real native prop and still has to reach the scroll view.
      expect(
        committed(SCROLL_VIEW).props.maintainVisibleContentPosition,
      ).toEqual({
        minIndexForVisible: 0,
      });
    });

    // why: the keyboard props are read by native DIRECTLY (no JS wiring), so the only way to get
    // them wrong is to swallow them in the handled-props split. A ScrollView that never dismisses
    // the keyboard on drag looks like a native bug rather than a dropped prop.
    it('forwards the keyboard props straight to the native scroll view', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <View />
        </ScrollView>
      ));
      await tick();

      const props = committed(SCROLL_VIEW).props;
      expect(props.keyboardDismissMode).toBe('on-drag');
      expect(props.keyboardShouldPersistTaps).toBe('handled');
    });

    // why: the scroll AXIS selects a different host TAG — on Android horizontal is a SEPARATE
    // ViewManager — and Solid cannot swap a tag under a live node, so a flip has to REBUILD, exactly
    // as React remounts on an element-type change. The tag difference itself is unreachable here
    // (the shared name table always resolves its iOS names under vitest, where both axes are
    // RCTScrollView), so the node-recreation count is its only headless proxy — and the risk the
    // rebuild buys, losing the children on the way, is asserted alongside it.
    it('rebuilds and keeps its children when the scroll axis flips', async () => {
      const [horizontal, setHorizontal] = createSignal(false);
      mount(ROOT_TAG, () => (
        <ScrollView horizontal={horizontal()}>
          <View testID={MARKER} />
        </ScrollView>
      ));
      await tick();
      expect(committed(CONTENT_VIEW).props.flexDirection).toBeUndefined();
      const createdAtMount = fabric.counts.createNode;

      setHorizontal(true);
      await tick();

      expect(
        fabric.counts.createNode,
        'the axis flip must rebuild the host tags',
      ).toBeGreaterThan(createdAtMount);
      expect(committed(CONTENT_VIEW).props.flexDirection).toBe('row');
      expect(committed(CONTENT_VIEW).children[0]?.props.testID).toBe(MARKER);
      expect(committed(SCROLL_VIEW).props.horizontal).toBe(true);
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside an accessor precisely so a
    // later change still reaches the host node; a single destructure would freeze the ScrollView at
    // its mount-time config while every other test in this file still passed. The node counter is
    // the other half of the claim — a re-prop must not become a re-render.
    it('re-props the same native node when the parent updates a prop after mount', async () => {
      const [enabled, setEnabled] = createSignal(true);
      mount(ROOT_TAG, () => (
        <ScrollView scrollEnabled={enabled()}>
          <View />
        </ScrollView>
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(committed(SCROLL_VIEW).props.scrollEnabled).toBe(true);

      setEnabled(false);
      await tick();

      expect(committed(SCROLL_VIEW).props.scrollEnabled).toBe(false);
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: on iOS the RefreshControl is a CHILD of the scroll view, placed BEFORE the content
    // container (RN ScrollView.js: {refreshControl}{contentContainer}). Placed after it, or outside,
    // the pull gesture never reaches it.
    it('renders the iOS RefreshControl as a sibling before the content container', async () => {
      mount(ROOT_TAG, () => (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => {}} />
          }
        >
          <View />
        </ScrollView>
      ));
      await tick();

      const scroll = committed(SCROLL_VIEW);
      expect(scroll.children.map(child => child.viewName)).toEqual([
        REFRESH_CONTROL,
        CONTENT_VIEW,
      ]);
      expect(scroll.children[0]?.props.refreshing).toBe(false);
    });

    // why: RefreshControl is CONTROLLED — native flips its own spinner on the gesture and only the
    // pushed-down `refreshing` prop takes it back down, so a frozen prop leaves the spinner up
    // forever. The node counter is the Solid half of the claim: the element is captured ONCE, so the
    // update has to reach it as a re-prop on the SAME PullToRefreshView, never as a second one.
    it('pushes a refreshing change down to the same committed refresh control', async () => {
      const [refreshing, setRefreshing] = createSignal(false);
      mount(ROOT_TAG, () => (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing()} />}
        >
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committed(REFRESH_CONTROL).props.refreshing).toBe(false);
      const createdAtMount = fabric.counts.createNode;

      setRefreshing(true);
      await tick();
      expect(committed(REFRESH_CONTROL).props.refreshing).toBe(true);
      expect(
        fabric.created.filter(node => node.viewName === REFRESH_CONTROL),
      ).toHaveLength(1);
      expect(
        fabric.counts.createNode,
        'the refresh control kept its identity',
      ).toBe(createdAtMount);
    });
  });

  describe('Negative', () => {
    // why: contentContainerStyle has no throwing path by contract — an unresolvable value must
    // degrade to `undefined` rather than crash the whole scroll render, which is what a bad prop
    // from user data would otherwise do.
    it('drops an unresolvable contentContainerStyle rather than throwing', async () => {
      mount(ROOT_TAG, () => (
        // A number is neither a class name nor a style object; the resolver's else-branch takes it.
        <ScrollView contentContainerStyle={undefined}>
          <View />
        </ScrollView>
      ));
      await tick();
      expect(committedOrUndefined(CONTENT_VIEW)).toBeDefined();
    });

    // why: an app that renders no children at all must still commit the pair, or the first
    // `<ScrollView />` with a conditional body blanks the screen instead of showing an empty region.
    it('commits the pair with no children', async () => {
      mount(ROOT_TAG, () => <ScrollView />);
      await tick();
      expect(committed(SCROLL_VIEW).children[0]?.viewName).toBe(CONTENT_VIEW);
    });
  });
});
