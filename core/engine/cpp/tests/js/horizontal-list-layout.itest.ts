// Горизонтальный список, ячейки без своей ширины, на настоящем Yoga: ряд не схлопывается в ноль

import { createElement } from 'react';

import { FlatList, mount } from '@symbiote-native/react';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  report,
  setViewport,
} from './harness';

const ROOT_TAG = 1;
const ROW_COUNT = 6;
const VIEWPORT_WIDTH = 360;
const VIEWPORT_HEIGHT = 640;
const ROW_HEIGHT = 44;

type IRow = { id: string; label: string };
type IView = ReturnType<typeof mounted>;

const ROWS: IRow[] = Array.from({ length: ROW_COUNT }, (_unused, index) => ({
  id: `row-${index}`,
  label: `Row ${index}`,
}));

function renderRow({ item }: { item: IRow }) {
  return createElement(
    'view',
    {
      testID: `cell-${item.id}`,
      style: {
        height: ROW_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: 12,
      },
      collapsable: false,
    },
    createElement('text', {}, item.label),
  );
}

function list(isHorizontal: boolean) {
  return createElement(FlatList<IRow>, {
    data: ROWS,
    keyExtractor: (row: IRow) => row.id,
    renderItem: renderRow,
    horizontal: isHorizontal,
  });
}

function parentOfCell(root: IView, testID: string): IView | undefined {
  for (const child of root.children) {
    if (child.children.some(inner => inner.props.testID === testID))
      return child;
    const deeper = parentOfCell(child, testID);
    if (deeper !== undefined) return deeper;
  }
  return undefined;
}

// The container the width pin lands on, the cell wrappers are flattened into it
function contentWidth(root: IView): number {
  return parentOfCell(root, `cell-${ROWS[0].id}`)?.layout.width ?? -1;
}

function cellXs(root: IView): number[] {
  return ROWS.map(row => findByTestId(`cell-${row.id}`, root)?.layout.x ?? -1);
}

function expectRowFlowsAlongX(): void {
  const xs = cellXs(mounted());
  expect(xs[0]).toBe(0);
  expect(xs.every((x, index) => index === 0 || x > xs[index - 1])).toBe(true);
}

describe('horizontal list with cells that carry no width', () => {
  it('lays the cells out one after another on a fresh mount', () => {
    setViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    mount(ROOT_TAG, list(true));
    flushTimers();

    expectRowFlowsAlongX();
  });

  it('lays them out one after another after a vertical list flips to horizontal', () => {
    setViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    mount(ROOT_TAG, list(false));
    flushTimers();
    mount(ROOT_TAG, list(true));
    flushTimers();

    expectRowFlowsAlongX();
  });

  it('gives the content container the width of the row', () => {
    setViewport(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
    mount(ROOT_TAG, list(true));
    flushTimers();

    expect(contentWidth(mounted()) > 0).toBe(true);
  });
});

report();
