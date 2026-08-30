import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  computed,
  signal,
} from '@angular/core';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  SymbioteHostPropsDirective,
  Text,
  View,
  VListItemDirective,
  VSectionHeaderDirective,
  VSectionItemDirective,
  type ISection,
} from '@symbiote-native/angular';
import {
  readCommitProfile,
  registerPostCommit,
  unregisterPostCommit,
} from '@symbiote-native/engine';
import {
  readFabricCallProfile,
  type IFabricCallProfile,
} from '../fabric-call-counter';
import { ActionButton } from '../components/ActionButton';
import {
  commitProfileGate,
  JsFrameRateMeter,
} from '../components/JsFrameRateMeter';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
// static look compiled at build time by @symbiote-native/css-parser
import './BenchmarkScreen.css';

// Word lists and row shape are taken verbatim from js-framework-benchmark (krausest) so the
// numbers here can be read next to the published Vue/Svelte/Solid ones. Its rules forbid
// hand-tuning the implementation for the benchmark, so everything below is the plain keyed-list
// Angular anyone would write: signals in the component, one row component, `@for` with `track`.
const ADJECTIVES = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
];
const COLOURS = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'white',
  'black',
  'orange',
];
const NOUNS = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
];

const ROW_BATCH = 1000;
const ROW_BATCH_LARGE = 10000;

// The number that decides whether a row COUNT is even feasible here, and the one krausest cannot
// tell us: its counts are DOM-node counts. `BenchmarkRow` below expands to NINE native views
// (1 View + 3x[Text + RawText] + 2 Pressable Views), so 10 000 rows mounted at once is 90 000
// UIViews. Measured 2026-08-18 on the iOS 26.5 simulator, that never completed: RAM climbed
// 2.1 -> 2.8 GB and the JS thread sat at 0 fps. 1 000 rows (9 000 views) completes in ~880 ms.
// That ceiling is the native host's, not the engine's - which is exactly why the two mount modes
// below exist, so the claim can be measured instead of asserted.
const NATIVE_VIEWS_PER_ROW = 9;
// Fixed so getItemLayout is exact in virtualized mode and both modes lay rows out identically.
const BENCH_ROW_HEIGHT = 44;

// How the row list reaches the screen. Same rows, same operations, same measurement - only the
// number of rows SIMULTANEOUSLY MOUNTED differs, which isolates "our commit path is slow" from
// "no host can hold this many native views".
const MOUNT_MODE = {
  // krausest's own shape: every row mounted, no windowing. Measures the engine's commit path
  // directly, and is the only mode whose numbers are comparable to the published web ones.
  All: 'all',
  // What an actual app ships. The list mounts a window of ~10 rows regardless of row count, so
  // the measurement covers the window plus the list's own bookkeeping, NOT 10 000 rows of commit.
  Virtualized: 'virtualized',
} as const;
type IMountMode = (typeof MOUNT_MODE)[keyof typeof MOUNT_MODE];

// DIAGNOSTIC PROBE — delete once the question below is answered either way.
//
// THE OPEN QUESTION. Angular builds a 1,000-row list ~3x slower than every other adapter, while
// its point operations are ordinary. Measured on device, all-mounted Create 1,000 rows:
//
//   Angular 2383 ms · Solid 765 · React 814 · Svelte 937 · Vue 1132
//   Angular's own select 77 ms · swap 81 · remove 84 — in line with everyone else.
//
// Two explanations were tested and DIED. ChangeDetectionStrategy.OnPush: every counter
// byte-identical with and without it. Wasted engine prop writes (Angular pushed 104,000 setProp
// calls where Solid needed 12,000): real, fixed, and worth exactly nothing — every row within
// ±10% of baseline afterwards.
//
// The remaining structural suspect is the one this toggle exists to test: Angular binds a
// component to a host ELEMENT, so every composed component instance costs an engine node
// (anchor-host-registry.ts keeps it from painting), while a Vue/React/Solid/Svelte component is a
// function that allocates nothing. The row below is 12 engine nodes under Angular against 9 under
// the others — the row component itself plus its two <Pressable>s. Note the arithmetic that makes
// this doubtful rather than obvious, and treat it as the thing under test: +33% nodes would have
// to produce 3x time, which needs a sharply superlinear cost nobody has located. A REFUTATION is
// a good result here; two convincing hypotheses have already died.
//
// So the same row exists in two shapes, switchable at runtime so both numbers come out of ONE
// build in ONE session with nothing rebuilt in between:
const ROW_SHAPE = {
  // The row as every other adapter's canary WRITES it, and what produced the 2383 ms above.
  // Byte-identical to what it was before this toggle existed, but no longer the default — under
  // Angular it is 12 engine nodes where every other adapter's row is 9, so it is not the shape a
  // cross-adapter table may be read off. Diagnostic for the question above; see `rowShape`.
  Composed: 'composed',
  // The same row with ZERO composed components: the two <Pressable>s become plain host elements
  // carrying a (press) listener, and the row component is inlined into the list template. Same 9
  // native views, same props, 9 engine nodes instead of 12 — i.e. the node count every other
  // adapter's row has, which is what makes this the DEFAULT.
  //
  // What it gives up, which is why this measures "composed components as a whole" rather than
  // anchors alone: Pressable's press machine (hitSlop, pressRetentionOffset, delayLongPress,
  // unstable_pressDelay, disabled, android_ripple), its responder claim and termination
  // negotiation, its accessibility fold, and the markForCheck wiring that comes with a component
  // boundary. A plain (press) on a View still fires — press is a base ViewConfig event the engine
  // synthesizes from the touch stream — so tapping a row still selects, and the × still removes.
  Flat: 'flat',
} as const;
type IRowShape = (typeof ROW_SHAPE)[keyof typeof ROW_SHAPE];

// The row's class in each state, as literals rather than a template concatenation so a
// change-detection pass hands `[class]` the same string it saw last time. BenchmarkRow's own
// getter spells the identical two values; the flat row must not differ from it here either.
const ROW_CLASS = 'bench-row';
const ROW_CLASS_SELECTED = 'bench-row bench-row-selected';
// krausest's "partial update" touches every 10th row of 10,000 and appends " !!!" to its label.
const UPDATE_STRIDE = 10;
const UPDATE_SUFFIX = ' !!!';
// The exact indices krausest's driver clicks: select row 2, remove row 4, swap rows 2 and 999.
const SELECT_INDEX = 1;
const REMOVE_INDEX = 3;
const SWAP_LOW_INDEX = 1;
const SWAP_HIGH_INDEX = 998;
const HISTORY_LIMIT = 20;

// Every timed step of the suite below starts from exactly this many rows.
const SUITE_ROWS = ROW_BATCH;
// A step that never commits would leave the suite awaiting forever and the screen frozen mid-run.
// Timing out into a reported `timeout` row instead keeps the rest of the suite measurable and
// names the broken operation - which is worth more than a hung screen.
const SUITE_STEP_TIMEOUT_MS = 30_000;
const SUITE_TIMED_OUT = Number.NaN;

// Two sticky paths are on this screen on purpose (see the block components below): a plain
// ScrollView, and a SectionList. Same viewport height and same header look, so a difference
// between the two boxes isolates virtualization from stickiness itself.
const STICKY_SECTION_COUNT = 200;
const STICKY_ROWS_PER_SECTION = 3;
const SECTION_LIST_SECTION_COUNT = 16;
const SECTION_LIST_ROWS_PER_SECTION = 32;
const SECTION_LIST_ROW_HEIGHT = 30;
const SECTION_LIST_HEADER_HEIGHT = 28;
// Every section is flattened to a header row, its item rows, then a FOOTER row - emitted even
// with no section-footer template, in which case it paints nothing and occupies no height. The
// getItemLayout arithmetic below has to account for that row existing in the index space.
const SECTION_LIST_FOOTER_HEIGHT = 0;
const SECTION_LIST_ENTRIES_PER_SECTION = 1 + SECTION_LIST_ROWS_PER_SECTION + 1;
const SECTION_LIST_SECTION_EXTENT =
  SECTION_LIST_HEADER_HEIGHT +
  SECTION_LIST_ROWS_PER_SECTION * SECTION_LIST_ROW_HEIGHT;

