// F-79 (`.docs/tree-inefficiency-findings.md`) isolated Angular's residual ~1 extra propWrite/row
// vs Solid to somewhere in a `view+text` element, on a REACTIVE PUSH (mount empty, then push rows
// in via a signal/input), and named its own next step: "instrument `recordSetProp` call sites
// directly, not just before/after counts". `propKeyTally` (`core/engine/src/node.ts`, gated behind
// `isDebug()`) is exactly that instrument, added this round.
//
// ANSWER: there is no residual. `RowHost`/`BenchmarkRow` here are the REAL production shape
// (`examples/angular/src/screens/BenchmarkScreen.ts`'s own `BenchmarkRow` — `[row]`/`[isSelected]`
// both bound to an object, not two separate primitive `@Input`s) — with that shape, this file reads
// `total=12`, byte-identical to Solid's twin, key for key. An EARLIER version of this file used the
// simplified `[id]="id"` + static-string `label="row label"` fixture `node-census.probe.test.ts`
// happens to use, and THAT shape produced one extra `BenchmarkRow.label` write, confirmed (via a
// throwaway probe, not kept) to need only a bare, non-bound `label="…"` attribute — swapping it for
// `[label]="'row label'"` with nothing else changed removed the write. NOT chased further: neither
// this probe nor the throwaway one registered `BenchmarkRow` via `registerComposedComponent`
// (`benchmark-row-shape.test.ts` does), so whether that write lands on a real committing node or a
// skipped anchor host is unconfirmed, and the point is moot anyway — no real template in this repo
// writes a bare static attribute onto a composed component's own `@Input`, this benchmark included.
// So F-79's residual was a stale-fixture artifact, not a live production cost — recorded here so
// the `[id]`+static-`label` shape is never mistaken for the real row again.
import '@angular/compiler';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { describe, it } from 'vitest';
import { clearGlobalStyles, takePropKeyTally } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { TextHost as Text, ViewHost as View } from './primitives';
import { PressableElement } from './elements';

globalThis.__SYMBIOTE_DEBUG__ = true;

installRecordingFabric();

const ROOT_TAG = 91_997;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IBenchmarkRow = { id: number; label: string };

// Byte-identical to the REAL production row — `examples/angular/src/screens/BenchmarkScreen.ts`'s
// own `BenchmarkRow` (`[row]`/`[isSelected]` both bound, an object input not two primitives) — not
// the older simplified fixture other probes in this file's neighborhood use, which papered over
// exactly the mechanism this file exists to find (checked: the simplified `[id]`+static-`label`
// shape showed a residual write the object-input shape below does NOT reproduce, so that residual
// was a fixture artifact, not a real one — see this file's own trailing ANSWER comment).
@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [PressableElement, Text, View],
  template: `
    <view [class]="rowClass">
      <text class="bench-row-id">{{ rowId }}</text>
      <pressable class="flex1" (press)="select.emit(row.id)">
        <text class="bench-row-label">{{ row.label }}</text>
      </pressable>
      <pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <text class="bench-row-remove-text">x</text>
      </pressable>
    </view>
  `,
})
class BenchmarkRow {
  @Input({ required: true }) row!: IBenchmarkRow;
  @Input({ required: true }) isSelected = false;
  @Output() readonly select = new EventEmitter<number>();
  @Output() readonly remove = new EventEmitter<number>();

  get rowClass(): string {
    return this.isSelected ? 'bench-row bench-row-selected' : 'bench-row';
  }

  get rowId(): string {
    return String(this.row.id);
  }
}

const rowsSignal = signal<readonly IBenchmarkRow[]>([]);

@Component({
  selector: 'row-host',
  standalone: true,
  imports: [BenchmarkRow, View],
  template: `
    <view>
      @for (row of rows(); track row.id) {
        <BenchmarkRow [row]="row" [isSelected]="false" />
      }
    </view>
  `,
})
class RowHost {
  readonly rows = rowsSignal;
}

describe('propKeyTally: Angular reactive push of ONE row vs Solid (F-79 continuation)', () => {
  it('names the exact (component.key) the residual write difference is at', async () => {
    rowsSignal.set([]);
    const surface = mount(ROOT_TAG, RowHost);
    await tick();
    takePropKeyTally(); // discard the empty mount's own cost — price only the reactive push

    rowsSignal.set([{ id: 1, label: 'row label' }]);
    await tick();

    const tally = takePropKeyTally();
    unmount(ROOT_TAG);
    clearGlobalStyles();
    void surface;

    const total = [...tally.values()].reduce((sum, count) => sum + count, 0);
    const lines = [...tally.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `  ${key}: ${String(count)}`);
    console.log(
      `DEBUG angular reactive-push propKeyTally (total=${String(total)}):\n${lines.join('\n')}`,
    );
  });
});
