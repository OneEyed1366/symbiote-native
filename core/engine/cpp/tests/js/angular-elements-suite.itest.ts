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
//
// AND RUN THE ARMS ONE AT A TIME when the numbers are meant to be compared. `pnpm run bench:itest`
// fills `availableParallelism()` slots, so seven suites contend: measured 2026-09-18, the same
// sitting read stock 107.4 / ng-elements 264.9 in one parallel run and stock 88.6 / ng-elements
// 234.5 sequentially. The RATIO survives that and the absolute numbers do not, so a figure quoted
// off a parallel run is not on the same ruler as one quoted off a sequential one.
//
// ONE RULER, sequential, one process per arm, `build-release`, 2026-09-18 — AFTER `mount()` began
// turning Angular's dev mode off in a release bundle (`render/index.ts`, `settleAngularDevMode`):
//
//              stock  react    vue  solid svelte  angular  ng-elements
//   create      88.6  103.6  138.1   94.7  104.7    147.9        234.5
//   replace     99.8  111.6  151.9  108.0  123.2    161.9        246.9
//   append     123.2  112.9  141.5  106.9  116.8    149.5        235.6
//
// Both Angular arms moved with that one change, because both mount through the same function:
// ng-elements ~292 -> ~234 and the bare arm ~178 -> ~148, census byte-identical on both
// (created=10000 setProps=10000 unchanged=3000 nodes=10003) and walk/apply/fabric/layout unmoved.
// So ng-elements is 2.65x stock where it was 3.19x, and the whole delta is pass 1.
//
// WHAT IS LEFT is the 86.6 ms between the two Angular arms — the directives themselves, ~8.7 us per
// element. `adapters/angular/src/directive-shape-cost.probe.test.ts` takes that apart, but read its
// caveat first: it runs under vitest, where Angular's dev mode is still ON, so its per-injection
// figure is a dev-mode one and is larger than what this arm now pays.
//
// AND THE DIRECTIVE IS DEARER WHILE WRITING LESS, which is the fact that decides what to do about
// it. `setAngularProfileDetail` on the create step of each arm, same tree, same ten-node row:
//
//   this arm    style=4000            ellipsizeMode=6000  testID=1000  value=1000  #text=2000
//   bare arm    style.height=2000 style.flex=2000 style.flexDirection=1000
//               style.paddingLeft=1000 style.width=1000   ellipsizeMode=3000 …
//
// So the declared `style` input DOES claim the binding — 4 000 whole objects against 7 000 per-key
// `setStyle` calls through `ɵɵstyleMap`, which is what the input shadow is for and it is working.
// The directive still costs ~72-86 ms while making FEWER renderer calls, so the price is matching and
// instantiating it, not the writes it performs. No write-side change can reach that.
//
// `ellipsizeMode` reading 6 000 against the bare arm's 3 000 is the `unchanged=3000` double write
// this file's census already carries: a STATIC attribute goes through `setUpAttributes` AND feeds the
// directive input, so a directive turns one authored attribute into two renderer calls. Priced
// separately at ~0.3 ms — real, and not where the 86 ms is.
//
// THE ONLY IDEA LEFT IS TO REMOVE THE DIRECTIVE FROM THE RUNTIME, and the two arms are already most
// of the evidence that it would work. `SymbioteElement.ngOnChanges` forwards each changed input with
// `renderer.setProperty(host, name, …)` — which is the call `ɵɵproperty` makes DIRECTLY on an element
// no directive claimed. Same destination, one hop shorter, and the bare arm passes the same oracle on
// the same screen. What the bare shape genuinely loses is not the writes: it is `wrapCallback` (an
// `on*` function prop wrapped so Angular learns it fired), `ReadBackElement`'s `registerViewFlush` on
// `text-input`/`switch`/`refresh-control`, and the style shadow above. This screen exercises none of
// the first two, so the 86 ms is an upper bound on what a compile-time-only spelling could recover,
// not a promise.
//
// AND THE BARE ARM'S `remove` IS AN ARTIFACT OF THE BARE SHAPE. It reads 11.7-15.2 ms against every
// other non-React adapter's 3.6-5.1 and was chased at length as Angular's worst row
// (`angular-remove-cost.itest.ts`); this arm — the shape the device runs — reads **6.9**. So the
// anomaly lives only in the configuration nobody ships, and the row Angular actually pays on a
// removal is ordinary. Do not spend another session on it from the bare arm's number.

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
