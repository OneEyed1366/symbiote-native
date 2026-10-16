// Modal and FlatList cases of RN's `ScrollView-viewCulling-itest`, same trees and mount logs
// @symbiote-fabric-flags {"enableViewCulling":true}

import { createElement, useState, type ReactElement } from 'react';

import { FlatList, Modal } from '@symbiote-native/react';

import {
  CONTENT_INSERTED,
  SCROLL_VIEW_INSERTED,
  createRoot,
  modalSizeUpdate,
  render,
  runTask,
  scrollView,
  takeLogs,
  view,
} from './culling-fixture';
import { beforeEach, describe, expect, it, report } from './harness';

const SCROLL_STYLE = { height: 100, width: 100 };

describe('ScrollView view culling inside Modal and FlatList', () => {
  beforeEach(() => createRoot(100, 100));

  it('does not cull inside of a Modal', () => {
    // Scrolled down: without the Modal the content would be culled
    const withChild = (child: ReactElement[]): ReactElement =>
      scrollView(
        { style: SCROLL_STYLE, contentOffset: { x: 0, y: 100 } },
        createElement(Modal, null, ...child),
      );

    render(withChild([]));
    modalSizeUpdate(100, 100);

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "ModalHostView", nativeID: (root)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: (N/A)}',
      'Insert {type: "ModalHostView", parentNativeID: (N/A), index: 0, nativeID: (root)}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
      'Update {type: "View", nativeID: (N/A)}',
      'Update {type: "ModalHostView", nativeID: (root)}',
      'Update {type: "View", nativeID: (N/A)}',
    ]);

    render(
      withChild([
        view({
          nativeID: 'child',
          style: { height: 10, width: 10, marginTop: 45 },
        }),
      ]),
    );

    expect(takeLogs()).toEqual([
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
    ]);
  });

  it('culls items nested in a FlatList with item resizing', () => {
    let setIsExpanded: (isExpanded: boolean) => void = () => {};

    function ExpandableComponent(): ReactElement {
      const [isExpanded, setExpanded] = useState(false);
      setIsExpanded = setExpanded;
      return view({}, isExpanded ? view({ style: { height: 80.5 } }) : null);
    }

    render(
      createElement(FlatList, {
        style: SCROLL_STYLE,
        data: [{ key: 'one' }, { key: 'two' }],
        renderItem: ({ item }: { item: { key: string } }) =>
          item.key === 'one'
            ? createElement(ExpandableComponent)
            : // `position: absolute` keeps Yoga from overcloning, which would visit every clone
              view(
                { style: { position: 'absolute' } },
                view(
                  { nativeID: 'parent', style: { marginTop: 10 } },
                  view({
                    nativeID: 'child',
                    style: { height: 10, width: 75, marginTop: 10 },
                  }),
                ),
              ),
      }),
    );

    expect(takeLogs()).toContain('Create {type: "View", nativeID: "child"}');

    runTask(() => setIsExpanded(true));

    expect(takeLogs()).toContain('Delete {type: "View", nativeID: "child"}');
  });
});

report();