/**
 * The fixed-layout fast path for sticky path B. Without it the list learns a cell's extent only
 * after measuring it, so a fast drag outruns measurement and leaves the window blank for seconds -
 * observed on this very screen, scrolling past section 4.
 *
 * The index is FLAT over the whole stream (this is React Native's shape, not a section-relative
 * one), so it is decoded back into "which section, and what within it" here. Rows are uniform, so
 * a section always spans the same extent and the section's own offset is a multiplication.
 */
function sectionListItemLayout(
  _sections: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const sectionIndex = Math.floor(index / SECTION_LIST_ENTRIES_PER_SECTION);
  const withinSection = index - sectionIndex * SECTION_LIST_ENTRIES_PER_SECTION;
  const sectionOffset = sectionIndex * SECTION_LIST_SECTION_EXTENT;
  if (withinSection === 0) {
    return { length: SECTION_LIST_HEADER_HEIGHT, offset: sectionOffset, index };
  }
  if (withinSection === SECTION_LIST_ENTRIES_PER_SECTION - 1) {
    // The zero-height footer sits exactly where the next section begins.
    return {
      length: SECTION_LIST_FOOTER_HEIGHT,
      offset: sectionOffset + SECTION_LIST_SECTION_EXTENT,
      index,
    };
  }
  return {
    length: SECTION_LIST_ROW_HEIGHT,
    offset:
      sectionOffset +
      SECTION_LIST_HEADER_HEIGHT +
      (withinSection - 1) * SECTION_LIST_ROW_HEIGHT,
    index,
  };
}

type IStickyListItem = {
  id: string;
  label: string;
};

function isStickyListItem(value: unknown): value is IStickyListItem {
  return typeof value === 'object' && value !== null && 'label' in value;
}

// Every section is far taller than the 320px viewport, so headers genuinely cross-talk while
// scrolling instead of each one appearing and leaving on its own.
const BENCHMARK_SECTIONS: ISection<IStickyListItem>[] = Array.from(
  { length: SECTION_LIST_SECTION_COUNT },
  (_value, section) => ({
    title: `SECTION ${section + 1}`,
    data: Array.from(
      { length: SECTION_LIST_ROWS_PER_SECTION },
      (_rowValue, row) => ({
        id: `s${section}-r${row}`,
        label: `row ${section + 1}.${row + 1}`,
      }),
    ),
  }),
);

// Height is pinned inline rather than in the stylesheet because the number has to agree with
// sectionListItemLayout's arithmetic; splitting it across two files is how that pair silently
// drifts apart. Frozen module constants, not template literals: a fresh object per
// change-detection pass would re-push `style` onto every cell (angular-adapter-change-detection §9).
const SECTION_HEADER_STYLE = { height: SECTION_LIST_HEADER_HEIGHT };
const SECTION_ROW_STYLE = { height: SECTION_LIST_ROW_HEIGHT };

// Sticky path A addresses DIRECT children of the content container, so the sections are flattened
// into one list: a header followed by its rows, repeating. Built once at module load - rebuilding
// 800 entries on every change-detection pass would add its own cost to what the meter reports.
type IStickyChild = {
  key: string;
  className: string;
  text: string;
};

const STICKY_CHILDREN: readonly IStickyChild[] = Array.from(
  { length: STICKY_SECTION_COUNT },
  (_value, section) => [
    {
      key: `sticky-header-${section}`,
      className: 'section-header',
      text: `SECTION ${section + 1}`,
    },
    ...Array.from({ length: STICKY_ROWS_PER_SECTION }, (_rowValue, row) => ({
      key: `sticky-row-${section}-${row}`,
      className: 'list-row-text',
      text: `row ${section + 1}.${row + 1}`,
    })),
  ],
).flat();

const STICKY_HEADER_INDICES: number[] = Array.from(
  { length: STICKY_SECTION_COUNT },
  (_value, section) => section * (STICKY_ROWS_PER_SECTION + 1),
);

type IBenchmarkRow = {
  id: number;
  label: string;
};

function isBenchmarkRow(value: unknown): value is IBenchmarkRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'label' in value
  );
}

// A virtualized cell's template context types `let-item` as `unknown` (the list's item generic
// does not flow into an <ng-template>), so the cell narrows through the guard above. This stands
// in for the value the guard can never produce - same shape as ReactiveStyleScreen's rowLabel.
const PLACEHOLDER_ROW: IBenchmarkRow = { id: 0, label: '' };

const BENCH_OP = {
  Create: 'create',
  Replace: 'replace',
  Update: 'update',
  Select: 'select',
  Swap: 'swap',
  Remove: 'remove',
  CreateLots: 'createLots',
  Append: 'append',
  Clear: 'clear',
} as const;

type IBenchOpId = (typeof BENCH_OP)[keyof typeof BENCH_OP];

// One `symbioteHostProps` bag - the escape hatch for any prop a bare primitive does not declare
// as an @Input (angular-adapter §10).
type IHostProps = Record<string, unknown>;

type IBenchOperation = {
  id: IBenchOpId;
  label: string;
  testID: string;
  // testID on a bare Text is not a declared @Input, so a BOUND one has to travel in a
  // symbioteHostProps bag (angular-adapter §10). Built once per operation, next to the id it
  // encodes, rather than rebuilt by a template getter.
  resultHostProps: IHostProps;
  run: () => void;
};

type IBenchResult = {
  seq: number;
  op: IBenchOpId;
  label: string;
  durationMs: number;
  rowCount: number;
};

// Rows and selection are ONE signal, the way the reference implementation keeps them in one state
// object: every operation then produces exactly one new value, hence exactly one commit - a select
// that also touched a second signal would leave the clock running past the commit it timed.
type IListState = {
  rows: readonly IBenchmarkRow[];
  selectedId: number | undefined;
};

// What the ENGINE did inside one timed step, captured from readCommitProfile() around the step
// rather than sampled on a timer. This is the number that separates "our commit is expensive" from
// "the framework above it is expensive": every adapter builds the same 9 001-node tree for
// Create 1 000, so a nodesVisited or propWrites that differs between adapters on the SAME step is
// work the screen is generating, not a cost of the platform.
//
// `walkMs` is NOT the engine's JS cost — the window around reconcile() contains the createNode and
// appendChild JSI crossings it makes. Read it only as a DELTA between adapters, where the native
// part is a shared constant (measured: identical Fabric call counts across react/vue/solid/svelte).
type IStepProfile = {
  nodesVisited: number;
  propWrites: number;
  propNoops: number;
  commits: number;
  walkMs: number;
};

const EMPTY_STEP_PROFILE: IStepProfile = {
  nodesVisited: 0,
  propWrites: 0,
  propNoops: 0,
  commits: 0,
  walkMs: 0,
};

const EMPTY_FABRIC_PROFILE: IFabricCallProfile = {
  calls: {},
  propKeys: {},
  totalCalls: 0,
  totalPropKeys: 0,
};

// The one quantity this canary and `examples/bare-rn` (stock React Native on React's own Fabric
// renderer) can both report. IStepProfile above counts the ENGINE's reconcile walk, which stock
// has no equivalent of; `global.nativeFabricUIManager` is what both stacks actually drive, so
// counting calls there is the only like-for-like number between them.
function formatFabric(profile: IFabricCallProfile | undefined): string {
  if (profile === undefined) return '—';
  const create = profile.calls.createNode ?? 0;
  const append = profile.calls.appendChild ?? 0;
  const clones =
    (profile.calls.cloneNode ?? 0) +
    (profile.calls.cloneNodeWithNewChildren ?? 0) +
    (profile.calls.cloneNodeWithNewProps ?? 0) +
    (profile.calls.cloneNodeWithNewChildrenAndProps ?? 0);
  return `${create}/${append}/${clones}`;
}

// One row of the fixed-order suite. `startRows` is recorded rather than derived because it is the
// number the whole suite exists to pin down - a duration is meaningless without it.
type ISuiteEntry = {
  op: IBenchOpId;
  label: string;
  durationMs: number;
  startRows: number;
  profile: IStepProfile;
  fabric: IFabricCallProfile;
};

