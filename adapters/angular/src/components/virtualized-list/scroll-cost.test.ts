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
import { writeFileSync } from 'node:fs';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { readCommitProfile } from '@symbiote-native/engine';
import {
  buildOffsets,
  computeWindow,
  subscribeListDiagnostics,
  type IListDiagnosticFrame,
} from '@symbiote-native/components';

import { mount, unmount } from '../../render';
import { readAngularProfile } from '../../diagnostics';
import { registerComposedComponent } from '../../anchor-host-registry';
import { VirtualizedList, VListItemDirective } from './index';

registerComposedComponent('vlist-cost-screen');

const ROOT_TAG = 985;
const SCROLL_EVENT = 'topScroll';
const SCROLL_BURST = 10;
const ROW_COUNT = 5;
const fabric = installFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
// One incremental-fill tick (DEFAULT_UPDATE_CELLS_BATCHING_PERIOD + slack).
const settle = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 55));

// Pump the incremental fill until the committed window reaches the target, then stop. A fixed step
// count would have to assume the worst case, and every extra 55ms tick here lands on the WHOLE
// suite - flat-list-array-style.test.ts settles on wall clock and reads a slow neighbour as a
// free-running change detector.
async function fillToTarget(frames: IListDiagnosticFrame[]): Promise<void> {
  for (let step = 0; step < 120; step += 1) {
    const frame = frames[frames.length - 1];
    if (
      frame !== undefined &&
      frame.first <= frame.targetFirst &&
      frame.last >= frame.targetLast
    )
      return;
    const before = frames.length;
    await settle();
    if (frames.length === before) return;
  }
}

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
  readonly screenRows = Array.from(
    { length: ROW_COUNT },
    (_unused, index) => index,
  );
  readonly rowKey = (item: IRow): string => item.id;
  readonly getRow = (_data: unknown, index: number): IRow =>
    ROWS[index] ?? ROWS[0]!;
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
  if (mountedScreen === undefined)
    throw new Error('screen component was never constructed');
  return mountedScreen;
}

