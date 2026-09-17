// What does the SAME tree cost through a zero-cost driver, and what does it cost through ours?
//
// why: the device run of 2026-09-17 says every create-shaped row got more expensive after the
// buffer architecture — Create/Replace/Append/Clear up 10-37% on four adapters of five — while
// every row that touches a handful of nodes got cheaper. The suspicion that follows is "we drive
// Fabric worse than React does", and it cannot be answered by comparing two adapters: both are ours
// and both would move together.
//
// So this file prices the FLOOR instead. `symbiote-host.h` calls
// `UIManagerBinding::createAndInstallIfNeeded`, which publishes the same `global.nativeFabricUIManager`
// a device has — the full persistent-mode surface, verified by `fabric-binding-probe.itest.ts`
// (15 of 16 names present; only `cloneNode` is absent). So the identical tree can be built twice in
// ONE process, against ONE C++ Fabric:
//
//   RAW      `createNode` / `appendChild` / `createChildSet` / `appendChildToSet` / `completeRoot`,
//            with the prop payloads written out as object literals. No retained tree, no diff, no
//            prop routing, no buffer. This is BELOW React, not equal to it: React's own host config
//            still runs a fiber tree and builds each payload through `ReactNativeAttributePayload`.
//            It is the floor the platform itself charges.
//   ENGINE   our mutation API -> op buffer -> one `applyOps` across JSI -> `materialize` -> commit.
//
// ── RUN THIS ON `build-release`, AND THE REASON IS NOT THE ONE THIS FILE FIRST GAVE ──────────────
//
//   pnpm run bench:itest                        # or SYMBIOTE_ITEST_BUILD=build-release
//
// The caveat everyone here already knew is that `core/engine/cpp/tests/build` is Debug with no `-O`,
// so its milliseconds do not transfer. The caveat that cost a day is that its SHAPE does not either.
// `NDEBUG` is off in that build on purpose — `react_native_assert` is what the harness is for — and
// `NDEBUG` off also defines `REACT_NATIVE_DEBUG` (`ReactCommon/react/debug/flags.h`), which compiles
// in consistency checks that walk a whole child list on every mutation:
// `YogaLayoutableShadowNode::appendChild` runs `ensureConsistency` and then
// `ensureYogaChildrenLookFine` + `ensureYogaChildrenAlignment`, so building an N-child list one
// append at a time is O(N²) there and O(N) in the build that ships.
//
// Measured 2026-09-17, the same file on the two builds:
//
//                        build (asserts)   build-release      what it looked like
//   RAW total                  ~307              ~92
//   ENGINE total               ~325              ~98
//   ratio engine/raw           1.06x         0.96-1.14x       unchanged, by luck
//   walkMs (materialize)        200              ~27           "materialize is 61% of a create"
//     createNode                128.7            18.5
//     appendChild                44.2             1.0          "a fifth of the walk" -> 4%
//   10 000 appends, 1 parent   3554 ms           27 ms         132x, entirely asserts
//
// So the assert build reported `materialize` at 61% of a create and it is ~27%, and it reported an
// O(N²) in list width that does not exist off this harness. Both readings were published before the
// second build existed. A number whose ORDER is right and whose SHAPE is wrong is worse than no
// number, because it survives review.
//
// A ratio between the two arms is still the only claimable output even on `build-release` — JSC is
// not Hermes and a Mac is not a phone. Same binary, same process, same Fabric, back to back.
//
// The two arms must build the SAME tree or the comparison is theatre, so each asserts its own node
// census against the other's before any number is printed. That check is what makes this a
// measurement rather than two unrelated timings.

