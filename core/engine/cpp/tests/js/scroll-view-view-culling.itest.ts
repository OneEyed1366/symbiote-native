// `ScrollView-viewCulling-itest` из RN: те же деревья, те же шаги и те же логи монтирования
// @symbiote-fabric-flags {"enableViewCulling":true}

import { Fragment, createElement } from 'react';

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

describe('ScrollView view culling', () => {
  beforeEach(() => createRoot(100, 100));

  it('basic culling', () => {
    render(
      scrollView(
        { style: { height: 100, width: 100 } },
        view({
          nativeID: 'child',
          style: { height: 10, width: 10, marginTop: 45 },
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

    expect(scrollToY(60)).toEqual([
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      'Delete {type: "View", nativeID: "child"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      'Delete {type: "View", nativeID: (N/A)}',
      'Update {type: "ScrollView", nativeID: (N/A)}',
    ]);

    expect(scrollToY(0)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child"}',
      CONTENT_INSERTED,
    ]);
  });

  it('recursive culling', () => {
    render(
      scrollView(
        { style: { height: 100, width: 100 } },
        view(
          {
            nativeID: 'element A',
            style: { height: 30, width: 30, marginTop: 25 },
          },
          view({ nativeID: 'child AA', style: { height: 10, width: 10 } }),
          view({
            nativeID: 'child AB',
            style: { height: 10, width: 10, marginTop: 5 },
          }),
        ),
        view(
          {
            nativeID: 'element B',
            style: { height: 30, width: 30, marginTop: 195 },
          },
          view({ nativeID: 'child BA', style: { height: 10, width: 10 } }),
          view({
            nativeID: 'child BB',
            style: { height: 10, width: 10, marginTop: 5 },
          }),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "element A"}',
      'Create {type: "View", nativeID: "child AA"}',
      'Create {type: "View", nativeID: "child AB"}',
      'Insert {type: "View", parentNativeID: "element A", index: 0, nativeID: "child AA"}',
      'Insert {type: "View", parentNativeID: "element A", index: 1, nativeID: "child AB"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    // Дошли до края `child AA`
    expect(scrollToY(30)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
    ]);

    // Проскроллили `child AA`
    expect(scrollToY(36)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: "element A", index: 0, nativeID: "child AA"}',
      'Delete {type: "View", nativeID: "child AA"}',
    ]);

    // Проскроллили `child AB`
    expect(scrollToY(51)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: "element A", index: 0, nativeID: "child AB"}',
      'Delete {type: "View", nativeID: "child AB"}',
    ]);

    // Проскроллили `element A`
    expect(scrollToY(56)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      'Delete {type: "View", nativeID: "element A"}',
    ]);

    // В зону видимости вошёл `element B`, создаётся только `child BA`
    expect(scrollToY(155)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "element B"}',
      'Create {type: "View", nativeID: "child BA"}',
      'Insert {type: "View", parentNativeID: "element B", index: 0, nativeID: "child BA"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element B"}',
    ]);

    // В зону видимости вошёл `child BB`
    expect(scrollToY(165)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child BB"}',
      'Insert {type: "View", parentNativeID: "element B", index: 1, nativeID: "child BB"}',
    ]);

    // Назад к началу
    expect(scrollToY(0)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: "element B", index: 1, nativeID: "child BB"}',
      'Remove {type: "View", parentNativeID: "element B", index: 0, nativeID: "child BA"}',
      'Delete {type: "View", nativeID: "child BA"}',
      'Delete {type: "View", nativeID: "child BB"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element B"}',
      'Delete {type: "View", nativeID: "element B"}',
      'Create {type: "View", nativeID: "element A"}',
      'Create {type: "View", nativeID: "child AA"}',
      'Create {type: "View", nativeID: "child AB"}',
      'Insert {type: "View", parentNativeID: "element A", index: 0, nativeID: "child AA"}',
      'Insert {type: "View", parentNativeID: "element A", index: 1, nativeID: "child AB"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
    ]);

    expect(scrollToY(85)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: "element A", index: 1, nativeID: "child AB"}',
      'Remove {type: "View", parentNativeID: "element A", index: 0, nativeID: "child AA"}',
      'Delete {type: "View", nativeID: "child AA"}',
      'Delete {type: "View", nativeID: "child AB"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      'Delete {type: "View", nativeID: "element A"}',
    ]);
  });

  it('culls recursively when the initial offset is negative', () => {
    createRoot(402, 874);
    render(
      scrollView(
        {
          style: { height: 874, width: 402 },
          contentOffset: { x: 0, y: -10_000 },
        },
        view({
          nativeID: 'child A',
          style: { height: 100, width: 100, marginTop: 235 },
        }),
        view(
          {
            nativeID: 'child B',
            style: { height: 100, width: 100, marginTop: 235 },
          },
          view({ nativeID: 'child BA', style: { height: 17, width: 100 } }),
          view({
            nativeID: 'child BB',
            style: { height: 17, width: 100, marginTop: 60 },
          }),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(0)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "child A"}',
      'Create {type: "View", nativeID: "child B"}',
      'Create {type: "View", nativeID: "child BA"}',
      'Create {type: "View", nativeID: "child BB"}',
      'Insert {type: "View", parentNativeID: "child B", index: 0, nativeID: "child BA"}',
      'Insert {type: "View", parentNativeID: "child B", index: 1, nativeID: "child BB"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "child A"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 1, nativeID: "child B"}',
      CONTENT_INSERTED,
    ]);
  });

  it('culls through deep nesting', () => {
    render(
      scrollView(
        { style: { height: 100, width: 100 } },
        view({
          nativeID: 'element A',
          style: { height: 10, width: 100, marginTop: 30 },
        }),
        view(
          {
            nativeID: 'element B',
            style: { height: 50, width: 100, marginTop: 85 },
          },
          view(
            {
              nativeID: 'child BA',
              style: { height: 30, width: 80, marginTop: 10, marginLeft: 10 },
            },
            view({
              nativeID: 'child BAA',
              style: { height: 10, width: 75, marginTop: 5, marginLeft: 5 },
            }),
            view({
              nativeID: 'child BAB',
              style: { height: 10, width: 75, marginTop: 15, marginLeft: 5 },
            }),
          ),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "element A"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(40)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Create {type: "View", nativeID: "element B"}',
      'Create {type: "View", nativeID: "child BA"}',
      'Create {type: "View", nativeID: "child BAA"}',
      'Insert {type: "View", parentNativeID: "child BA", index: 0, nativeID: "child BAA"}',
      'Insert {type: "View", parentNativeID: "element B", index: 0, nativeID: "child BA"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 1, nativeID: "element B"}',
    ]);

    expect(scrollToY(150)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      'Delete {type: "View", nativeID: "element A"}',
      'Create {type: "View", nativeID: "child BAB"}',
      'Insert {type: "View", parentNativeID: "child BA", index: 1, nativeID: "child BAB"}',
    ]);
  });

  it('adds an item into an area that is not culled', () => {
    render(
      scrollView(
        { style: { height: 100, width: 100 } },
        view({
          nativeID: 'element A',
          style: { height: 20, width: 20, marginTop: 30 },
        }),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "element A"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(
      scrollView(
        { style: { height: 100, width: 100 } },
        view(
          {
            nativeID: 'element A',
            style: { height: 20, width: 20, marginTop: 30 },
          },
          view({ nativeID: 'child AA', style: { height: 20, width: 20 } }),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      'Create {type: "View", nativeID: "child AA"}',
      'Insert {type: "View", parentNativeID: "element A", index: 0, nativeID: "child AA"}',
    ]);
  });

  it('adds an item into an area that is culled', () => {
    render(
      scrollView(
        { contentOffset: { x: 0, y: 45 }, style: { height: 100, width: 100 } },
        view({
          key: 'element B',
          nativeID: 'element B',
          style: { height: 20, width: 20, marginTop: 30 },
        }),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "element B"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element B"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    render(
      scrollView(
        { contentOffset: { x: 0, y: 45 }, style: { height: 100, width: 100 } },
        view({
          key: 'element A',
          nativeID: 'element A',
          style: { height: 20, width: 20 },
        }),
        view({
          key: 'element B',
          nativeID: 'element B',
          style: { height: 20, width: 20, marginTop: 10 },
        }),
      ),
    );

    // `element B` updates because Yoga cloned its shadow node, which is inconsequential
    expect(takeLogs()).toEqual([
      'Update {type: "View", nativeID: "element B"}',
    ]);
  });

  it('culls on the initial render and creates what scrolls into view', () => {
    render(
      scrollView(
        { contentOffset: { x: 0, y: 45 }, style: { height: 100, width: 100 } },
        view({ nativeID: 'element A', style: { height: 50, width: 100 } }),
        view(
          {
            nativeID: 'element B',
            style: { height: 50, width: 100, marginTop: 100 },
          },
          view({ nativeID: 'child BA', style: { height: 20, width: 100 } }),
          view({
            nativeID: 'child BB',
            style: { height: 20, width: 100, marginTop: 10 },
          }),
        ),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "element A"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(100)).toEqual([
      'Update {type: "ScrollView", nativeID: (N/A)}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element A"}',
      'Delete {type: "View", nativeID: "element A"}',
      'Create {type: "View", nativeID: "element B"}',
      'Create {type: "View", nativeID: "child BA"}',
      'Create {type: "View", nativeID: "child BB"}',
      'Insert {type: "View", parentNativeID: "element B", index: 0, nativeID: "child BA"}',
      'Insert {type: "View", parentNativeID: "element B", index: 1, nativeID: "child BB"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element B"}',
    ]);
  });

  it('unmounts culled elements', () => {
    render(
      scrollView(
        { style: { height: 100, width: 100 }, contentOffset: { x: 0, y: 20 } },
        view({ nativeID: 'element 1', style: { height: 10, width: 10 } }),
      ),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "ScrollView", nativeID: (N/A)}',
      SCROLL_VIEW_INSERTED,
    ]);

    render(createElement(Fragment));

    expect(takeLogs()).toEqual([
      'Remove {type: "ScrollView", parentNativeID: (root), index: 0, nativeID: (N/A)}',
      'Delete {type: "ScrollView", nativeID: (N/A)}',
    ]);
  });

  it('culls in a ScrollView smaller than the root', () => {
    render(
      scrollView(
        { style: { height: 50, width: 50, marginTop: 25 } },
        view({ nativeID: 'element 1', style: { height: 10, width: 10 } }),
      ),
    );

    expect(takeLogs()).toEqual([
      ...SCROLL_VIEW_MOUNTED,
      'Create {type: "View", nativeID: "element 1"}',
      'Insert {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element 1"}',
      CONTENT_INSERTED,
      SCROLL_VIEW_INSERTED,
    ]);

    expect(scrollToY(11)).toEqual([
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: "element 1"}',
      'Delete {type: "View", nativeID: "element 1"}',
      'Remove {type: "View", parentNativeID: (N/A), index: 0, nativeID: (N/A)}',
      'Delete {type: "View", nativeID: (N/A)}',
      'Update {type: "ScrollView", nativeID: (N/A)}',
    ]);
  });

  it('does not cull views outside of a ScrollView', () => {
    render(
      view({
        nativeID: 'child',
        style: { height: 10, width: 10, marginTop: 101 },
      }),
    );

    expect(takeLogs()).toEqual([
      'Update {type: "RootView", nativeID: (root)}',
      'Create {type: "View", nativeID: "child"}',
      'Insert {type: "View", parentNativeID: (root), index: 0, nativeID: "child"}',
    ]);
  });
});

report();
