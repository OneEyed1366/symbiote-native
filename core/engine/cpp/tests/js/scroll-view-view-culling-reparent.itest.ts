// Reparenting cases of RN's `ScrollView-viewCulling-itest` (flattening, part 1), same mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import type { ReactElement } from 'react';

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
const BOX_STYLE = { height: 10, width: 10 };

const SCROLL_VIEW_IN_ROOT = [
  'Update {type: "RootView", nativeID: (root)}',
  'Create {type: "ScrollView", nativeID: (N/A)}',
  'Create {type: "View", nativeID: (N/A)}',
];

// A 100 x 100 wrapper around a size-less ScrollView holding `child` at `marginTop`
function wrapped(marginTop: number, wrapperId?: string): ReactElement {
  return view(
    { nativeID: wrapperId, style: { width: 100, height: 100 } },
    scrollView(
      {},
      view({ nativeID: 'child', style: { ...BOX_STYLE, marginTop } }),
    ),
  );
}

function flattenable(extraStyle: Record<string, unknown>): ReactElement {
  return scrollView(
    { style: SCROLL_STYLE },
    view(
      { style: { marginTop: 150, ...extraStyle } },
      view({
        nativeID: 'child',
        style: { ...BOX_STYLE, backgroundColor: 'red' },
      }),
    ),
  );
}

describe('ScrollView view culling while reparenting', () => {
  beforeEach(() => createRoot(100, 100));

  it('culls with view flattening', () => {
    render(flattenable({}));

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_IN_ROOT,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(60)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);

    // `opacity` forces the wrapper to stay a view
    render(flattenable({ opacity: 0 }));

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Create {type: "View", nativeID: (N/A)}',
      CONTENT_INSERTED,
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);

    render(flattenable({}));

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      'Delete {type: "View", nativeID: (N/A)}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);
  });

  it('shows a culled view when the ScrollView parent is unflattened', () => {
    render(wrapped(150));

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_IN_ROOT,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(wrapped(50, 'unflattened'));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "ScrollView", parentNativeID: (root), index: 0, nativeID: (N/A)}',
      'Create {type: "View", nativeID: "unflattened"}',
      'Update {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "unflattened"}',
      'Insert {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
    ]);
  });

  it('shows a culled view when the ScrollView parent is flattened', () => {
    render(wrapped(150, 'unflattened'));

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "View", nativeID: "unflattened"}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      CONTENT_INSERTED,
      'Insert {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "unflattened"}',
    ]);

    render(wrapped(50));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: (root), index: 0, nativeID: "unflattened"}',
      'Delete {type: "View", nativeID: "unflattened"}',
      'Update {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      SCROLL_VIEW_INSERTED,
    ]);
  });

  it('culls a view when the ScrollView parent is flattened', () => {
    render(wrapped(50, 'unflattened'));

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "View", nativeID: "unflattened"}',
      ...SCROLL_VIEW_MOUNTED.slice(1),
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      'Insert {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "unflattened"}',
    ]);

    render(wrapped(150));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: (root), index: 0, nativeID: "unflattened"}',
      'Delete {type: "View", nativeID: "unflattened"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Delete {type: "View", nativeID: "child"}',
      'Update {type: "View", nativeID: (N/A)}',
      SCROLL_VIEW_INSERTED,
    ]);
  });

  it('culls a view when the ScrollView parent is unflattened', () => {
    render(wrapped(50));

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(wrapped(150, 'unflattened'));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "ScrollView", parentNativeID: (root), index: 0, nativeID: (N/A)}',
      'Create {type: "View", nativeID: "unflattened"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Delete {type: "View", nativeID: "child"}',
      'Update {type: "View", nativeID: (N/A)}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "unflattened"}',
      'Insert {type: "ScrollView", parentNativeID: "unflattened", index: 0, nativeID: (N/A)}',
    ]);
  });
});

report();
