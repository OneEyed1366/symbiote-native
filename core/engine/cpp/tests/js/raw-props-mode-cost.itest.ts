// We hand Fabric its props down a path React Native's own header calls deprecated, and this file
// prices what that costs per prop.
//
// FOUND BY READING RN'S ISSUES FIRST, which is the method this investigation now runs on.
// `RawPropsParser` used to convert every `jsi::Value` to `folly::dynamic` before building a
// `RawValue`, and React Native removed that round trip behind an opt-in — facebook/react-native#48047
// ("Construct `RawValue` directly from `jsi::Value`") and #48231 (`useRawPropsJsiValue`). Our arm is
// on the other side of that fix by construction: the payload is built in C++ from the op buffer, so
// `SymbioteTree.cpp:1364` passes `react::RawProps(std::move(forFabric))` — the constructor
// `RawProps.h:65` documents as "Deprecated. Do not use."
//
// The two modes are not the same amount of work, and the difference is per PROP rather than per
// node (`RawPropsParser.cpp`, `preparse`):
//
//   Mode::JSI       values_.emplace_back(runtime, std::move(value))   a jsi::Value, MOVED
//   Mode::Dynamic   values_.emplace_back(pair.second)                 RawValue(const dynamic&), COPIED
//
// So every prop we send is deep-copied into the parser's value table, and a style prop is a whole
// flattened object. Stock never pays it: React hands `createNode` a `jsi::Object` and the JSI branch
// moves. That is asymmetric in our direction and it scales with the tree, which is the shape §18 of
// the measurement skill says a device-only suspect has to have.
//
// The method is §7's: read a FACTOR, not a millisecond. Node count is FIXED and the prop count per
// node varies, so the slope between two widths is the per-prop cost and every per-node constant —
// the ShadowNode allocation, the family, the Yoga node — cancels.
//
// RUN ON `bench:itest`. The assert build's list append is O(N^2) and its numbers carry no verdict.