beforeEach(() => {
  mountedScreen = undefined;
  flingScreen = undefined;
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
      fabric.fireEvent(host, SCROLL_EVENT, {
        contentOffset: { x: 0, y: index },
      });
      await flush();
    }

    // ZERO: this list never receives a viewport, so its window is the initialNumToRender prefix and
    // no offset can move it - the screen owes nothing for any of the ten frames. It read ONE while
    // the gate compared the last-rendered window against the one before it, which lags the state by
    // a pass and paid for a move that had already happened; predicting the window from the LIVE
    // offset instead (isWindowSettled) drops that stale pass, which is why this number went 1 -> 0
    // rather than the property weakening. Before either gate existed: 10 and 50.
    expect(
      screen().templateReads - screenBefore,
      'the screen template must not re-run per scroll frame, only when the window moves',
    ).toBe(0);
    expect(
      screen().rowReads - rowsBefore,
      'and its @for rows follow it - this is the cost that scales with screen size',
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// The FLING measurement: what does one scroll frame cost when the window actually MOVES?
//
// The block above prices the cheap frame (window stays put). The device symptom is the other one:
// on a fast fling the JS thread drops to ~7fps and cells fill in behind the finger. Geometry is
// examples/angular's Benchmark sticky PATH B, flattened to the one stream VirtualizedList actually
// windows (SectionList is a wrapper over exactly this): 16 x (header + 32 rows + footer) = 544
// entries, getItemLayout, a 320px viewport, every virtualization prop at its RN default.
//
// Everything reported is an OPERATION COUNT, never a laptop millisecond - desktop V8 has already
// mispredicted Hermes once in this project (a 7.4x cut in engine calls that measured as zero time
// change on device). Counts survive the trip to the device; wall clock does not.
const ENTRY_COUNT = 544;
const ENTRIES_PER_SECTION = 34;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 28;
const SECTION_EXTENT = HEADER_HEIGHT + 32 * ROW_HEIGHT;
const VIEWPORT = 320;
// ~7000 px/s at 60Hz - a fling, not a drag.
const FLING_STEP = 120;
const FLING_FRAMES = 20;
// Past the 3200px overscan, so the window slides instead of growing.
const FLING_START = 6000;

function pathBLayout(
  _data: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const section = Math.floor(index / ENTRIES_PER_SECTION);
  const within = index - section * ENTRIES_PER_SECTION;
  const sectionOffset = section * SECTION_EXTENT;
  if (within === 0)
    return { length: HEADER_HEIGHT, offset: sectionOffset, index };
  if (within === ENTRIES_PER_SECTION - 1)
    return { length: 0, offset: sectionOffset + SECTION_EXTENT, index };
  return {
    length: ROW_HEIGHT,
    offset: sectionOffset + HEADER_HEIGHT + (within - 1) * ROW_HEIGHT,
    index,
  };
}

interface IEntry {
  id: string;
}

const ENTRIES: readonly IEntry[] = Array.from(
  { length: ENTRY_COUNT },
  (_unused, index) => ({ id: `e${index}` }),
);

registerComposedComponent('vlist-fling-screen');

let flingScreen: VListFlingScreen | undefined;

@Component({
  selector: 'vlist-fling-screen',
  standalone: true,
  imports: [VirtualizedList, VListItemDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <symbiote-text>{{ ownLabel }}</symbiote-text>
    <VirtualizedList
      [testID]="'vlist-fling-host'"
      [data]="entries"
      [getItem]="getEntry"
      [getItemCount]="getEntryCount"
      [keyExtractor]="entryKey"
      [getItemLayout]="itemLayout"
      [extraData]="extra()"
      [scrollEventThrottle]="16"
    >
      <ng-template vListItem let-entry>
        <symbiote-view
          ><symbiote-text>{{ entry.id }}</symbiote-text></symbiote-view
        >
      </ng-template>
    </VirtualizedList>
  `,
})
class VListFlingScreen {
  templateReads = 0;
  // A signal, not a plain field: a write schedules the zoneless tick that carries the new
  // @Input down, which is what an app doing the same thing gets.
  readonly extra = signal(0);
  readonly entries = ENTRIES;
  readonly itemLayout = pathBLayout;
  readonly entryKey = (entry: IEntry): string => entry.id;
  readonly getEntry = (_data: unknown, index: number): IEntry =>
    ENTRIES[index] ?? ENTRIES[0]!;
  readonly getEntryCount = (): number => ENTRY_COUNT;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    flingScreen = this;
  }

  get ownLabel(): string {
    this.templateReads += 1;
    return 'screen';
  }
}

// computeWindow's cost is EXACTLY readable off its own result: the first loop steps `first` times
// from index 0, the second steps `last - first` times, so one call walks `last + 2` entries. That
// makes `isWindowSettled`'s per-frame price a number rather than an estimate, with no probe inside
// the shipped code.
function windowScanSteps(window: { first: number; last: number }): number {
  return window.last + 2;
}

function flingReport(): string[] {
  return report;
}
const report: string[] = [];

describe('the cost of a FLING frame on PATH B geometry', () => {
  it('prices one window-moving scroll frame in operations', async () => {
    mount(ROOT_TAG, VListFlingScreen);
    await flush();

    const host = handleFor('vlist-fling-host');
    fabric.fireEvent(host, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    await flush();
    // Get into the STEADY state before timing. windowSize 21 on a 320px viewport buys
    // (21-1)/2 * 320 = 3200px of overscan on each side, so below offset 3200 the window's leading
    // edge never leaves index 0 and a scroll only ever GROWS the window - which prices a first
    // paint, not a fling. Park past the overscan and let the fill reach target first.
    const frames: IListDiagnosticFrame[] = [];
    const stop = subscribeListDiagnostics({
      onFrame: frame => frames.push(frame),
    });
    fabric.fireEvent(host, 'topScroll', {
      contentOffset: { x: 0, y: FLING_START },
    });
    await flush();
    await fillToTarget(frames);

    frames.length = 0;
    readAngularProfile();
    readCommitProfile();
    const screenBefore = flingScreen!.templateReads;

    let offset = FLING_START;
    const flingStart = performance.now();
    for (let frame = 0; frame < FLING_FRAMES; frame += 1) {
      offset += FLING_STEP;
      fabric.fireEvent(host, 'topScroll', {
        contentOffset: { x: 0, y: offset },
      });
      await flush();
    }
    const flingMs = performance.now() - flingStart;
    stop();

    const angular = readAngularProfile();
    const commit = readCommitProfile();
    const widths = frames.map(frame => frame.last - frame.first + 1);
    const meanWidth =
      widths.reduce((sum, width) => sum + width, 0) /
      Math.max(1, widths.length);
    // Every recompute pays deriveMetrics' own computeWindow; every scroll tick additionally pays
    // isWindowSettled's. Both are the same scan over the same table.
    const settleSteps = frames.reduce(
      (sum, frame) =>
        sum +
        windowScanSteps({ first: frame.targetFirst, last: frame.targetLast }),
      0,
    );

    // isWindowSettled ALONE, on the real table, at the same offsets, on this host. Isolated rather
    // than differenced: removing the call changes the mark pattern and therefore what the rest of
    // the frame does, so a subtractive A/B would price a different scenario.
    const table = buildOffsets(
      ENTRY_COUNT,
      new Map<number, number>(),
      new Map<number, number>(),
      (index: number) => pathBLayout(undefined, index),
      ROW_HEIGHT,
      ROW_HEIGHT,
    );
    const settleOnlyStart = performance.now();
    for (let frame = 1; frame <= FLING_FRAMES; frame += 1) {
      computeWindow(
        ENTRY_COUNT,
        table.offsets,
        table.lengths,
        FLING_START + frame * FLING_STEP,
        VIEWPORT,
        21,
        10,
      );
    }
    const settleOnlyMs = performance.now() - settleOnlyStart;

    const per = (value: number): string => (value / FLING_FRAMES).toFixed(1);
    report.push(
      `ANGULAR fling, ${FLING_FRAMES} frames of ${FLING_STEP}px over ${ENTRY_COUNT} entries`,
      `  per frame: scrollTicks=${per(angular.scrollTicks)} listMarks=${per(angular.listMarks)} ` +
        `listChecks=${per(angular.listChecks)} listRecomputes=${per(angular.listRecomputes)} ` +
        `cdPasses=${per(angular.cdPasses)}`,
      `  per frame: viewsChecked=${per(angular.viewsChecked)} rendererWrites=${per(angular.rendererWrites)} ` +
        `styleChecks=${per(angular.styleChecks)} styleMarks=${per(angular.styleMarks)}`,
      `  per frame: outletCreates=${per(angular.outletCreates)} outletUpdates=${per(angular.outletUpdates)} ` +
        `outletDestroys=${per(angular.outletDestroys)}`,
      `  per frame: nodesCreated=${per(angular.nodesCreated)} nodesInserted=${per(angular.nodesInserted)} ` +
        `nodesRemoved=${per(angular.nodesRemoved)}`,
      `  per frame: engine commits=${per(commit.commits)} nodesVisited=${per(commit.nodesVisited)} ` +
        `propWrites=${per(commit.propWrites)} propNoops=${per(commit.propNoops)} ` +
        `childScans=${per(commit.childScans)} childFlattens=${per(commit.childFlattens)}`,
      `  per frame: deriveMetrics=${per(frames.length)} windowWidth=${meanWidth.toFixed(1)} ` +
        `cellsRebuilt=${per(frames.length * meanWidth)}`,
      `  per frame: isWindowSettled scan steps=${per(settleSteps)} (of ${ENTRY_COUNT} entries)`,
      `  per frame: screen template re-runs=${per(flingScreen!.templateReads - screenBefore)}`,
      `  windows: ${frames
        .map(f => `[${f.first},${f.last}]`)
        .slice(0, 4)
        .join(' ')} ... ` +
        `${frames
          .map(f => `[${f.first},${f.last}]`)
          .slice(-2)
          .join(' ')}`,
      `  totals: outletCreates=${angular.outletCreates} outletDestroys=${angular.outletDestroys} ` +
        `nodesCreated=${angular.nodesCreated} nodesRemoved=${angular.nodesRemoved} frames=${frames.length}`,
      `  per frame: buildOffsets steps=${ENTRY_COUNT} (${ENTRY_COUNT} getItemLayout objects + 2 arrays)`,
      `  wall clock, THIS HOST ONLY (desktop V8, not Hermes):`,
      `    whole fling ${flingMs.toFixed(2)} ms -> ${(flingMs / FLING_FRAMES).toFixed(3)} ms/frame`,
      `    isWindowSettled in isolation ${(settleOnlyMs / FLING_FRAMES).toFixed(4)} ms/frame ` +
        `= ${((settleOnlyMs / flingMs) * 100).toFixed(2)}% of the frame`,
    );
    writeFileSync(
      process.env['SYMBIOTE_FLING_REPORT'] ?? '/dev/null',
      `${flingReport().join('\n')}\n`,
    );

    expect(
      frames.length,
      'the fling must move the window every frame, or this measures nothing',
      // >=, not ==: a batch-fill timer can land inside the burst under a loaded run and add one
      // more recompute. It costs the same and does not change what is being priced.
    ).toBeGreaterThanOrEqual(FLING_FRAMES);
    // THE PROPERTY. A frame slides the window by four cells; the other ~229 are the same item at
    // the same index and have nothing to re-read. Re-stamping them is pure waste, and it is the
    // largest single term in the frame - larger than the whole shared reducer pass.
    expect(
      angular.outletUpdates,
      'a sliding window must re-stamp only the cells that entered it',
    ).toBe(0);
    expect(
      angular.outletCreates,
      'and the cells that DID enter must still be stamped',
    ).toBeGreaterThan(0);
  });

  // The discriminator. Without it, "never re-stamp anything" passes the test above and ships a list
  // that never repaints - RN's contract is that extraData is the marker for "the data object did
  // not change but the cells must re-render".
  it('re-stamps every cell in the window when extraData changes', async () => {
    mount(ROOT_TAG, VListFlingScreen);
    await flush();

    // No viewport and no settle, deliberately. Without a layout the window IS the
    // initialNumToRender prefix and nothing can grow it, so the count is exact and the case costs
    // no wall clock - every 55ms fill tick spent here lands on the whole suite, and
    // flat-list-array-style.test.ts settles on wall clock next door.
    const frames: IListDiagnosticFrame[] = [];
    const stop = subscribeListDiagnostics({
      onFrame: frame => frames.push(frame),
    });
    readAngularProfile();

    flingScreen!.extra.update(value => value + 1);
    await flush();
    stop();

    const angular = readAngularProfile();
    const last = frames[frames.length - 1];
    const width = last === undefined ? 0 : last.last - last.first + 1;
    expect(width, 'the window must have cells to re-stamp').toBeGreaterThan(1);
    expect(
      angular.outletUpdates,
      'an extraData change must reach every cell already in the window',
    ).toBeGreaterThanOrEqual(width);
  });
});
