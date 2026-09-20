// What is a Fabric node actually made of, in milliseconds?
//
// why: `materialize` spends most of itself inside `UIManager::createNode`, which is React Native's
// code, not ours — 18.5 of a 27 ms walk on `build-release`. So "optimize materialize" cannot mean
// making that call faster; it can only mean calling it less often, or calling it with less. Which
// of those two is worth anything depends on what is INSIDE it, and the vendor gives the list but
// not the weights (`UIManager.cpp:61`): a registry lookup by `std::string`, `createFamily`,
// `cloneProps` — which runs the real props parser over the payload — `createInitialState`, and
// `createShadowNode`.
//
// RUN IT ON `build-release` (`pnpm run bench:itest`). This file is what CAUGHT the assert build's
// distortion: its `appendChild` arm read 355 us per call against 2.7 us optimized, which is a
// quadratic that exists only where `REACT_NATIVE_DEBUG` compiles in
// `ensureYogaChildrenLookFine`/`ensureYogaChildrenAlignment`. Read the full account in
// `raw-fabric-vs-engine.itest.ts`; do not read this file's numbers off the assert build.
//
// So this file splits it by difference, from JS, over the bare binding. Every arm makes the same
// number of calls across the same JSI boundary and differs in exactly one thing, which is what lets
// a subtraction mean something:
//
//   full props   the benchmark row's real payloads
//   no props     `{}` — same call, same family, same node, nothing to parse
//   one key      `{}` plus a single key, to see whether the cost is per-key or per-call
//
// Nodes here are created and never committed. That is deliberate: a commit would add layout and a
// mount pass to every arm and bury the thing being measured. `createNode` allocates the family and
// parses the props whether or not anything ever commits it.
//
// Debug build, no `-O` — the ratios between arms transfer, the milliseconds do not.

import { createSurface } from '@symbiote-native/engine';

import { describe, expect, it, print, report } from './harness';

const ROOT_TAG = 1;
const NODES = 10_000;

type IFabricNode = object;
type IFabricBinding = {
  createNode: (
    tag: number,
    viewName: string,
    rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: object,
  ) => IFabricNode;
  appendChild: (parent: IFabricNode, child: IFabricNode) => IFabricNode;
};

function fabric(): IFabricBinding {
  const binding = (globalThis as Record<string, unknown>).nativeFabricUIManager;
  if (binding === null || typeof binding !== 'object') {
    throw new Error('no nativeFabricUIManager in this host');
  }
  return binding as IFabricBinding;
}

let nextTag = 20_000_001;
function tag(): number {
  nextTag += 2;
  return nextTag;
}

function since(startedAt: number): number {
  return performance.now() - startedAt;
}

/** `createNode` N times with one payload shape, and nothing else. */
function timeCreates(
  binding: IFabricBinding,
  viewName: string,
  props: Record<string, unknown>,
): number {
  const startedAt = performance.now();
  for (let at = 0; at < NODES; at += 1) {
    binding.createNode(tag(), viewName, ROOT_TAG, props, {});
  }
  return since(startedAt);
}

describe('what a Fabric node costs to make', () => {
  // why: if the payload is most of it, the lever is how many keys we send and the parser we send
  // them through. If the call itself is most of it, the only lever is calling it less often — and
  // those two conclusions send the next day's work to opposite ends of the engine.
  it('splits createNode into the call and the payload', () => {
    const binding = fabric();
    createSurface(ROOT_TAG);

    // The SAME object every iteration in each arm, so no arm is timed building its own props. The
    // engine reuses its style objects the same way, and a fresh literal per call would price JS
    // allocation as if it were Fabric's.
    const full = {
      height: 44,
      flexDirection: 'row',
      paddingLeft: 10,
      testID: 'row',
    };
    const one = { testID: 'row' };
    const none = {};

    // Warm first: the registry lookup populates caches on first touch of a component name, and the
    // first arm would otherwise carry that for all three.
    timeCreates(binding, 'RCTView', full);

    const emptyMs = timeCreates(binding, 'RCTView', none);
    const oneMs = timeCreates(binding, 'RCTView', one);
    const fullMs = timeCreates(binding, 'RCTView', full);

    print(
      `DEBUG createNode x${NODES}  none=${emptyMs.toFixed(1)} one=${oneMs.toFixed(1)} ` +
        `four=${fullMs.toFixed(1)}`,
    );
    print(
      `DEBUG per node (us)  none=${((emptyMs * 1000) / NODES).toFixed(2)} ` +
        `one=${((oneMs * 1000) / NODES).toFixed(2)} four=${((fullMs * 1000) / NODES).toFixed(2)}`,
    );
    print(
      `DEBUG payload share of a four-key node = ` +
        `${(((fullMs - emptyMs) / Math.max(fullMs, 0.001)) * 100).toFixed(0)}%`,
    );

    // why: the arms only mean something if they actually ran; a zero here would make every ratio
    // above a division by noise.
    expect(emptyMs > 0).toBe(true);
    expect(fullMs > 0).toBe(true);
  });

  // why: `appendChild` was 44 ms of the walk, a fifth of it, and the vendor call looks trivial —
  // so it is worth knowing whether it is the append or the ten-thousand-ness of it.
  it('prices appendChild against createNode on the same nodes', () => {
    const binding = fabric();
    createSurface(ROOT_TAG);

    const parent = binding.createNode(tag(), 'RCTView', ROOT_TAG, {}, {});
    const children: IFabricNode[] = [];
    for (let at = 0; at < NODES; at += 1) {
      children.push(binding.createNode(tag(), 'RCTView', ROOT_TAG, {}, {}));
    }

    const startedAt = performance.now();
    for (const child of children) binding.appendChild(parent, child);
    const appendMs = since(startedAt);

    print(
      `DEBUG appendChild x${NODES} = ${appendMs.toFixed(1)} ms ` +
        `(${((appendMs * 1000) / NODES).toFixed(2)} us each)`,
    );
    expect(appendMs > 0).toBe(true);
  });
});

report();
