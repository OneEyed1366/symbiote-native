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
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { readCommitProfile } from '@symbiote-native/engine';
import {
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
const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
// One incremental-fill tick (DEFAULT_UPDATE_CELLS_BATCHING_PERIOD + slack).
const settle = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 55));

// Frames must land one after another, each flush drains the event before the next one fires
function inSequence(
  count: number,
  task: (index: number) => Promise<void>,
): Promise<void> {
  return Array.from({ length: count }).reduce<Promise<void>>(
    (chain, _unused, index) => chain.then(() => task(index)),
    Promise.resolve(),
  );
}

const MAX_FILL_TICKS = 120;

// Pumps the incremental fill until the committed window reaches the target, then stops
// A fixed tick count would assume the worst case, and each extra 55ms tick lands on the whole
// suite: `flat-list-array-style.test.ts` settles on wall clock and reads a slow neighbour as drift
async function fillToTarget(
  frames: IListDiagnosticFrame[],
  ticksLeft = MAX_FILL_TICKS,
): Promise<void> {
  const frame = frames[frames.length - 1];
  const isFilled =
    frame !== undefined &&
    frame.first <= frame.targetFirst &&
    frame.last >= frame.targetLast;
  if (isFilled || ticksLeft === 0) return;
  const before = frames.length;
  await settle();
  if (frames.length === before) return;
  await fillToTarget(frames, ticksLeft - 1);
}

function handleFor(testID: string): unknown {
  const node = fabric.find((n: IAuthoredNode) => n.props.testID === testID);
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
    <text>{{ ownLabel }}</text>
    @for (row of screenRows; track row) {
      <text>{{ rowLabel }}</text>
    }
    <VirtualizedList
      [testID]="'vlist-cost-host'"
      [data]="rows"
      [getItem]="getRow"
      [getItemCount]="getRowCount"
      [keyExtractor]="rowKey"
    >
      <ng-template vListItem>
        <text>cell</text>
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
  // Pins the fix for one full screen template execution per scroll frame, 60 times a second
  it('does not re-run the ancestor screen for a scroll that moves no cell', async () => {
    mount(ROOT_TAG, VListCostScreen);
    await flush();

    const host = handleFor('vlist-cost-host');
    const screenBefore = screen().templateReads;
    const rowsBefore = screen().rowReads;

    await inSequence(SCROLL_BURST, async index => {
      fabric.fireEvent(host, SCROLL_EVENT, {
        contentOffset: { x: 0, y: index },
      });
      await flush();
    });

    // No viewport arrives, so the window stays the `initialNumToRender` prefix
    // `isWindowSettled` predicts it from the live offset, a lagging compare paid one stale pass
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
const FLING_START = 6_000;

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

type IEntry = {
  id: string;
};

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
    <text>{{ ownLabel }}</text>
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
        <view
          ><text>{{ entry.id }}</text></view
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
    // Park past the overscan and let the fill reach target before timing
    // `windowSize` 21 on 320px buys 3200px per side, below that a scroll only grows the window
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

    const flingStart = performance.now();
    await inSequence(FLING_FRAMES, async frame => {
      fabric.fireEvent(host, 'topScroll', {
        contentOffset: { x: 0, y: FLING_START + (frame + 1) * FLING_STEP },
      });
      // A far-ahead window slides on the batching tick, not on the scroll event
      await settle();
    });
    const flingMs = performance.now() - flingStart;
    stop();

    const angular = readAngularProfile();
    const commit = readCommitProfile();
    const widths = frames.map(frame => frame.last - frame.first + 1);
    const meanWidth =
      widths.reduce((sum, width) => sum + width, 0) /
      Math.max(1, widths.length);
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
      // The walk counters died with the walk and JS holds no tree
      // so `nodesVisited`, `propNoops`, `childScans` and `childFlattens` are not observable here
      `  per frame: engine commits=${per(commit.commits)} propWrites=${per(commit.propWrites)}`,
      `  per frame: deriveMetrics=${per(frames.length)} windowWidth=${meanWidth.toFixed(1)} ` +
        `cellsRebuilt=${per(frames.length * meanWidth)}`,
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
    );
    writeFileSync(
      process.env['SYMBIOTE_FLING_REPORT'] ?? '/dev/null',
      `${flingReport().join('\n')}\n`,
    );

    expect(
      frames.length,
      'the fling must move the window every frame, or this measures nothing',
      // `>=` since a batch-fill timer can land inside the burst under load and add a recompute
    ).toBeGreaterThanOrEqual(FLING_FRAMES);
    // A frame slides the window by four cells, the other ~229 have nothing to re-read
    // Re-stamping them is pure waste and the largest term, above the whole shared reducer pass
    expect(
      angular.outletUpdates,
      'a sliding window must re-stamp only the cells that entered it',
    ).toBe(0);
    expect(
      angular.outletCreates,
      'and the cells that DID enter must still be stamped',
    ).toBeGreaterThan(0);
  });

  // Discriminator: "never re-stamp" would pass the test above and ship a list that never repaints
  // RN's contract is that `extraData` marks "same data object, cells must re-render"
  it('re-stamps every cell in the window when extraData changes', async () => {
    mount(ROOT_TAG, VListFlingScreen);
    await flush();

    // No viewport and no settle: the window is the `initialNumToRender` prefix, count is exact
    // A 55ms fill tick would land on the whole suite, `flat-list-array-style.test.ts` runs next
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
