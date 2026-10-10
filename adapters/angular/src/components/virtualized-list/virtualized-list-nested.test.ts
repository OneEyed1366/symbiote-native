// A list in a cell of a list with the same orientation shares the outer scroll, as RN's does
// It renders a plain view, windows by the outer scroll, and gets the outer drag events
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parentOf } from '@symbiote-native/engine';
import {
  createLiveTree,
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import { Modal } from '../modal';
import { VirtualizedList } from './index';
import { VListItemDirective } from './directives';

const ROOT_TAG = 979;
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
// Read when the outer host is created, so a case sets it before it mounts
const insideModal = { value: false };

const rows = Array.from({ length: INNER_ROWS }, (_unused, index) => index);
const outerCells = [0, 1, 2, 3, 4];

const layoutOf =
  (length: number) =>
  (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length,
    offset: length * index,
    index,
  });

const getItem = (data: readonly number[], index: number): number => data[index];
const getItemCount = (data: readonly number[]): number => data.length;

@Component({
  selector: 'symbiote-nested-inner',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective],
  template: `
    <VirtualizedList
      testID="inner"
      [data]="rows"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [windowSize]="1"
      [initialNumToRender]="2"
      [onScrollBeginDrag]="onDrag"
    >
      <ng-template vListItem let-item>
        <text>{{ 'r-' + item }}</text>
      </ng-template>
    </VirtualizedList>
  `,
})
class InnerList {
  rows = rows;
  getItem = getItem;
  getItemCount = getItemCount;
  keyExtractor = (item: number): string => `r-${item}`;
  getItemLayout = layoutOf(INNER_ROW);
  onDrag = (): void => {
    dragStarts.push('inner');
  };
}

@Component({
  selector: 'symbiote-nested-outer',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective, Modal, InnerList],
  template: `
    <VirtualizedList
      testID="outer"
      [data]="cells"
      [getItem]="getItem"
      [getItemCount]="getItemCount"
      [keyExtractor]="keyExtractor"
      [getItemLayout]="getItemLayout"
      [windowSize]="3"
    >
      <ng-template vListItem let-item>
        @if (item === ${INNER_CELL_INDEX}) {
          @if (isInsideModal) {
            <Modal [visible]="true"><symbiote-nested-inner /></Modal>
          } @else {
            <symbiote-nested-inner />
          }
        } @else {
          <text>{{ 'plain-' + item }}</text>
        }
      </ng-template>
    </VirtualizedList>
  `,
})
class OuterList {
  cells = outerCells;
  isInsideModal = insideModal.value;
  getItem = getItem;
  getItemCount = getItemCount;
  keyExtractor = (item: number): string => `c-${item}`;
  getItemLayout = layoutOf(OUTER_CELL);
}

function handleFrom(node: IAuthoredNode | undefined): object {
  const handle = node?.instanceHandle;
  if (typeof handle !== 'object' || handle === null) {
    throw new Error('no node with an instance handle');
  }
  return handle;
}

// The component's own element carries the attribute too, only the host node has a view name
function hostOf(testID: string): IAuthoredNode | undefined {
  return fabric.find(
    node => node.props.testID === testID && node.viewName !== '',
  );
}

function handleOf(testID: string): object {
  return handleFrom(hostOf(testID));
}

// The cell view the list wraps around the node with this `testID`
function cellHandleOf(testID: string): object {
  const inner = hostOf(testID);
  let ancestor = inner === undefined ? undefined : parentOf(inner.handle);
  // The component's host and anchors sit between the list and its cell, the cell is the first view
  while (ancestor !== undefined) {
    const up = ancestor;
    const record = fabric.find(node => node.handle === up);
    if (record?.viewName === 'RCTView') return handleFrom(record);
    ancestor = parentOf(up);
  }
  throw new Error(`no cell view above ${testID}`);
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
  insideModal.value = false;
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
  mount(ROOT_TAG, OuterList);
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
  await tick();
}

describe('an Angular list nested in a list of the same orientation', () => {
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
    insideModal.value = true;
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
