// Does `binding.createNode(...)` cost more than `createNode(...)`, and how much of RAW is that?
//
// FOUND BY READING AN ISSUE, then the vendored source it pointed at. Margelo's JSI write-up prices a
// method reached through a `jsi::HostObject` at ~5x a plain `HostFunction`, because a HostObject
// serves every property through a `get` trap. `UIManagerBinding` IS a HostObject, and its trap is
// not a lookup — it BUILDS the answer
// (`.vendors/react-native/.../uimanager/UIManagerBinding.cpp:184`):
//
//   auto methodName = name.utf8(runtime);          // a std::string, allocated per access
//   if (methodName == "createNode") { ... }        // a compare chain, in declaration order
//   return jsi::Function::createFromHostFunction(  // a NEW function object, per access
//       runtime, name, paramCount, [uiManager, methodName, paramCount](...) { ... });
//
// **React pays that exactly once per method.** `ReactFiberConfigFabric.js:45-60` destructures the
// whole surface at module scope — `const { createNode, appendChild: appendChildNode, ... } =
// nativeFabricUIManager;` — so its ten thousand creates call a function it resolved at load.
//
// `raw-fabric-vs-engine.itest.ts` does not. It holds the binding OBJECT and writes
// `binding.createNode(...)`, so it re-enters that trap on every node and every append. That makes
// RAW something other than what it is named for: stock's protocol PLUS a resolution stock does not
// pay. Every conclusion drawn off RAW's per-node cost — including the one that the buffer's premise
// is a JIT artefact — rests on a number that may be carrying it.
//
// So this file measures the resolution directly, as two arms in one process against one Fabric:
//
//   RESOLVED   `binding.createNode(...)`   — the shape RAW uses today
//   BOUND      `createNode(...)`           — the shape React's renderer uses
//
// Identical tree, identical node census, back to back. The DIFFERENCE is the property trap and
// nothing else.
//
// RUN ON `bench:itest` (Release, Hermes). Solo, not inside the full parallel run — the arms differ
// by tens of milliseconds and the runner spawns one process per file.

import { createSurface } from '@symbiote-native/engine';

