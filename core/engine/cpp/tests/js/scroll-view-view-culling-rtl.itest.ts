// RTL horizontal cases of RN's `ScrollView-viewCulling-itest`, same culling and mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  SCROLL_VIEW_MOUNTED,
  createRoot,
  horizontalScrollView,
  render,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const ITEM_STYLE = { height: 90, width: 90, margin: 5 };

function rtlRow(contentOffset?: { x: number; y: number }) {
  return horizontalScrollView(
    { style: { direction: 'rtl', height: 100, width: 100 }, contentOffset },
    view({ nativeID: 'item1', style: ITEM_STYLE }),
    view({ nativeID: 'item2', style: ITEM_STYLE }),
  );
}

// The headless name table is iOS, so the content is a `View` where Android says
// `AndroidHorizontalScrollContentView`
function mountedWith(itemId: string): string[] {
  return [
    ...SCROLL_VIEW_MOUNTED,
    `Create {type: "View", nativeID: "${itemId}"}`,
    `Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "${itemId}"}`,
    CONTENT_INSERTED,
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
