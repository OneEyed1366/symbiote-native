// Opt-out cases of RN's `ScrollView-viewCulling-itest`: Modal, overflow visible, empty layout
// @symbiote-fabric-flags {"enableViewCulling":true}

import { createElement, type ReactElement } from 'react';

import { Modal } from '@symbiote-native/react';

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  createRoot,
  modalSizeUpdate,
  render,
  scrollView,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const SCROLL_STYLE = { height: 100, width: 100 };
const CHILD_CREATED = 'Create {type: "View", nativeID: "child"}';
const CHILD_STYLE = { height: 10, width: 10 };

// A wrapper below the viewport, holding a Modal with `child` inside when `withModal`
function modalBelowViewport(
  wrapperId: string | undefined,
  withModal: boolean,
): ReactElement {
  return scrollView(
    { style: SCROLL_STYLE },
    view(
      { nativeID: wrapperId, style: { marginTop: 101 } },
      ...(withModal
        ? [
            createElement(
              Modal,
              null,
              view({ nativeID: 'child', style: CHILD_STYLE }),
            ),
          ]
        : []),
    ),
  );
}

describe('ScrollView view culling opt-outs', () => {
  beforeEach(() => createRoot(100, 100));

  it('renders a Modal that is in the culling region', () => {
    render(modalBelowViewport('modal parent', true));
    modalSizeUpdate(100, 100);

    const logs = takeLogs();

    expect(logs).toContain(CHILD_CREATED);
    expect(logs).toContain('Create {type: "View", nativeID: "modal parent"}');

    // The Modal is gone: views mounted only because of it must go too
    render(modalBelowViewport('modal parent', false));

    expect(takeLogs()).toContain(
      'Delete {type: "View", nativeID: "modal parent"}',
    );
  });

  it('mounts a Modal added in a second update', () => {
    render(modalBelowViewport(undefined, false));
    takeLogs();

    render(modalBelowViewport(undefined, true));
    modalSizeUpdate(100, 100);

    expect(takeLogs()).toContain(CHILD_CREATED);
  });

  it('shows a view outside of the bounds with overflow visible', () => {
    // 145 is below the viewport
    render(
      scrollView(
        { style: { ...SCROLL_STYLE, overflow: 'visible' } },
        view({ nativeID: 'child', style: { ...CHILD_STYLE, marginTop: 145 } }),
      ),
    );

    expect(takeLogs()).toContain(CHILD_CREATED);
  });

  it('does not cull views with no layout', () => {
    const box = { height: 100, width: 100 };

    render(
      scrollView(
        { style: SCROLL_STYLE },
        view({ nativeID: 'viewWithLayout', style: box }),
        view({ style: { height: 1_000, width: 100 } }),
        view({ nativeID: 'culledViewWithLayout', style: box }),
        view({ nativeID: 'viewWithoutLayout', style: { height: 0, width: 0 } }),
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "viewWithLayout"}',
      'Create {type: "View", nativeID: "viewWithoutLayout"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "viewWithLayout"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 1, nativeID: "viewWithoutLayout"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);
  });
});

report();
