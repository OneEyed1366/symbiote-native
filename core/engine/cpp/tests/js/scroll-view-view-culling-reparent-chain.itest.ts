// Reparenting cases of RN's `ScrollView-viewCulling-itest` (flattening, part 2), same mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import type { ReactElement } from 'react';

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  createRoot,
  render,
  scrollView,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

type IStyle = Record<string, unknown>;

const SCROLL_STYLE = { height: 100, width: 100 };
const CREATE_VIEW = 'Create {type: "View", nativeID: (N/A)}';
const REMOVE_ANON =
  'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}';
const DELETE_ANON = 'Delete {type: "View", nativeID: (N/A)}';
const INSERT_CHILD =
  'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}';
const REMOVE_CHILD =
  'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}';

// `child` inside `inner` inside `outer`, in a 100 x 100 ScrollView scrolled to `offsetY`
function chain(
  outer: IStyle,
  inner: IStyle,
  child: IStyle,
  offsetY?: number,
): ReactElement {
  return scrollView(
    {
      style: SCROLL_STYLE,
      contentOffset: offsetY === undefined ? undefined : { x: 0, y: offsetY },
    },
    view(
      { style: outer },
      view({ style: inner }, view({ nativeID: 'child', style: child })),
    ),
  );
}

// grandparent > `parent` > `child` where only the grandparent's opacity and the parent's width vary
function grandparent(
  opacity: number | undefined,
  parentWidth: number,
): ReactElement {
  return scrollView(
    { style: SCROLL_STYLE },
    view(
      { style: { marginTop: 70, opacity } },
      view(
        {
          nativeID: 'parent',
          style: { height: 10, width: parentWidth, marginTop: 10 },
        },
        view({
          nativeID: 'child',
          style: { height: 5, width: 5, marginTop: 5 },
        }),
      ),
    ),
  );
}

const RED_BOX = { height: 10, width: 10, backgroundColor: 'red' };

describe('ScrollView view culling while reparenting a chain', () => {
  beforeEach(() => createRoot(100, 100));

  it('flattens parent and child with culling', () => {
    render(
      chain(
        { marginTop: 100, opacity: 0 },
        { marginTop: 50, opacity: 0 },
        RED_BOX,
        60,
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      CREATE_VIEW,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "child"}',
      INSERT_CHILD,
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(chain({ marginTop: 100 }, { marginTop: 50 }, RED_BOX, 60));

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "child"}',
      REMOVE_CHILD,
      REMOVE_ANON,
      REMOVE_ANON,
      DELETE_ANON,
      DELETE_ANON,
      INSERT_CHILD,
    ]);
  });

  it('flattens the grandparent', () => {
    render(grandparent(0, 10));

    expect(takeLogs()).toContain(
      'Insert {type: "View", parentNativeID: "parent", index: 0, nativeID: "child"}',
    );

    render(grandparent(undefined, 11));

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "parent"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "parent"}',
      REMOVE_ANON,
      DELETE_ANON,
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "parent"}',
    ]);
  });

  it('unflattens the grandparent', () => {
    render(grandparent(undefined, 10));

    expect(takeLogs()).toContain(
      'Insert {type: "View", parentNativeID: "parent", index: 0, nativeID: "child"}',
    );

    render(grandparent(0, 11));

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "parent"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "parent"}',
      CREATE_VIEW,
      CONTENT_INSERTED,
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "parent"}',
    ]);
  });

  it('flattens parent and child with the child culled', () => {
    const child = { height: 10, width: 10, marginTop: 5 };

    render(
      chain(
        { marginTop: 100, opacity: 0.5 },
        { marginTop: 50, opacity: 0.1 },
        child,
        50,
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      CREATE_VIEW,
      CREATE_VIEW,
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(chain({ marginTop: 100 }, { marginTop: 50 }, child, 50));

    expect(takeLogs()).toEqual([
      REMOVE_ANON,
      REMOVE_ANON,
      DELETE_ANON,
      DELETE_ANON,
    ]);
  });

  it('switches from unflattened-flattened to flattened-unflattened', () => {
    render(
      chain({ marginTop: 100, opacity: 0 }, { marginTop: 50 }, RED_BOX, 60),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      CREATE_VIEW,
      CREATE_VIEW,
      'Create {type: "View", nativeID: "child"}',
      INSERT_CHILD,
      CONTENT_INSERTED,
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(
      chain({ marginTop: 100 }, { marginTop: 50, opacity: 0 }, RED_BOX, 60),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "child"}',
      REMOVE_CHILD,
      REMOVE_ANON,
      DELETE_ANON,
      CREATE_VIEW,
      INSERT_CHILD,
      CONTENT_INSERTED,
    ]);
  });
});

report();
