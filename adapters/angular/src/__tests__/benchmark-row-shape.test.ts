/// <reference types="node" />

// The instrument behind examples/angular's BenchmarkScreen row-shape toggle.
//
// That toggle exists to test one open question: Angular builds a 1,000-row list ~3x slower than
// the other four adapters while its point operations are ordinary. The last structural suspect is
// that an Angular component is bound to a host ELEMENT, so every composed component instance costs
// an engine node — 12 per row against the 9 every other adapter retains.
//
// SPLIT (not the first time): the COMMIT-shape half of this file (byte-identical composed/flat
// trees, the Fabric view-name count for the with-input row) moved to
// `core/engine/cpp/tests/js/angular-benchmark-row-shape.itest.ts` — those are commit-shape
// questions only the real renderer can answer. What is left here needs no committed Fabric tree at
// all: the ENGINE-NODE-count claim (`censusLive`, reading the retained tree's own child links, the
// same under any host) and the drift fence against the real screen (a plain file read, no engine
// involved). `childFlattens` (`censusRetainedTree().flattenWidths.length`, the applier's own
// commit-walk bookkeeping) has no reading outside the retired mirror and is DROPPED here, not
// ported — the same "goes with it" call every prior round made for applier-internal counters.
//
// Both row templates are literal copies of the screen's, and a drift fence below reads the screen
// and fails if either copy stops matching it.

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import {
  censusLive,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { TextHost as Text, ViewHost as View } from '../primitives';
import { PressableElement } from '../elements';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 4242;
const SCREEN_PATH = 'examples/angular/src/screens/BenchmarkScreen.ts';

const COMPOSED_NODES_PER_ROW = 10;
const FLAT_NODES_PER_ROW = 9;
const FEW_ROWS = 1;
const MANY_ROWS = 3;

registerComposedComponent('BenchmarkRow');

const ROW_RULES = [
  { tokens: ['bench-row'], style: { height: 44, flexDirection: 'row' } },
  { tokens: ['bench-row-selected'], style: { backgroundColor: '#3a2c10' } },
  { tokens: ['bench-row-id'], style: { width: 56, fontSize: 12 } },
  { tokens: ['bench-row-label'], style: { fontSize: 14 } },
  { tokens: ['bench-row-remove'], style: { width: 28, height: 28 } },
  { tokens: ['bench-row-remove-text'], style: { fontSize: 18 } },
  { tokens: ['flex1'], style: { flex: 1 } },
];

type IBenchmarkRow = { id: number; label: string };
const ROW_CLASS = 'bench-row';
const ROW_CLASS_SELECTED = 'bench-row bench-row-selected';

// FIXTURE ONLY — see the itest twin's identical comment.
const COMPOSED_ROW_TEMPLATE = `
    <view [class]="rowClass">
      <text class="bench-row-id">{{ rowId }}</text>
      <pressable class="flex1" (press)="select.emit(row.id)">
        <text class="bench-row-label">{{ row.label }}</text>
      </pressable>
      <pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <text class="bench-row-remove-text">×</text>
      </pressable>
    </view>
  `;

// THE SCREEN'S ONLY ROW — the one constant here still fenced against the screen.
const WITH_INPUT_ROW_TEMPLATE = `
    <view [class]="rowClass">
      <text class="bench-row-id">{{ rowId }}</text>
      <pressable class="flex1" (press)="select.emit(row.id)">
        <text class="bench-row-label">{{ row.label }}</text>
      </pressable>
      <pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <text class="bench-row-remove-text">×</text>
      </pressable>
      <text-input class="bench-row-input" [value]="row.label"></text-input>
    </view>
  `;

const FLAT_ROW_TEMPLATE = `
            <view [class]="rowClassFor(row)">
              <text class="bench-row-id">{{ row.id }}</text>
              <view class="flex1" (press)="onSelect(row.id)">
                <text class="bench-row-label">{{ row.label }}</text>
              </view>
              <view class="bench-row-remove" (press)="onRemove(row.id)">
                <text class="bench-row-remove-text">×</text>
              </view>
            </view>
`;

@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [PressableElement, Text, View],
  template: COMPOSED_ROW_TEMPLATE,
})
class BenchmarkRow {
  @Input({ required: true }) row!: IBenchmarkRow;
  @Input({ required: true }) isSelected = false;
  @Output() readonly select = new EventEmitter<number>();
  @Output() readonly remove = new EventEmitter<number>();

  get rowClass(): string {
    return this.isSelected ? ROW_CLASS_SELECTED : ROW_CLASS;
  }

  get rowId(): string {
    return String(this.row.id);
  }
}

const rowsSignal = signal<readonly IBenchmarkRow[]>([]);
const selectedSignal = signal<number | undefined>(undefined);

