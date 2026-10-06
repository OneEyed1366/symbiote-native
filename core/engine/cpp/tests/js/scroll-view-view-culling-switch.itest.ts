// Flatten-switch and nested ScrollView cases of RN's `ScrollView-viewCulling-itest`, same logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import type { ReactElement } from 'react';

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  createRoot,
  horizontalScrollView,
  render,
  scrollToY,
  scrollView,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const SCROLL_STYLE = { height: 100, width: 100 };
const CREATE_VIEW = 'Create {type: "View", nativeID: (N/A)}';
const REMOVE_ANON =
  'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}';
const DELETE_ANON = 'Delete {type: "View", nativeID: (N/A)}';
const REVEALED_GRANDCHILD = [
  'Update {type: "ScrollView", nativeID: (N/A)}',
  'Create {type: "View", nativeID: "grandchild"}',
  'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "grandchild"}',
];

// `grandchild` inside `inner` inside `outer`; `opacity` 0 keeps a wrapper unflattened
function pair(
  outerOpacity: number | undefined,
  innerOpacity: number | undefined,
  grandchild: Record<string, unknown>,
): ReactElement {
  return scrollView(
    { style: SCROLL_STYLE, contentOffset: { x: 0, y: 60 } },
    view(
      { style: { marginTop: 100, opacity: outerOpacity } },
      view(
        { style: { marginTop: 50, opacity: innerOpacity } },
        view({ nativeID: 'grandchild', style: grandchild }),
      ),
    ),
  );
}

// A wrapper holding a horizontal ScrollView that is scrolled past its content
function nestedScroll(
  outerStyle: Record<string, unknown>,
  wrapperId?: string,
): ReactElement {
  return scrollView(
    { style: outerStyle },
    view(
      { nativeID: wrapperId },
      horizontalScrollView(
        { contentOffset: { x: 15, y: 0 }, style: SCROLL_STYLE },
        view({ nativeID: 'child', style: { width: 10, height: 10 } }),
      ),
    ),
  );
}

const CULLED_GRANDCHILD = { height: 10, width: 10, marginTop: 11 };

const TWO_WRAPPERS_MOUNTED = [
  'Update {type: "RootView", nativeID: (root)}',
  'Create {type: "ScrollView", nativeID: (N/A)}',
  CREATE_VIEW,
  CREATE_VIEW,
  CONTENT_INSERTED,
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
];

describe('ScrollView view culling while switching flattening', () => {
  beforeEach(() => createRoot(100, 100));

  it('switches unflattened-flattened to flattened-unflattened, grandchild culled', () => {
    render(pair(0, undefined, CULLED_GRANDCHILD));

    // `grandchild` is not mounted
    expect(takeLogs()).toEqual(TWO_WRAPPERS_MOUNTED);

    render(pair(undefined, 0, CULLED_GRANDCHILD));

    expect(takeLogs()).toEqual([
      REMOVE_ANON,
      DELETE_ANON,
      CREATE_VIEW,
      CONTENT_INSERTED,
    ]);

    expect(scrollToY(70)).toEqual(REVEALED_GRANDCHILD);
  });

  it('switches flattened-unflattened to unflattened-flattened, grandchild culled', () => {
    render(pair(undefined, 0, CULLED_GRANDCHILD));

    expect(takeLogs()).toEqual(TWO_WRAPPERS_MOUNTED);

    render(pair(0, undefined, CULLED_GRANDCHILD));

    expect(takeLogs()).toEqual([
      REMOVE_ANON,
      DELETE_ANON,
      CREATE_VIEW,
      CONTENT_INSERTED,
    ]);

    expect(scrollToY(70)).toEqual(REVEALED_GRANDCHILD);
  });

  it('switches flattened-unflattened to unflattened-flattened', () => {
    const visibleGrandchild = { height: 10, width: 10 };

    render(pair(undefined, 0, visibleGrandchild));

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "grandchild"}',
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(pair(0, undefined, visibleGrandchild));

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "grandchild"}',
      REMOVE_ANON,
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "grandchild"}',
      DELETE_ANON,
      CREATE_VIEW,
      CONTENT_INSERTED,
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "grandchild"}',
    ]);
  });

  it('keeps a nested ScrollView when its wrapper is unflattened', () => {
    render(nestedScroll(SCROLL_STYLE));

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Insert {type: "ScrollView", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(nestedScroll({ ...SCROLL_STYLE, padding: 1 }, 'unflattened'));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Update {type: "View", nativeID: (N/A)}',
      'Remove {type: "ScrollView", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      'Create {type: "View", nativeID: "unflattened"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "unflattened"}',
      'Insert {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
    ]);
  });
});

report();
