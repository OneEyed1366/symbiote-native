// js-framework-benchmark, one primitive at a time.
//
// `bench-suite.ts` prices ONE row shape (view/text/text-input) and says nothing about the other
// sixteen tags an app writes. This suite runs the same kind of steps over a flat list of a single
// primitive, for every app-facing intrinsic, so a regression or a framework tax that lives on one tag
// — a behavior's attach cost, a directive still matching on it, a wrapper node it commits — shows up
// under that tag's name instead of being averaged into a row.
//
// THE SPECS ARE THE WORKLOAD and the arms only render them: every prop, child and wrapper is data
// here, so two arms cannot quietly build different trees. The census is the first oracle, as
// everywhere in this directory: `nodesPerItem` is PINNED per tag and asserted on every step.
//
// Steps per tag: create N, update every 10th (a new style object), swap two, remove one, clear.

import {
  committedShape,
  committedTags,
  expect,
  heapInfo,
  print,
  startProfiling,
  stopProfiling,
} from './harness';

// Set by the runner from `SYMBIOTE_PROFILE_DIR`: non-empty samples each tag's CREATE into
// `<dir>/<arm>-<tag>-create.json`. Never read a PRIM line from such a run.
declare const __SYMBIOTE_PROFILE_DIR__: string;
const PROFILE_HZ = 10_000;

export const PRIMITIVE_COUNT = 1_000;
const UPDATE_STRIDE = 10;
const SWAP_LOW = 1;
const REMOVE_AT = 1;

export const ITEM_STYLE = { width: 40, height: 20 } as const;
export const UPDATED_STYLE = { width: 40, height: 20, opacity: 0.5 } as const;
export const CHILD_STYLE = { width: 10, height: 10 } as const;

/** What an arm renders inside the tag. `label` is the item's text; `view` a styled child view. */
export type IPrimitiveChild = 'none' | 'label' | 'view';

export type IPrimitiveSpec = {
  readonly tag: string;
  /** Bound on every item; `style` is added by the suite and is what `update` rewrites. */
  readonly props: Readonly<Record<string, unknown>>;
  readonly child: IPrimitiveChild;
  /** A tag the item must sit inside (`refresh-control` is only meaningful under a scroll view). */
  readonly parent?: string;
  /** Committed nodes per item, pinned. Undefined prints the census and fails. */
  readonly nodesPerItem: number | undefined;
  /** Items per step when a thousand is not a real workload (a hidden modal each). */
  readonly count?: number;
};

const SOURCE = { uri: 'https://example.invalid/a.png', width: 20, height: 20 };

// `nodesPerItem` is what RN's own components commit for the same props: Text is Paragraph+RawText,
// ImageBackground a View around an Image, a touchable with a child is its View plus the child (the
// anchor-backed two commit only the child), Button is TouchableOpacity>View>Text, ActivityIndicator
// a View around the spinner, a ScrollView its content View too.
export const PRIMITIVE_SPECS: readonly IPrimitiveSpec[] = [
  { tag: 'view', props: {}, child: 'none', nodesPerItem: 1 },
  { tag: 'text', props: { numberOfLines: 1 }, child: 'label', nodesPerItem: 2 },
  { tag: 'image', props: { source: SOURCE }, child: 'none', nodesPerItem: 1 },
  {
    tag: 'image-background',
    props: { source: SOURCE },
    child: 'none',
    nodesPerItem: 2,
  },
  { tag: 'pressable', props: {}, child: 'none', nodesPerItem: 1 },
  {
    tag: 'touchable-opacity',
    props: { activeOpacity: 0.5 },
    child: 'view',
    nodesPerItem: 2,
  },
  {
    tag: 'touchable-highlight',
    props: { underlayColor: 'red' },
    child: 'view',
    nodesPerItem: 2,
  },
  {
    tag: 'touchable-native-feedback',
    props: {},
    child: 'view',
    nodesPerItem: 1,
  },
  {
    tag: 'touchable-without-feedback',
    props: {},
    child: 'view',
    nodesPerItem: 1,
  },
  { tag: 'button', props: { title: 'Go' }, child: 'none', nodesPerItem: 4 },
  {
    tag: 'text-input',
    props: { value: 'abc' },
    child: 'none',
    nodesPerItem: 1,
  },
  {
    tag: 'text-input-multiline',
    props: { value: 'abc' },
    child: 'none',
    nodesPerItem: 1,
  },
  { tag: 'switch', props: { value: true }, child: 'none', nodesPerItem: 1 },
  {
    tag: 'activity-indicator',
    props: { animating: true },
    child: 'none',
    nodesPerItem: 2,
  },
  { tag: 'scroll-view', props: {}, child: 'none', nodesPerItem: 2 },
  { tag: 'horizontal-scroll-view', props: {}, child: 'none', nodesPerItem: 2 },
  { tag: 'safe-area-view', props: {}, child: 'none', nodesPerItem: 1 },
  // [characterization — behavior not confirmed] QUESTION: RN's Modal.js returns null while not
  // visible (`Modal.js:280-288`), so stock commits ZERO nodes here; we commit a ModalHostView each.
  {
    tag: 'modal',
    props: { visible: false },
    child: 'none',
    nodesPerItem: 1,
    count: 100,
  },
  {
    tag: 'refresh-control',
    props: { refreshing: false },
    child: 'none',
    parent: 'scroll-view',
    nodesPerItem: 3,
  },
];

