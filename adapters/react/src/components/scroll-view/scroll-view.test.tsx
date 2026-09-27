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
  it('maps contentContainerStyle onto the content node', () => {
    mount(ROOT_TAG, horizontalApp());

    const content = byName('RCTScrollContentView');
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    // The REDIRECT is the adapter's half and stays: an app writes this on the scroll view and it has
    // to land here. The row direction that used to be asserted beside it is the engine's rule
    // (`core/engine/cpp/tests/js/scroll-content-payload.itest.ts`).
    expect(content!.payload.padding).toBe(8);
  });

  // why: the outer/inner style split must stay strict in both directions — a content-container
  // prop leaking onto the outer node would double-apply padding (Yoga would size the frame by it
  // too), and the outer node's own base clip/axis styles must still be present since native reads
  // them to know how to clip and scroll.
  it('keeps content padding off the outer node', () => {
    mount(ROOT_TAG, horizontalApp());

    const outer = byName('RCTScrollView');
    expect(outer, 'RCTScrollView was created').toBeDefined();
    // `padding` is a content-container style and must NOT leak onto the scroll view node. That is
    // the SLOT ROUTING, which is this adapter's half and still JS.
    expect(Object.hasOwn(outer!.payload, 'padding')).toBe(false);
    // The base style (`flexDirection`, `overflow`) is `foldScrollViewProps`'s rule now, in
    // `scroll-view-payload.itest.ts`; this host's `fabricProps` holds no copy of the tag rules.
  });

  // The axis flag and `nestedScrollEnabled` are `foldScrollViewProps`'s too, asserted in
  // `scroll-view-payload.itest.ts` — each with its own negative control (absent on the vertical
  // tag; an explicit `false` honoured), since a control only controls beside what it controls.

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

  // The vertical base clip — the regression guard for an iOS bleed where a vertical scroll view got
  // NO base style and never clipped — is the engine's rule now, with its "a user style still wins"
  // half beside it: `core/engine/cpp/tests/js/scroll-view-payload.itest.ts`. Nothing about it was
  // ever this adapter's, which is why it moved rather than shrinking to the half that still passes.
  it('reaches a committed RCTScrollView from the bare tag', () => {
    mount(
      ROOT_TAG,
      <scroll-view style={{ height: 120 }}>
        <view />
      </scroll-view>,
    );

    const vertical = byName('RCTScrollView');
    expect(vertical, 'vertical RCTScrollView was created').toBeDefined();
    expect(vertical!.payload.height).toBe(120);
  });
});
