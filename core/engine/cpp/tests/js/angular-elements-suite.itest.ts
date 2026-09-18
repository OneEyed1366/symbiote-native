// The benchmark screen through the Angular adapter, written the way a REAL SCREEN writes it.
//
// `angular-suite.itest.ts` is the arm that belongs on the six-column ruler: bare tags under
// `CUSTOM_ELEMENTS_SCHEMA`, matching what every other adapter's arm does with an intrinsic tag. This
// one is the same eight steps and the same ten-node row, with one difference — it imports
// `SYMBIOTE_ELEMENTS`, so each tag matches a `@Directive` and Angular instantiates one PER ELEMENT.
//
// WHY IT HAS TO EXIST. `examples/angular/src/screens/BenchmarkScreen.ts` imports
// `SYMBIOTE_ELEMENTS`; the device has never run the bare shape. A bare tag matches nothing and
// instantiates nothing, which makes it the CHEAPER spelling — so every Angular figure this
// repository has published describes a lighter workload than the screen it is read against. That is
// the same class of mistake `CLAUDE.md` already records twice for this adapter (the four row shapes,
// and the nine-node row read against a ten-node one), and the same repair: measure both and say
// which is which.
//
// The two arms are ONE FILE EACH deliberately — the runner spawns a process per file, which is what
// keeps an arm from paying for its neighbour's warm-up.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import '@angular/compiler';
import { Component, Input, signal } from '@angular/core';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import {
  SYMBIOTE_ELEMENTS,
  mount,
  registerComposedComponent,
} from '@symbiote-native/angular';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  runBenchSuite,
  type IBenchRow,
  type IBenchState,
} from './bench-suite';
import { describe, flushTimers, it, mounted, report } from './harness';

class BenchRow {
  @Input() row!: IBenchRow;
  @Input() isSelected = false;

  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

// `[value]` rather than `[text]`: the directive declares the public prop, where a bare tag takes the
// engine's own name. Same node, same payload — the difference is that a declared input CLAIMS the
// binding, which is the whole reason the directives exist.
Component({
  selector: 'BenchRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view
      [style]="isSelected ? selectedRowStyle : rowStyle"
      [testID]="'row-' + row.id"
    >
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

let host: BenchScreen | undefined;

class BenchScreen {
  readonly state = signal<IBenchState>({ rows: [], selectedId: undefined });

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

Component({
  selector: 'symbiote-bench-elements-screen',
  standalone: true,
  imports: [BenchRow, SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="{ flex: 1 }">
      @for (row of state().rows; track row.id) {
        <BenchRow [row]="row" [isSelected]="row.id === state().selectedId" />
      }
    </view>
  `,
})(BenchScreen);

/** One zoneless turn: let Angular's scheduler run, then drain whatever it queued. */
const settle = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('the benchmark screen through the Angular element directives', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, BenchScreen);
    await settle();
    surface.commit();
    mounted();

    if (host === undefined) throw new Error('the screen never rendered');
    const screen = host;

    await runBenchSuite({
      // A DIFFERENT NAME, so the two arms never overwrite each other in a reader's notes.
      name: 'ng-elements',
      // The root, the container `createSurface` puts under it, and the screen's own wrapper — the
      // same three as the bare arm. A directive adds no node; it attaches to one.
      chrome: 3,
      readTelemetry: () => readSurfaceTelemetry(ROOT_TAG),
      apply: async next => {
        screen.state.set(next);
        await settle();
        surface.commit();
      },
    });
  });
});

report();