import {
  appendChild,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
const NODES = 4_000;

// Scalars only, and every one a key Fabric's View parser actually knows — an unrecognised key is
// skipped by `nameToIndex_` before any RawValue is built, so a fixture padded with invented props
// would measure the lookup and not the copy.
const SCALAR_PROPS = [
  ['accessibilityLabel', 'a'],
  ['accessibilityHint', 'b'],
  ['accessibilityRole', 'button'],
  ['testID', 'c'],
  ['nativeID', 'd'],
  ['accessibilityLanguage', 'en'],
] as const;

type ICost = { rawPropsMs: number; createNodeMs: number };

/** The cheaper of two readings, phase by phase — the minimum is the reading (§6). */
function cheaperOf(left: ICost, right: ICost): ICost {
  return {
    rawPropsMs: Math.min(left.rawPropsMs, right.rawPropsMs),
    createNodeMs: Math.min(left.createNodeMs, right.createNodeMs),
  };
}

/** Commit `NODES` fresh nodes carrying `propCount` scalar props each, and return what C++ spent. */
function commitWith(propCount: number): ICost {
  const surface = createSurface(ROOT_TAG);
  const container = createElement('RCTView');
  routeProp(container, 'nativeID', 'container');
  surface.appendChild(container);

  for (let at = 0; at < NODES; at += 1) {
    const node = createElement('RCTView');
    for (let key = 0; key < propCount; key += 1) {
      const pair = SCALAR_PROPS[key];
      if (pair === undefined) throw new Error(`no prop ${key} in the fixture`);
      routeProp(node, pair[0], pair[1]);
    }
    appendChild(container, node);
  }
  surface.commit();
  mounted();

  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  if (telemetry === undefined) throw new Error('no telemetry after the commit');
  return {
    rawPropsMs: telemetry.rawPropsMs,
    createNodeMs: telemetry.createNodeMs,
  };
}

/** One styled prop instead of N scalars — the shape a real row writes. */
function commitWithStyle(): ICost {
  const surface = createSurface(ROOT_TAG);
  const container = createElement('RCTView');
  routeProp(container, 'nativeID', 'container');
  surface.appendChild(container);

  // HOISTED, so the fixture does not bill its own object allocation to the engine — the mistake
  // `style-write-cost.itest.ts` records paying for.
  const style = {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
    backgroundColor: 0xff13243a,
  };
  for (let at = 0; at < NODES; at += 1) {
    const node = createElement('RCTView');
    routeProp(node, 'style', style);
    appendChild(container, node);
  }
  surface.commit();
  mounted();

  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  if (telemetry === undefined) throw new Error('no telemetry after the commit');
  return {
    rawPropsMs: telemetry.rawPropsMs,
    createNodeMs: telemetry.createNodeMs,
  };
}

describe('what the deprecated dynamic props path costs per prop', () => {
  // why: THE SLOPE. Two widths of the same tree, so the per-node constants cancel and what is left
  // is what one more prop costs to build (ours, `rawPropsMs`) and to hand Fabric (`createNodeMs`,
  // which contains the parser's copy).
  it('prices one more scalar prop on a node', () => {
    // DISCARDED, and the first version of this file had no such line. The first commit in a process
    // carries its warm-up, and under the full run's 60-way parallelism that read 18.0 ms against the
    // 7.5 it reads alone — so the narrow arm came out DEARER than the wide one and the sign
    // assertion below went red in the suite while passing on its own. A pair where only one member
    // pays the warm-up is not a slope (§6).
    commitWith(1);

    // Best of two per width, minimum as the reading: timing noise only ever adds (§6).
    const narrow = cheaperOf(commitWith(1), commitWith(1));
    const wide = cheaperOf(commitWith(6), commitWith(6));
    const props = 5;

    const build =
      ((wide.rawPropsMs - narrow.rawPropsMs) * 1_000_000) / (NODES * props);
    const create =
      ((wide.createNodeMs - narrow.createNodeMs) * 1_000_000) / (NODES * props);
    print(
      `DEBUG SCALAR  rawProps ${narrow.rawPropsMs.toFixed(1)} -> ${wide.rawPropsMs.toFixed(1)} ms · ` +
        `createNode ${narrow.createNodeMs.toFixed(1)} -> ${wide.createNodeMs.toFixed(1)} ms`,
    );
    print(
      `DEBUG SLOPE   per prop: build ${build.toFixed(0)} ns · createNode ${create.toFixed(0)} ns · ` +
        `over ${NODES} nodes one prop is ${((create * NODES) / 1_000_000).toFixed(2)} ms`,
    );

    // NOT EVEN THE SIGN IS ASSERTED, and that was tried twice. The slope is ~0.9 ms across the two
    // arms, and the runner puts 60 processes on the machine at once — under that the two readings
    // cross each other, so the file went red in the suite while passing alone, twice, at two
    // different margins. A claim smaller than the run's own noise is not a claim (§8), and the
    // answer is the one §9 gives for a monotone gate: make it a PRINT.
    //
    // READ THIS FILE FROM A SOLO INVOCATION. What is asserted is only that both arms committed
    // something — the guard against a fixture that silently stopped building a tree.
    expect(narrow.createNodeMs).toBeGreaterThan(0);
    expect(wide.createNodeMs).toBeGreaterThan(0);
  });

  // why: the prop a row actually writes, and the one the copy should hurt most — a style arrives as
  // a flattened OBJECT, so `RawValue(const folly::dynamic&)` copies the whole thing rather than a
  // scalar. Read against the six-scalar arm above: same node count, one prop instead of six, and a
  // far larger value.
  it('prices a style prop, which is an object rather than a scalar', () => {
    const styled = cheaperOf(commitWithStyle(), commitWithStyle());
    const scalar = cheaperOf(commitWith(1), commitWith(1));

    print(
      `DEBUG STYLE   rawProps ${styled.rawPropsMs.toFixed(1)} ms · ` +
        `createNode ${styled.createNodeMs.toFixed(1)} ms · ` +
        `against one scalar: ${scalar.rawPropsMs.toFixed(1)} / ${scalar.createNodeMs.toFixed(1)}`,
    );
    print(
      `DEBUG STYLE   per node: build ` +
        `${(((styled.rawPropsMs - scalar.rawPropsMs) * 1_000_000) / NODES).toFixed(0)} ns · ` +
        `createNode ` +
        `${(((styled.createNodeMs - scalar.createNodeMs) * 1_000_000) / NODES).toFixed(0)} ns`,
    );
    expect(styled.createNodeMs).toBeGreaterThan(0);
  });
});

report();
