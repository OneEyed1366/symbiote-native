// The Angular element-directive arm with the row written INLINE in `@for` instead of as a component.
//
// `angular-elements-suite.itest.ts` is the shape the device screen runs: a `BenchRow` component per
// row. This file is the same ten-node row, the same directives, the same eight steps — only the
// component boundary is gone. The difference between the two RESULT lines is what one component
// instance per row costs (its LView, NodeInjector, renderer handout, host element, CD visit), which is
// the number any attempt to stop paying it has to be read against.
//
// A measurement arm, not a recommendation to authors: the developer writes the component, and the
// adapter has to make it cheap at run time (`<angular_no_template_transform>`).

import '@angular/compiler';
import { Component, signal } from '@angular/core';
import { readSurfaceTelemetry } from '@symbiote-native/engine';
import { SYMBIOTE_ELEMENTS, mount } from '@symbiote-native/angular';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  runBenchSuite,
  type IBenchState,
} from './bench-suite';
import { describe, flushTimers, it, mounted, report } from './harness';

let host: BenchScreen | undefined;

class BenchScreen {
  readonly state = signal<IBenchState>({ rows: [], selectedId: undefined });
  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

Component({
  selector: 'symbiote-bench-inline-screen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="{ flex: 1 }">
      @for (row of state().rows; track row.id) {
        <view
          [style]="row.id === state().selectedId ? selectedRowStyle : rowStyle"
        >
          <text ellipsizeMode="tail">{{ row.id }}</text>
          <view [style]="cellStyle"
            ><text ellipsizeMode="tail">{{ row.label }}</text></view
          >
          <view [style]="cellStyle"><text ellipsizeMode="tail">x</text></view>
          <text-input [style]="inputStyle" [value]="row.label"></text-input>
        </view>
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

describe('the benchmark screen with the row inline in @for', () => {
  it('runs the eight device steps', async () => {
    const surface = mount(ROOT_TAG, BenchScreen);
    await settle();
    surface.commit();
    mounted();

    if (host === undefined) throw new Error('the screen never rendered');
    const screen = host;

    await runBenchSuite({
      name: 'ng-inline',
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
