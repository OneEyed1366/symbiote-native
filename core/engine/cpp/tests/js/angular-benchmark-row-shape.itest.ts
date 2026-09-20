// The instrument behind examples/angular's BenchmarkScreen row-shape toggle, against the REAL
// committed Fabric tree — replaces the COMMIT-shape half of
// adapters/angular/src/__tests__/benchmark-row-shape.test.ts's `installFabric()` usage (byte-
// identical composed-vs-flat trees, and the Fabric view-NAME count for the with-input row). Both
// are commit-shape questions only the real renderer can answer.
//
// The engine-NODE-count claim (censusLive's `engineNodes`/`anchors`) needs no host at all — it
// reads the retained JS tree's own child links — and stays a plain vitest file
// (adapters/angular/src/__tests__/benchmark-row-shape.test.ts), alongside the drift fence against
// the real screen. `childFlattens` (the applier's own commit-walk bookkeeping,
// `censusRetainedTree().flattenWidths.length`) has no reading outside the retired mirror and is
// dropped, not ported — the same "goes with it" call every prior round made for applier-internal
// counters.

import '@angular/compiler';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import {
  SYMBIOTE_ELEMENTS,
  mount,
  registerComposedComponent,
  unmount,
} from '@symbiote-native/angular';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
// Internal, non-barrel module — the bare intrinsic hosts, not the behavior-wrapped `View`/`Text`
// the public barrel exports, matching exactly what the screen's own row imports.
import {
  TextHost as Text,
  ViewHost as View,
} from '../../../../../adapters/angular/src/primitives';

import {
  beforeEach,
  describe,
  expect,
  findCommitted,
  flushTimers,
  it,
  report,
} from './harness';

const ROOT_TAG = 1;

const flush = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function buildRows(count: number): { id: number; label: string }[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: index + 1,
    label: `row ${index + 1}`,
  }));
}

const ROW_RULES = [
  { tokens: ['bench-row'], style: { height: 44, flexDirection: 'row' } },
  { tokens: ['bench-row-selected'], style: { backgroundColor: '#3a2c10' } },
  { tokens: ['bench-row-id'], style: { width: 56, fontSize: 12 } },
  { tokens: ['bench-row-label'], style: { fontSize: 14 } },
  { tokens: ['bench-row-remove'], style: { width: 28, height: 28 } },
  { tokens: ['bench-row-remove-text'], style: { fontSize: 18 } },
  { tokens: ['flex1'], style: { flex: 1 } },
];

registerComposedComponent('BenchmarkRow');
registerComposedComponent('BenchmarkRowWithInput');

type IBenchmarkRow = { id: number; label: string };
const ROW_CLASS = 'bench-row';
const ROW_CLASS_SELECTED = 'bench-row bench-row-selected';

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
  imports: [SYMBIOTE_ELEMENTS, Text, View],
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

@Component({
  selector: 'BenchmarkRowWithInput',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, Text, View],
  template: WITH_INPUT_ROW_TEMPLATE,
})
class BenchmarkRowWithInput {
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
    <view testID="list">
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
  selector: 'with-input-row-host',
  standalone: true,
  imports: [BenchmarkRowWithInput, View],
  template: `
    <view testID="list">
      @for (row of rows(); track row.id) {
        <BenchmarkRowWithInput
          [row]="row"
          [isSelected]="row.id === selectedId()"
          (select)="onSelect($event)"
          (remove)="onRemove($event)"
        />
      }
    </view>
  `,
})
class WithInputRowHost {
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
    <view testID="list">
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

const NATIVE_VIEWS_PER_ROW = 9;
const WITH_INPUT_VIEWS_PER_ROW = NATIVE_VIEWS_PER_ROW + 1;
// Just the fixture's own `testID="list"` view — rooting the count there (rather than at the
// surface, the way the mirror's `fabric.committed` array did) excludes RN's synthetic AppContainer
// wrapper the mirror used to count as chrome, so this port's chrome is 1 node, not 2.
const FIXTURE_CHROME_VIEWS = 1;
const FEW_ROWS = 1;
const MANY_ROWS = 3;
const perRow = (few: number, many: number): number =>
  (many - few) / (MANY_ROWS - FEW_ROWS);

const PRESSABLE_ONLY_DEFAULTS = ['accessible', 'focusable'];

type ICommittedShape = {
  viewName: string;
  props: Record<string, string>;
  children: ICommittedShape[];
};

function shapeOf(
  node: NonNullable<ReturnType<typeof findCommitted>>,
): ICommittedShape {
  const props = { ...node.props };
  for (const key of PRESSABLE_ONLY_DEFAULTS) delete props[key];
  return {
    viewName: node.viewName,
    props,
    children: node.children.map(shapeOf),
  };
}

function viewNamesOf(
  node: NonNullable<ReturnType<typeof findCommitted>>,
): string[] {
  return [node.viewName, ...node.children.flatMap(viewNamesOf)];
}

type IMountProbe = {
  committed: ICommittedShape | undefined;
  viewNames: string[];
};

async function mountProbe(
  component:
    typeof ComposedRowHost | typeof FlatRowHost | typeof WithInputRowHost,
  rowCount: number,
): Promise<IMountProbe> {
  rowsSignal.set(buildRows(rowCount));
  selectedSignal.set(undefined);

  const surface = mount(ROOT_TAG, component);
  await flush();
  surface.commit();
  await flush();

  // The fixture's own list View — everything the test measures sits under it.
  const listView = findCommitted(n => n.props.testID === 'list');
  return {
    committed: listView === undefined ? undefined : shapeOf(listView),
    viewNames: listView === undefined ? [] : viewNamesOf(listView),
  };
}

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

describe('benchmark row shapes on the real engine', () => {
  it('commit an identical Fabric tree', async () => {
    const composed = await mountProbe(ComposedRowHost, MANY_ROWS);
    unmount(ROOT_TAG);
    const flat = await mountProbe(FlatRowHost, MANY_ROWS);
    unmount(ROOT_TAG);
    clearGlobalStyles();

    expect(composed.viewNames).toEqual(flat.viewNames);
    expect(composed.viewNames.length).toBe(
      NATIVE_VIEWS_PER_ROW * MANY_ROWS + FIXTURE_CHROME_VIEWS,
    );
    expect(flat.committed).toEqual(composed.committed);
  });

  it('adds exactly one native view per row (the TextInput), nothing else', async () => {
    const withInputFew = await mountProbe(WithInputRowHost, FEW_ROWS);
    unmount(ROOT_TAG);
    const withInputMany = await mountProbe(WithInputRowHost, MANY_ROWS);
    unmount(ROOT_TAG);
    clearGlobalStyles();

    expect(
      perRow(withInputFew.viewNames.length, withInputMany.viewNames.length),
    ).toBe(WITH_INPUT_VIEWS_PER_ROW);
    expect(withInputMany.viewNames.length).toBe(
      WITH_INPUT_VIEWS_PER_ROW * MANY_ROWS + FIXTURE_CHROME_VIEWS,
    );
  });
});

report();