// A suite row's testID is per-operation, so it cannot be a static attribute; a bound one on a bare
// Text has to travel in a symbioteHostProps bag (angular-adapter §10). Built once at module load,
// keyed by operation, so the template hands the same object back on every change-detection pass
// instead of re-pushing a fresh one onto every row.
const SUITE_ROW_HOST_PROPS: Record<string, IHostProps> = Object.fromEntries(
  Object.values(BENCH_OP).map(op => [op, { testID: `bench-suite-${op}` }]),
);

// Same arrangement for the composed-vs-flat probe table. Its own testIDs, never the suite's -
// the two tables show different quantities and a shared testID would let a check read one for
// the other.
const PROBE_ROW_HOST_PROPS: Record<string, IHostProps> = Object.fromEntries(
  Object.values(BENCH_OP).map(op => [op, { testID: `bench-probe-${op}` }]),
);

// And for the engine-per-step table below it.
const ENGINE_ROW_HOST_PROPS: Record<string, IHostProps> = Object.fromEntries(
  Object.values(BENCH_OP).map(op => [op, { testID: `bench-engine-${op}` }]),
);

// And for the Fabric-call table beside it.
const FABRIC_ROW_HOST_PROPS: Record<string, IHostProps> = Object.fromEntries(
  Object.values(BENCH_OP).map(op => [op, { testID: `bench-fabric-${op}` }]),
);

// The suite's fixed order, shared by the runner and the comparison table below, so a step can
// never run without a row to land in (or a row exist for a step that never runs).
const SUITE_STEPS: readonly { op: IBenchOpId; label: string }[] = [
  { op: BENCH_OP.Create, label: 'Create 1,000 rows' },
  { op: BENCH_OP.Replace, label: 'Replace all 1,000 rows' },
  { op: BENCH_OP.Update, label: 'Partial update · every 10th row' },
  { op: BENCH_OP.Select, label: 'Select row' },
  { op: BENCH_OP.Swap, label: 'Swap 2 rows' },
  { op: BENCH_OP.Remove, label: 'Remove row' },
  { op: BENCH_OP.Append, label: 'Append 1,000 rows' },
  { op: BENCH_OP.Clear, label: 'Clear' },
];

function suiteLabel(op: IBenchOpId): string {
  return SUITE_STEPS.find(step => step.op === op)?.label ?? op;
}

// Which mode is mid-run and how far along. Rendered as its own block rather than folded into the
// button title, because a suite step can hold the JS thread for hundreds of milliseconds and the
// operator otherwise has no way to tell a running suite from a dead screen.
type ISuiteProgress = {
  mode: IMountMode;
  label: string;
  done: number;
};

// Both modes' last results, side by side. The comparison IS the output - all-mounted prices the
// commit path itself, virtualized prices what an app actually ships, and reading one without the
// other is how "the engine is slow" gets claimed off a number that measured 9,000 native views.
type ISuiteResults = Record<IMountMode, readonly ISuiteEntry[]>;

// Kept per row shape as well, so the probe's two runs sit side by side instead of the second
// overwriting the first - the whole point is reading them back to back without a rebuild.
type IShapedSuiteResults = Record<IRowShape, ISuiteResults>;

const EMPTY_SUITE_RESULTS: ISuiteResults = {
  [MOUNT_MODE.All]: [],
  [MOUNT_MODE.Virtualized]: [],
};

const EMPTY_SHAPED_RESULTS: IShapedSuiteResults = {
  [ROW_SHAPE.Composed]: EMPTY_SUITE_RESULTS,
  [ROW_SHAPE.Flat]: EMPTY_SUITE_RESULTS,
};

// A step's stopwatch: started by runStep, stopped by the engine's post-commit hook.
type IPendingMeasurement = {
  startedAt: number;
  settle: (durationMs: number) => void;
};

// Row ids are globally unique and never reused, exactly as in the reference implementation -
// a reused key would let `@for`'s track match an old row to a new one and hide real reconciliation
// work.
let nextRowId = 1;

// Deterministic, not Math.random(), and that is a cross-adapter requirement rather than a
// stylistic one: this screen is a RULER, and the same ruler has to exist in every example so a
// difference between React and Vue and Svelte and Angular can be read as a difference in the
// adapter. Random labels vary in length, length changes text measurement, and the noise lands in
// exactly the numbers being compared. A tiny LCG with a fixed seed makes every adapter build the
// byte-identical row list. (krausest forbids tuning the IMPLEMENTATION for the benchmark; pinning
// the data generator's seed is not that.)
const RANDOM_SEED = 1;
const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const LCG_MODULUS = 2 ** 32;
let randomState = RANDOM_SEED;

// Both generators are module state, so they drift with every button pressed before a run. Two
// suite runs are only byte-identical - to each other and across adapters - if both are rewound
// first, which is the whole point of pinning the seed.
function resetRowData(): void {
  randomState = RANDOM_SEED;
  nextRowId = 1;
}

function nextRandom(): number {
  randomState = (randomState * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
  return randomState / LCG_MODULUS;
}

function pick<T>(from: readonly T[]): T {
  return from[Math.floor(nextRandom() * from.length)];
}

function buildRows(count: number): IBenchmarkRow[] {
  const rows: IBenchmarkRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: nextRowId,
      label: `${pick(ADJECTIVES)} ${pick(COLOURS)} ${pick(NOUNS)}`,
    };
    nextRowId += 1;
  }
  return rows;
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '—';
  if (!Number.isFinite(durationMs)) return 'timeout';
  return `${durationMs.toFixed(1)} ms`;
}

@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [Pressable, Text, View],
  template: `
    <View [class]="rowClass">
      <Text class="bench-row-id">{{ rowId }}</Text>
      <Pressable class="flex1" (press)="select.emit(row.id)">
        <Text class="bench-row-label">{{ row.label }}</Text>
      </Pressable>
      <Pressable class="bench-row-remove" (press)="remove.emit(row.id)">
        <Text class="bench-row-remove-text">×</Text>
      </Pressable>
    </View>
  `,
})
export class BenchmarkRow {
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

/**
 * Sticky path A - a plain ScrollView with stickyHeaderIndices. Stickiness is computed in JS (the
 * adapter wraps each flagged child and drives it off the scroll offset), but nothing else runs
 * per frame: every child is mounted up front, there is no windowing. A component of its own with
 * no inputs, so a benchmark run never re-runs its template and never contaminates the numbers next
 * to the buttons - the Angular twin of React's memo() here.
 */
@Component({
  selector: 'StickyScrollViewBlock',
  standalone: true,
  imports: [ScrollView, Text],
  template: `
    <Text class="section-label"
      >STICKY PATH A · ScrollView · stickyHeaderIndices</Text
    >
    <ScrollView
      testID="benchmark-sticky-scroll"
      class="bench-sticky"
      [stickyHeaderIndices]="headerIndices"
      [scrollEventThrottle]="16"
      [nestedScrollEnabled]="true"
    >
      @for (child of children; track child.key) {
        <Text [class]="child.className">{{ child.text }}</Text>
      }
    </ScrollView>
    <Text class="note-text">{{ note }}</Text>
  `,
})
export class StickyScrollViewBlock {
  readonly children = STICKY_CHILDREN;
  readonly headerIndices = STICKY_HEADER_INDICES;
  readonly note = `${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`;
}

/**
 * Sticky path B - SectionList with stickySectionHeadersEnabled, i.e. VirtualizedSectionList over
 * VirtualizedList. This is the path the frame-drop regression actually showed up on: each scroll
 * frame additionally runs the windowing pass (cell render, viewability) and the sticky math is
 * computed inside the list. Shaped after components/ParityDemo's sticky check, scaled up to 512
 * rows. If path A holds its frame rate and this one does not, the cost is virtualization rather
 * than stickiness.
 */
@Component({
  selector: 'StickySectionListBlock',
  standalone: true,
  imports: [
    SectionList,
    Text,
    View,
    VSectionHeaderDirective,
    VSectionItemDirective,
  ],
  template: `
    <Text class="section-label"
      >STICKY PATH B · SectionList · stickySectionHeadersEnabled</Text
    >
    <SectionList
      testID="benchmark-sticky-section-list"
      [sections]="sections"
      [keyExtractor]="keyExtractor"
      [stickySectionHeadersEnabled]="true"
      class="bench-sticky"
      [scrollEventThrottle]="16"
      [getItemLayout]="itemLayout"
    >
      <ng-template vSectionHeader let-section>
        <Text class="section-header" [style]="headerStyle">{{
          section.title
        }}</Text>
      </ng-template>
      <ng-template vSectionItem let-item>
        <View class="parity-row" [style]="rowStyle">
          <Text class="list-row-text">{{ itemLabel(item) }}</Text>
        </View>
      </ng-template>
    </SectionList>
    <Text class="note-text">{{ note }}</Text>
  `,
})
export class StickySectionListBlock {
  readonly sections = BENCHMARK_SECTIONS;
  readonly headerStyle = SECTION_HEADER_STYLE;
  readonly rowStyle = SECTION_ROW_STYLE;
  readonly itemLayout = sectionListItemLayout;
  readonly note = `${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`;

