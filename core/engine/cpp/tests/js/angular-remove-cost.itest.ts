// Why removing ONE row of a thousand costs Angular 12-15 ms where every other non-React adapter
// pays 3.6-5.1 — the one row the project's own thesis says we should win, measured on the eight-step
// suite, release build, repeated.
//
//   arm      wall  walk  apply  fabric  layout  cloned  reused  setProps
//   vue       4.4   0.6    2.6     1.8     1.1       2     999         0
//   angular  13.3   0.4   10.7     9.7     8.8       3    1002         1
//
// The walk is IDENTICAL. What differs is the PLATFORM — Fabric's own commit and the Yoga pass — by
// five to seven times, on a tree that ends at the same 9 993 nodes either way.
//
// AND THE ADAPTER IS ALREADY DOING THE MINIMAL THING, which is what makes this worth a file rather
// than a fix. Its renderer emits `inserted=0 removed=1 writes=0` for that step: one `removeChild`,
// not a prop written, exactly what a framework that tracks its list should emit. So the cost is not
// in what Angular asks for.
//
// A PER-ROW COMPONENT COSTS ONE ANCHOR PER ROW AND THAT ANCHOR IS FREE ON A REMOVAL. The A/B below
// is what this file settles, and it settles it the other way from the hypothesis that prompted it:
//
//   anchored (a component per row)   inserted 11000   remove wall 6.0  fabric 2.0  cloned 2  setProps 0
//   inlined  (the markup in `@for`)  inserted 10000   remove wall 6.6  fabric 1.7  cloned 2  setProps 0
//
// The anchors are REAL — a thousand extra nodes inserted on the build, exactly one per row, which is
// the count this case asserts. They simply cost nothing when a row leaves: both spellings clone two
// nodes, write no prop, and hand Fabric the same work.
//
// SO THE SUITE'S 13 ms IS NOT THE ANCHOR, and that matters because the obvious A/B says it is.
// Inlining the row inside `angular-suite.itest.ts` itself drops its removal from 13.3 to 7.9 ms with
// the census going `cloned 3 -> 2`, `setProps 1 -> 0`, `fabric 9.7 -> 2.5`. Read alone that is a
// clean attribution to the component. Read beside the arms above it cannot be: the anchored arm here
// has every one of those anchors and none of that cost.
//
// WHAT IS LEFT, stated as the open question rather than guessed at: the expensive removal needs the
// suite's STEP HISTORY — create, replace, partial, select, swap — and not merely the row's shape.
// Something those steps leave standing turns a removal that costs 6 ms into one that costs 13, and
// the per-row component is necessary for it but not sufficient. Naming it is the next thing to do.
//
// A NOTE ON REPRODUCTION, because it cost most of the time this took: four reconstructions of the
// suite's sequence by hand — including one that threaded the state exactly as `bench-suite.ts` does
// and matched its committed node count to the node — all read `cloned=2 reused=999 setProps=0`, and
// all PASSED on their first run while proving nothing. The only instrument that moved the number was
// changing one thing in the real arm and re-measuring it. Prefer that to a reproduction whenever the
// subject can be edited, and treat a first-run green on a reproduction as a warning.
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
import {
  mount,
  readAngularProfile,
  registerComposedComponent,
  unmount,
} from '@symbiote-native/angular';

import {
  CELL_STYLE,
  INPUT_STYLE,
  ROOT_TAG,
  ROW_STYLE,
  SELECTED_ROW_STYLE,
  type IBenchRow,
  type IBenchState,
} from './bench-suite';
import {
  committedTags,
  describe,
  expect,
  flushTimers,
  it,
  print,
  report,
} from './harness';

const ROWS = 1_000;
const NODES_PER_ROW = 10;

