// Does selecting a row through the Angular arm reach Fabric at all?
//
// why: the benchmark suite's per-step counters say it does not. On the identical step every other
// adapter reports `setProps=1 batches=2`, and Angular reports `setProps=0 batches=0` — the step
// writes nothing and never crosses. Its wall clock is then the fastest of the six (2-5 ms against
// 11-14), which is what a step that does nothing looks like.
//
// NO ORACLE IN THAT SUITE CAN SEE IT, and that is the point of this file. `bench-suite.ts` asserts
// the committed NODE COUNT before every clock, and a selection changes no node — it changes one
// node's style. It is the same shape as the stock arm's bare text input: the census matched, the
// name matched, the count matched, and the work was missing.
//
// So this asserts the PAYLOAD. Whether Angular's zoneless scheduler settles inside the suite's turn
// is a question about the arm; whether the selected style reaches the node is a question about the
// adapter, and only the second one is a bug if it fails.
//
// RUN ON EITHER BUILD — this is a correctness claim, not a timing.

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
  readAngularProfileDetail,
  registerComposedComponent,
  setAngularProfileDetail,
  unmount,
} from '@symbiote-native/angular';

import { ROW_STYLE, SELECTED_ROW_STYLE, type IBenchRow } from './bench-suite';
import {
  describe,
  expect,
  findAllCommitted,
  findByTestId,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 3;
/** The benchmark arm's own width, for the case that reproduces its shape. */
const SUITE_ROWS = 1_000;
const SELECT_INDEX = 1;

class BenchRow {
  @Input({ required: true }) row!: IBenchRow;
  @Input() isSelected = false;
  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
}

Component({
  selector: 'BenchRow',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view
    [style]="isSelected ? selectedRowStyle : rowStyle"
    [testID]="'row-' + row.id"
  ></view>`,
})(BenchRow);

registerComposedComponent('BenchRow');

let host: Screen | undefined;

class Screen {
  readonly rows = signal<readonly IBenchRow[]>([]);
  readonly selectedId = signal<number | undefined>(undefined);

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

Component({
  selector: 'select-screen',
  standalone: true,
  imports: [BenchRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="{ flex: 1 }">
    @for (row of rows(); track row.id) {
      <BenchRow [row]="row" [isSelected]="row.id === selectedId()" />
    }
  </view>`,
})(Screen);

// The ARM's own shape: one signal holding `{ rows, selectedId }`, replaced wholesale.
let oneSignalHost: OneSignalScreen | undefined;

class OneSignalScreen {
  readonly state = signal<{
    rows: readonly IBenchRow[];
    selectedId: number | undefined;
  }>({ rows: [], selectedId: undefined });

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    oneSignalHost = this;
  }
}