  readonly keyExtractor = (item: IStickyListItem): string => item.id;

  itemLabel(item: unknown): string {
    return isStickyListItem(item) ? item.label : '';
  }
}

/**
 * On-device twin of the js-framework-benchmark (krausest) suite: the same nine list operations
 * every framework there is scored on, run against @symbiote-native/engine's commit path on a
 * real device instead of in isolation. A micro-benchmark times pure JS; this screen times the
 * whole round trip - Angular change detection, the engine's mutation -> clone-on-write
 * translation, and completeRoot - and puts a JS-thread frame counter next to it so a saved
 * millisecond can be checked against frames the user actually sees.
 */
@Component({
  selector: 'BenchmarkScreen',
  standalone: true,
  imports: [
    ActionButton,
    ActivityIndicator,
    BenchmarkRow,
    FlatList,
    JsFrameRateMeter,
    SafeAreaView,
    ScrollView,
    StickyScrollViewBlock,
    StickySectionListBlock,
    SymbioteHostPropsDirective,
    Text,
    View,
    VListItemDirective,
  ],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="benchmark-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View [class]="lineTagClass">
          <Text class="line-tag-text">{{ lineTagLabel }}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" [style]="heroBadgeStyle">
            <Text class="hero-badge-text">BM</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Benchmark</Text>
            <Text class="hero-body">
              The js-framework-benchmark operations, run on device against the
              engine's commit path — with the JS-thread frame rate beside them.
            </Text>
          </View>
        </View>

        <Text class="section-label">MEASUREMENTS</Text>
        <JsFrameRateMeter [accent]="accent" />

        <!-- Buttons and results sit DIRECTLY under the meter, and everything they stress sits
             below: a suite step holds the JS thread, so the dip has to be readable in the same
             screenful as the press that caused it. -->
        <View class="bench-run-row">
          <View class="flex1">
            <ActionButton
              testID="bench-run-suite-all"
              [title]="allMountedTitle()"
              [color]="accent"
              (press)="onRunSuite(mountModeAll)"
            ></ActionButton>
          </View>
          <View class="flex1">
            <ActionButton
              testID="bench-run-suite-virtualized"
              [title]="virtualizedTitle()"
              [color]="accent"
              (press)="onRunSuite(mountModeVirtualized)"
            ></ActionButton>
          </View>
        </View>

        <!-- The row-shape probe's switch. Sits with the run buttons, not down beside the rows,
             because it decides what a run MEASURES - press a shape, then press a mode. -->
        <View class="bench-run-row">
          <View class="flex1">
            <ActionButton
              testID="bench-row-shape-composed"
              [title]="composedShapeTitle()"
              [color]="accent"
              (press)="onPickRowShape(rowShapeComposed)"
            ></ActionButton>
          </View>
          <View class="flex1">
            <ActionButton
              testID="bench-row-shape-flat"
              [title]="flatShapeTitle()"
              [color]="accent"
              (press)="onPickRowShape(rowShapeFlat)"
            ></ActionButton>
          </View>
        </View>
        <Text testID="bench-row-shape-note" class="note-text">{{
          rowShapeNote()
        }}</Text>

        <View class="bench-run-row">
          <View class="flex1">
            <ActionButton
              testID="bench-toggle-batch-create"
              [title]="batchCreateTitle()"
              [color]="accent"
              (press)="onToggleBatchCreate()"
            ></ActionButton>
          </View>
        </View>
        <Text class="note-text">{{ batchCreateNote }}</Text>

        @if (progress() !== undefined) {
          <View testID="bench-suite-progress" class="bench-progress">
            <ActivityIndicator [color]="accent" />
            <Text class="bench-progress-text">{{ progressLine() }}</Text>
            <Text class="bench-progress-count">{{ progressCount() }}</Text>
          </View>
        }

        @if (hasSuiteResults()) {
          <View class="bench-compare-row">
            <Text class="bench-compare-label"></Text>
            <Text class="bench-compare-head-cell">ALL MOUNTED</Text>
            <Text class="bench-compare-head-cell">VIRTUALIZED</Text>
          </View>
          @for (step of suiteSteps; track step.op) {
            <View
              [symbioteHostProps]="suiteHostProps(step.op)"
              class="bench-compare-row"
            >
              <Text class="bench-compare-label">{{ step.label }}</Text>
              <Text class="bench-compare-cell">{{
                allMountedResult(step.op)
              }}</Text>
              <Text class="bench-compare-cell">{{
                virtualizedResult(step.op)
              }}</Text>
            </View>
          }

          <Text class="section-label">ENGINE PER STEP · ALL MOUNTED</Text>
          <View class="bench-compare-row">
            <Text class="bench-compare-label"></Text>
            <Text class="bench-compare-head-cell">VISITED</Text>
            <Text class="bench-compare-head-cell">WRITES/NOOP</Text>
            <Text class="bench-compare-head-cell">COMMITS</Text>
          </View>
          @for (step of suiteSteps; track step.op) {
            <View
              [symbioteHostProps]="engineHostProps(step.op)"
              class="bench-compare-row"
            >
              <Text class="bench-compare-label">{{ step.label }}</Text>
              <Text class="bench-compare-cell">{{
                engineVisited(step.op)
              }}</Text>
              <Text class="bench-compare-cell">{{
                engineWrites(step.op)
              }}</Text>
              <Text class="bench-compare-cell">{{
                engineCommits(step.op)
              }}</Text>
            </View>
          }
          <Text class="note-text">{{ engineNote }}</Text>

          <Text class="section-label">FABRIC CALLS · ALL MOUNTED</Text>
          <View class="bench-compare-row">
            <Text class="bench-compare-label"></Text>
            <Text class="bench-compare-head-cell">CREATE/APPEND/CLONE</Text>
            <Text class="bench-compare-head-cell">PROP KEYS</Text>
          </View>
          @for (step of suiteSteps; track step.op) {
            <View
              [symbioteHostProps]="fabricHostProps(step.op)"
              class="bench-compare-row"
            >
              <Text class="bench-compare-label">{{ step.label }}</Text>
              <Text class="bench-compare-cell">{{ fabricCalls(step.op) }}</Text>
              <Text class="bench-compare-cell">{{
                fabricPropKeys(step.op)
              }}</Text>
            </View>
          }
          <Text class="note-text">{{ fabricNote }}</Text>

          <Text class="section-label">PROBE · ROW SHAPE · ALL MOUNTED</Text>
          <View class="bench-compare-row">
            <Text class="bench-compare-label"></Text>
            <Text class="bench-compare-head-cell">COMPOSED</Text>
            <Text class="bench-compare-head-cell">FLAT</Text>
          </View>
          @for (step of suiteSteps; track step.op) {
            <View
              [symbioteHostProps]="probeHostProps(step.op)"
              class="bench-compare-row"
            >
              <Text class="bench-compare-label">{{ step.label }}</Text>
              <Text class="bench-compare-cell">{{
                composedShapeResult(step.op)
              }}</Text>
              <Text class="bench-compare-cell">{{
                flatShapeResult(step.op)
              }}</Text>
            </View>
          }
          <Text class="note-text">{{ probeNote }}</Text>
        } @else {
          <Text testID="bench-suite-empty" class="note-text"
            >No suite run yet.</Text
          >
        }
        <Text class="note-text">{{ suiteNote }}</Text>

        <!-- Both sticky paths and the row list sit under the buttons: the meter above stays on
             screen while either box is being dragged — the concrete case the benchmark exists
             for. -->
        <StickyScrollViewBlock />
        <StickySectionListBlock />
        <Text class="note-text">
          Drag inside a box (not the page) and watch the counters above — the
          two boxes differ only in which sticky implementation carries the
          frame.
        </Text>

        <Text class="section-label">{{ rowsSectionLabel() }}</Text>
        <!-- The shape branch is OUTSIDE the mount-mode branch on purpose. Nested the other way,
             every row would carry an extra @if container - one more engine node per row, in BOTH
             shapes - and the composed column would stop being the thing the 2383 ms was measured
             on. This way the composed branch below is byte-identical to what it was before the
             probe, and the whole toggle costs one anchor for the list. -->
        @if (isComposedRow()) {
          @if (isAllMounted()) {
            @for (row of rows(); track row.id) {
              <BenchmarkRow
                [row]="row"
                [isSelected]="row.id === selectedId()"
                (select)="onSelect($event)"
                (remove)="onRemove($event)"
              />
            }
          } @else {
            <FlatList
              testID="bench-rows-virtualized"
              class="bench-rows-viewport"
              [data]="rows()"
              [keyExtractor]="rowKeyExtractor"
              [getItemLayout]="rowItemLayout"
            >
              <ng-template vListItem let-item>
                <BenchmarkRow
                  [row]="rowOf(item)"
                  [isSelected]="rowOf(item).id === selectedId()"
                  (select)="onSelect($event)"
                  (remove)="onRemove($event)"
                />
              </ng-template>
            </FlatList>
          }
        } @else if (isAllMounted()) {
          <!-- The same nine native views, no component boundary anywhere: the row markup is
               inlined here rather than living in a @Component, and each <Pressable> is a plain
               View with a (press) listener. A literal copy of BenchmarkRow's template rather than
               something shared with it - sharing would need a component, which is the thing being
               removed. adapters/angular/src/__tests__/benchmark-row-shape.test.ts pins the two
               against each other so a drifting copy fails there instead of silently voiding a
               measurement. -->
          @for (row of rows(); track row.id) {
            <View [class]="rowClassFor(row)">
              <Text class="bench-row-id">{{ row.id }}</Text>
              <View class="flex1" (press)="onSelect(row.id)">
                <Text class="bench-row-label">{{ row.label }}</Text>
              </View>
              <View class="bench-row-remove" (press)="onRemove(row.id)">
                <Text class="bench-row-remove-text">×</Text>
              </View>
            </View>
          }
        } @else {
          <FlatList
            testID="bench-rows-virtualized"
            class="bench-rows-viewport"
            [data]="rows()"
            [keyExtractor]="rowKeyExtractor"
            [getItemLayout]="rowItemLayout"
          >
            <ng-template vListItem let-item>
              <View [class]="rowClassFor(rowOf(item))">
                <Text class="bench-row-id">{{ rowOf(item).id }}</Text>
                <View class="flex1" (press)="onSelect(rowOf(item).id)">
                  <Text class="bench-row-label">{{ rowOf(item).label }}</Text>
                </View>
                <View
                  class="bench-row-remove"
                  (press)="onRemove(rowOf(item).id)"
                >
                  <Text class="bench-row-remove-text">×</Text>
                </View>
              </View>
            </ng-template>
          </FlatList>
        }

        <!-- Below the fold on purpose: the single operations are for poking at one commit shape
             while debugging, not for reporting. Their Remove and Append numbers depend on press
             order, which is exactly what the suite above exists to remove. -->
        <Text class="section-label">OPERATIONS · LAST RUN</Text>
        @for (operation of operations; track operation.id) {
          <View class="bench-op-row">
            <View class="flex1">
              <ActionButton
                [testID]="operation.testID"
                [title]="operation.label"
                [color]="accent"
                (press)="operation.run()"
              ></ActionButton>
            </View>
            <Text
              [symbioteHostProps]="operation.resultHostProps"
              class="bench-op-result"
              >{{ resultFor(operation.id) }}</Text
            >
          </View>
        }

        <Text testID="bench-row-count" class="info-text">{{
          rowCountLine()
        }}</Text>

        <Text class="section-label">{{ historyLabel }}</Text>
        @if (history().length === 0) {
          <Text class="note-text"
            >Run an operation above to record a measurement.</Text
          >
        } @else {
          @for (entry of history(); track entry.seq) {
            <Text class="bench-history-row">{{ historyLine(entry) }}</Text>
          }
        }
      </ScrollView>
    </SafeAreaView>
  `,
})
export class BenchmarkScreen implements OnInit, OnDestroy {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Benchmark];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly accent = LINE_COLOR.performance;
  readonly heroBadgeStyle = { backgroundColor: LINE_COLOR.performance };
  readonly historyLabel = `HISTORY · LAST ${HISTORY_LIMIT} MEASUREMENTS`;

  private readonly list = signal<IListState>({
    rows: [],
    selectedId: undefined,
  });
  private readonly mountMode = signal<IMountMode>(MOUNT_MODE.All);
  // FLAT by default, and the default is the whole cross-adapter contract: only the flat row is 9
  // engine nodes, which is what one row is under React, Vue, Svelte and Solid. Composed is 12, and
  // it does not cost +33% — measured on device, all-mounted Create 1,000: composed 942.9 ms against
  // flat 418.2 ms, 2.26x for a third more nodes. Defaulting to composed therefore publishes an
  // Angular column ~2.3x worse than its siblings in any table read off this screen, comparing a
  // different tree rather than a different adapter. Composed stays one press away — it is the
  // probe for exactly that gap.
  private readonly rowShape = signal<IRowShape>(ROW_SHAPE.Flat);
  readonly history = signal<readonly IBenchResult[]>([]);
  readonly suiteResults = signal<IShapedSuiteResults>(EMPTY_SHAPED_RESULTS);
  readonly progress = signal<ISuiteProgress | undefined>(undefined);
  readonly suiteSteps = SUITE_STEPS;
  readonly suiteStepCount = SUITE_STEPS.length;
  readonly mountModeAll = MOUNT_MODE.All;
  readonly mountModeVirtualized = MOUNT_MODE.Virtualized;
  readonly rowShapeComposed = ROW_SHAPE.Composed;
  readonly rowShapeFlat = ROW_SHAPE.Flat;
  readonly probeNote = `Composed is ${NATIVE_VIEWS_PER_ROW + 3} engine nodes per row (the row component and its two Pressables each own a non-painting host element); flat is ${NATIVE_VIEWS_PER_ROW}. Both commit the same ${NATIVE_VIEWS_PER_ROW} native views with the same props, so a difference here is the cost of the component boundaries themselves — press one shape, run a mode, press the other, run the same mode.`;

  readonly rows = computed(() => this.list().rows);
  readonly selectedId = computed(() => this.list().selectedId);
  readonly isAllMounted = computed(() => this.mountMode() === MOUNT_MODE.All);
  readonly isComposedRow = computed(
    () => this.rowShape() === ROW_SHAPE.Composed,
  );

  // History is newest-first, so the first entry found for an operation is its latest run.
  private readonly lastDurations = computed(() => {
    const durations = new Map<IBenchOpId, number>();
    for (const entry of this.history()) {
      if (!durations.has(entry.op)) durations.set(entry.op, entry.durationMs);
    }
    return durations;
  });

  // What the host is actually holding. In virtualized mode the list decides, so it is reported as
  // an approximation of the window rather than a count derived from rows.length.
  readonly rowCountLine = computed(() => {
    const rows = this.rows();
    const mountedViews = this.isAllMounted()
      ? String(rows.length * NATIVE_VIEWS_PER_ROW)
      : `~1 window x ${NATIVE_VIEWS_PER_ROW}`;
    return `rows: ${rows.length} · ${mountedViews} native views mounted · selected: ${this.selectedId() ?? 'none'}`;
  });

  readonly rowsSectionLabel = computed(() =>
    this.isAllMounted() ? 'ROWS · ALL MOUNTED' : 'ROWS · VIRTUALIZED',
  );

  readonly allMountedTitle = computed(() =>
    this.progress()?.mode === MOUNT_MODE.All ? 'Running…' : 'Run · all mounted',
  );

  readonly virtualizedTitle = computed(() =>
    this.progress()?.mode === MOUNT_MODE.Virtualized
      ? 'Running…'
      : 'Run · virtualized',
  );

  readonly composedShapeTitle = computed(() =>
    this.isComposedRow() ? 'Rows · composed ✓' : 'Rows · composed',
  );

  readonly flatShapeTitle = computed(() =>
    this.isComposedRow() ? 'Rows · flat' : 'Rows · flat ✓',
  );

  readonly rowShapeNote = computed(() =>
    this.isComposedRow()
      ? `Composed row · BenchmarkRow + 2 Pressables · ${NATIVE_VIEWS_PER_ROW + 3} engine nodes per row. Diagnostic — a third more nodes than every other adapter's row, and measured 2.26x the Create time, so a cross-adapter table read off this shape is not comparing adapters.`
      : `Flat row · no composed components · ${NATIVE_VIEWS_PER_ROW} engine nodes per row. The default: the same node count every other adapter's row has, which is what makes the columns comparable. It gives up Pressable's press machine, responder negotiation and accessibility fold.`,
  );

  readonly progressLine = computed(() => {
    const progress = this.progress();
    if (progress === undefined) return '';
    const mode =
      progress.mode === MOUNT_MODE.All ? 'All mounted' : 'Virtualized';
    return `${mode} · ${progress.label}`;
  });

  readonly progressCount = computed(() => {
    const progress = this.progress();
    return progress === undefined
      ? ''
      : `${progress.done}/${this.suiteStepCount}`;
  });

  // Every recorded duration in one map, keyed shape:mode:operation. One computed rather than four
  // because the probe added a second axis and a computed per cell would be four more to keep in
  // step with each other.
  private readonly durations = computed(() => {
    const durations = new Map<string, number>();
    for (const [shape, byMode] of Object.entries(this.suiteResults())) {
      for (const [mode, entries] of Object.entries(byMode)) {
        for (const entry of entries) {
          durations.set(`${shape}:${mode}:${entry.op}`, entry.durationMs);
        }
      }
    }
    return durations;
  });

  readonly hasSuiteResults = computed(() => this.durations().size > 0);

  // All-mounted only, and following the selected row shape exactly as the duration columns above
  // do: the virtualized mode prices two different list implementations rather than two renderers,
  // and a profile shown against the shape that did not produce it would be read as this one's.
  private readonly profiles = computed(() => {
    const entries = this.suiteResults()[this.rowShape()][MOUNT_MODE.All];
    return new Map(entries.map(entry => [entry.op, entry.profile]));
  });

  private readonly fabricProfiles = computed(() => {
    const entries = this.suiteResults()[this.rowShape()][MOUNT_MODE.All];
    return new Map(entries.map(entry => [entry.op, entry.fabric]));
  });

  // Off by default because the engine's default is off; the toggle only mirrors the global back.
  readonly isBatchingCreate = signal(false);

  readonly batchCreateTitle = computed(() =>
    this.isBatchingCreate() ? 'Batch create · on ✓' : 'Batch create · off',
  );

  readonly batchCreateNote = `Temporary experiment switch. On, the engine hands a parent's children to cloneNodeWithChildren in one call instead of appending them one at a time — about a third fewer JSI calls on Create, paid for with one extra ShadowNode per batched parent. The sign is not predicted, which is why it is a runtime toggle: two builds a day apart drifted 4% on Create and 6x on Clear with no code change, so the only trustworthy comparison is back-to-back on one binary. Flip it, re-run the suite, compare.`;

  readonly engineNote = `Captured around each timed step, with the frame meter held so its own read-and-reset cannot eat them. On the flat row shape every adapter builds the same ${SUITE_ROWS * NATIVE_VIEWS_PER_ROW + 1}-node tree for Create, so a VISITED or WRITES that differs between adapters is work this screen is generating — not a cost of the platform. COMMITS must read 1; anything higher means a foreign commit landed inside the window. The ms is the reconcile window and it CONTAINS the createNode/appendChild JSI calls, so compare it across adapters, never read it as engine JS.`;

  readonly fabricNote = `Counted by wrapping global.nativeFabricUIManager before the engine binds it — the one surface this canary and the stock-React-Native baseline (examples/bare-rn) genuinely share, and therefore the only like-for-like number between them. The ENGINE table above has no counterpart over there: stock has no reconcile walk to count. Read as two questions. CREATE/APPEND/CLONE answers "does one stack ask Fabric to do MORE"; PROP KEYS answers the other half, "or the same number of times with fatter payloads". The wrapper costs one JS call per crossing and is therefore in every timing on this screen — the comparison holds only because the other side carries the identical wrapper.`;

  readonly suiteNote = `Every operation in a fixed order, each timed step starting from exactly ${SUITE_ROWS} rows, with untimed resets in between. All-mounted is krausest's own shape (${NATIVE_VIEWS_PER_ROW} native views per row) and the column that compares to the published web numbers; virtualized mounts a window instead, so it prices what an app ships rather than the commit path itself. Pressing the operation buttons by hand leaves Remove and Append measuring whatever happened to be on screen.`;

  private pending: IPendingMeasurement | null = null;
  private seq = 0;
  // Filled by the post-commit hook, read by `timed` right after its own `await this.runStep(...)`.
  // A plain field, deliberately NOT a signal: nothing renders it directly (the table below reads
  // the recorded suite entries), and a signal write here would dirty the view from inside the
  // commit that was just measured. Steps are serialized and `timed` awaits the progress step BEFORE
  // the measured one, so the value standing here when it reads is always the measured step's.
  private lastStepProfile: IStepProfile = EMPTY_STEP_PROFILE;
  private lastFabricProfile: IFabricCallProfile = EMPTY_FABRIC_PROFILE;

  readonly operations: readonly IBenchOperation[] = [
    this.operation(BENCH_OP.Create, 'Create 1,000 rows', () => this.onCreate()),
    this.operation(BENCH_OP.Replace, 'Replace all 1,000 rows', () =>
      this.onReplace(),
    ),
    this.operation(BENCH_OP.Update, 'Partial update · every 10th row', () =>
      this.onUpdate(),
    ),
    this.operation(BENCH_OP.Select, 'Select row', () => this.onSelectSample()),
    this.operation(BENCH_OP.Swap, 'Swap 2 rows', () => this.onSwap()),
    this.operation(BENCH_OP.Remove, 'Remove row', () => this.onRemoveSample()),
    this.operation(BENCH_OP.CreateLots, 'Create 10,000 rows', () =>
      this.onCreateLots(),
    ),
    this.operation(BENCH_OP.Append, 'Append 1,000 rows', () => this.onAppend()),
    this.operation(BENCH_OP.Clear, 'Clear', () => this.onClear()),
  ];

  readonly rowKeyExtractor = (row: IBenchmarkRow): string => String(row.id);

  readonly rowItemLayout = (
    _data: unknown,
    index: number,
  ): { length: number; offset: number; index: number } => ({
    length: BENCH_ROW_HEIGHT,
    offset: BENCH_ROW_HEIGHT * index,
    index,
  });

  // Stopped by the ENGINE's post-commit hook, not by an Angular lifecycle hook, and that choice is
  // what makes this screen comparable across adapters at all. Angular commits on a microtask, so
  // afterNextRender / a change-detection hook fires at a DIFFERENT point relative to the native
  // commit than React's useLayoutEffect does. Four different hooks would silently measure four
  // different quantities and the comparison would be void. registerPostCommit means one definition
  // of "done" everywhere: completeRoot has returned. Native layout and paint happen after that and
  // are not in the number; the frame counter above is what shows those.
  private readonly onCommitted = (): void => {
    const pending = this.pending;
    if (pending === null) return;
    this.pending = null;
    const durationMs = performance.now() - pending.startedAt;
    // Safe to read here: commitContainer increments walkMs and commits BEFORE completeRoot, and
    // runPostCommitHooks() fires after it, so the profile for this commit is already complete.
    const profile = readCommitProfile();
    this.lastStepProfile = {
      nodesVisited: profile.nodesVisited,
      propWrites: profile.propWrites,
      propNoops: profile.propNoops,
      commits: profile.commits,
      walkMs: profile.walkMs,
    };
    this.lastFabricProfile = readFabricCallProfile();
    pending.settle(durationMs);
  };

  ngOnInit(): void {
    registerPostCommit(this.onCommitted);
  }

  ngOnDestroy(): void {
    unregisterPostCommit(this.onCommitted);
  }

  resultFor(op: IBenchOpId): string {
    return formatDuration(this.lastDurations().get(op));
  }

  historyLine(entry: IBenchResult): string {
    return `${entry.label} — ${formatDuration(entry.durationMs)} · ${entry.rowCount} rows`;
  }

  suiteHostProps(op: IBenchOpId): IHostProps {
    return SUITE_ROW_HOST_PROPS[op];
  }

  probeHostProps(op: IBenchOpId): IHostProps {
    return PROBE_ROW_HOST_PROPS[op];
  }

  engineHostProps(op: IBenchOpId): IHostProps {
    return ENGINE_ROW_HOST_PROPS[op];
  }

  fabricHostProps(op: IBenchOpId): IHostProps {
    return FABRIC_ROW_HOST_PROPS[op];
  }

  // Three cells rather than one formatter, so an operation the suite has not run yet reads as a
  // dash in every column instead of a row of zeroes that looks like a measurement.
  engineVisited(op: IBenchOpId): string {
    const profile = this.profiles().get(op);
    return profile === undefined ? '—' : String(profile.nodesVisited);
  }

  engineWrites(op: IBenchOpId): string {
    const profile = this.profiles().get(op);
    return profile === undefined
      ? '—'
      : `${profile.propWrites}/${profile.propNoops}`;
  }

  engineCommits(op: IBenchOpId): string {
    const profile = this.profiles().get(op);
    return profile === undefined
      ? '—'
      : `${profile.commits} · ${profile.walkMs.toFixed(1)}ms`;
  }

  fabricCalls(op: IBenchOpId): string {
    return formatFabric(this.fabricProfiles().get(op));
  }

  fabricPropKeys(op: IBenchOpId): string {
    const fabric = this.fabricProfiles().get(op);
    return fabric === undefined ? '—' : String(fabric.totalPropKeys);
  }

  // The engine reads `__SYMBIOTE_BATCH_CREATE__` once per commit, not per node, so it has to be
  // set BEFORE the mutation that starts a step — which a press between runs always is. Deliberately
  // a global rather than an input: nothing on the commit path should have to be threaded a flag.
  onToggleBatchCreate(): void {
    const next = !this.isBatchingCreate();
    Reflect.set(globalThis, '__SYMBIOTE_BATCH_CREATE__', next);
    this.isBatchingCreate.set(next);
  }

  // The two mode columns follow the row shape currently selected, so the table always prices what
  // the buttons above it would run right now; the probe table below them holds both shapes.
  allMountedResult(op: IBenchOpId): string {
    return this.durationOf(this.rowShape(), MOUNT_MODE.All, op);
  }

  virtualizedResult(op: IBenchOpId): string {
    return this.durationOf(this.rowShape(), MOUNT_MODE.Virtualized, op);
  }

  composedShapeResult(op: IBenchOpId): string {
    return this.durationOf(ROW_SHAPE.Composed, MOUNT_MODE.All, op);
  }

  flatShapeResult(op: IBenchOpId): string {
    return this.durationOf(ROW_SHAPE.Flat, MOUNT_MODE.All, op);
  }

  rowClassFor(row: IBenchmarkRow): string {
    return row.id === this.selectedId() ? ROW_CLASS_SELECTED : ROW_CLASS;
  }

  // Ignored mid-suite for the same reason a hand-pressed operation is: the shape swap commits a
  // whole new row list, and that commit would stop the running step's stopwatch and file its own
  // teardown cost under whichever operation was in flight.
  onPickRowShape(shape: IRowShape): void {
    if (this.progress() !== undefined) return;
    this.rowShape.set(shape);
  }

  onRunSuite(mode: IMountMode): void {
    if (this.progress() !== undefined) return;
    this.runSuite(mode).catch(() => {
      // A rejected step would otherwise leave the progress block up with no way back; whatever
      // entries were collected are dropped, because a partial suite is not a ruler.
      this.progress.set(undefined);
    });
  }

  rowOf(item: unknown): IBenchmarkRow {
    return isBenchmarkRow(item) ? item : PLACEHOLDER_ROW;
  }

  // The guards below keep an operation from recording a measurement of nothing - an empty list,
  // or an index krausest's fixed row numbers put past the end of a short one.
  onSelect(id: number): void {
    const rows = this.rows();
    this.measure(BENCH_OP.Select, 'Select row', rows.length, () => {
      this.list.update(current => ({
        ...current,
        selectedId: current.selectedId === id ? undefined : id,
      }));
    });
  }

  onRemove(id: number): void {
    const rows = this.rows();
    this.measure(BENCH_OP.Remove, 'Remove row', rows.length - 1, () => {
      this.list.update(current => ({
        ...current,
        rows: current.rows.filter(row => row.id !== id),
      }));
    });
  }

  // THE timing primitive - every number on this screen, button or suite, comes through here. The
  // clock starts here (a signal write only schedules change detection, so a performance.now() pair
  // wrapped around the mutation would time the scheduling call and nothing else) and stops in the
  // post-commit hook above, which resolves this promise. Awaiting it is what lets the suite drive
  // one operation at a time from a known state instead of racing its own steps.
  private runStep(mutate: () => void): Promise<number> {
    return new Promise<number>(resolve => {
      let isSettled = false;
      const settle = (durationMs: number): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timer);
        // Release before resolving, so the meter is live again the moment the step is over even if
        // a caller does more work synchronously off this promise. The timeout path below settles
        // through here too, so a step that never commits still hands the meter back.
        commitProfileGate.isHeldByBenchmark = false;
        resolve(durationMs);
      };
      const timer = setTimeout(() => {
        // Drop the pending record too: leaving it would make the NEXT step's commit stop this
        // step's stopwatch and report a duration against the wrong operation.
        this.pending = null;
        this.lastStepProfile = EMPTY_STEP_PROFILE;
        this.lastFabricProfile = EMPTY_FABRIC_PROFILE;
        settle(SUITE_TIMED_OUT);
      }, SUITE_STEP_TIMEOUT_MS);

      // Stop the meter and zero both sets of counters LAST, immediately before the mutation, so
      // nothing between here and the commit lands in the step's profile. No install retry for the
      // Fabric counter: its wrapper has to be in place while the engine binds the slot, which
      // index.js already did and nothing can redo — an all-zero FABRIC CALLS table means that
      // install did not land.
      commitProfileGate.isHeldByBenchmark = true;
      readCommitProfile();
      readFabricCallProfile();
      this.pending = { startedAt: performance.now(), settle };
      mutate();
    });
  }

  // `rowCount` is passed in rather than read back from state afterwards: this closes over the list
  // as it was when the button was pressed, and reading it later would report the post-mutation one.
  private measure(
    op: IBenchOpId,
    label: string,
    rowCount: number,
    mutate: () => void,
  ): void {
    // A press that landed mid-suite would install its own pending record over the suite's, and the
    // next commit would stop the wrong stopwatch - silently attributing one operation's cost to
    // another. The read is live (this runs from a template event listener, outside any reactive
    // consumer), so the signal that drives the progress block is the single holder of the fact.
    if (this.progress() !== undefined) return;
    this.runStep(mutate).then(durationMs => {
      this.seq += 1;
      const result: IBenchResult = {
        seq: this.seq,
        op,
        label,
        durationMs,
        rowCount,
      };
      this.history.update(previous =>
        [result, ...previous].slice(0, HISTORY_LIMIT),
      );
    });
  }

  /**
   * The whole ruler in one press, in a FIXED order, each timed operation starting from exactly
   * SUITE_ROWS rows.
   *
   * Pressing the buttons by hand does not measure what it looks like it measures. `Remove` and
   * `Append` cost scale with the rows currently on screen (a flat parent re-appends every child
   * handle on any structural change), so their numbers depend on which buttons were pressed
   * before them. Measured 2026-08-18, React Debug, same build twice: Remove 87-107 ms against
   * 418.6 ms, Append 953 against 1678 ms, while Create / Replace / Partial / Select / Swap
   * reproduced inside 1-3%. Two runs of the SAME adapter disagreed 4x - so a cross-ADAPTER
   * comparison off those rows was measuring press order, not the adapter.
   *
   * Hence: untimed setup steps in between, awaited through the same engine post-commit seam as
   * the timed ones, so each measurement begins from a state this function chose rather than one
   * the operator happened to leave behind.
   *
   * Runs in EITHER mount mode - the pressed button picks it. No 10,000-row step in either: 10,000
   * rows is 90,000 native views, which the host does not survive in all-mounted (see
   * NATIVE_VIEWS_PER_ROW), and a suite that hangs the screen measures nothing.
   */
  private async runSuite(mode: IMountMode): Promise<void> {
    resetRowData();

    // Read once, up front: the shape cannot change mid-run (onPickRowShape refuses while a suite
    // is up), and this is the cell the results land in.
    const shape = this.rowShape();
    const entries: ISuiteEntry[] = [];
    const clearRows = (): void => {
      this.list.set({ rows: [], selectedId: undefined });
    };
    const fillRows = (): void => {
      this.list.set({ rows: buildRows(SUITE_ROWS), selectedId: undefined });
    };

    // The suite's own UI is committed and PAINTED before any measured step starts. Angular
    // schedules change detection and the engine coalesces commits onto a microtask, so setting a
    // running flag and then immediately mutating the list puts the spinner and the first
    // (heaviest) step in one commit: the operator presses the button and gets several hundred
    // milliseconds of frozen screen with the button still reading "Run". Awaiting a commit that
    // carries only the progress block splits the two.
    const showProgress = (label: string): Promise<number> =>
      this.runStep(() => {
        this.progress.set({ mode, label, done: entries.length });
      });

    const timed = async (
      op: IBenchOpId,
      startRows: number,
      mutate: () => void,
    ): Promise<void> => {
      const label = suiteLabel(op);
      await showProgress(label);
      const durationMs = await this.runStep(mutate);
      // Read AFTER the measured step, never after showProgress: the field holds whichever step
      // committed last, and the progress step commits first by construction.
      entries.push({
        op,
        label,
        durationMs,
        startRows,
        profile: this.lastStepProfile,
        fabric: this.lastFabricProfile,
      });
    };

    // One commit for the whole prologue: the mode this run measures, an emptied list, and the
    // progress block appearing. It always changes the tree (the block goes from absent to present)
    // - which matters, because `commitContainer` returns early on a commit that produced no native
    // change (`if (!result.changed) return` sits ABOVE `runPostCommitHooks()` in
    // core/engine/src/commit.ts), so a no-op mutation never resolves its step and would stall the
    // suite until the timeout. Every step after this one changes the tree by construction.
    await this.runStep(() => {
      this.mountMode.set(mode);
      this.suiteResults.update(current => ({
        ...current,
        [shape]: { ...current[shape], [mode]: [] },
      }));
      this.history.set([]);
      this.progress.set({ mode, label: 'Preparing', done: 0 });
      clearRows();
    });

    await timed(BENCH_OP.Create, 0, fillRows);
    await timed(BENCH_OP.Replace, SUITE_ROWS, fillRows);
    await timed(BENCH_OP.Update, SUITE_ROWS, () => {
      this.list.update(current => ({
        ...current,
        rows: current.rows.map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: row.label + UPDATE_SUFFIX }
            : row,
        ),
      }));
    });
    await timed(BENCH_OP.Select, SUITE_ROWS, () => {
      this.list.update(current => ({
        ...current,
        selectedId: current.rows[SELECT_INDEX].id,
      }));
    });
    await timed(BENCH_OP.Swap, SUITE_ROWS, () => {
      this.list.update(current => {
        const next = current.rows.slice();
        const low = next[SWAP_LOW_INDEX];
        next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
        next[SWAP_HIGH_INDEX] = low;
        return { ...current, rows: next };
      });
    });
    await timed(BENCH_OP.Remove, SUITE_ROWS, () => {
      this.list.update(current => ({
        ...current,
        rows: current.rows.filter((_row, index) => index !== REMOVE_INDEX),
      }));
    });

    await this.runStep(clearRows);
    await this.runStep(fillRows);
    await timed(BENCH_OP.Append, SUITE_ROWS, () => {
      this.list.update(current => ({
        ...current,
        rows: current.rows.concat(buildRows(SUITE_ROWS)),
      }));
    });

    await this.runStep(clearRows);
    await this.runStep(fillRows);
    await timed(BENCH_OP.Clear, SUITE_ROWS, clearRows);

    this.suiteResults.update(current => ({
      ...current,
      [shape]: { ...current[shape], [mode]: entries },
    }));
    this.progress.set(undefined);
  }

  private durationOf(
    shape: IRowShape,
    mode: IMountMode,
    op: IBenchOpId,
  ): string {
    return formatDuration(this.durations().get(`${shape}:${mode}:${op}`));
  }

  private operation(
    id: IBenchOpId,
    label: string,
    run: () => void,
  ): IBenchOperation {
    return {
      id,
      label,
      testID: `bench-op-${id}`,
      resultHostProps: { testID: `bench-result-${id}` },
      run,
    };
  }

  private onCreate(): void {
    this.measure(BENCH_OP.Create, 'Create 1,000 rows', ROW_BATCH, () => {
      this.list.set({ rows: buildRows(ROW_BATCH), selectedId: undefined });
    });
  }

  // Same call as Create - krausest scores them apart because the starting state differs: this one
  // swaps a full keyed list for another, the other one mounts into an empty container.
  private onReplace(): void {
    this.measure(BENCH_OP.Replace, 'Replace all 1,000 rows', ROW_BATCH, () => {
      this.list.set({ rows: buildRows(ROW_BATCH), selectedId: undefined });
    });
  }

  private onCreateLots(): void {
    this.measure(
      BENCH_OP.CreateLots,
      'Create 10,000 rows',
      ROW_BATCH_LARGE,
      () => {
        this.list.set({
          rows: buildRows(ROW_BATCH_LARGE),
          selectedId: undefined,
        });
      },
    );
  }

  private onAppend(): void {
    this.measure(
      BENCH_OP.Append,
      'Append 1,000 rows',
      this.rows().length + ROW_BATCH,
      () => {
        this.list.update(current => ({
          ...current,
          rows: current.rows.concat(buildRows(ROW_BATCH)),
        }));
      },
    );
  }

  private onUpdate(): void {
    if (this.rows().length === 0) return;
    this.measure(
      BENCH_OP.Update,
      'Partial update (every 10th)',
      this.rows().length,
      () => {
        this.list.update(current => ({
          ...current,
          rows: current.rows.map((row, index) =>
            index % UPDATE_STRIDE === 0
              ? { ...row, label: row.label + UPDATE_SUFFIX }
              : row,
          ),
        }));
      },
    );
  }

  private onSelectSample(): void {
    const rows = this.rows();
    if (rows.length <= SELECT_INDEX) return;
    this.onSelect(rows[SELECT_INDEX].id);
  }

  private onRemoveSample(): void {
    const rows = this.rows();
    if (rows.length <= REMOVE_INDEX) return;
    this.onRemove(rows[REMOVE_INDEX].id);
  }

  private onSwap(): void {
    if (this.rows().length <= SWAP_HIGH_INDEX) return;
    this.measure(BENCH_OP.Swap, 'Swap 2 rows', this.rows().length, () => {
      this.list.update(current => {
        const next = current.rows.slice();
        const low = next[SWAP_LOW_INDEX];
        next[SWAP_LOW_INDEX] = next[SWAP_HIGH_INDEX];
        next[SWAP_HIGH_INDEX] = low;
        return { ...current, rows: next };
      });
    });
  }

  // Clear wipes the recorded measurements too, not just the rows. A duration stays pinned next to
  // its button until that operation runs again, so a number measured under one set of conditions
  // reads as current under another - a Create 10,000 timed in virtualized mode sat next to the
  // button in all-mounted mode and looked like an all-mounted result. Resetting the run alongside
  // the list keeps a stale figure from ever being read as a fresh one. Clear's OWN measurement
  // still lands (the post-commit hook runs after this commit and appends to the emptied history),
  // so the button that was just pressed does not read as "did nothing".
  private onClear(): void {
    if (this.rows().length === 0) return;
    this.measure(BENCH_OP.Clear, 'Clear', 0, () => {
      this.list.set({ rows: [], selectedId: undefined });
      this.history.set([]);
    });
  }
}
