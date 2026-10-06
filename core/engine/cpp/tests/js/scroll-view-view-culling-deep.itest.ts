// Deep reparenting cases of RN's `ScrollView-viewCulling-itest`, same trees, steps and mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import type { ReactElement } from 'react';

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  createRoot,
  mountedShape,
  render,
  scrollToY,
  scrollView,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const SCROLL_STYLE = { height: 100, width: 100 };
const CHILD_CREATED = 'Create {type: "View", nativeID: "child"}';
const GRANDGRANDCHILD_CREATED = [
  'Update {type: "ScrollView", nativeID: (N/A)}',
  'Create {type: "View", nativeID: "grandgrandchild"}',
  'Insert {type: "View", parentNativeID: "grandchild", index: 0, nativeID: "grandgrandchild"}',
];

// `child` > `grandchild` > optional `grandgrandchild` under a 100 x 100 box that keeps its children
function reparented(
  wrapperId: string | undefined,
  boxMarginTop: number | undefined,
  innerSize: number,
  withGrandgrandchild: boolean,
): ReactElement {
  const innermost = withGrandgrandchild
    ? [
        view({
          nativeID: 'grandgrandchild',
          style: { width: innerSize, height: innerSize, marginTop: innerSize },
        }),
      ]
    : [];

  return scrollView(
    { style: { width: 100, height: 100 } },
    view(
      { nativeID: wrapperId },
      view(
        {
          style: { height: 100, width: 100, marginTop: boxMarginTop },
          collapsableChildren: false,
        },
        view(
          { nativeID: 'child', style: { width: 10, height: 10 } },
          view(
            {
              nativeID: 'grandchild',
              style: { width: 5, height: 5, marginTop: 5 },
            },
            ...innermost,
          ),
        ),
      ),
    ),
  );
}

// Two wrappers and three boxes that cannot collapse, `flattened` picks the wrappers' opacity
function deepTree(isFinal: boolean, flattenWhenFinal: boolean): ReactElement {
  const opacity = isFinal === flattenWhenFinal ? 0 : undefined;

  return scrollView(
    { style: SCROLL_STYLE, contentOffset: { x: 0, y: 52 } },
    view(
      { style: { marginTop: isFinal ? 92 : 100, opacity } },
      view(
        { style: { marginTop: 50, opacity } },
        view(
          { collapsable: false, style: { height: 10, width: 10 } },
          view(
            {
              collapsable: false,
              style: { height: 5, width: 5, marginTop: 5 },
            },
            view({
              nativeID: 'child',
              style: { height: 2.5, width: 2.5, marginTop: 2.5 },
            }),
          ),
        ),
      ),
    ),
  );
}

describe('ScrollView view culling while reparenting deep trees', () => {
  beforeEach(() => createRoot(100, 100));

  it('reparents a subtree that changes its marginTop', () => {
    render(reparented(undefined, undefined, 5, false));

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      CHILD_CREATED,
      'Create {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(reparented('unflattened', 97, 5, false));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Update {type: "View", nativeID: (N/A)}',
      'Update {type: "View", nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Create {type: "View", nativeID: "unflattened"}',
      'Remove {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
      'Delete {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "unflattened"}',
      'Insert {type: "View", parentNativeID: "unflattened", index: 0, nativeID: "child"}',
    ]);

    expect(scrollToY(50)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
    ]);
  });

  it('reparents a deep subtree that changes its marginTop', () => {
    render(reparented(undefined, undefined, 5, true));

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      CHILD_CREATED,
      'Create {type: "View", nativeID: "grandchild"}',
      'Create {type: "View", nativeID: "grandgrandchild"}',
      'Insert {type: "View", parentNativeID: "grandchild", index: 0, nativeID: "grandgrandchild"}',
      'Insert {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(reparented('unflattened', 94, 2.5, true));

    expect(takeLogs()).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Update {type: "View", nativeID: (N/A)}',
      'Update {type: "View", nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Create {type: "View", nativeID: "unflattened"}',
      'Remove {type: "View", parentNativeID: "grandchild", index: 0, nativeID: "grandgrandchild"}',
      'Delete {type: "View", nativeID: "grandgrandchild"}',
      'Update {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "unflattened"}',
      'Insert {type: "View", parentNativeID: "unflattened", index: 0, nativeID: "child"}',
    ]);

    expect(scrollToY(50)).toEqual(GRANDGRANDCHILD_CREATED);
  });

  // Mounted output of an incremental update must equal a fresh mount of the final tree
  for (const flattenWhenFinal of [true, false]) {
    it(`${flattenWhenFinal ? 'flattens' : 'unflattens'} parent and child with a deep hierarchy`, () => {
      render(deepTree(false, flattenWhenFinal));
      expect(takeLogs().includes(CHILD_CREATED)).toBe(false);

      render(deepTree(true, flattenWhenFinal));
      expect(takeLogs()).toContain(CHILD_CREATED);
      const updated = mountedShape();

      createRoot(100, 100);
      render(deepTree(true, flattenWhenFinal));
      takeLogs();

      expect(updated).toEqual(mountedShape());
    });
  }
});

report();
