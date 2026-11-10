// Partially culled subtree cases of RN's `ScrollView-viewCulling-itest`, same mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import type { ReactElement } from 'react';

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  createRoot,
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
const UPDATE_ANON = 'Update {type: "View", nativeID: (N/A)}';
const UPDATE_SCROLL_VIEW = 'Update {type: "ScrollView", nativeID: (N/A)}';

// A square view with its own margin, named so a log line can point at it
function box(
  nativeID: string,
  marginTop: number,
  size: number,
  ...children: ReactElement[]
): ReactElement {
  return view(
    { nativeID, style: { marginTop, height: size, width: size } },
    ...children,
  );
}

// A size-less container at `marginTop`, optionally forced out of flattening by `opacity`
function container(
  marginTop: number,
  opacity: number | undefined,
  ...children: ReactElement[]
): ReactElement {
  return view({ style: { marginTop, opacity } }, ...children);
}

function scrolledTo(
  offsetY: number,
  ...children: ReactElement[]
): ReactElement {
  return scrollView(
    { style: SCROLL_STYLE, contentOffset: { x: 0, y: offsetY } },
    ...children,
  );
}

const EMPTY_CONTAINER_MOUNTED = [
  'Update {type: "RootView", nativeID: (root)}',
  'Create {type: "ScrollView", nativeID: (N/A)}',
  CREATE_VIEW,
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
];

describe('ScrollView view culling of partially culled subtrees', () => {
  beforeEach(() => createRoot(100, 100));

  it('unflattens and creates a subtree that is partially culled', () => {
    render(scrolledTo(111, container(200, undefined)));

    expect(takeLogs()).toEqual(EMPTY_CONTAINER_MOUNTED);

    render(
      scrolledTo(
        111,
        container(200, 0.5, box('child', 10, 10, box('grandchild', 5, 5))),
      ),
    );

    expect(takeLogs()).toEqual([
      UPDATE_SCROLL_VIEW,
      UPDATE_ANON,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "child"}',
      CONTENT_INSERTED,
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);

    expect(scrollToY(115)).toEqual([
      UPDATE_SCROLL_VIEW,
      'Create {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
    ]);
  });

  it('unflattens and creates a deeper subtree that is partially culled', () => {
    render(scrolledTo(115, container(200, undefined)));

    expect(takeLogs()).toEqual(EMPTY_CONTAINER_MOUNTED);

    render(
      scrolledTo(
        115,
        container(
          200,
          0.5,
          box(
            'child',
            10,
            10,
            box('grandchild', 5, 5, box('grandgrandchild', 2.5, 2.5)),
          ),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      UPDATE_SCROLL_VIEW,
      UPDATE_ANON,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "child"}',
      'Create {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
      CONTENT_INSERTED,
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);

    expect(scrollToY(118)).toEqual([
      UPDATE_SCROLL_VIEW,
      'Create {type: "View", nativeID: "grandgrandchild"}',
      'Insert {type: "View", parentNativeID: "grandchild", index: 0, nativeID: "grandgrandchild"}',
    ]);
  });

  it('flattens and deletes a deeper subtree that is partially culled', () => {
    render(
      scrolledTo(
        115,
        container(
          200,
          0.5,
          box(
            'child',
            10,
            10,
            box('grandchild', 5, 5, box('grandgrandchild', 2.5, 2.5)),
          ),
        ),
      ),
    );

    // Everything is mounted except the grandgrandchild
    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "child"}',
      'Create {type: "View", nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(scrolledTo(115, container(200, undefined)));

    expect(takeLogs()).toEqual([
      UPDATE_SCROLL_VIEW,
      UPDATE_ANON,
      'Remove {type: "View", parentNativeID: "child", index: 0, nativeID: "grandchild"}',
      'Delete {type: "View", nativeID: "grandchild"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      REMOVE_ANON,
      DELETE_ANON,
      'Delete {type: "View", nativeID: "child"}',
    ]);
  });

  it('flattens and deletes a subtree that is partially culled', () => {
    render(
      scrolledTo(
        111,
        container(200, 0.5, box('child', 10, 10, box('grandchild', 5, 5))),
      ),
    );

    // Everything is mounted except the grandchild
    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(scrolledTo(111, container(200, undefined)));

    expect(takeLogs()).toEqual([
      UPDATE_SCROLL_VIEW,
      UPDATE_ANON,
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      REMOVE_ANON,
      DELETE_ANON,
      'Delete {type: "View", nativeID: "child"}',
    ]);
  });
});

report();
