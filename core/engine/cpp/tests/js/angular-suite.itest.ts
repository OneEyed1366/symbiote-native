// The whole benchmark screen through the Angular adapter — all eight device steps, headless.
//
// why, the step definitions, the oracle and the one-file-per-arm rule: `bench-suite.ts`.
//
// Zoneless, so the turn is explicit: a step writes the signal and then lets the scheduler run, and
// the await sits inside the stopwatch — the same turn a device pays.
//
// The row keeps its own component, which is the device screen's shape and NOT the cheaper one.
// `CLAUDE.md` prices an Angular per-row component at ~81 us per instance (an LView, a DI scope, two
// `EventEmitter`s) and `examples/angular`'s screen carries an `Inline rows` toggle to measure it
// apart. Inlining here would make this column faster than the four it is read against, all of which
// have a real component per row.
//
// `Component({...})(Klass)` rather than a decorator, and `@angular/compiler` imported for a runtime
// template compile — the same deal every Angular suite in this repo makes.
//
// RUN ON `build-release` (`pnpm run bench:itest`).

import '@angular/compiler';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  Input,
  signal,
} from '@angular/core';

import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { mount, registerComposedComponent } from '@symbiote-native/angular';

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

Component({
  // NOT a `symbiote-` prefixed selector: that prefix is how the adapter recognises its own host
  // primitives, so `symbiote-bench-row` committed a real native view and the row read as ELEVEN
  // nodes. The device screen's row is `selector: 'BenchmarkRow'` for the same reason — a component
  // host has to stay an anchor.
  selector: 'BenchRow',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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
      <text-input [style]="inputStyle" [text]="row.label" />
    </view>
  `,
})(BenchRow);

// An app's own composed component has to say so, or Angular's automatic host element falls through
// to a raw Fabric `createNode` and the row commits ELEVEN nodes — measured here before this line
// existed (`BenchRow=1000` in the census). On device a Babel plugin injects this call for every
// `@Component`; the itest runner does not run that plugin, so it is written out, exactly as
// `angular-benchmark-row-shape.itest.ts` does.
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
  selector: 'symbiote-bench-screen',
  standalone: true,
  imports: [BenchRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
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

describe('the benchmark screen through the Angular adapter', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, BenchScreen);
    await settle();
    surface.commit();
    mounted();

    if (host === undefined) throw new Error('the screen never rendered');
    const screen = host;

    await runBenchSuite({
      name: 'angular',
      // The root, the container `createSurface` puts under it, and the screen's own wrapper. The
      // per-row component costs an anchor in the adapter's DOM shim, not a committed node.
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
