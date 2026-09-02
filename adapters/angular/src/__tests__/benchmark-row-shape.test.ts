/// <reference types="node" />

// The instrument behind examples/angular's BenchmarkScreen row-shape toggle.
//
// That toggle exists to test one open question: Angular builds a 1,000-row list ~3x slower than
// the other four adapters (Create 1,000 rows, all-mounted, on device: Angular 2383 ms vs Solid
// 765 / React 814 / Svelte 937 / Vue 1132) while its point operations are ordinary (select 77,
// swap 81, remove 84). The last structural suspect is that an Angular component is bound to a
// host ELEMENT, so every composed component instance costs an engine node — 12 per row against
// the 9 every other adapter retains.
//
// An A/B that changes the COMMITTED tree measures something else and is void, so both halves of
// the claim are pinned here rather than asserted on the screen:
//
//   1. composed and flat commit a byte-identical Fabric tree — same view names, same nesting,
//      same props, the canary row's 9 native views either way;
//   2. the engine node count actually differs, and by exactly the anchors — the row component
//      and its two Pressables.
//
// The five-adapter anchor census in adapters/*/src/anchor-flatten-cost.test.* prices the same
// anchors across every adapter; this file is narrower and answers the question that census cannot:
// whether the screen's own two row shapes are a valid A/B at all.
//
// Both row templates are literal copies of the screen's, and a drift fence below reads the screen
// and fails if either copy stops matching it. Copies rather than a shared import because
// examples/* is a standalone npm tree outside this workspace, and because sharing the row would
// need a component — the thing the flat shape removes.

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  isAnchor,
  readCommitProfile,
  registerRules,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { Pressable } from '../components/pressable';
import { TextHost as Text, ViewHost as View } from '../primitives';
import { TextInput } from '../components/text-input';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 4242;
const SCREEN_PATH = 'examples/angular/src/screens/BenchmarkScreen.ts';

// What the row shape is supposed to cost, per row, on each side of the toggle. NATIVE_VIEWS is
// the canary row every adapter builds: 1 View + 3x(Text + RawText) + 2 press targets.
const NATIVE_VIEWS_PER_ROW = 9;
const COMPOSED_NODES_PER_ROW = 12;
const FLAT_NODES_PER_ROW = 9;
// The with-input arm's own view count: NATIVE_VIEWS_PER_ROW + one real <TextInput> — see
// examples/angular's ROW_CONTENT.
const WITH_INPUT_VIEWS_PER_ROW = NATIVE_VIEWS_PER_ROW + 1;

// RN's synthetic box-none AppContainer, plus the fixture's own list View. The rows sit under a
// View rather than directly under the surface because a @for at the surface ROOT renders nothing
// through this adapter (measured while writing this file) - the screen's rows are inside a
// ScrollView, so the wrapper keeps the fixture faithful as well as functional. Identical in both
// shapes, so it cancels out of every comparison here.
const FIXTURE_CHROME_VIEWS = 2;

// Two row counts, so a per-row figure comes out as a DELTA and the fixture's own chrome cancels
// instead of having to be subtracted by hand.
const FEW_ROWS = 1;
const MANY_ROWS = 3;

// In the app the babel-register-composed plugin registers every app-authored composed selector;
// here it is explicit. Without it the row's host element falls through to a real createNode with
// an unknown view name — which would put an extra painting node in the composed tree and make
// test 1 fail for a reason that never happens on a device.
registerComposedComponent('BenchmarkRow');

// The screen's classes, as rules, so both shapes carry a real class-derived style. With none
// registered the comparison would be between two empty styles and could not see a merge
// difference between Pressable's anchor fold and a plain view's own class tokens.
const ROW_RULES = [
  { tokens: ['bench-row'], style: { height: 44, flexDirection: 'row' } },
  { tokens: ['bench-row-selected'], style: { backgroundColor: '#3a2c10' } },
  { tokens: ['bench-row-id'], style: { width: 56, fontSize: 12 } },
  { tokens: ['bench-row-label'], style: { fontSize: 14 } },
  { tokens: ['bench-row-remove'], style: { width: 28, height: 28 } },
  { tokens: ['bench-row-remove-text'], style: { fontSize: 18 } },
  { tokens: ['flex1'], style: { flex: 1 } },
];

