// Does the windowed list still track the scroll offset after a frame that moved no cell?
//
// Device symptom (examples/angular, Benchmark screen, sticky PATH B): a 16x32 SectionList paints
// section 4's rows and then blank space to the bottom of the box, forever. That cut-off is exactly
// the window the FIRST viewport asked for - the list stops reacting to scroll the moment two
// consecutive window recomputes agree, because the mark that drives the next recompute was gated on
// comparing them (adapters/angular/src/components/virtualized-list/index.ts, isWindowSettled).
//
// Two observables, and the pair is deliberate. The reducer's own diagnostic tap
// (subscribeListDiagnostics) reports `first`/`last` beside `targetFirst`/`targetLast`, which is the
// incremental-fill predicate; its `scrollOffset` is what catches the deaf list, since a frozen list
// reports a target that agrees with itself and looks healthy on the fill predicate alone.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import {
  subscribeListDiagnostics,
  type IListDiagnosticFrame,
  type ISection,
} from '@symbiote-native/components';

import { mount, unmount } from '../../render';
// Barrel, not './index' — see section-list-get-item-layout.test.ts for the require-cycle reason.
import {
  SectionList,
  VSectionHeaderDirective,
  VSectionItemDirective,
} from '../../components';

const ROOT_TAG = 971;
const SCROLL_VIEW = 'RCTScrollView';
// examples/angular/src/screens/BenchmarkScreen.ts, sticky PATH B, verbatim.
const SECTION_COUNT = 16;
const ROWS_PER_SECTION = 32;
const ROW_HEIGHT = 30;
const HEADER_HEIGHT = 28;
const FOOTER_HEIGHT = 0;
const ENTRIES_PER_SECTION = 1 + ROWS_PER_SECTION + 1;
const SECTION_EXTENT = HEADER_HEIGHT + ROWS_PER_SECTION * ROW_HEIGHT;
// .bench-sticky in examples/angular/src/screens/BenchmarkScreen.css.
const VIEWPORT = 320;
// The batch period the list runs on (DEFAULT_UPDATE_CELLS_BATCHING_PERIOD); a settle step has to
// outlast it or the pump looks stalled when it is merely mid-tick.
const BATCH_PERIOD = 50;
// Enough steps to fill the whole 544-entry stream at 10 cells per tick several times over, so a
// failure means "stopped", never "not finished yet".
const SETTLE_STEPS = 120;
// Consecutive settle steps producing no new window recompute before the pump counts as stopped.
const STALL_STEPS = 3;

const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settleStep = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, BATCH_PERIOD + 5));

function sectionListItemLayout(
  _sections: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const sectionIndex = Math.floor(index / ENTRIES_PER_SECTION);
  const withinSection = index - sectionIndex * ENTRIES_PER_SECTION;
  const sectionOffset = sectionIndex * SECTION_EXTENT;
  if (withinSection === 0)
    return { length: HEADER_HEIGHT, offset: sectionOffset, index };
  if (withinSection === ENTRIES_PER_SECTION - 1)
    return {
      length: FOOTER_HEIGHT,
      offset: sectionOffset + SECTION_EXTENT,
      index,
    };
  return {
    length: ROW_HEIGHT,
    offset: sectionOffset + HEADER_HEIGHT + (withinSection - 1) * ROW_HEIGHT,
    index,
  };
}

interface IRow {
  id: string;
  label: string;
}

const SECTIONS: ISection<IRow>[] = Array.from(
  { length: SECTION_COUNT },
  (_value, section) => ({
    title: `SECTION ${section + 1}`,
    data: Array.from({ length: ROWS_PER_SECTION }, (_row, row) => ({
      id: `s${section}-r${row}`,
      label: `row ${section + 1}.${row + 1}`,
    })),
  }),
);

const HEADER_STYLE = { height: HEADER_HEIGHT };
const ROW_STYLE = { height: ROW_HEIGHT };

@Component({
  selector: 'symbiote-refill-pump-host',
  standalone: true,
  imports: [SectionList, VSectionHeaderDirective, VSectionItemDirective],
  template: `
    <SectionList
      [testID]="'refill-pump-list'"
      [sections]="sections"
      [keyExtractor]="keyExtractor"
      [stickySectionHeadersEnabled]="true"
      [scrollEventThrottle]="16"
      [getItemLayout]="itemLayout"
    >
      <ng-template vSectionHeader let-section>
        <symbiote-text [style]="headerStyle">{{ section.title }}</symbiote-text>
      </ng-template>
      <ng-template vSectionItem let-item>
        <symbiote-view [style]="rowStyle">
          <symbiote-text [testID]="item.id">{{ item.label }}</symbiote-text>
        </symbiote-view>
      </ng-template>
    </SectionList>
  `,
})
class RefillPumpHost {
  readonly sections = SECTIONS;
  readonly headerStyle = HEADER_STYLE;
  readonly rowStyle = ROW_STYLE;
  readonly itemLayout = sectionListItemLayout;
  readonly keyExtractor = (item: IRow): string => item.id;
}

