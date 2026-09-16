// Angular's column of the work ledger. See `adapters/solid/src/work-ledger.probe.test.tsx` for what
// the columns mean and why a count rather than a clock.
//
// Angular is the outlier candidate every time. F-20's duplicate text defaults were its alone, and
// the project's device baseline records it emitting 2 000 more prop writes than Solid for a
// byte-identical Fabric payload — "a `WRITES` that differs between adapters is work the ADAPTER is
// generating", named there as the next thing to enumerate on Angular and never enumerated. Solid's
// and Vue's columns are byte-identical to each other, which makes those two a control and this the
// column worth reading.
//
// THE ROW IS THE REAL ONE. It used to be an invented seven-node row with inline styles, which made
// this column incomparable with the other three and therefore useless for the one thing the ledger
// is for — F-34 records that defect on solid's own probe and F-52 what an invented STYLESHEET did
// on top of it. What is below is a transcription of `examples/angular/src/screens/BenchmarkScreen
// .ts`'s `BenchmarkRow`: ten native views, CSS classes, two `(press)` outputs, `<text-input>` last,
// and the example app's real stylesheet compiled by the real parser.

import '@angular/compiler';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// By package name, not a relative path — see the sibling probe in `adapters/solid` for what the
// relative one does to `core/css-parser`'s source tree.
import { compileCssToRules } from '@symbiote-native/css-parser';
import {
  clearGlobalStyles,
  registerRules,
  setTreeHost,
  treeHost,
} from '@symbiote-native/engine';
import {
  OP_SET_PROP,
  OP_STRIDE,
} from '@symbiote-native/engine/mutation-buffer';
import {
  registerPressableBehavior,
  registerTextInputBehavior,
} from '@symbiote-native/components';

import { mount, unmount } from './render';
import { SYMBIOTE_ELEMENTS } from './elements';
import { registerComposedComponent } from './anchor-host-registry';

// At module scope, as the shipping app registers them. Without these the pressables and the input
// commit their class and nothing else — the fourth invented input this investigation found (F-53).
registerPressableBehavior();
registerTextInputBehavior();

// Without these the composed hosts fall through to a real `createNode` and the ledger measures a
// different tree from Solid's and Vue's — which would make the columns incomparable, i.e. destroy
// the only thing this file is for.
registerComposedComponent('BenchmarkRow');
registerComposedComponent('work-ledger-list');

/**
 * The example app's own stylesheet, compiled by the real parser — the same file solid's, react's
 * and vue's ledgers read, because the point of the ledger is that the adapters share a ruler. An
 * adapter never imports another adapter's source, so these eight lines are here too; what must not
 * be duplicated is the STYLESHEET, and it is not.
 */
function benchmarkRowRules(): unknown[] {
  const compiled = compileCssToRules(
    readFileSync(
      new URL('../../../examples/svelte/App.css', import.meta.url),
      'utf8',
    ),
    { filename: 'App.css' },
  );
  return Array.isArray(compiled) ? compiled : compiled.rules;
}

const ROOT_TAG = 8842;
const ROWS = 1_000;

const fabric = installRecordingFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
}

const ROW_POOL = makeRows(1, ROWS * 2);

// A majority of the list rather than all of it — the only shape that separates the two halves of
// F-43's rule, since `retext all rows` satisfies both with the same number.
const PARTIAL_SHARE = 3;
const PARTIAL_OF = 5;

