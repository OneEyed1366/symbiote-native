// What does ONE scroll frame inside a VirtualizedList cost the screen around it?
//
// Device symptom: the Angular canary scrolled at ~37fps, worst in the sticky section, where RN pins
// `scrollEventThrottle` to 1 and JS sees every frame. Two paths called markForCheck (which walks to
// the root) on each of them: SymbioteHostPropsDirective wrapping `onScroll`, and
// VirtualizedList.dispatch, since the reducer reports `changed` for every offset.
//
// The counter is on the SCREEN, not the list: a list that re-renders while scrolling is doing its
// job. The burst deliberately moves no cell, the common case at 60Hz.

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { registerComposedComponent } from '../../anchor-host-registry';
import { VirtualizedList, VListItemDirective } from './index';

registerComposedComponent('vlist-cost-screen');

const ROOT_TAG = 985;
const SCROLL_EVENT = 'topScroll';
const SCROLL_BURST = 10;
const ROW_COUNT = 5;
const fabric = installFabric();

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

function handleFor(testID: string): unknown {
  const node = fabric.find((n: IFakeNode) => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

type IRow = {
  id: string;
};

const ROWS: readonly IRow[] = Array.from({ length: 40 }, (_unused, index) => ({
  id: `row-${index}`,
}));

let mountedScreen: VListCostScreen | undefined;

// The device-faithful shape: a screen template with its own content and an @for block, wrapped
// around a real VirtualizedList. Both counters live here, so they answer "what did the SCREEN pay".
@Component({
  selector: 'vlist-cost-screen',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective],
  // Raw host elements rather than the Text primitive: importing the primitives barrel alongside
  // VirtualizedList trips a JIT circular-dependency error (NG0919) that AOT does not have.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <symbiote-text>{{ ownLabel }}</symbiote-text>
    @for (row of screenRows; track row) {
      <symbiote-text>{{ rowLabel }}</symbiote-text>
    }
    <VirtualizedList
      [testID]="'vlist-cost-host'"
      [data]="rows"
      [getItem]="getRow"
      [getItemCount]="getRowCount"
      [keyExtractor]="rowKey"
    >
      <ng-template vListItem>
        <symbiote-text>cell</symbiote-text>
      </ng-template>
    </VirtualizedList>
  `,
})
class VListCostScreen {
  templateReads = 0;
  rowReads = 0;
  readonly rows = ROWS;
  readonly screenRows = Array.from({ length: ROW_COUNT }, (_unused, index) => index);
  readonly rowKey = (item: IRow): string => item.id;
  readonly getRow = (_data: unknown, index: number): IRow => ROWS[index] ?? ROWS[0]!;
  readonly getRowCount = (): number => ROWS.length;

  constructor() {
    // Captures the live component instance so the test can read its counters after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mountedScreen = this;
  }

  get ownLabel(): string {
    this.templateReads += 1;
    return 'screen';
  }

  get rowLabel(): string {
    this.rowReads += 1;
    return 'row';
  }
}

function screen(): VListCostScreen {
  if (mountedScreen === undefined) throw new Error('screen component was never constructed');
  return mountedScreen;
}

beforeEach(() => {
  mountedScreen = undefined;
  fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

describe('the cost of a scroll frame inside a VirtualizedList', () => {
  // why: the regression that pins the fix. Before it, this was SCROLL_BURST screen re-runs and
  // SCROLL_BURST * ROW_COUNT row re-runs - one full screen template execution per scroll frame,
  // 60 times a second on a sticky screen.
  it('does not re-run the ancestor screen for a scroll that moves no cell', async () => {
    mount(ROOT_TAG, VListCostScreen);
    await flush();

    const host = handleFor('vlist-cost-host');
    const screenBefore = screen().templateReads;
    const rowsBefore = screen().rowReads;

    for (let index = 0; index < SCROLL_BURST; index += 1) {
      fabric.fireEvent(host, SCROLL_EVENT, { contentOffset: { x: 0, y: index } });
      await flush();
    }

    // ONE, not SCROLL_BURST: the first frame genuinely moves the window (the initial render count
    // is not the post-interaction one), and a moved window is when the screen should pay. Every
    // frame after it costs nothing. Before the fix: 10 and 50.
    expect(
      screen().templateReads - screenBefore,
      'the screen template must not re-run per scroll frame, only when the window moves',
    ).toBe(1);
    expect(
      screen().rowReads - rowsBefore,
      'and its @for rows follow it - this is the cost that scales with screen size',
    ).toBe(ROW_COUNT);
  });
});