@Component({
  selector: 'composed-row-host',
  standalone: true,
  imports: [BenchmarkRow, View],
  template: `
    <view>
      @for (row of rows(); track row.id) {
        <BenchmarkRow
          [row]="row"
          [isSelected]="row.id === selectedId()"
          (select)="onSelect($event)"
          (remove)="onRemove($event)"
        />
      }
    </view>
  `,
})
class ComposedRowHost {
  readonly rows = rowsSignal;
  readonly selectedId = selectedSignal;

  onSelect(id: number): void {
    selectedSignal.set(id);
  }

  onRemove(id: number): void {
    rowsSignal.update(rows => rows.filter(row => row.id !== id));
  }
}

@Component({
  selector: 'flat-row-host',
  standalone: true,
  imports: [Text, View],
  template: `
    <view>
      @for (row of rows(); track row.id) {
        ${FLAT_ROW_TEMPLATE}
      }
    </view>
  `,
})
class FlatRowHost {
  readonly rows = rowsSignal;
  readonly selectedId = selectedSignal;

  rowClassFor(row: IBenchmarkRow): string {
    return row.id === this.selectedId() ? ROW_CLASS_SELECTED : ROW_CLASS;
  }

  onSelect(id: number): void {
    selectedSignal.set(id);
  }

  onRemove(id: number): void {
    rowsSignal.update(rows => rows.filter(row => row.id !== id));
  }
}

const fabric = installRecordingFabric();

const flush = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function buildRows(count: number): IBenchmarkRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: index + 1,
    label: `row ${index + 1}`,
  }));
}

type IMountProbe = {
  engineNodes: number;
  anchors: number;
};

async function mountProbe(
  component: typeof ComposedRowHost | typeof FlatRowHost,
  rowCount: number,
): Promise<IMountProbe> {
  rowsSignal.set(buildRows(rowCount));
  selectedSignal.set(undefined);
  fabric.reset();

  const surface = mount(ROOT_TAG, component);
  await flush();

  const liveCensus = censusLive(...surface.children);
  return { engineNodes: liveCensus.nodes, anchors: liveCensus.anchors };
}

const perRow = (few: number, many: number): number =>
  (many - few) / (MANY_ROWS - FEW_ROWS);

beforeEach(() => {
  registerRules(
    ROW_RULES.map((rule, order) => ({
      tokens: rule.tokens,
      specificity: [0, 1, 0] as [number, number, number],
      order,
      style: rule.style,
    })),
  );
});

afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('benchmark row shapes', () => {
  it('differ by exactly the composed components on the engine side', async () => {
    const composedFew = await mountProbe(ComposedRowHost, FEW_ROWS);
    unmount(ROOT_TAG);
    const composedMany = await mountProbe(ComposedRowHost, MANY_ROWS);
    unmount(ROOT_TAG);
    const flatFew = await mountProbe(FlatRowHost, FEW_ROWS);
    unmount(ROOT_TAG);
    const flatMany = await mountProbe(FlatRowHost, MANY_ROWS);

    const measured = {
      composedNodes: perRow(composedFew.engineNodes, composedMany.engineNodes),
      composedAnchors: perRow(composedFew.anchors, composedMany.anchors),
      composedRenderable: perRow(
        composedFew.engineNodes - composedFew.anchors,
        composedMany.engineNodes - composedMany.anchors,
      ),
      flatNodes: perRow(flatFew.engineNodes, flatMany.engineNodes),
      flatAnchors: perRow(flatFew.anchors, flatMany.anchors),
      flatRenderable: perRow(
        flatFew.engineNodes - flatFew.anchors,
        flatMany.engineNodes - flatMany.anchors,
      ),
    };

    expect(measured).toEqual({
      // The claim under test: same renderable tree, ONE extra retained node per row, and it is an
      // anchor — the row component's own host.
      composedNodes: COMPOSED_NODES_PER_ROW,
      composedAnchors: COMPOSED_NODES_PER_ROW - FLAT_NODES_PER_ROW,
      composedRenderable: FLAT_NODES_PER_ROW,
      flatNodes: FLAT_NODES_PER_ROW,
      flatAnchors: 0,
      flatRenderable: FLAT_NODES_PER_ROW,
    });
  });

  // WITH_INPUT_ROW_TEMPLATE is the only one of the templates with a literal counterpart in the
  // screen — COMPOSED_ROW_TEMPLATE and FLAT_ROW_TEMPLATE are adapter-property fixtures now, and
  // fencing a fixture with no real screen match would just report "not found" forever.
  it('stays a literal copy of the screen row it measures', () => {
    const screen = readFileSync(SCREEN_PATH, 'utf8').replace(/\s+/g, '');

    expect(screen).toContain(WITH_INPUT_ROW_TEMPLATE.replace(/\s+/g, ''));
  });
});