import {
  appendChild,
  createElement,
  createRawText,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';

import {
  committedTags,
  committedTree,
  describe,
  expect,
  it,
  mounted,
  print,
  report,
  type ICommittedNode,
} from './harness';

const ROOT_TAG = 1;
const ROWS = 1_000;
const NODES_PER_ROW = 10;

// Hoisted exactly as a payload reaches Fabric: React Native flattens `style` into the top-level
// props object before it crosses JSI (`ReactNativeAttributePayload.addNestedProperty`), and so does
// our own `fabricProps`. Writing them nested here would make the native parse cheaper on one arm.
const ROW_PROPS = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_PROPS = { flex: 1 };
const INPUT_PROPS = { width: 96, height: 28 };
const TEXT_PROPS = { ellipsizeMode: 'tail', allowFontScaling: true };

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

type IFabricNode = object;
type IFabricChildSet = object;

type IFabricBinding = {
  createNode: (
    tag: number,
    viewName: string,
    rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: object,
  ) => IFabricNode;
  appendChild: (parent: IFabricNode, child: IFabricNode) => IFabricNode;
  createChildSet: (rootTag: number) => IFabricChildSet;
  appendChildToSet: (childSet: IFabricChildSet, child: IFabricNode) => void;
  completeRoot: (rootTag: number, childSet: IFabricChildSet) => void;
};

function fabric(): IFabricBinding {
  const binding = (globalThis as Record<string, unknown>).nativeFabricUIManager;
  if (binding === null || typeof binding !== 'object') {
    throw new Error('no nativeFabricUIManager in this host');
  }
  // A narrowing, not a cast: every name the arm calls was proven to be a function by the probe, and
  // `fabric-binding-probe.itest.ts` fails first if that ever stops being true.
  const bag: Record<string, unknown> = binding as Record<string, unknown>;
  for (const name of [
    'createNode',
    'appendChild',
    'createChildSet',
    'appendChildToSet',
    'completeRoot',
  ]) {
    if (typeof bag[name] !== 'function') {
      throw new Error(`nativeFabricUIManager.${name} is not a function`);
    }
  }
  return binding as IFabricBinding;
}

/**
 * Tags well past anything the engine hands out in this process.
 *
 * Fabric aborts on a duplicate tag inside one surface (`ShadowNodeFamily`), so an overlap would show
 * up as a hard crash rather than a wrong number — but the arms are meant to be independent, and a
 * shared counter would couple them.
 */
let nextRawTag = 10_000_001;
function rawTag(): number {
  nextRawTag += 2;
  return nextRawTag;
}

function since(startedAt: number): number {
  return performance.now() - startedAt;
}

/**
 * How many of each view name the committed tree holds, as `RCTView=4002 RCTText=3000 …`.
 *
 * A total node count alone cannot say WHICH node an arm has that the other does not, and this repo
 * has already paid for that distinction twice — two trees agreed on every structural counter while
 * 19% of the prop keys were missing, and a 1.31x ratio turned out to be one missing element.
 */
function census(from: ICommittedNode | undefined): string {
  const counts = new Map<string, number>();
  const walk = (node: ICommittedNode): void => {
    counts.set(node.viewName, (counts.get(node.viewName) ?? 0) + 1);
    for (const child of node.children) walk(child);
  };
  if (from !== undefined) walk(from);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
}

// ── the RAW arm ──────────────────────────────────────────────────────────────────────────────────

/** `<view>` + three text/rawtext pairs + two cell views + one text input = 10 nodes, as the row. */
function rawRow(binding: IFabricBinding, id: number): IFabricNode {
  const node = (
    viewName: string,
    props: Record<string, unknown>,
  ): IFabricNode => binding.createNode(rawTag(), viewName, ROOT_TAG, props, {});

  const label = (text: string): IFabricNode => {
    const outer = node('RCTText', TEXT_PROPS);
    binding.appendChild(outer, node('RCTRawText', { text }));
    return outer;
  };

  const row = node('RCTView', { ...ROW_PROPS, testID: `row-${id}` });
  binding.appendChild(row, label(String(id)));
  for (const text of [`row ${id}`, 'x']) {
    const cell = node('RCTView', CELL_PROPS);
    binding.appendChild(cell, label(text));
    binding.appendChild(row, cell);
  }
  binding.appendChild(
    row,
    node('RCTSinglelineTextInputView', {
      ...INPUT_PROPS,
      text: `input ${id}`,
    }),
  );
  return row;
}

// ── the ENGINE arm ───────────────────────────────────────────────────────────────────────────────

function engineRow(id: number): ISymbioteNode {
  const row = createElement('RCTView');
  routeProp(row, 'style', ROW_STYLE);
  routeProp(row, 'testID', `row-${id}`);

  const label = (text: string): ISymbioteNode => {
    const outer = createElement('RCTText');
    routeProp(outer, 'ellipsizeMode', 'tail');
    routeProp(outer, 'allowFontScaling', true);
    appendChild(outer, createRawText(text));
    return outer;
  };

  appendChild(row, label(String(id)));
  for (const text of [`row ${id}`, 'x']) {
    const cell = createElement('RCTView');
    routeProp(cell, 'style', CELL_STYLE);
    appendChild(cell, label(text));
    appendChild(row, cell);
  }

  const input = createElement('RCTSinglelineTextInputView');
  routeProp(input, 'style', INPUT_STYLE);
  routeProp(input, 'text', `input ${id}`);
  appendChild(row, input);
  return row;
}

type IArm = {
  total: number;
  nodes: number;
  commitMs: number;
  layoutMs: number;
  census: string;
};

// Module scope, because the arms run as separate cases ON PURPOSE: the harness resets the surface
// and the registry between cases, and that reset is what keeps one arm's committed root from being
// the base revision the next arm commits against. Two drivers writing the same surface back to back
// would price the second one against a tree the first left behind.
let raw: IArm | undefined;
let engine: IArm | undefined;

describe('one tree, two drivers, one Fabric', () => {
  // why: the floor. Everything this arm spends is what the platform charges to hold 10 001 nodes —
  // no retained tree, no diff, no prop routing, no op buffer, and below React's own renderer, which
  // still runs a fiber tree and builds every payload through `ReactNativeAttributePayload`.
  it('builds the 10 001-node tree through the bare JSI binding', () => {
    const binding = fabric();
    // Opening the surface is not part of either measurement, and the engine is what knows how.
    createSurface(ROOT_TAG);

    let startedAt = performance.now();
    const childSet = binding.createChildSet(ROOT_TAG);
    // TWO views above the rows, not one: `createSurface` puts its own container `<View>` under the
    // `RootView`, so an arm that appends straight to the child set builds a tree one node shallower
    // than the engine's and the census below refuses it. Matching it here is cheaper than special-
    // casing the oracle, and a weaker oracle is how a node count gets read as a ratio.
    const container = binding.createNode(rawTag(), 'RCTView', ROOT_TAG, {}, {});
    const list = binding.createNode(
      rawTag(),
      'RCTView',
      ROOT_TAG,
      { flex: 1 },
      {},
    );
    for (let id = 0; id < ROWS; id += 1) {
      binding.appendChild(list, rawRow(binding, id));
    }
    binding.appendChild(container, list);
    binding.appendChildToSet(childSet, container);
    const build = since(startedAt);

    startedAt = performance.now();
    binding.completeRoot(ROOT_TAG, childSet);
    const commit = since(startedAt);
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    raw = {
      total: build + commit,
      nodes: committedTags().length,
      commitMs: telemetry?.commitMs ?? -1,
      layoutMs: telemetry?.layoutMs ?? -1,
      census: census(committedTree()),
    };
    print(
      `DEBUG RAW    build=${build.toFixed(1)} completeRoot=${commit.toFixed(1)} ` +
        `total=${raw.total.toFixed(1)} commitMs=${raw.commitMs.toFixed(1)} ` +
        `layoutMs=${raw.layoutMs.toFixed(1)} nodes=${raw.nodes}`,
    );
    print(`DEBUG RAW    census ${raw.census}`);
    expect(raw.nodes > 0).toBe(true);
  });

  // why: the same tree through the shipped path, split where the architecture splits — JS fill, one
  // `applyOps` across JSI, then `materialize` + commit + layout.
  it('builds the same tree through the engine', () => {
    const surface = createSurface(ROOT_TAG);

    let startedAt = performance.now();
    const list = createElement('RCTView');
    routeProp(list, 'style', { flex: 1 });
    for (let id = 0; id < ROWS; id += 1) {
      appendChild(list, engineRow(id));
    }
    surface.appendChild(list);
    const fill = since(startedAt);

    startedAt = performance.now();
    flushOps();
    const apply = since(startedAt);

    startedAt = performance.now();
    surface.commit();
    const commit = since(startedAt);
    mounted();

    const telemetry = readSurfaceTelemetry(ROOT_TAG);
    engine = {
      total: fill + apply + commit,
      nodes: committedTags().length,
      commitMs: telemetry?.commitMs ?? -1,
      layoutMs: telemetry?.layoutMs ?? -1,
      census: census(committedTree()),
    };
    print(
      `DEBUG ENGINE fill=${fill.toFixed(1)} apply=${apply.toFixed(1)} ` +
        `commit=${commit.toFixed(1)} total=${engine.total.toFixed(1)} ` +
        `commitMs=${engine.commitMs.toFixed(1)} layoutMs=${engine.layoutMs.toFixed(1)} ` +
        `nodes=${engine.nodes}`,
    );
    print(`DEBUG ENGINE census ${engine.census}`);
    // The walk, named from the inside. `walkMs` is the whole of `materialize`; the rest are per-node
    // sums within it and deliberately do NOT total to it — the remainder is the walk's own
    // bookkeeping, and seeing how big that remainder is was the point of splitting it.
    if (telemetry !== undefined) {
      print(
        `DEBUG WALK   walkMs=${telemetry.walkMs.toFixed(1)} ` +
          `props=${telemetry.propsMs.toFixed(1)} ` +
          `rawPropsCopy=${telemetry.rawPropsMs.toFixed(1)} ` +
          `createNode=${telemetry.createNodeMs.toFixed(1)} ` +
          `appendChild=${telemetry.appendChildMs.toFixed(1)} ` +
          `diffProps=${telemetry.diffPropsMs.toFixed(1)}`,
      );
      // `applyOps`' half. The buffer exists to replace 10 001 JSI calls with one, so the thing to
      // watch is whether the decode inside that one call has simply moved the per-node JSI work
      // rather than removed it.
      print(
        `DEBUG DECODE decodeMs=${telemetry.decodeMs.toFixed(1)} ` +
          `instanceHandle=${telemetry.instanceHandleMs.toFixed(1)} ` +
          `publish=${telemetry.publishMs.toFixed(1)} ` +
          `(setNativeState=${telemetry.nativeStateMs.toFixed(1)}) ` +
          `nodes=${telemetry.nodesDecoded}`,
      );
      // The books, closed. `applyMs` spans BOTH native calls this step makes — the explicit
      // `flushOps()` and the one `surface.commit()` makes to run `kOpCommit` — and the whole walk
      // happens inside the second, so `walkMs` has to come off before anything is attributed to the
      // op loop. Reading it without that subtraction reports the walk twice.
      const named =
        telemetry.walkMs +
        telemetry.decodeMs +
        telemetry.setPropMs +
        telemetry.stringDecodeMs +
        telemetry.structureMs;
      print(
        `DEBUG APPLY  applyMs=${telemetry.applyMs.toFixed(1)} (both calls) ` +
          `walk=${telemetry.walkMs.toFixed(1)} decode=${telemetry.decodeMs.toFixed(1)} ` +
          `setProp=${telemetry.setPropMs.toFixed(1)} ` +
          `strings=${telemetry.stringDecodeMs.toFixed(1)} ` +
          `structure=${telemetry.structureMs.toFixed(1)} ` +
          `(holdHandle=${telemetry.holdHandleMs.toFixed(1)}) ` +
          `rest=${(telemetry.applyMs - named).toFixed(1)}`,
      );
      print(
        `DEBUG SETPROP setPropMs=${telemetry.setPropMs.toFixed(1)} ` +
          `jsValueToDynamic=${telemetry.propConvertMs.toFixed(1)} ` +
          `ops=${telemetry.setProps} valueTable=${telemetry.valueEntries} ` +
          `converted=${telemetry.valueConversions}`,
      );
      print(
        `DEBUG WALK   created=${telemetry.nodesCreated} cloned=${telemetry.nodesCloned} ` +
          `reused=${telemetry.nodesReused} · rest=${(
            telemetry.walkMs -
            telemetry.propsMs -
            telemetry.rawPropsMs -
            telemetry.createNodeMs -
            telemetry.appendChildMs -
            telemetry.diffPropsMs
          ).toFixed(1)}`,
      );
    }
    expect(engine.nodes > 0).toBe(true);
  });

  // why: THE ORACLE, and it comes before the ratio is allowed to mean anything. Two timings over two
  // different trees are not a comparison — this repo has twice published a ratio that was a node
  // count in disguise, and the census is the cheap check that catches it.
  it('compares the two arms on a census they both pass', () => {
    if (raw === undefined || engine === undefined) {
      throw new Error('an arm did not run');
    }
    print(
      `DEBUG RATIO  engine/raw total = ${(engine.total / Math.max(raw.total, 0.001)).toFixed(2)}x · ` +
        `commitMs ${raw.commitMs.toFixed(1)} -> ${engine.commitMs.toFixed(1)} · ` +
        `layoutMs ${raw.layoutMs.toFixed(1)} -> ${engine.layoutMs.toFixed(1)}`,
    );
    print(`DEBUG NODES  raw=${raw.nodes} engine=${engine.nodes}`);
    expect(engine.nodes).toBe(raw.nodes);
    expect(engine.census).toBe(raw.census);
  });
});

report();