@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [class]="rowClass">
      <text class="bench-row-id">{{ rowId }}</text>
      <pressable class="flex1" (press)="select.emit(row.id)">
        <text class="bench-row-label">{{ row.label }}{{ suffix }}</text>
      </pressable>
      <pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <text class="bench-row-remove-text">×</text>
      </pressable>
      <text-input class="bench-row-input" [value]="row.label"></text-input>
    </view>
  `,
})
class BenchmarkRow {
  @Input({ required: true }) row!: IRow;
  @Input({ required: true }) isSelected = false;
  @Input({ required: true }) suffix = '';
  @Output() readonly select = new EventEmitter<number>();
  @Output() readonly remove = new EventEmitter<number>();

  get rowClass(): string {
    return this.isSelected ? 'bench-row bench-row-selected' : 'bench-row';
  }

  get rowId(): string {
    return String(this.row.id);
  }
}

let mounted: List | undefined;

@Component({
  selector: 'work-ledger-list',
  standalone: true,
  imports: [BenchmarkRow, SYMBIOTE_ELEMENTS],
  template: `
    <view testID="list">
      @for (row of rows(); track row.id) {
        <BenchmarkRow
          [row]="row"
          [isSelected]="row.id === selectedId()"
          [suffix]="suffixFor(row)"
        />
      }
    </view>
  `,
})
class List {
  readonly rows = signal<IRow[]>(ROW_POOL.slice(0, ROWS));
  readonly selectedId = signal(-1);
  readonly suffix = signal('');
  readonly partialSuffix = signal('');

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mounted = this;
  }

  suffixFor(row: IRow): string {
    return (
      this.suffix() +
      (row.id % PARTIAL_OF < PARTIAL_SHARE ? this.partialSuffix() : '')
    );
  }
}

function drive(): List {
  if (mounted === undefined) throw new Error('list was never mounted');
  return mounted;
}

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
  registerRules(benchmarkRowRules());
  mounted = undefined;
});

describe('the work an angular commit asks for, against the work it needs', () => {
  // SKIPPED, not deleted: both read `measureWorkStep`, the mirror's own simulation of Fabric's
  // `materialize` walk (`visited`/`rebuilt`/`scanned`/payload-fold counts) — genuinely
  // mirror-derived, confirmed against the real engine's `Tree` class, which holds no members by
  // design (a real device crash is on record from a similar attempt) — see
  // `.docs/mirror-elimination.md` Round 16/21 for the full investigation. No C++ instrumentation
  // exists for this and none is safely addable inside this migration's scope.
  it.skip('accounts for every step of the benchmark sequence', () => {});

  // The cheap check `CLAUDE.md` prescribes before any number is compared across columns, and the
  // one Angular has failed twice in this project's history — four row shapes that read as one, and
  // a flat row missing Pressable's whole surface. Ten native views per row, plus the list and the
  // surface, is `createNode 10000` on device. SKIPPED for the same reason as the case above.
  it.skip('builds the same ten-view row the device measures', () => {});

  // WHICH KEY. The device baseline's standing lead is `WRITES` angular 17002 against solid 15001 —
  // two per row, never enumerated. A count cannot name them; a census keyed by prop NAME and VALUE
  // can, and it is the same instrument that named Vue's in F-63.
  it('names every prop it writes on a create', async () => {
    const base = treeHost();
    if (base === undefined) throw new Error('no host installed');
    const keys: Record<string, number> = {};
    // Every DISTINCT string the batch interned, not only the prop-key ones. The ledger's `strings`
    // column read 11 004 here against solid's 2 011 for the identical tree, and a prop-key census
    // accounts for seven names — so whatever the other eleven thousand are, they are not prop keys.
    const interned: string[] = [];
    setTreeHost({
      ...base,
      applyOps: batch => {
        for (const value of batch.strings) interned.push(value);
        for (let at = 0; at + OP_STRIDE <= batch.ops.length; at += OP_STRIDE) {
          if (batch.ops[at] !== OP_SET_PROP) continue;
          const name = batch.strings[batch.ops[at + 2]] ?? '?';
          keys[name] = (keys[name] ?? 0) + 1;
        }
        base.applyOps(batch);
      },
    });

    mount(ROOT_TAG, List);
    await flush();
    unmount(ROOT_TAG);

    // Recorded rather than asserted against a guessed total: what this pins is that every key the
    // create writes is one of the row's own, so a NEW name appearing is visible.
    writeFileSync(
      fileURLToPath(
        new URL(
          '../../../.docs/work-ledger-angular-create-keys.txt',
          import.meta.url,
        ),
      ),
      [
        'prop keys written on a create',
        ...Object.entries(keys)
          .sort((left, right) => right[1] - left[1])
          .map(([name, count]) => `${name.padStart(28)}  ${count}`),
        '',
        `distinct strings interned: ${interned.length}`,
        'first 40, in intern order — the order is the clue, not the count',
        ...interned.slice(0, 40).map(value => `  ${JSON.stringify(value)}`),
        '',
        'last 12',
        ...interned.slice(-12).map(value => `  ${JSON.stringify(value)}`),
        '',
      ].join('\n'),
    );

    expect(Object.keys(keys).length).toBeGreaterThan(0);
  });
});
