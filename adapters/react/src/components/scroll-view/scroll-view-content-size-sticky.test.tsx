// Two ScrollView features that have no native event or native prop behind them, reached from
// REACT: `onContentSizeChange` (RN synthesizes it from an onLayout on the inner content node,
// ScrollView.js _handleContentOnLayout) and sticky headers (RN pins them purely in JS).
//
// SCOPE — this file is deliberately thin, and the reason is the whole point of the migration. The
// synthesis, the dedupe, the pin's translateY, the collision point below each header, the
// throttle it raises and gives back, the index form and the tag form agreeing: all of that is the
// ENGINE's, exhaustively covered at `core/components/src/behaviors/scroll-view/{scroll-view,
// sticky,sticky-indices}.test.ts`. Re-asserting it here would be a second copy of someone else's
// contract. What is React's, and only React's, is whether a prop and a tag written in ITS JSX
// reach that behavior at all — a callback prop through its host config, a hyphenated intrinsic
// through its own JSX namespace.
//
// `StickyHeaderComponent` is GONE with the wrapper and is not replaced. It was an override for a
// JS wrapping pass that no longer happens in this adapter, and the collision point now comes from
// the owner's DOCUMENT order — so there is no component for an app to substitute.
//
// No Negative group: a bad stickyHeaderIndices entry matches no child, and nothing throws.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 53;

// Recorder owned by the app below; reset per test after fabric.reset().
const contentSizes: Array<[number, number]> = [];

const fabric = installFabric();
beforeEach(() => {
  fabric.reset();
  contentSizes.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function contentNode(): IFakeNode | undefined {
  return fabric.find(node => node.viewName === 'RCTScrollContentView');
}

describe('React reaches the scroll view content-size and sticky seams', () => {
  // why: the behavior installs the content onLayout ONLY when the app passed the callback, so this
  // is also the proof that React's prop routing delivers a FUNCTION prop to a slot node the
  // adapter never sees. A `.tsx` call site that type-checks and commits nothing looks identical.
  it('synthesizes onContentSizeChange from the content onLayout and dedupes', () => {
    mount(
      ROOT_TAG,
      <scroll-view
        onContentSizeChange={(width: number, height: number) => {
          contentSizes.push([width, height]);
        }}
      >
        <view />
      </scroll-view>,
    );

    const content = contentNode();
    expect(content, 'RCTScrollContentView was created').toBeDefined();
    expect(content!.props.onLayout).toBe(true);

    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 800 },
    });
    expect(contentSizes.length).toBe(1);
    expect(contentSizes[0]).toEqual([320, 800]);

    // Same size again -> deduped, no second call (RN's behavior).
    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 800 },
    });
    expect(contentSizes.length).toBe(1);

    // Changed -> fires again.
    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 1200 },
    });
    expect(contentSizes.length).toBe(2);
    expect(contentSizes[1][1]).toBe(1200);
  });

  // why: no native support at all — an un-collapsed view carrying a translateY IS the feature, so
  // a flattened wrapper would silently kill stickiness. Here the discriminator is that React
  // committed the hyphenated tag through its own JSX namespace and the behavior found it: a
  // `<sticky-header>` React failed to resolve would commit as an inert unknown view with none of
  // these props.
  it('pins a <sticky-header> child written in its own JSX', () => {
    mount(
      ROOT_TAG,
      <scroll-view>
        <sticky-header>
          <text>H0</text>
        </sticky-header>
        <view testID="plain" />
      </scroll-view>,
    );

    const content = contentNode();
    expect(content, 'RCTScrollContentView was created').toBeDefined();

    const [header, plain] = content!.children;
    expect(
      header,
      'the sticky header is the first content child',
    ).toBeDefined();
    // collapsable:false is what stops Yoga flattening the node the pin's transform rides on — a
    // flattened header has nothing to animate. Asserted at CREATE, which is the only sticky state
    // this file owns: the translateY itself needs a measurement, and core's `sticky.test.ts`
    // drives that round trip.
    expect(header.props.collapsable).toBe(false);
    expect(header.children[0]?.viewName).toBe('RCTText');
    // The unflagged sibling stays an ordinary, untouched content child.
    expect(plain.props.testID).toBe('plain');
    expect(plain.props.collapsable).toBeUndefined();
  });
});
