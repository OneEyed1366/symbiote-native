/** @jsxRuntime automatic */
// WHERE a separator sits, and WHAT decides to render it, are both geometry — not decoration.
//
// RN renders ItemSeparatorComponent INSIDE the cell's own measuring wrapper
// (VirtualizedListCellRenderer.js:218-221) and gates it on the last index of the DATA
// (VirtualizedList.js:793, `const end = getItemCount(data) - 1`). Every adapter here had it as a
// SIBLING of the wrapper, gated on the WINDOW's last index. Both were device-measured on
// 2026-08-19 as the list jumping mid-scroll:
//
//   * as a sibling it is an extra flex child, so the chrome between two cells is gap + separator +
//     gap while a spacer collapsing that region contributes only one gap — the leading spacer lands
//     every cell below it short by (separator + gap), 17px with a 1px divider under a 16px gap;
//   * gated on the window, a cell's own measured height changes as the window slides past it, so
//     everything below shifts by the divider's 1px on each window step.
//
// Counting separators cannot see either one: the pre-fix code passed a count-based test. These
// assertions are structural on purpose — they ask which node CONTAINS the divider.
// Full incident: .claude/rules/list-geometry-feedback-loop.md.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VirtualizedList, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface IRow {
  id: number;
}

const ROOT_TAG = 51;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const CONTENT_VIEW = 'RCTScrollContentView';

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function flatten(nodes: IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

// The content container's DIRECT children — the level a spacer collapses, and the only level at
// which "inside the cell" and "beside the cell" look different.
function contentChildren(): IFakeNode[] {
  const content = flatten(fabric.committed).find(
    node => node.viewName === CONTENT_VIEW,
  );
  if (content === undefined) throw new Error('no content container committed');
  return content.children;
}

function carriesText(node: IFakeNode, text: string): boolean {
  return (
    node.props.text === text ||
    node.children.some(child => carriesText(child, text))
  );
}

// windowSize is a parameter because the gate test needs the LAST data index actually rendered:
// with windowSize=1 the overscan is zero, so a two-row list windows down to cell 0 alone and the
// cell under test never commits.
function listOf(rows: number, windowSize: number): ReactElement {
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
    ItemSeparatorComponent: () => createElement('symbiote-text', {}, 'divider'),
    renderItem: ({ item }) =>
      createElement('symbiote-text', {}, `row-${item.id}`),
  });
}

function layoutViewport(): void {
  const scroll = flatten(fabric.committed).find(
    node => node.viewName === 'RCTScrollView',
  );
  if (scroll === undefined) throw new Error('no scroll view committed');
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
    // A sibling separator shows up here as a child carrying the divider and no row label.
    for (const [position, child] of withDivider.entries()) {
      expect(carriesText(child, `row-${position}`)).toBe(true);
    }
  });

  // The window's last cell is mid-DATA, so it keeps its separator. This is the assertion that
  // separates the two gates: under the window gate that cell is exactly the one that loses it, and
  // its height then changes every time the window slides past.
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
