/** @jsxRuntime automatic */
// A list in a cell of a list with the same orientation shares the outer scroll, as RN's does
// It renders a plain view, windows by the outer scroll, and gets the outer drag events
import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Modal, VirtualizedList, mount, unmount } from '@symbiote-native/react';
import { parentOf } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 61;
const OUTER_CELL = 300;
const INNER_ROW = 50;
const INNER_ROWS = 40;
const VIEWPORT = 400;
const INNER_CELL_INDEX = 1;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const dragStarts: string[] = [];
let isInsideModal = false;

const rows = Array.from({ length: INNER_ROWS }, (_unused, index) => index);
const outerCells = [0, 1, 2, 3, 4];

function Inner(): ReactElement {
  return createElement(VirtualizedList<number>, {
    testID: 'inner',
    data: rows,
    getItem: (_data: unknown, index: number) => rows[index],
    getItemCount: () => rows.length,
    keyExtractor: (item: number) => `r-${item}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: INNER_ROW,
      offset: INNER_ROW * index,
      index,
    }),
    windowSize: 1,
    initialNumToRender: 2,
    onScrollBeginDrag: () => dragStarts.push('inner'),
    renderItem: ({ item }: { item: number }) =>
      createElement('text', {}, `r-${item}`),
  });
}

function App(): ReactElement {
  return createElement(VirtualizedList<number>, {
    testID: 'outer',
    data: outerCells,
    getItem: (_data: unknown, index: number) => outerCells[index],
    getItemCount: () => outerCells.length,
    keyExtractor: (item: number) => `c-${item}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: OUTER_CELL,
      offset: OUTER_CELL * index,
      index,
    }),
    windowSize: 3,
    renderItem: ({ item }: { item: number }) => {
      if (item !== INNER_CELL_INDEX) {
        return createElement('text', {}, `plain-${item}`);
      }
      return isInsideModal
        ? createElement(Modal, { visible: true }, createElement(Inner))
        : createElement(Inner);
    },
  });
}

function handleFrom(node: IAuthoredNode | undefined): object {
  const handle = node?.instanceHandle;
  if (typeof handle !== 'object' || handle === null) {
    throw new Error('no node with an instance handle');
  }
  return handle;
}

function handleOf(testID: string): object {
  return handleFrom(fabric.find(node => node.props.testID === testID));
}

// The cell view the list wraps around the node with this `testID`
function cellHandleOf(testID: string): object {
  const inner = fabric.find(node => node.props.testID === testID);
  const cell = inner === undefined ? undefined : parentOf(inner.handle);
  return handleFrom(fabric.find(node => node.handle === cell));
}

function scrollOuter(offset: number): void {
  fabric.fireEvent(handleOf('outer'), 'topScroll', {
    contentOffset: { x: 0, y: offset },
    contentSize: { width: 320, height: OUTER_CELL * outerCells.length },
    layoutMeasurement: { width: 320, height: VIEWPORT },
  });
}

beforeEach(() => {
  fabric.reset();
  dragStarts.length = 0;
  isInsideModal = false;
});
afterEach(() => unmount(ROOT_TAG));

// The inner list sits one outer cell down, as Yoga would report it relative to the outer scroll
async function openedAt(offset: number): Promise<void> {
  fabric.answerMeasureLayout(handle =>
    handle === handleOf('outer')
      ? undefined
      : {
          x: 0,
          y: OUTER_CELL * INNER_CELL_INDEX,
          width: 320,
          height: INNER_ROW * INNER_ROWS,
        },
  );
  mount(ROOT_TAG, createElement(App));
  await tick();
  fabric.fireEvent(handleOf('outer'), 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
  fabric.fireEvent(handleOf('inner'), 'topLayout', {
    layout: { x: 0, y: OUTER_CELL, width: 320, height: INNER_ROW * INNER_ROWS },
  });
  await tick();
  // The inner list laid out before the outer cell holding it, the order a real layout pass gives
  fabric.fireEvent(cellHandleOf('inner'), 'topLayout', {
    layout: { x: 0, y: OUTER_CELL, width: 320, height: OUTER_CELL },
  });
  await tick();
  scrollOuter(offset);
  await tick();
}

describe('a list nested in a list of the same orientation', () => {
  it('renders a plain view, only the outer list is a scroll view', async () => {
    await openedAt(0);

    const scrollViews = fabric.findAll(
      node => node.viewName === 'RCTScrollView',
    );

    expect(scrollViews).toHaveLength(1);
    expect(scrollViews[0].props.testID).toBe('outer');
  });

  it('windows by the outer scroll, relative to where it sits', async () => {
    await openedAt(OUTER_CELL + 400);

    const texts = live.texts(live.appRoot());

    expect(texts).toContain('r-8');
    expect(texts).not.toContain('r-30');
  });

  it('is a scroll view of its own inside a modal in the cell', async () => {
    isInsideModal = true;
    await openedAt(0);

    const scrollViews = fabric.findAll(
      node => node.viewName === 'RCTScrollView',
    );

    expect(scrollViews.map(node => node.props.testID).sort()).toEqual([
      'inner',
      'outer',
    ]);
  });

  it('gets the outer drag events', async () => {
    await openedAt(0);

    fabric.fireEvent(handleOf('outer'), 'topScrollBeginDrag', {});

    expect(dragStarts).toEqual(['inner']);
  });
});
