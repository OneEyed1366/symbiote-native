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
// Counting separators cannot see either one. These assertions are structural on purpose — they ask
// which node CONTAINS the divider. Full incident: .claude/rules/list-geometry-feedback-loop.md.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { VirtualizedList } from './index';
import { VListItemDirective, VListSeparatorDirective } from './directives';

const ROOT_TAG = 981;
const ITEM_HEIGHT = 100;
const VIEWPORT = 100;
const CONTENT_VIEW = 'RCTScrollContentView';
const LONG_ROWS = 20;
const SHORT_ROWS = 2;

interface IRow {
  id: number;
}

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const makeRows = (count: number): IRow[] =>
  Array.from({ length: count }, (_unused, id) => ({ id }));

let hostRows: IRow[] = makeRows(LONG_ROWS);
let hostWindowSize = 1;

// windowSize is bound per host: the gate test needs the LAST data index actually rendered, and with
// windowSize=1 the overscan is zero, so a two-row list windows down to cell 0 alone.
@Component({
  selector: 'symbiote-virtualized-list-separator-host',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective, VListSeparatorDirective],
  template: `
    <VirtualizedList
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [windowSize]="windowSize"
    >
      <ng-template vListItem let-item>
        <symbiote-text [testID]="'row-' + item.id">{{
          'row-' + item.id
        }}</symbiote-text>
      </ng-template>
      <ng-template vListSeparator>
        <symbiote-text testID="divider">divider</symbiote-text>
      </ng-template>
    </VirtualizedList>
  `,
})
class SeparatorHost {
  // Read at construction, which mount() does after the fixture below has set them — one host
  // component covers both shapes without a second template to keep in sync.
  rows = hostRows;
  windowSize = hostWindowSize;
  getItem = (data: readonly IRow[], index: number): IRow => data[index];
  getItemCount = (data: readonly IRow[]): number => data.length;
  keyExtractor = (item: IRow): string => `k-${item.id}`;
  getItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  });
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findScrollView(): IFakeNode {
  const node = fabric.find(n => n.viewName === 'RCTScrollView');
  if (node === undefined) throw new Error('no scroll view committed');
  return node;
}

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
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

function carriesTestID(node: IFakeNode, testID: string): boolean {
  return (
    node.props.testID === testID ||
    node.children.some(child => carriesTestID(child, testID))
  );
}

async function mountWithViewport(
  rows: number,
  windowSize: number,
): Promise<void> {
  hostRows = makeRows(rows);
  hostWindowSize = windowSize;
  mount(ROOT_TAG, SeparatorHost);
  await tick();
  fabric.fireEvent(findScrollView().instanceHandle, 'topLayout', {
    layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
  });
  await tick();
}

describe('Angular VirtualizedList separator placement', () => {
  it('renders the separator inside its cell rather than beside it', async () => {
    await mountWithViewport(LONG_ROWS, 1);

    const withDivider = contentChildren().filter(child =>
      carriesTestID(child, 'divider'),
    );
    expect(withDivider.length, 'separators committed').toBeGreaterThan(0);
    // A sibling separator shows up here as a child carrying the divider and no row testID.
    for (const [position, child] of withDivider.entries()) {
      expect(
        carriesTestID(child, `row-${position}`),
        'the divider sits inside its own cell',
      ).toBe(true);
    }
  });

  // The window's last cell is mid-DATA, so it keeps its separator. This is the assertion that
  // separates the two gates — under a window gate that cell is exactly the one that loses it.
  it('keeps the separator on the window-last cell, which is mid-data', async () => {
    await mountWithViewport(LONG_ROWS, 1);

    const rendered = contentChildren().filter(child =>
      makeRows(LONG_ROWS).some(row => carriesTestID(child, `row-${row.id}`)),
    );
    expect(rendered.length, 'cells committed').toBeGreaterThan(0);
    expect(
      carriesTestID(rendered[rendered.length - 1], 'divider'),
      'the window-last cell is mid-data and keeps its separator',
    ).toBe(true);
  });

  it('withholds the separator from the last item of the DATA', async () => {
    await mountWithViewport(SHORT_ROWS, 21);

    const cells = contentChildren();
    const first = cells.find(child => carriesTestID(child, 'row-0'));
    const last = cells.find(child => carriesTestID(child, 'row-1'));
    expect(last, 'the last cell is rendered at all').toBeDefined();
    expect(first === undefined ? false : carriesTestID(first, 'divider')).toBe(
      true,
    );
    expect(last === undefined ? true : carriesTestID(last, 'divider')).toBe(
      false,
    );
  });
});
