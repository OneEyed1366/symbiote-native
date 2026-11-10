// Transform cases of RN's `ScrollView-viewCulling-itest`, same trees and mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  SCROLL_VIEW_MOUNTED,
  createRoot,
  render,
  scrollToY,
  scrollView,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const SCROLL_STYLE = { height: 100, width: 100 };

describe('ScrollView view culling with transforms', () => {
  beforeEach(() => createRoot(100, 100));

  it('culls with a transform move', () => {
    render(
      scrollView(
        { style: SCROLL_STYLE },
        view({
          nativeID: 'child',
          style: {
            height: 10,
            width: 10,
            marginTop: 90,
            transform: [{ translateY: 11 }],
          },
        }),
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(1)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);
  });

  it('culls with a recursive transform move', () => {
    render(
      scrollView(
        { style: SCROLL_STYLE },
        view(
          { style: { transform: [{ translateY: 11 }] } },
          view({
            nativeID: 'child',
            style: { height: 10, width: 10, marginTop: 90 },
          }),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(1)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);
  });

  it('culls with a transform scale', () => {
    render(
      scrollView(
        { style: SCROLL_STYLE },
        view({
          nativeID: 'child',
          style: {
            height: 10,
            width: 10,
            marginTop: 105,
            transform: [{ scale: 2 }],
          },
        }),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(121)).toEqual([
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Delete {type: "View", nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      'Delete {type: "View", nativeID: (N/A)}',
      'Update {type: "ScrollView", nativeID: (N/A)}',
    ]);
  });

  it('culls when the ScrollView parent has a transform', () => {
    render(
      view(
        { style: { transform: [{ translateY: 100 }] } },
        scrollView(
          { style: SCROLL_STYLE },
          view({
            nativeID: 'child',
            style: { height: 10, width: 10, marginTop: 45 },
          }),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      'Insert {type: "ScrollView", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: (N/A)}',
    ]);
  });
});

report();