class BenchRow {
  @Input() row!: IBenchRow;
  @Input() isSelected = false;

  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

const ROW_MARKUP = `
  <view [style]="isSelected ? selectedRowStyle : rowStyle" [testID]="'row-' + row.id">
    <text ellipsizeMode="tail">{{ row.id }}</text>
    <view [style]="cellStyle"><text ellipsizeMode="tail">{{ row.label }}</text></view>
    <view [style]="cellStyle"><text ellipsizeMode="tail">x</text></view>
    <text-input [style]="inputStyle" [text]="row.label" />
  </view>
`;

Component({
  // NOT a `symbiote-` prefixed selector: that prefix is how the adapter recognises its own host
  // primitives, so a prefixed one would commit a real native view and the row would read as ELEVEN
  // nodes — which is a different tree and would make the A/B compare two workloads.
  selector: 'BenchAnchoredRow',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: ROW_MARKUP,
})(BenchRow);

registerComposedComponent('BenchAnchoredRow');

abstract class BenchScreen {
  readonly state = signal<IBenchState>({ rows: [], selectedId: undefined });

  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

let anchoredHost: BenchScreen | undefined;
let inlinedHost: BenchScreen | undefined;

class AnchoredScreen extends BenchScreen {
  constructor() {
    super();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    anchoredHost = this;
  }
}

Component({
  selector: 'symbiote-anchored-screen',
  standalone: true,
  imports: [BenchRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view [style]="{ flex: 1 }">
      @for (row of state().rows; track row.id) {
        <BenchAnchoredRow
          [row]="row"
          [isSelected]="row.id === state().selectedId"
        />
      }
    </view>
  `,
})(AnchoredScreen);

class InlinedScreen extends BenchScreen {
  constructor() {
    super();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    inlinedHost = this;
  }
}

Component({
  selector: 'symbiote-inlined-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // The same markup with `isSelected` resolved inline — no component, therefore no anchor. Written
  // out rather than shared with `ROW_MARKUP`, because the binding it reads is the only difference
  // and hiding that behind a substitution is how an A/B stops being readable.
  template: `
    <view [style]="{ flex: 1 }">
      @for (row of state().rows; track row.id) {
        <view
          [style]="row.id === state().selectedId ? selectedRowStyle : rowStyle"
          [testID]="'row-' + row.id"
        >
          <text ellipsizeMode="tail">{{ row.id }}</text>
          <view [style]="cellStyle"
            ><text ellipsizeMode="tail">{{ row.label }}</text></view
          >
          <view [style]="cellStyle"><text ellipsizeMode="tail">x</text></view>
          <text-input [style]="inputStyle" [text]="row.label" />
        </view>
      }
    </view>
  `,
})(InlinedScreen);

const settle = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

type IArm = {
  readonly inserted: number;
  readonly wall: number;
  readonly fabric: number;
  readonly cloned: number;
  readonly setProps: number;
};

describe('what a per-row component costs Angular on a removal', () => {
  const runArm = async (
    name: string,
    screenClass: typeof AnchoredScreen,
    hostOf: () => BenchScreen | undefined,
  ): Promise<IArm> => {
    const surface = mount(ROOT_TAG, screenClass);
    await settle();
    surface.commit();
    committedTags();
    const screen = hostOf();
    if (screen === undefined) throw new Error(`${name} never rendered`);

    const rows: readonly IBenchRow[] = Array.from(
      { length: ROWS },
      (_, id) => ({ id, label: `row ${id}` }),
    );
    readAngularProfile();
    screen.state.set({ rows, selectedId: undefined });
    await settle();
    surface.commit();
    const built = committedTags().length;
    const buildProfile = readAngularProfile();
    readSurfaceTelemetry(ROOT_TAG);

    const startedAt = performance.now();
    screen.state.set({
      rows: rows.filter(row => row.id !== rows[3].id),
      selectedId: undefined,
    });
    await settle();
    surface.commit();
    const wall = performance.now() - startedAt;
    const remaining = committedTags().length;
    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    unmount(ROOT_TAG);

    print(
      `DEBUG ${name.padEnd(9)} inserted=${buildProfile.nodesInserted} ` +
        `wall=${wall.toFixed(1)} walk=${(telemetry?.walkMs ?? 0).toFixed(1)} ` +
        `fabric=${(telemetry?.commitMs ?? 0).toFixed(1)} ` +
        `layout=${(telemetry?.layoutMs ?? 0).toFixed(1)} ` +
        `cloned=${telemetry?.nodesCloned ?? 0} reused=${telemetry?.nodesReused ?? 0} ` +
        `setProps=${telemetry?.setProps ?? 0}`,
    );

    // THE ORACLE, PER ARM AND BEFORE ANY COMPARISON. Both spellings must build and then leave the
    // SAME tree, or the two clocks are two workloads. An anchor is not committed, so these counts
    // agree while `inserted` does not — which is the whole point of reading both.
    expect(built).toBe(ROWS * NODES_PER_ROW + 3);
    expect(remaining).toBe((ROWS - 1) * NODES_PER_ROW + 3);

    return {
      inserted: buildProfile.nodesInserted,
      wall,
      fabric: telemetry?.commitMs ?? 0,
      cloned: telemetry?.nodesCloned ?? 0,
      setProps: telemetry?.setProps ?? 0,
    };
  };

  // why: the suite's `remove` row is Angular's worst standing against the other adapters, and
  // inlining the row inside that arm halves it — which reads as an attribution to the per-row
  // component. This holds the component's anchors constant and prices them on their own, in the one
  // currency that cannot be argued with, and finds them free.
  it('inserts one anchor per row and pays nothing for it when a row leaves', async () => {
    const anchored = await runArm(
      'anchored',
      AnchoredScreen,
      () => anchoredHost,
    );
    const inlined = await runArm('inlined', InlinedScreen, () => inlinedHost);

    print(
      `DEBUG per-row anchor: ${(anchored.wall - inlined.wall).toFixed(1)} ms on a removal, ` +
        `${anchored.inserted - inlined.inserted} extra nodes inserted on the build`,
    );

    // THE FINDING, AS A COUNT. One anchor per row, exact rather than approximate — the milliseconds
    // beside it are a small-ms row and carry no verdict, which is precisely why the claim is made
    // here and not there.
    expect(anchored.inserted - inlined.inserted).toBe(ROWS);

    // AND THE NEGATIVE, in the engine's own counters rather than a clock: a thousand anchors change
    // NOTHING about what the removal costs the engine or the platform. Asserted on both arms and not
    // just the cheap one, because the claim is that they AGREE.
    expect(anchored.cloned).toBe(inlined.cloned);
    expect(anchored.setProps).toBe(inlined.setProps);
    expect(anchored.setProps).toBe(0);
  });
});

report();