Component({
  selector: 'one-signal-screen',
  standalone: true,
  imports: [BenchRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="{ flex: 1 }">
    @for (row of state().rows; track row.id) {
      <BenchRow [row]="row" [isSelected]="row.id === state().selectedId" />
    }
  </view>`,
})(OneSignalScreen);

// The same screen with the row INLINED — no per-row component, so no `@Input()` hop. If this one
// paints and the component one does not, the defect is in how a rebuilt component input reacts; if
// both go dark, it is `@for` plus the signal.
let inlineHost: InlineScreen | undefined;

class InlineScreen {
  readonly state = signal<{
    rows: readonly IBenchRow[];
    selectedId: number | undefined;
  }>({ rows: [], selectedId: undefined });

  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    inlineHost = this;
  }
}

Component({
  selector: 'inline-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="{ flex: 1 }">
    @for (row of state().rows; track row.id) {
      <view
        [style]="row.id === state().selectedId ? selectedRowStyle : rowStyle"
        [testID]="'row-' + row.id"
      ></view>
    }
  </view>`,
})(InlineScreen);

// The same per-row component, NOT registered as a composed host. `registerComposedComponent` is ours
// — it keeps a component's automatic host element an ANCHOR instead of a real Fabric node — so if the
// unregistered twin paints and the registered one does not, the defect is on our side of the seam.
class PlainRow {
  @Input({ required: true }) row!: IBenchRow;
  @Input() isSelected = false;
  readonly rowStyle = ROW_STYLE;
  readonly selectedRowStyle = SELECTED_ROW_STYLE;
}

Component({
  selector: 'PlainRow',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view
    [style]="isSelected ? selectedRowStyle : rowStyle"
    [testID]="'plain-' + row.id"
  ></view>`,
})(PlainRow);

let plainHost: PlainScreen | undefined;

class PlainScreen {
  readonly state = signal<{
    rows: readonly IBenchRow[];
    selectedId: number | undefined;
  }>({ rows: [], selectedId: undefined });

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    plainHost = this;
  }
}

Component({
  selector: 'plain-screen',
  standalone: true,
  imports: [PlainRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="{ flex: 1 }">
    @for (row of state().rows; track row.id) {
      <PlainRow [row]="row" [isSelected]="row.id === state().selectedId" />
    }
  </view>`,
})(PlainScreen);

// THE FORK THIS FILE STILL OWES AN ANSWER TO. Every case above reads the committed PAYLOAD, so a
// dark row could mean either of two opposite things: Angular never told the component its input
// changed, or it did and the write was lost on our side. A counting SETTER separates them — it is
// the last place inside Angular before anything of ours runs.
const inputCalls: { count: number; values: boolean[] } = {
  count: 0,
  values: [],
};
// The CHILD's own template evaluations, counted the only way a template can be: through what it
// reads. It splits the fork one step further — a setter that fires and a getter that does not means
// the component was told and never re-rendered.
const templateReads: { count: number; values: boolean[] } = {
  count: 0,
  values: [],
};

class CountingRow {
  @Input({ required: true }) row!: IBenchRow;

  #isSelected = false;

  @Input()
  set isSelected(value: boolean) {
    inputCalls.count += 1;
    inputCalls.values.push(value);
    this.#isSelected = value;
  }

  get isSelected(): boolean {
    return this.#isSelected;
  }

  get styleNow(): typeof ROW_STYLE | typeof SELECTED_ROW_STYLE {
    templateReads.count += 1;
    templateReads.values.push(this.#isSelected);
    return this.#isSelected ? SELECTED_ROW_STYLE : ROW_STYLE;
  }
}

Component({
  selector: 'CountingRow',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="styleNow" [testID]="'count-' + row.id"></view>`,
})(CountingRow);

let countingHost: CountingScreen | undefined;

class CountingScreen {
  readonly state = signal<{
    rows: readonly IBenchRow[];
    selectedId: number | undefined;
  }>({ rows: [], selectedId: undefined });

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    countingHost = this;
  }
}

Component({
  selector: 'counting-screen',
  standalone: true,
  imports: [CountingRow],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view [style]="{ flex: 1 }">
    @for (row of state().rows; track row.id) {
      <CountingRow [row]="row" [isSelected]="row.id === state().selectedId" />
    }
  </view>`,
})(CountingScreen);

/** One zoneless turn, exactly as `angular-suite.itest.ts` spells it. */
const settle = async (): Promise<void> => {
  // GENEROUSLY MANY ROUNDS on purpose. The question this file asks is whether the selection ever
  // reaches Fabric, not how few turns it needs — so the settle must be past any doubt, or a red case
  // would only prove the fixture impatient. Angular notifies on a microtask and re-checks on a
  // timer, so the two are alternated.
  for (let round = 0; round < 16; round += 1) {
    await Promise.resolve();
    flushTimers();
  }
};

describe('selecting a row through the Angular adapter', () => {
  // why: a selected row commits a different style. That is the whole product rule, and the benchmark
  // suite's own counters say the step writes nothing — which would mean the screen never shows a
  // selection, silently, on this adapter alone.
  it('commits the selected style onto the selected row', async () => {
    const surface = mount(ROOT_TAG, Screen);
    await settle();
    surface.commit();
    mounted();

    if (host === undefined) throw new Error('the screen never rendered');
    const screen = host;

    const rows: IBenchRow[] = [];
    for (let id = 0; id < ROWS; id += 1) rows.push({ id, label: `row ${id}` });
    screen.rows.set(rows);
    await settle();
    surface.commit();
    mounted();

    const before = findByTestId(`row-${SELECT_INDEX}`);
    print(`DEBUG before select :: ${JSON.stringify(before?.props ?? null)}`);
    expect(before !== undefined).toBe(true);

    screen.selectedId.set(SELECT_INDEX);
    await settle();
    surface.commit();
    mounted();

    const after = findByTestId(`row-${SELECT_INDEX}`);
    print(`DEBUG after select  :: ${JSON.stringify(after?.props ?? null)}`);
    expect(after !== undefined).toBe(true);

    // The selected style adds a left border the unselected one does not have. Asserting a KEY the
    // two styles differ on, rather than the whole bag, so the case survives a change to the row's
    // ordinary style and fails only on the thing it is about.
    const painted = JSON.stringify(after?.props ?? {});
    expect(painted.includes(String(SELECTED_ROW_STYLE.borderLeftWidth))).toBe(
      true,
    );

    unmount(ROOT_TAG);
  });

  // why: a keyed replace destroys every embedded view, which makes Angular call `destroy()` on the
  // ONE renderer the factory shares across the whole surface — and a selection written afterwards
  // still has to paint. It did not for as long as that `destroy()` also closed the renderer's flush
  // door, and the write then surfaced two steps later, on whichever node's style run happened to
  // close the accumulator next.
  //
  // FIXED 2026-09-21 (`SymbioteRendererFactory.dispose`); this case was pinned to the broken answer
  // before that and is the reason the fix could be recognised as one.
  it('repaints a component row after a keyed replace', async () => {
    const surface = mount(ROOT_TAG, OneSignalScreen);
    await settle();
    surface.commit();
    mounted();

    if (oneSignalHost === undefined)
      throw new Error('the screen never rendered');
    const screen = oneSignalHost;

    // THE ARM'S SCALE AND THE ARM'S STEP ORDER, because neither is obviously irrelevant: the suite
    // selects after a `partial` that hands `@for` a new array holding mostly the same row objects,
    // and it does it over a thousand embedded views rather than three.
    const rows: IBenchRow[] = [];
    for (let id = 0; id < SUITE_ROWS; id += 1) {
      rows.push({ id, label: `row ${id}` });
    }
    screen.state.set({ rows, selectedId: undefined });
    await settle();
    surface.commit();
    mounted();

    // REPLACE: a thousand unseen ids, so `@for` tears every embedded view down and builds a new one.
    // The arm does this before it selects, and a rebuilt view is the one thing left that could have
    // stopped being a consumer of the signal the selection reads.
    const replaced: IBenchRow[] = [];
    for (let id = 0; id < SUITE_ROWS; id += 1) {
      replaced.push({ id: SUITE_ROWS + id, label: `row ${SUITE_ROWS + id}` });
    }
    screen.state.set({ rows: replaced, selectedId: undefined });
    await settle();
    surface.commit();
    mounted();

    const partial = replaced.map((row, index) =>
      index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
    );
    screen.state.set({ rows: partial, selectedId: undefined });
    await settle();
    surface.commit();
    mounted();

    // The arm selects by the ID standing at that index, not by the index — after a replace those are
    // different numbers, and picking the wrong one would look exactly like a selection that never
    // painted.
    const selectedId = partial[SELECT_INDEX].id;
    screen.state.set({ rows: partial, selectedId });
    await settle();
    surface.commit();
    mounted();

    const painted = JSON.stringify(
      findByTestId(`row-${selectedId}`)?.props ?? {},
    );
    print(`DEBUG one-signal after select :: ${painted}`);
    expect(painted.includes(String(SELECTED_ROW_STYLE.borderLeftWidth))).toBe(
      true,
    );

    unmount(ROOT_TAG);
  });

  // why: narrows the case above to a layer. Same signal, same steps, same widths — the row's markup
  // is inlined into the `@for` instead of living behind an `@Input()`.
  it('commits the selected style after a replace when the row is inlined', async () => {
    const surface = mount(ROOT_TAG, InlineScreen);
    await settle();
    surface.commit();
    mounted();

    if (inlineHost === undefined) throw new Error('the screen never rendered');
    const screen = inlineHost;

    const fill = async (
      rows: readonly IBenchRow[],
      selectedId: number | undefined,
    ): Promise<void> => {
      screen.state.set({ rows, selectedId });
      await settle();
      surface.commit();
      mounted();
    };

    const first: IBenchRow[] = [];
    for (let id = 0; id < SUITE_ROWS; id += 1) {
      first.push({ id, label: `row ${id}` });
    }
    await fill(first, undefined);

    const replaced: IBenchRow[] = [];
    for (let id = 0; id < SUITE_ROWS; id += 1) {
      replaced.push({ id: SUITE_ROWS + id, label: `row ${SUITE_ROWS + id}` });
    }
    await fill(replaced, undefined);

    const selectedId = replaced[SELECT_INDEX].id;
    await fill(replaced, selectedId);

    const painted = JSON.stringify(
      findByTestId(`row-${selectedId}`)?.props ?? {},
    );
    print(`DEBUG inlined after replace+select :: ${painted}`);
    expect(painted.includes(String(SELECTED_ROW_STYLE.borderLeftWidth))).toBe(
      true,
    );

    unmount(ROOT_TAG);
  });

  // why: decided ownership while the defect stood — identical in every respect except that this row
  // is NOT registered as a composed host, which was the one thing on our side of the seam that
  // looked like a suspect. It went dark exactly as the registered twin did, which is what ruled the
  // registry out and sent the search to the renderer's lifetime. Kept as the guard for BOTH shapes.
  it('repaints an UNregistered row component too, so neither shape depends on the registry', async () => {
    const surface = mount(ROOT_TAG, PlainScreen);
    await settle();
    surface.commit();
    mounted();

    if (plainHost === undefined) throw new Error('the screen never rendered');
    const screen = plainHost;

    const fill = async (
      rows: readonly IBenchRow[],
      selectedId: number | undefined,
    ): Promise<void> => {
      screen.state.set({ rows, selectedId });
      await settle();
      surface.commit();
      mounted();
    };

    const first: IBenchRow[] = [];
    for (let id = 0; id < SUITE_ROWS; id += 1) {
      first.push({ id, label: `row ${id}` });
    }
    await fill(first, undefined);

    const replaced: IBenchRow[] = [];
    for (let id = 0; id < SUITE_ROWS; id += 1) {
      replaced.push({ id: SUITE_ROWS + id, label: `row ${SUITE_ROWS + id}` });
    }
    await fill(replaced, undefined);

    const selectedId = replaced[SELECT_INDEX].id;
    await fill(replaced, selectedId);

    const painted = JSON.stringify(
      findByTestId(`plain-${selectedId}`)?.props ?? {},
    );
    print(`DEBUG unregistered after replace+select :: ${painted}`);
    expect(painted.includes(String(SELECTED_ROW_STYLE.borderLeftWidth))).toBe(
      true,
    );

    unmount(ROOT_TAG);
  });

  // why: this case is what LOCATED the defect, and it earns its place afterwards by pinning all
  // three layers at once. It asks the questions the committed payload cannot: did Angular
  // re-evaluate the binding (`@Input()` setter), did the child re-render (a getter the template
  // reads), did our Renderer2 get called (`rendererWrites`), and did it reach the engine
  // (`setProps`). The answers ran 1 / 1 / 3 / 0 — every layer but the last — which is what named
  // the renderer's lifetime rather than Angular's change detection.
  //
  // Kept because a regression can now re-break it at ANY of the four and the line says which.
  it('carries a selection through all four layers after a keyed replace', async () => {
    const surface = mount(ROOT_TAG, CountingScreen);
    await settle();
    surface.commit();
    mounted();

    if (countingHost === undefined)
      throw new Error('the screen never rendered');
    const screen = countingHost;

    // SMALL, deliberately: the question is whether a call happens, and three rows make the log
    // readable where a thousand would not. The scale was already shown not to matter — the
    // thousand-row case above and the three-row one here go dark the same way.
    const rows: IBenchRow[] = [];
    for (let id = 0; id < ROWS; id += 1) rows.push({ id, label: `row ${id}` });
    screen.state.set({ rows, selectedId: undefined });
    await settle();
    surface.commit();
    mounted();

    const replaced: IBenchRow[] = [];
    for (let id = 0; id < ROWS; id += 1) {
      replaced.push({ id: ROWS + id, label: `row ${ROWS + id}` });
    }
    screen.state.set({ rows: replaced, selectedId: undefined });
    await settle();
    surface.commit();
    mounted();

    const afterReplace = inputCalls.count;
    const readsAfterReplace = templateReads.count;
    const selectedId = replaced[SELECT_INDEX].id;
    // Both drained so the counts below belong to the select turn alone — each zeroes on read.
    // The DETAIL map names the prop behind each write, which is the difference between "three
    // writes happened" and "three writes of the three keys this selection changes".
    setAngularProfileDetail(true);
    readSurfaceTelemetry(ROOT_TAG);
    readAngularProfile();
    readAngularProfileDetail();
    screen.state.set({ rows: replaced, selectedId });
    await settle();
    surface.commit();
    const writesDuringSelect = readSurfaceTelemetry(ROOT_TAG)?.setProps ?? 0;
    const profile = readAngularProfile();
    const detail = readAngularProfileDetail();
    setAngularProfileDetail(false);
    mounted();

    const duringSelect = inputCalls.count - afterReplace;
    const readsDuringSelect = templateReads.count - readsAfterReplace;
    const painted = JSON.stringify(
      findByTestId(`count-${selectedId}`)?.props ?? {},
    );
    print(
      `DEBUG INPUT CALLS  mount+replace=${afterReplace} select=${duringSelect} ` +
        `values=${JSON.stringify(inputCalls.values.slice(afterReplace))}`,
    );
    print(
      `DEBUG CHILD RENDER mount+replace=${readsAfterReplace} select=${readsDuringSelect} ` +
        `values=${JSON.stringify(templateReads.values.slice(readsAfterReplace))} · ` +
        `painted=${painted.includes(String(SELECTED_ROW_STYLE.borderLeftWidth))}`,
    );
    // WHERE DID IT GO, if Angular resolved it and the row does not carry it? A write landing on a
    // node that left the tree looks exactly like a write that never happened, and the two have
    // opposite causes. So the whole committed tree is asked, not just the row.
    const carriers = findAllCommitted(node =>
      JSON.stringify(node.props ?? {}).includes('"borderLeftWidth":'),
    );
    print(
      `DEBUG WHERE        nodes carrying borderLeftWidth=${carriers.length} ` +
        `testIDs=${JSON.stringify(
          carriers.map(node => node.props?.testID ?? null),
        )} · the row itself :: ${JSON.stringify(
          findByTestId(`count-${selectedId}`)?.props ?? null,
        )}`,
    );
    // DID THE WRITE REACH THE ENGINE AT ALL? `setProps` counts what crossed, so a zero here means
    // the renderer was never called and a one means it was called and the value was turned away —
    // and those are opposite bugs in opposite files. Read AFTER the prints above, because the
    // counter zeroes on read and whoever reads first takes it.
    // THREE LAYERS ON ONE LINE, and between them there is nowhere left for the write to hide:
    // Angular's own change detection (`cdPasses`/`viewsChecked`), our Renderer2 (`rendererWrites`,
    // which `setStyle` raises before anything else it does), and the engine (`setProps`).
    print(
      `DEBUG LAYERS       cdPasses=${profile.cdPasses} viewsChecked=${profile.viewsChecked} ` +
        `rendererWrites=${profile.rendererWrites} styleChecks=${profile.styleChecks} ` +
        `styleMarks=${profile.styleMarks} · engine setProps=${writesDuringSelect}`,
    );
    print(`DEBUG WRITTEN      ${JSON.stringify(detail.writesByProp)}`);

    // ALL FOUR, in order, so a regression names its own layer instead of reading as "Angular broke".
    expect(duringSelect > 0).toBe(true);
    expect(readsDuringSelect > 0).toBe(true);
    expect(profile.rendererWrites > 0).toBe(true);
    expect(writesDuringSelect).toBe(1);
    // AND THE PAYLOAD, because the three counters above were ALL true while the row stayed dark —
    // that was the defect, and a count is not a paint.
    expect(painted.includes(String(SELECTED_ROW_STYLE.borderLeftWidth))).toBe(
      true,
    );

    unmount(ROOT_TAG);
  });
});

report();
