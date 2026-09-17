// Twin of adapters/solid/src/node-census.probe.test.tsx and adapters/vue/src/node-census.probe.test.ts
// — same row shape (`bench-row` > id text + two pressables + their text), same reactive-push
// scenario. CLAUDE.md's own device numbers flagged an unexplained gap here: Angular's `WRITES`
// reads 17002 against Solid's 15001 on an identical 1,000-row create, 2 extra prop writes per row,
// "the next thing to enumerate on Angular" — never enumerated. `propWrites` (`readCommitProfile`,
// tree-host.ts) is engine-native and headless-safe for exactly this: it counts what the adapter
// pushed AT the engine, not wall time, so it needs no simulator to answer.
import { writeFileSync } from 'node:fs';
import '@angular/compiler';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { describe, it } from 'vitest';
import { clearGlobalStyles, readCommitProfile } from '@symbiote-native/engine';
import {
  censusLive,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import { TextHost as Text, ViewHost as View } from './primitives';
import { PressableElement } from './elements';

const ROOT_TAG = 4_245;
const ROWS = Number(process.env.BENCH_ROWS ?? 1000);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const noop = (): void => {};

// Byte-identical to Solid's Row: view.bench-row > text.bench-row-id + pressable.flex1(press) >
// text.bench-row-label + pressable.bench-row-remove(press) > text.bench-row-remove-text.
@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [PressableElement, Text, View],
  template: `
    <view class="bench-row">
      <text class="bench-row-id">{{ id }}</text>
      <pressable class="flex1" (press)="onPress()">
        <text class="bench-row-label">{{ label }}</text>
      </pressable>
      <pressable class="bench-row-remove" (press)="onPress()">
        <text class="bench-row-remove-text">x</text>
      </pressable>
    </view>
  `,
})
class BenchmarkRow {
  @Input({ required: true }) id!: number;
  @Input({ required: true }) label!: string;
  @Output() readonly select = new EventEmitter<number>();

  onPress(): void {
    noop();
  }
}

const rowsSignal = signal<readonly number[]>([]);

@Component({
  selector: 'row-host',
  standalone: true,
  imports: [BenchmarkRow, View],
  template: `
    <view>
      @for (id of rows(); track id) {
        <BenchmarkRow [id]="id" label="row label" />
      }
    </view>
  `,
})
class RowHost {
  readonly rows = rowsSignal;
}

describe('node census', () => {
  // No `registerRules` call — deliberately, to match Solid's probe: every class below then
  // resolves to the registry's `EMPTY_STYLE` sentinel (no rule matches), which is the one input
  // `pushClassStyle`'s `contributesNothing` guard (node.ts) skips outright. A rule REGISTERED to an
  // empty `{}` body is a different, non-sentinel value and does still publish — confirmed with a
  // minimal adapter-free `routeProp` repro — so adding rules here would silently stop measuring the
  // same thing this file's twins measure.
  it('prices a reactive create of 1000 rows', async () => {
    const fabric = installRecordingFabric();
    const surface = mount(ROOT_TAG, RowHost);
    await tick();
    fabric.reset();
    readCommitProfile();

    rowsSignal.set(Array.from({ length: ROWS }, (_value, index) => index));
    await tick();

    const profile = readCommitProfile();
    const census = censusLive(...surface.children);
    const line = `angular nodes=${census.nodes} commits=${profile.commits} writes=${profile.propWrites} writesPerRow=${(profile.propWrites / ROWS).toFixed(2)}\n`;

    console.log(line);
    const outPath = process.env.SYMBIOTE_CENSUS_OUT;
    if (outPath !== undefined) writeFileSync(outPath, line);

    unmount(ROOT_TAG);
    clearGlobalStyles();
  });
});