type IBenchmarkRow = {
  id: number;
  label: string;
};

const ROW_CLASS = 'bench-row';
const ROW_CLASS_SELECTED = 'bench-row bench-row-selected';

// ---------------------------------------------------------------------------
// Three row shapes. Only ONE of them is still a literal copy of anything the screen renders —
// see the drift fence at the end and the note above each constant below.
// ---------------------------------------------------------------------------

// FIXTURE ONLY as of 2026-09-01 — the screen dropped its row-shape/row-content toggles down to
// one row (below), so this "composed, no TextInput" shape no longer exists there literally. Kept
// verbatim anyway: it is still the real adapter property `flat vs composed commit an identical
// Fabric tree` measures (tests below), independent of what the example currently ships, and that
// oracle is the only thing in the repo comparing Angular's two paths at all
// (`.claude/rules/fabric-boolean-event-gates.md`). Not fenced against the screen — see the `it`
// at the end for why fencing a fixture with no literal counterpart would just go vacuous.
const COMPOSED_ROW_TEMPLATE = `
    <View [class]="rowClass">
      <Text class="bench-row-id">{{ rowId }}</Text>
      <Pressable class="flex1" (press)="select.emit(row.id)">
        <Text class="bench-row-label">{{ row.label }}</Text>
      </Pressable>
      <Pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <Text class="bench-row-remove-text">×</Text>
      </Pressable>
    </View>
  `;

// THE SCREEN'S ONLY ROW as of 2026-09-01 (formerly its `ROW_CONTENT.WithInput` arm; the toggle
// that picked between this and `COMPOSED_ROW_TEMPLATE` above is gone, and this is what stayed).
// The one constant here still fenced against the screen — see the `it` at the end.
const WITH_INPUT_ROW_TEMPLATE = `
    <View [class]="rowClass">
      <Text class="bench-row-id">{{ rowId }}</Text>
      <Pressable class="flex1" (press)="select.emit(row.id)">
        <Text class="bench-row-label">{{ row.label }}</Text>
      </Pressable>
      <Pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <Text class="bench-row-remove-text">×</Text>
      </Pressable>
      <TextInput class="bench-row-input" [value]="row.label" />
    </View>
  `;

// FIXTURE ONLY as of 2026-09-01, same reasoning as COMPOSED_ROW_TEMPLATE above — the screen's
// `flat` row shape (zero composed components) is gone entirely, not merged into anything. Kept
// for the same adapter-property tests; not fenced against the screen.
const FLAT_ROW_TEMPLATE = `
            <View [class]="rowClassFor(row)">
              <Text class="bench-row-id">{{ row.id }}</Text>
              <View class="flex1" (press)="onSelect(row.id)">
                <Text class="bench-row-label">{{ row.label }}</Text>
              </View>
              <View class="bench-row-remove" (press)="onRemove(row.id)">
                <Text class="bench-row-remove-text">×</Text>
              </View>
            </View>
`;

@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [Pressable, Text, View],
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
  imports: [Pressable, Text, TextInput, View],
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

registerComposedComponent('BenchmarkRowWithInput');

const rowsSignal = signal<readonly IBenchmarkRow[]>([]);
const selectedSignal = signal<number | undefined>(undefined);

