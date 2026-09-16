// The bare `<scroll-view>` / `<horizontal-scroll-view>` tags against the fake Fabric slot: the
// nested RCTScrollView > RCTScrollContentView shape, `contentContainerStyle` landing on the content
// node, the base clip/axis styles on both axes, and the onScroll round-trip.
//
// SCOPE: there is no React ScrollView left to test — the engine owns every one of these
// (`core/components/src/behaviors/scroll-view/`), and `../../register` is what names it. What this
// file proves is that the ADAPTER reaches that behavior: a tag React commits through its own host
// config, with its own JSX namespace and its own prop routing.
//
// TWO ROWS PIN A FOLD THAT WAS ONCE REPORTED AS A CORE GAP AND IS NOT — `horizontal` and
// `nestedScrollEnabled`. See their comments; they exist so the claim is checked here rather than
// re-derived from a wrapper's comment.
//
// No Negative group: nothing in the base-style / content-node assembly throws — a missing or odd
// prop produces a different visual, never a rejection.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 51;

// onScroll payload recorder. Reset per test after fabric.reset().
let scrolled: Record<string, unknown> | undefined;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => {
  fabric.reset();
  scrolled = undefined;
});
afterEach(() => unmount(ROOT_TAG));

function horizontalApp(): React.ReactElement {
  return (
    <horizontal-scroll-view
      contentContainerStyle={{ padding: 8 }}
      onScroll={(event: { nativeEvent: Record<string, unknown> }) => {
        scrolled = event.nativeEvent;
      }}
    >
      <view />
    </horizontal-scroll-view>
  );
}

function byName(name: string): ILiveNode | undefined {
  return live.findLive(live.appRoot(), node => node.viewName === name);
}

// The app's own top-level node, serialized — the counterpart of the old `fabric.serialize`.
function appShape(): string {
  const [child] = live.nodeOf(live.appRoot()).children;
  if (child === undefined)
    throw new Error('the app rendered no top-level node');
  return live.serialize(child.handle);
}

describe('React <scroll-view> on the engine', () => {
  // why: RN's ScrollView is always TWO native views (the scroll frame + a content view Yoga can
  // grow past the frame) — collapsing to one node would break scrolling entirely, since Fabric
  // needs a child larger than its clipped parent to have anything to scroll to. The behavior's
  // `buildStructure` is what builds the second one; nothing in this adapter does.
  it('commits the nested scroll view shape under a box-none AppContainer', () => {
    mount(ROOT_TAG, horizontalApp());
    expect(appShape()).toBe('RCTScrollView(RCTScrollContentView(RCTView))');
  });

  // why: contentContainerStyle styles the SCROLLABLE content, not the clipping frame — it must
  // land on RCTScrollContentView, and the horizontal TAG must flip the content's growth axis
  // (flexDirection: row) so children lay out side-by-side instead of stacking.
  it('maps contentContainerStyle + the horizontal tag onto the content node', () => {
    mount(ROOT_TAG, horizontalApp());

    const content = byName('RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.payload.padding).toBe(8);
    expect(content!.payload.flexDirection).toBe('row');
  });

  // why: the outer/inner style split must stay strict in both directions — a content-container
  // prop leaking onto the outer node would double-apply padding (Yoga would size the frame by it
  // too), and the outer node's own base clip/axis styles must still be present since native reads
  // them to know how to clip and scroll.
  it('keeps content padding off the outer node and gives it the horizontal base style', () => {
    mount(ROOT_TAG, horizontalApp());

    const outer = byName('RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    // `padding` is a content-container style and must NOT leak onto the scroll view node.
    expect(Object.hasOwn(outer!.payload, 'padding')).toBe(false);
    // flexDirection:'row' on the scroll view NODE is RN's styles.baseHorizontal: Yoga sizes the
    // content child along the scroll axis so the row overflows and scrolls.
    expect(outer!.payload.flexDirection).toBe('row');
    // overflow:'scroll' clips content to the frame, RN's base style on both axes.
    expect(outer!.payload.overflow).toBe('scroll');
  });

  // why: this was reported as a missing core fold and it is IMPLEMENTED — `ownerFold`
  // (behaviors/scroll-view/shared.ts) deletes whatever `horizontal` the app wrote and rewrites it
  // from the TAG. On iOS both tags resolve to RCTScrollView, so the boolean is the only thing that
  // tells the native view which axis it scrolls; on Android the tag picks a different ViewManager.
  // The row is here so the next reader checks the behavior rather than a wrapper's comment.
  it('writes `horizontal` from the tag, on both axes', () => {
    mount(ROOT_TAG, horizontalApp());
    expect(byName('RCTScrollView')!.payload.horizontal).toBe(true);

    unmount(ROOT_TAG);
    fabric.reset();
    mount(
      ROOT_TAG,
      <scroll-view>
        <view />
      </scroll-view>,
    );
    // Absent, not `false`: RN's own ScrollView omits the prop on the vertical axis.
    expect(byName('RCTScrollView')!.payload.horizontal).toBeUndefined();
  });

  // why: the second half of the same correction. `nestedScrollEnabled ?? true` was reported as
  // owed by core and is likewise implemented — the behavior defaults it, which is what every
  // wrapper used to write by hand, so a bare tag does NOT lose the default.
  it('defaults nestedScrollEnabled to true and honours an explicit false', () => {
    mount(
      ROOT_TAG,
      <scroll-view>
        <view />
      </scroll-view>,
    );
    expect(byName('RCTScrollView')!.payload.nestedScrollEnabled).toBe(true);

    unmount(ROOT_TAG);
    fabric.reset();
    mount(
      ROOT_TAG,
      <scroll-view nestedScrollEnabled={false}>
        <view />
      </scroll-view>,
    );
    expect(byName('RCTScrollView')!.payload.nestedScrollEnabled).toBe(false);
  });

  // why: onScroll must reach the caller unmodified — RN's ScrollView does no JS-side
  // transformation of the native scroll payload, so re-wrapping or partially copying it here
  // would silently drop fields a consumer (e.g. a parallax header) depends on.
  it('delivers the onScroll native event to the handler verbatim', () => {
    mount(ROOT_TAG, horizontalApp());

    const outer = byName('RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();

    const payload = {
      contentOffset: { x: 0, y: 10 },
      contentSize: { width: 100, height: 400 },
      layoutMeasurement: { width: 100, height: 200 },
    };
    fabric.fireEvent(outer!.instanceHandle, 'topScroll', payload);
    expect(scrolled, 'onScroll fired').toBeDefined();
    expect(scrolled).toBe(payload);
  });

  it('carries the vertical base clip and lets a user style win over it', () => {
    // Regression guard for the iOS bleed: a vertical scroll view used to get NO base style, so
    // overflow was never set and iOS didn't clip. It must match RN's baseVertical.
    mount(
      ROOT_TAG,
      <scroll-view style={{ height: 120 }}>
        <view />
      </scroll-view>,
    );

    const vertical = byName('RCTScrollView');
    expect(vertical, 'vertical RCTScrollView was created').toBeDefined();
    expect(vertical!.payload.overflow).toBe('scroll');
    expect(vertical!.payload.flexDirection).toBe('column');
    // A user style still wins over the base: the explicit height must survive the merge.
    expect(vertical!.payload.height).toBe(120);
  });
});