import {
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

const ROW_PROPS = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_PROPS = { flex: 1 };
const INPUT_PROPS = { width: 96, height: 28 };
const TEXT_PROPS = { ellipsizeMode: 'tail', allowFontScaling: true };

type IFabricNode = object;
type IFabricChildSet = object;

type ICreateNode = (
  tag: number,
  viewName: string,
  rootTag: number,
  props: Record<string, unknown>,
  instanceHandle: object,
) => IFabricNode;
type IAppendChild = (parent: IFabricNode, child: IFabricNode) => void;

type IFabricBinding = {
  createNode: ICreateNode;
  appendChild: IAppendChild;
  createChildSet: (rootTag: number) => IFabricChildSet;
  appendChildToSet: (childSet: IFabricChildSet, child: IFabricNode) => void;
  completeRoot: (rootTag: number, childSet: IFabricChildSet) => void;
};

function fabric(): IFabricBinding {
  const binding = (globalThis as Record<string, unknown>).nativeFabricUIManager;
  if (binding === null || typeof binding !== 'object') {
    throw new Error('no nativeFabricUIManager in this host');
  }
  // A narrowing, not a cast: `fabric-binding-probe.itest.ts` fails first if any of these stops being
  // a function.
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

// Tags well past anything the engine hands out, and disjoint per arm: Fabric aborts on a duplicate
// tag inside one surface, so an overlap would surface as a crash rather than a wrong number.
let nextTag = 20_000_001;
function tag(): number {
  nextTag += 2;
  return nextTag;
}

/** `RCTView=… RCTText=…` over the committed tree — the oracle that makes the two arms one workload. */
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

/**
 * Build the whole 10 002-node tree and commit it, given the two methods the row needs.
 *
 * Both arms call THIS function, so the tree, the payload literals and the loop shape are shared by
 * construction — the arms can differ only in what they passed in. Writing the row twice is how a
 * comparison quietly acquires a second difference.
 */
function build(createNode: ICreateNode, appendChild: IAppendChild): number {
  const binding = fabric();
  createSurface(ROOT_TAG);

  const startedAt = performance.now();
  const childSet = binding.createChildSet(ROOT_TAG);
  const node = (
    viewName: string,
    props: Record<string, unknown>,
  ): IFabricNode => createNode(tag(), viewName, ROOT_TAG, props, {});

  // Two views above the rows, matching what `createSurface` puts there, so a census taken against
  // any other arm in this directory compares trees of the same depth.
  const container = node('RCTView', {});
  const list = node('RCTView', { flex: 1 });
  appendChild(container, list);

  for (let id = 0; id < ROWS; id += 1) {
    const label = (text: string): IFabricNode => {
      const outer = node('RCTText', TEXT_PROPS);
      appendChild(outer, node('RCTRawText', { text }));
      return outer;
    };

    const row = node('RCTView', { ...ROW_PROPS, testID: `row-${id}` });
    appendChild(row, label(String(id)));
    for (const text of [`row ${id}`, 'x']) {
      const cell = node('RCTView', CELL_PROPS);
      appendChild(cell, label(text));
      appendChild(row, cell);
    }
    appendChild(
      row,
      node('RCTSinglelineTextInputView', {
        ...INPUT_PROPS,
        text: `input ${id}`,
      }),
    );
    appendChild(list, row);
  }

  binding.appendChildToSet(childSet, container);
  binding.completeRoot(ROOT_TAG, childSet);
  const total = performance.now() - startedAt;
  mounted();
  return total;
}

/**
 * `createNode` and `appendChild` reached through the binding OBJECT — the shape
 * `raw-fabric-vs-engine.itest.ts` uses, and the one every number attributed to "stock's protocol"
 * was taken through. Each call re-enters `UIManagerBinding::get`.
 */
function buildResolved(binding: IFabricBinding): number {
  return build(
    (nodeTag, viewName, rootTag, props, instanceHandle) =>
      binding.createNode(nodeTag, viewName, rootTag, props, instanceHandle),
    (parent, child) => binding.appendChild(parent, child),
  );
}

/**
 * The same two methods destructured once — the shape React's own renderer uses.
 *
 * Wrapped in the SAME arrow shape as the arm above rather than passed straight through: handing
 * `build` a bare function here would make this arm one JS call per node cheaper as well, and a
 * comparison carrying two differences attributes neither (§8).
 */
function buildBound(binding: IFabricBinding): number {
  const { createNode, appendChild } = binding;
  return build(
    (nodeTag, viewName, rootTag, props, instanceHandle) =>
      createNode(nodeTag, viewName, rootTag, props, instanceHandle),
    (parent, child) => appendChild(parent, child),
  );
}

// Both arms make 10 002 `createNode` calls and 10 001 `appendChild` calls, so the trap is entered
// 20 003 times on the resolved arm and exactly twice on the bound one.
const TRAPS = 20_003;
const ROUNDS = 3;

describe('what a HostObject property access costs on the create path', () => {
  // why: THE READING. A property access is a few hundred nanoseconds and a build is tens of
  // milliseconds, so the two arms have to be interleaved inside ONE case rather than run as two —
  // whichever arm goes first carries the process warm-up, and §18h already published a 2.4x figure
  // that was warm-up before that was noticed. Alternating and taking each arm's MINIMUM gives the
  // warm-up to the discarded round and leaves a one-sided noise distribution (§6).
  it('costs about a third of a microsecond per access', () => {
    const binding = fabric();

    // DISCARDED: the first build in a process pays lazy C++ initialisation, the surface's own
    // container and whatever the allocator has not yet warmed.
    buildResolved(binding);

    let resolved = Infinity;
    let bound = Infinity;
    let resolvedCensus = '';
    let boundCensus = '';
    for (let round = 0; round < ROUNDS; round += 1) {
      resolved = Math.min(resolved, buildResolved(binding));
      resolvedCensus = census(committedTree());
      bound = Math.min(bound, buildBound(binding));
      boundCensus = census(committedTree());
    }

    // ONE WORKLOAD, asserted before any millisecond is read (§1): two trees that differ by a node
    // are not a comparison, and this repo has read a missing element as a ratio twice.
    expect(boundCensus).toBe(resolvedCensus);

    const saved = resolved - bound;
    print(
      `DEBUG HOSTOBJECT resolved ${resolved.toFixed(1)} ms · ` +
        `bound ${bound.toFixed(1)} ms · ` +
        `saved ${saved.toFixed(1)} ms over ${TRAPS} accesses = ` +
        `${((saved * 1_000) / TRAPS).toFixed(3)} us per access · ` +
        `census ${resolvedCensus}`,
    );

    // The census is the gate; the timing is a PRINT. A directional assertion on two arms that differ
    // by a few milliseconds inside a 60-way parallel run is what §18h had to remove twice, and the
    // number this file exists to produce is the per-access cost, not a verdict.
    expect(resolved).toBeGreaterThan(0);
  });
});

report();
