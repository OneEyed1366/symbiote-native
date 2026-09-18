// THE SAME QUESTION AS `angular-style-lands-in-its-turn.itest.ts`, AT LIST SCALE.
//
// That file proves a single node's `[style]` change reaches the platform in one commit and one prop
// write. This one asks it of a list, because the eight-step bench arms keep implying otherwise: the
// BARE-tag arm reads `select` 3.6 ms and `remove` 14.5, while the DIRECTIVE-shaped arm — which takes
// `[style]` as a declared input and so never opens a styling run at all — reads 13.7 and 7.4. Same
// tree, same engine. The pair swaps about ten milliseconds, which is exactly what a publish escaping
// its own step would look like, and one node cannot show it because one node is one run.
//
// A SEPARATE FILE, not a second case next door, and that is the harness's own rule rather than a
// preference: it holds exactly ONE surface (`kSurfaceId = 1`), and a re-mount of it after a case has
// torn it down does not come back — `findByTestId` answers `undefined` for every row. Measured by
// trying it. One arm per file is what the bench suites already do.
//
// RUN ON EITHER BUILD: the subject is which commit carries a write, not how long it takes.

import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component, signal } from '@angular/core';
import { mount } from '@symbiote-native/angular';
import { readCommitProfile } from '@symbiote-native/engine';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  report,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 500;

const PLAIN = { height: 44, paddingLeft: 10 };
const PICKED = { height: 60, paddingLeft: 10 };

const flush = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
  });

let host: StyleListHost | undefined;

// Rows that differ only by which one is selected — the `select` step, minus everything else. Bare
// tags, so `[style]` goes through Angular's own styling engine and the renderer holds a run per row.
@Component({
  selector: 'style-list-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view testID="list">
      @for (row of rows; track row) {
        <view
          [testID]="'row-' + row"
          [style]="row === selected() ? picked : plain"
        ></view>
      }
    </view>
  `,
})
class StyleListHost {
  readonly rows = Array.from({ length: ROWS }, (_unused, at) => at);
  readonly selected = signal(-1);
  readonly plain = PLAIN;
  readonly picked = PICKED;
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }
}

function drive(): StyleListHost {
  if (host === undefined) throw new Error('the list was never mounted');
  return host;
}

describe('one row of a list changing its style', () => {
  // why: if this is one commit and one write, the bench rows that swap ten milliseconds are a
  // stopwatch artifact and the question is closed. If it is two, the coalesced run is escaping its
  // turn at list scale and that is a device bug — a frame of the old style on every selection.
  it('lands in the turn that made it, and touches nobody else', async () => {
    const surface = mount(ROOT_TAG, StyleListHost);
    await flush();
    flushTimers();
    await flush();
    surface.commit();
    mounted();

    // `getDebugProps` reports values as STRINGS — RN's own introspection, not our payload.
    expect(findByTestId('row-7')?.props.height).toBe('44');

    // Zeroes the window, so what follows is this turn's alone.
    readCommitProfile();

    drive().selected.set(7);
    await flush();
    flushTimers();
    await flush();
    surface.commit();
    mounted();

    const profile = readCommitProfile();

    expect(findByTestId('row-7')?.props.height, 'the selected row moved').toBe(
      '60',
    );
    expect(
      findByTestId('row-8')?.props.height,
      'and its neighbour did not',
    ).toBe('44');
    // ONE write for the one row whose style changed — the run coalesced its keys — and the other 499
    // reach the engine not at all, because `routeProp` refuses a style equal to the standing one.
    expect(profile.propWrites, 'one row, one write').toBe(1);
  });
});

report();