let frames: IListDiagnosticFrame[] = [];
let unsubscribe: (() => void) | undefined;

function flatten(nodes: readonly IFakeNode[]): IFakeNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

function scrollHost(): IFakeNode {
  const node = flatten(fabric.created).find(
    candidate => candidate.viewName === SCROLL_VIEW,
  );
  if (node === undefined) throw new Error('no scroll host created');
  return node;
}

function lastFrame(): IListDiagnosticFrame {
  const frame = frames[frames.length - 1];
  if (frame === undefined)
    throw new Error('the list never recomputed its window');
  return frame;
}

function shortfall(frame: IListDiagnosticFrame): string {
  return (
    `window [${frame.first}, ${frame.last}] of target ` +
    `[${frame.targetFirst}, ${frame.targetLast}] over ${frame.count} entries ` +
    `at offset ${frame.scrollOffset}`
  );
}

// Drive the pump with nothing else happening: no scroll, no layout, only timers. This is exactly
// the device situation "finger lifted, box half full".
//
// It gives up on a pump that has produced no new frame for STALL_STEPS in a row rather than burning
// the whole budget: a stalled pump would otherwise blow vitest's timeout, and a timeout reports the
// runner rather than the assertion that names what the window actually did.
async function settle(): Promise<void> {
  let idleSteps = 0;
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    const frame = lastFrame();
    if (frame.first <= frame.targetFirst && frame.last >= frame.targetLast)
      return;
    const before = frames.length;
    await settleStep();
    idleSteps = frames.length === before ? idleSteps + 1 : 0;
    if (idleSteps >= STALL_STEPS) return;
  }
}

beforeEach(() => {
  fabric.reset();
  frames = [];
  unsubscribe = subscribeListDiagnostics({
    onFrame: frame => frames.push(frame),
  });
});
afterEach(() => {
  unsubscribe?.();
  unmount(ROOT_TAG);
});

describe('VirtualizedList incremental fill reaches its target', () => {
  it('fills to target after the first layout, with no further input', async () => {
    mount(ROOT_TAG, RefillPumpHost);
    await tick();
    fabric.fireEvent(scrollHost().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    await tick();

    await settle();

    const frame = lastFrame();
    expect(
      frame.last >= frame.targetLast && frame.first <= frame.targetFirst,
      `the fill pump stopped short of its target: ${shortfall(frame)}`,
    ).toBe(true);
  });

  it('fills to target after a scroll stops', async () => {
    mount(ROOT_TAG, RefillPumpHost);
    await tick();
    fabric.fireEvent(scrollHost().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    await tick();
    await settle();

    // A flick into the middle of section 4 — the device's reported stopping point.
    const handle = scrollHost().instanceHandle;
    for (const offset of [200, 800, 1600, 2400, 3000]) {
      fabric.fireEvent(handle, 'topScroll', {
        contentOffset: { x: 0, y: offset },
      });
      await tick();
    }

    await settle();

    const frame = lastFrame();
    expect(
      frame.last >= frame.targetLast && frame.first <= frame.targetFirst,
      `the fill pump stopped short of its target after the scroll: ${shortfall(frame)}`,
    ).toBe(true);
  });

  // The frame that moves NO cell is the common one at 60Hz, and it is the one that leaves the
  // window and the last-marked signature identical. Every scroll after it must still be able to
  // move the window.
  it('still tracks the offset after a frame that moved no cell', async () => {
    mount(ROOT_TAG, RefillPumpHost);
    await tick();
    fabric.fireEvent(scrollHost().instanceHandle, 'topLayout', {
      layout: { x: 0, y: 0, width: 320, height: VIEWPORT },
    });
    await tick();
    await settle();

    const handle = scrollHost().instanceHandle;
    // Under 30px: less than one row, so the window it asks for is the one already committed.
    fabric.fireEvent(handle, 'topScroll', { contentOffset: { x: 0, y: 5 } });
    await tick();
    await settle();

    fabric.fireEvent(handle, 'topScroll', { contentOffset: { x: 0, y: 6000 } });
    await tick();
    await settle();

    expect(
      frames[frames.length - 1]?.scrollOffset,
      'the list never recomputed its window for the offset it was scrolled to',
    ).toBe(6000);
  });
});
