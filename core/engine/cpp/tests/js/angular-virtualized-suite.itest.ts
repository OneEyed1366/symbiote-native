// The benchmark screen's VIRTUALIZED mode through the Angular adapter's `FlatList`, in the shape
// `examples/angular`'s screen writes it: `SYMBIOTE_ELEMENTS`, a `BenchRow` component per cell through
// `<ng-template vListItem>`, `getItemLayout`, the 420-point viewport. Read against
// `stock-virtualized-suite.itest.tsx`; the row census (`VROWS`) must match stock's.
//
// RUN ON `build-release` with `SYMBIOTE_ITEST_BYTECODE=1`.

import '@angular/compiler';
import { Component, Input, signal } from '@angular/core';
import { readSurfaceTelemetry } from '@symbiote-native/engine';
import {
  FlatList,
  SYMBIOTE_ELEMENTS,
  VListItemDirective,
  mount,
  readAngularProfile,
  registerComposedComponent,
} from '@symbiote-native/angular';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  VIEWPORT_HEIGHT,
  announceListLayout,
  rowItemLayout,
  runBenchSuite,
  type IBenchRow,
  type IBenchState,
} from './bench-suite';
import { describe, flushTimers, it, mounted, print, report } from './harness';

class BenchRow {
  @Input() row!: IBenchRow;
  @Input() isSelected = false;

  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

Component({
  selector: 'BenchRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="isSelected ? selectedRowStyle : rowStyle">
      <text ellipsizeMode="tail">{{ row.id }}</text>
      <view [style]="cellStyle"
        ><text ellipsizeMode="tail">{{ row.label }}</text></view
      >
      <view [style]="cellStyle"><text ellipsizeMode="tail">x</text></view>
      <text-input [style]="inputStyle" [value]="row.label"></text-input>
    </view>
  `,
})(BenchRow);

registerComposedComponent('BenchRow');

function isBenchRow(item: unknown): item is IBenchRow {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof Reflect.get(item, 'id') === 'number' &&
    typeof Reflect.get(item, 'label') === 'string'
  );
}

let host: BenchScreen | undefined;

class BenchScreen {
  readonly state = signal<IBenchState>({ rows: [], selectedId: undefined });
  readonly viewport = { height: VIEWPORT_HEIGHT };
  readonly keyOf = (row: IBenchRow): string => String(row.id);
  readonly itemLayout = rowItemLayout;
  readonly rowOf = (item: unknown): IBenchRow => {
    if (!isBenchRow(item))
      throw new Error('a FlatList item that is not a bench row');
    return item;
  };

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

Component({
  selector: 'symbiote-bench-virtualized-screen',
  standalone: true,
  imports: [BenchRow, FlatList, VListItemDirective, SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="{ flex: 1 }">
      <FlatList
        [style]="viewport"
        [data]="state().rows"
        [keyExtractor]="keyOf"
        [getItemLayout]="itemLayout"
      >
        <ng-template vListItem let-item>
          <BenchRow
            [row]="rowOf(item)"
            [isSelected]="rowOf(item).id === state().selectedId"
          />
        </ng-template>
      </FlatList>
    </view>
  `,
})(BenchScreen);

const settle = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('the virtualized benchmark screen through the Angular adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, BenchScreen);
    await settle();
    surface.commit();
    mounted();
    announceListLayout();
    await settle();
    surface.commit();

    if (host === undefined) throw new Error('the screen never rendered');
    const screen = host;

    await runBenchSuite({
      name: 'ng-v',
      chrome: 3,
      virtualized: true,
      // Read after the stopwatch like the surface counters: how many change-detection passes and cell
      // outlets the step cost the adapter, which is what separates "cells are expensive" from "cells
      // are re-checked once per batch".
      readTelemetry: () => {
        const profile = readAngularProfile();
        print(
          `DEBUG ng-v cd=${profile.cdPasses} outletCreates=${profile.outletCreates} ` +
            `outletUpdates=${profile.outletUpdates} outletDestroys=${profile.outletDestroys} ` +
            `listChecks=${profile.listChecks} ` +
            `listRecomputes=${profile.listRecomputes} viewsChecked=${profile.viewsChecked}`,
        );
        return readSurfaceTelemetry(ROOT_TAG);
      },
      apply: async next => {
        screen.state.set(next);
        await settle();
        surface.commit();
        announceListLayout();
        await settle();
        surface.commit();
      },
    });
  });
});

report();