@Component({
  selector: 'composed-row-host',
  standalone: true,
  imports: [BenchmarkRow, View],
  template: `
    <View>
      @for (row of rows(); track row.id) {
        <BenchmarkRow
          [row]="row"
          [isSelected]="row.id === selectedId()"
          (select)="onSelect($event)"
          (remove)="onRemove($event)"
        />
      }
    </View>
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
    <View>
      @for (row of rows(); track row.id) {
        <BenchmarkRowWithInput
          [row]="row"
          [isSelected]="row.id === selectedId()"
          (select)="onSelect($event)"
          (remove)="onRemove($event)"
        />
      }
    </View>
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
    <View>
      @for (row of rows(); track row.id) {
        ${FLAT_ROW_TEMPLATE}
      }
    </View>
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

// ---------------------------------------------------------------------------

const fabric = installFabric();

// Two turns, not one: the first lets Angular's zoneless scheduler run the template, the second
// lets the engine's microtask-coalesced commit reach completeRoot. The render suite drains the
// same way.
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

// tag and instanceHandle are per-mount identities and would differ between two mounts of the same
// markup; everything that reaches the native host is here.
type ICommittedShape = {
  viewName: string;
  props: Record<string, unknown>;
  children: ICommittedShape[];
};

// FORMERLY subtracted `onAccessibilityAction`/`onAccessibilityTap`/`onMagicTap`/
// `onAccessibilityEscape` from both sides here — the composed `Pressable` template bound all four
// unconditionally (`(accessibilityTap)="emit(...)"`), the flat one bound none, and the engine
// cannot tell a subscriber from a forwarder, so the two shapes diverged on exactly these keys
// (`.claude/rules/fabric-boolean-event-gates.md`). Closed 2026-09-01: Pressable now routes all four
// through `hostProps()`'s flat bag, gated on `EventEmitter.observed` the same way `press`/`hoverIn`
// already were — an unsubscribed instance carries none of them. Verified with a positive and a
// negative control (a Pressable with no listener commits none of the four; one with exactly
// `(accessibilityAction)` commits only that key) before deleting the subtraction — a green
// comparison alone would not have told the two failure directions apart.
function shapeOf(nodes: readonly IFakeNode[]): ICommittedShape[] {
  return nodes.map(node => ({
    viewName: node.viewName,
    props: node.props,
    children: shapeOf(node.children),
  }));
}

function viewNamesOf(nodes: readonly IFakeNode[]): string[] {
  return nodes.flatMap(node => [node.viewName, ...viewNamesOf(node.children)]);
}

function countEngineNodes(roots: readonly ISymbioteNode[]): {
  total: number;
  anchors: number;
} {
  let total = 0;
  let anchors = 0;
  const stack: ISymbioteNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    total += 1;
    if (isAnchor(node)) anchors += 1;
    for (const child of node.children) stack.push(child);
  }
  return { total, anchors };
}

type IMountProbe = {
  committed: ICommittedShape[];
  viewNames: string[];
  engineNodes: number;
  anchors: number;
  childFlattens: number;
};

// One cold mount of `component` with `rowCount` rows, measured from a zeroed profile so the
// numbers cover that mount and nothing else.
async function mountProbe(
  component:
    typeof ComposedRowHost | typeof FlatRowHost | typeof WithInputRowHost,
  rowCount: number,
): Promise<IMountProbe> {
  rowsSignal.set(buildRows(rowCount));
  selectedSignal.set(undefined);
  fabric.reset();
  readCommitProfile();

  const surface = mount(ROOT_TAG, component);
  await flush();

  const profile = readCommitProfile();
  const census = countEngineNodes(surface.children);
  return {
    committed: shapeOf(fabric.committed),
    viewNames: viewNamesOf(fabric.committed),
    engineNodes: census.total,
    anchors: census.anchors,
    childFlattens: profile.childFlattens,
  };
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
  it('commit an identical Fabric tree', async () => {
    const composed = await mountProbe(ComposedRowHost, MANY_ROWS);
    unmount(ROOT_TAG);
    const flat = await mountProbe(FlatRowHost, MANY_ROWS);

    // The row every adapter's canary builds, once per row and nothing else.
    expect(composed.viewNames).toEqual(flat.viewNames);
    expect(composed.viewNames).toHaveLength(
      NATIVE_VIEWS_PER_ROW * MANY_ROWS + FIXTURE_CHROME_VIEWS,
    );
    expect(flat.committed).toEqual(composed.committed);
  });

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
      composedFlattens: perRow(
        composedFew.childFlattens,
        composedMany.childFlattens,
      ),
      flatNodes: perRow(flatFew.engineNodes, flatMany.engineNodes),
      flatAnchors: perRow(flatFew.anchors, flatMany.anchors),
      flatRenderable: perRow(
        flatFew.engineNodes - flatFew.anchors,
        flatMany.engineNodes - flatMany.anchors,
      ),
    };
    const flatFlattensPerRow = perRow(
      flatFew.childFlattens,
      flatMany.childFlattens,
    );

    expect(measured).toEqual({
      // The claim under test: same renderable tree, three extra retained nodes per row, and all
      // three of them anchors - the row component's host plus one per Pressable.
      composedNodes: COMPOSED_NODES_PER_ROW,
      composedAnchors: COMPOSED_NODES_PER_ROW - FLAT_NODES_PER_ROW,
      composedRenderable: FLAT_NODES_PER_ROW,
      // What an anchor costs the walk even though it never paints: two parents per row whose
      // children hold one (the row's own host, and the row View holding the two Pressables), so
      // renderableChildren's fast path is defeated and re-allocates on both.
      composedFlattens: 2,
      flatNodes: FLAT_NODES_PER_ROW,
      flatAnchors: 0,
      flatRenderable: FLAT_NODES_PER_ROW,
    });
    // Flat's own flatten count is not in that table because it does not scale with rows at all -
    // the fixture's @for anchor defeats one scan whatever the row count, and the per-row delta is
    // noise around zero. Growth is the property under test.
    expect(flatFlattensPerRow).toBeLessThanOrEqual(0);
  });

  // ROW_CONTENT.WithInput: one extra native view, and NOTHING else moves — same view names as
  // composed's own committed tree plus one RCTSinglelineTextInputView, same engine-node/anchor
  // delta as composed (BenchmarkRowWithInput is a straight copy of BenchmarkRow, not a fork of its
  // anchor shape).
  it('adds exactly one native view per row (the TextInput), nothing else', async () => {
    const withInputFew = await mountProbe(WithInputRowHost, FEW_ROWS);
    unmount(ROOT_TAG);
    const withInputMany = await mountProbe(WithInputRowHost, MANY_ROWS);

    // Fabric: the acceptance number this arm exists for — 10 native views/row, not 9.
    expect(
      perRow(withInputFew.viewNames.length, withInputMany.viewNames.length),
    ).toBe(WITH_INPUT_VIEWS_PER_ROW);
    expect(withInputMany.viewNames).toHaveLength(
      WITH_INPUT_VIEWS_PER_ROW * MANY_ROWS + FIXTURE_CHROME_VIEWS,
    );
    // Engine side costs MORE than the one Fabric view: TextInput's own composed template is
    // `@if (isMultiline) {…} @else {…}`, and (measured directly, headless, walking the engine
    // tree of a lone <TextInput>) that costs its own host anchor PLUS one anchor per @if branch —
    // 3 anchors total for 1 renderable native view, the same "@if reserves a structural slot
    // whether or not it renders" cost BenchmarkRowWithInput's own comment names, just paid inside
    // TextInput's implementation instead of this screen's. So the delta is +4 nodes / +3 anchors,
    // not +1 — this is Angular's un-lowered TextInput being expensive on the engine side even
    // where Fabric sees only one more view.
    const TEXT_INPUT_ENGINE_NODES = 4;
    const TEXT_INPUT_ANCHORS = 3;
    expect(perRow(withInputFew.engineNodes, withInputMany.engineNodes)).toBe(
      COMPOSED_NODES_PER_ROW + TEXT_INPUT_ENGINE_NODES,
    );
    expect(perRow(withInputFew.anchors, withInputMany.anchors)).toBe(
      COMPOSED_NODES_PER_ROW - FLAT_NODES_PER_ROW + TEXT_INPUT_ANCHORS,
    );
  });

  // WITH_INPUT_ROW_TEMPLATE is the only one of the three with a literal counterpart in the screen
  // as of 2026-09-01 — COMPOSED_ROW_TEMPLATE and FLAT_ROW_TEMPLATE are adapter-property fixtures
  // now (see their own comments above), and fencing a fixture with no real screen match would
  // just report "not found" forever, which is the same as no fence at all
  // (`.claude/rules/test-harness-false-greens.md`). A copy that drifts from the screen makes
  // every number below a measurement of something the device never runs — and nothing else would
  // say so, since the screen is outside this workspace and neither tsc nor ngc compares the two.
  it('stays a literal copy of the screen row it measures', () => {
    const screen = readFileSync(SCREEN_PATH, 'utf8').replace(/\s+/g, '');

    expect(screen).toContain(WITH_INPUT_ROW_TEMPLATE.replace(/\s+/g, ''));
  });
});
