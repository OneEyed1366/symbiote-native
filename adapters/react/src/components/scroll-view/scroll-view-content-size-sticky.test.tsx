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
import { STICKY_HEADER_TAG } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 53;

// Recorder owned by the app below; reset per test after fabric.reset().
const contentSizes: Array<[number, number]> = [];

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
beforeEach(() => {
  fabric.reset();
  contentSizes.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function contentNode(): ILiveNode | undefined {
  return live.findLive(
    live.appRoot(),
    node => node.viewName === 'RCTScrollContentView',
  );
}

describe('React reaches the scroll view content-size and sticky seams', () => {
  // Content `onLayout` ставится только если приложение передало колбэк, значит функция-проп
  // доехала до слота, которого адаптер не видит
  it('synthesizes onContentSizeChange from the content onLayout on every layout', () => {
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
    expect(content!.payload.onLayout).toBe(true);

    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 800 },
    });
    expect(contentSizes.length).toBe(1);
    expect(contentSizes[0]).toEqual([320, 800]);

    // Same size again still reports: RN's `_handleContentOnLayout` has no dedupe
    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 800 },
    });
    expect(contentSizes.length).toBe(2);

    fabric.fireEvent(content!.instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: 1_200 },
    });
    expect(contentSizes.length).toBe(3);
    expect(contentSizes[2][1]).toBe(1_200);
  });

  // Дефис-тег должен пройти через JSX-namespace React: нераспознанный `<sticky-header>`
  // закоммитился бы инертным видом без пина
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
    // Тег, который получил движок: сам пин проверяет `sticky-header-payload.itest.ts`
    expect(header.tagName).toBe(STICKY_HEADER_TAG);
    expect(header.children[0]?.viewName).toBe('RCTText');
    // The unflagged sibling stays an ordinary, untouched content child.
    expect(plain.payload.testID).toBe('plain');
    expect(plain.tagName).toBe('');
  });
});
