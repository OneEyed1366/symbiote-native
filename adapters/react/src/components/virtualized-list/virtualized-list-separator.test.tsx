/** @jsxRuntime automatic */
// Разделитель сидит внутри ячейки и скрыт у последнего элемента данных, а не окна
// Соседний flex-элемент ломает расчёт спейсера, поэтому смотрим, какой узел его содержит

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualizedList,
  mount,
  unmount,
  type IVirtualizedListProps,
} from '@symbiote-native/react';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';

type IRow = { id: number };

type ISeparatorSlot = IVirtualizedListProps<IRow>['ItemSeparatorComponent'];

const ROOT_TAG = 51;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const CONTENT_VIEW = 'RCTScrollContentView';

const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The content container's DIRECT children — the level a spacer collapses, and the only level at
// which "inside the cell" and "beside the cell" look different. Read off the engine's own child
// links, which is where "who was put inside whom" is stated.
function contentChildren(): readonly ISymbioteNode[] {
  const content = fabric.find(node => node.viewName === CONTENT_VIEW);
  if (content === undefined) throw new Error('no content container created');
  return childrenOf(content.handle);
}

function carriesText(handle: ISymbioteNode, text: string): boolean {
  const recorded = fabric.find(node => node.handle === handle);
  if (recorded?.props.text === text) return true;
  return childrenOf(handle).some(child => carriesText(child, text));
}

// `windowSize` параметр, т.к. тест гейта должен увидеть последний индекс данных
// При `windowSize` 1 запаса нет и двухстрочный список сжимается до ячейки 0
function listOf(
  rows: number,
  windowSize: number,
  separator: ISeparatorSlot = () => createElement('text', {}, 'divider'),
): ReactElement {
  const data: IRow[] = Array.from({ length: rows }, (_unused, id) => ({ id }));
  return createElement(VirtualizedList<IRow>, {
    data,
    getItem: (source, index) => (source as IRow[])[index],
    getItemCount: source => (source as IRow[]).length,
    keyExtractor: item => `k-${item.id}`,
    getItemLayout: (_source, index) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    windowSize,
    ItemSeparatorComponent: separator,
    renderItem: ({ item }) => createElement('text', {}, `row-${item.id}`),
  });
}

function layoutViewport(): void {
  const scroll = fabric.find(node => node.viewName === 'RCTScrollView');
  if (scroll === undefined) throw new Error('no scroll view created');
  fabric.fireEvent(scroll.instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
}

describe('VirtualizedList separator placement', () => {
  it('renders the separator inside its cell rather than beside it', () => {
    mount(ROOT_TAG, listOf(20, 1));
    layoutViewport();

    const withDivider = contentChildren().filter(child =>
      carriesText(child, 'divider'),
    );
    expect(withDivider.length).toBeGreaterThan(0);
    // Соседний разделитель виден здесь как ребёнок с divider и без метки строки
    for (const [position, child] of withDivider.entries()) {
      expect(carriesText(child, `row-${position}`)).toBe(true);
    }
  });

  // Последняя ячейка окна лежит посреди данных, поэтому разделитель у неё остаётся
  // Гейт по окну снял бы его именно здесь, и высота менялась бы при каждом сдвиге окна
  it('keeps the separator on the window-last cell, which is mid-data', () => {
    mount(ROOT_TAG, listOf(20, 1));
    layoutViewport();

    const rendered = contentChildren().filter(child =>
      Array.from({ length: 20 }, (_unused, id) => `row-${id}`).some(label =>
        carriesText(child, label),
      ),
    );
    expect(rendered.length).toBeGreaterThan(0);
    const windowLast = rendered[rendered.length - 1];
    expect(carriesText(windowLast, 'divider')).toBe(true);
  });

  // RN 0.83 (`isValidElement(ItemSeparatorComponent)`): an element is rendered as it is
  it('renders a separator given as a ready element, not only as a component', () => {
    mount(
      ROOT_TAG,
      listOf(20, 1, createElement('text', {}, 'element-divider')),
    );
    layoutViewport();

    const withDivider = contentChildren().filter(child =>
      carriesText(child, 'element-divider'),
    );
    expect(withDivider.length).toBeGreaterThan(0);
  });

  it('withholds the separator from the last item of the DATA', () => {
    mount(ROOT_TAG, listOf(2, 21));
    layoutViewport();

    const cells = contentChildren();
    const first = cells.find(child => carriesText(child, 'row-0'));
    const last = cells.find(child => carriesText(child, 'row-1'));
    expect(last, 'the last cell is rendered at all').toBeDefined();
    expect(first === undefined ? false : carriesText(first, 'divider')).toBe(
      true,
    );
    expect(last === undefined ? true : carriesText(last, 'divider')).toBe(
      false,
    );
  });
});