export type IPrimitiveItem = {
  readonly id: number;
  readonly label: string;
  readonly props: Readonly<Record<string, unknown>>;
};

export type IPrimitiveState = { readonly items: readonly IPrimitiveItem[] };

export type IPrimitiveDriver = {
  readonly name: string;
  /** Committed nodes that are not items: root, surface container, the screen's own wrapper. */
  readonly chrome: number;
  /** Render `spec` with `state` and settle it (framework flush + commit). */
  apply(spec: IPrimitiveSpec, state: IPrimitiveState): void | Promise<void>;
};

const STEPS = ['create', 'update', 'swap', 'remove', 'clear'] as const;
type IStep = (typeof STEPS)[number];

let nextId = 1;

function buildItems(spec: IPrimitiveSpec, count: number): IPrimitiveItem[] {
  const items: IPrimitiveItem[] = [];
  for (let at = 0; at < count; at += 1) {
    const id = nextId;
    nextId += 1;
    items.push({
      id,
      label: `item ${id}`,
      props: { ...spec.props, style: ITEM_STYLE },
    });
  }
  return items;
}

function allocatedBytes(): number | undefined {
  return heapInfo().hermes_totalAllocatedBytes;
}

function censusOf(): string {
  const counts = new Map<string, number>();
  for (const match of committedShape().matchAll(/([A-Za-z_][A-Za-z0-9_]*)\(/g))
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
}

/**
 * Run the five steps for every spec and print one `PRIM` line per tag.
 *
 * `PRIM <arm> <tag> create=.. update=.. swap=.. remove=.. clear=.. createKB=..` is the grep target;
 * sampling is off, so the wall clocks are readings (still single runs: take the minimum across runs).
 */
export async function runPrimitiveSuite(
  driver: IPrimitiveDriver,
  specs: readonly IPrimitiveSpec[] = PRIMITIVE_SPECS,
): Promise<void> {
  const unpinned: string[] = [];
  for (const spec of specs) {
    const count = spec.count ?? PRIMITIVE_COUNT;
    const timings = new Map<IStep, number>();
    let createBytes: number | undefined;
    let state: IPrimitiveState = { items: [] };
    await driver.apply(spec, state);

    const step = async (name: IStep, next: IPrimitiveState): Promise<void> => {
      state = next;
      const isProfiling =
        name === 'create' &&
        __SYMBIOTE_PROFILE_DIR__ !== '' &&
        startProfiling(PROFILE_HZ);
      const bytesBefore = allocatedBytes();
      const startedAt = performance.now();
      await driver.apply(spec, state);
      timings.set(name, performance.now() - startedAt);
      const bytesAfter = allocatedBytes();
      if (isProfiling)
        stopProfiling(
          `${__SYMBIOTE_PROFILE_DIR__}/${driver.name}-${spec.tag}-create.json`,
        );
      if (
        name === 'create' &&
        bytesBefore !== undefined &&
        bytesAfter !== undefined
      )
        createBytes = bytesAfter - bytesBefore;

      const nodes = committedTags().length - driver.chrome;
      if (spec.nodesPerItem === undefined) {
        if (name === 'create')
          print(
            `DEBUG ${driver.name} ${spec.tag} UNPINNED nodes=${nodes} per item=` +
              `${(nodes / Math.max(1, state.items.length)).toFixed(2)} :: ${censusOf()}`,
          );
        return;
      }
      if (nodes !== spec.nodesPerItem * state.items.length)
        print(
          `DEBUG ${driver.name} ${spec.tag} ${name} CENSUS :: ${censusOf()}`,
        );
      expect(nodes).toBe(spec.nodesPerItem * state.items.length);
    };

    await step('create', { items: buildItems(spec, count) });
    await step('update', {
      items: state.items.map((item, index) =>
        index % UPDATE_STRIDE === 0
          ? { ...item, props: { ...item.props, style: UPDATED_STYLE } }
          : item,
      ),
    });
    await step('swap', {
      items: (() => {
        const next = state.items.slice();
        const high = next.length - 1 - SWAP_LOW;
        const low = next[SWAP_LOW];
        next[SWAP_LOW] = next[high];
        next[high] = low;
        return next;
      })(),
    });
    await step('remove', {
      items: state.items.filter((_, index) => index !== REMOVE_AT),
    });
    await step('clear', { items: [] });

    print(
      `PRIM ${driver.name} ${spec.tag.padEnd(26)} ` +
        STEPS.map(
          name => `${name}=${(timings.get(name) ?? 0).toFixed(1)}`,
        ).join(' ') +
        (createBytes === undefined
          ? ''
          : ` createKB=${(createBytes / 1_024).toFixed(0)}`),
    );
    if (spec.nodesPerItem === undefined) unpinned.push(spec.tag);
  }
  // Pinning is a gate, not a note: an unpinned tag fails the file after printing its census.
  expect(unpinned).toEqual([]);
}
