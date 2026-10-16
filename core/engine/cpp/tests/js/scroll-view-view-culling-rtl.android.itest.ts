// RN's `ScrollView-viewCulling-itest` RTL cases, with the Android horizontal content view name
// @symbiote-fabric-flags {"enableViewCulling":true}

import {
  SCROLL_VIEW_INSERTED,
  createRoot,
  horizontalScrollView,
  render,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const ITEM_STYLE = { height: 90, width: 90, margin: 5 };
const CONTENT_VIEW = 'AndroidHorizontalScrollContentView';

function rtlRow(contentOffset?: { x: number; y: number }) {
  return horizontalScrollView(
    { style: { direction: 'rtl', height: 100, width: 100 }, contentOffset },
    view({ nativeID: 'item1', style: ITEM_STYLE }),
    view({ nativeID: 'item2', style: ITEM_STYLE }),
  );
}

function mountedWith(itemId: string): string[] {
  return [
    'Update {type: "RootView", nativeID: (root)}',
    'Create {type: "ScrollView", nativeID: (N/A)}',
    `Create {type: "${CONTENT_VIEW}", nativeID: (N/A)}`,
    `Create {type: "View", nativeID: "${itemId}"}`,
    `Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "${itemId}"}`,
    `Insert {type: "${CONTENT_VIEW}", parentNativeID: (N/A), index: 0, nativeID: (N/A)}`,
    SCROLL_VIEW_INSERTED,
  ];
}

describe('horizontal ScrollView in RTL script', () => {
  beforeEach(() => createRoot(100, 100));

  it('renders item 1', () => {
    render(rtlRow());

    expect(takeLogs()).toEqual(mountedWith('item1'));
  });

  it('takes contentOffset into account', () => {
    render(rtlRow({ x: 100, y: 0 }));

    expect(takeLogs()).toEqual(mountedWith('item2'));
  });
});

report();
