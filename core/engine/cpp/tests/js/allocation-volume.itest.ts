// How many BYTES does a node cost, and how many collections does a create trigger?
//
// FOUND BY READING THE TRACKERS FIRST, and this one is not React Native's — it is a renderer with
// our exact shape. octanejs/octane#1007, "High allocation volume and GC overhead in
// `octane/universal/native` on Hermes": a native renderer on Hermes, two universal frameworks
// driving the SAME host structure with the SAME property changes, compared on a metric set nothing
// in this directory has ever produced —
//
//   cumulative JS allocation · heap peak · live after GC · GC collections · time in GC · elapsed
//
// The thread's punchline is the reason this file exists: elapsed fell 36.4 s -> 6.5 s while
// cumulative allocation barely moved. **The win was in the collector, not in the work.** Every
// instrument here prices work with a wall clock; allocation is a second cost, paid later and
// somewhere else, and a phone's heap pays it far more often than a Mac's.
//
// It is a fair suspicion for us specifically. Our architecture allocates a JS node object, an op
// record and side-table entries PER NODE, and on the React adapter it does that on top of React's
// own fibers — where stock allocates fibers and hands Fabric a jsi object. If our bytes-per-node is
// a multiple of stock's, that is a device-only cost with the right shape (asymmetric in our
// direction, scaling with the tree) and no wall clock here would show it.
//
// Both arms build the SAME tree in ONE process: `RAW` is stock's protocol — the bare
// `nativeFabricUIManager`, no retained tree, no buffer — and `ENGINE` is the shipped path.
//
// READ BY SLOPE, two widths per arm (§7). The first arm in a process pays module warm-up and the
// first commit is dearer than the rest; a slope cancels both instead of trying to subtract them,
// which is the correction `raw-props-mode-cost.itest.ts` had to make twice.
//
// HERMES ONLY. JavaScriptCore reports an empty heap map by jsi's own default, so the arms skip
// rather than divide by nothing.
//
// RUN ON `bench:itest`.

import { createElement as h } from 'react';

import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
} from '@symbiote-native/engine';
import { flushOps } from '@symbiote-native/engine/tree-host';
import { mount } from '@symbiote-native/react';

import {
  collectGarbage,
  committedTags,
  describe,
  expect,
  heapInfo,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;
const NARROW = 1_000;
const WIDE = 4_000;

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };

type IFabricNode = object;
type IFabricBinding = {
  createNode: (
    tag: number,
    name: string,
    surfaceId: number,
    props: object,
    handle: object,
  ) => IFabricNode;
  appendChild: (parent: IFabricNode, child: IFabricNode) => IFabricNode;
  createChildSet: (surfaceId: number) => object;
  appendChildToSet: (childSet: object, node: IFabricNode) => void;
  completeRoot: (surfaceId: number, childSet: object) => void;
};

/**
 * The host binding, checked name by name.
 *
 * `Reflect.get` rather than a spread: the global is a JSI HostObject and its methods are not own
 * enumerable properties, so `{ ...binding }` comes back EMPTY and every check fails for a reason
 * that has nothing to do with the host. The one cast is the I/O edge where a host object enters the
 * type system, and the names above it are what make it narrow — `fabric-binding-probe.itest.ts`
 * fails first if any of them stops being a function.
 *
 * ONLY CALLABLE AFTER `createSurface`: `UIManagerBinding::createAndInstallIfNeeded` is what publishes
 * the global, so asking before the first surface exists throws "no nativeFabricUIManager in this
 * host" — which reads as a broken host and is an ordering mistake.
 */
function fabric(): IFabricBinding {
  const source: unknown = Reflect.get(globalThis, 'nativeFabricUIManager');
  if (typeof source !== 'object' || source === null) {
    throw new Error('no nativeFabricUIManager in this host');
  }
  for (const name of [
    'createNode',
    'appendChild',
    'createChildSet',
    'appendChildToSet',
    'completeRoot',
  ]) {
    if (typeof Reflect.get(source, name) !== 'function') {
      throw new Error(`nativeFabricUIManager.${name} is not a function`);
    }
  }
  return source as IFabricBinding;
}

let nextTag = 100_000;
function rawTag(): number {
  nextTag += 1;
  return nextTag;
}

type IHeap = { allocated: number; collections: number };

/** Cumulative allocation and collection count, or undefined on an engine that reports neither. */
function heap(): IHeap | undefined {
  const info = heapInfo();
  const allocated = info.hermes_totalAllocatedBytes;
  const collections = info.hermes_numCollections;
  if (allocated === undefined || collections === undefined) return undefined;
  return { allocated, collections };
}

/** `build` with the heap read either side of it, from a collected floor. */
function measure(build: () => void): IHeap | undefined {
  collectGarbage();
  const before = heap();
  if (before === undefined) return undefined;
  build();
  const after = heap();
  if (after === undefined) return undefined;
  return {
    allocated: after.allocated - before.allocated,
    collections: after.collections - before.collections,
  };
}

function buildRaw(count: number): void {
  // The surface FIRST — it is what installs the binding this line then reads.
  createSurface(ROOT_TAG);
  const binding = fabric();
  const childSet = binding.createChildSet(ROOT_TAG);
  const container = binding.createNode(rawTag(), 'RCTView', ROOT_TAG, {}, {});
  const list = binding.createNode(
    rawTag(),
    'RCTView',
    ROOT_TAG,
    { flex: 1 },
    {},
  );
  for (let at = 0; at < count; at += 1) {
    binding.appendChild(
      list,
      binding.createNode(rawTag(), 'RCTView', ROOT_TAG, ROW_STYLE, {}),
    );
  }
  binding.appendChild(container, list);
  binding.appendChildToSet(childSet, container);
  binding.completeRoot(ROOT_TAG, childSet);
  mounted();
}

function buildEngine(count: number): void {
  const surface = createSurface(ROOT_TAG);
  const list = createElement('RCTView');
  routeProp(list, 'style', { flex: 1 });
  for (let at = 0; at < count; at += 1) {
    const node = createElement('RCTView');
    routeProp(node, 'style', ROW_STYLE);
    appendChild(list, node);
  }
  surface.appendChild(list);
  flushOps();
  surface.commit();
  mounted();
}

/** The same tree through the React adapter — React's own allocations on top of ours. */
function buildAdapter(count: number): void {
  const rows = [];
  for (let at = 0; at < count; at += 1) {
    rows.push(h('view', { key: at, style: ROW_STYLE }));
  }
  mount(ROOT_TAG, h('view', { style: { flex: 1 } }, ...rows));
  mounted();
}

/** Bytes and collections per node, from the slope between two widths. */
function slopeOf(label: string, build: (count: number) => void): number {
  const narrow = measure(() => build(NARROW));
  const wide = measure(() => build(WIDE));
  if (narrow === undefined || wide === undefined) {
    print(`DEBUG ${label} SKIPPED — this engine reports no heap info`);
    return 0;
  }

  const nodes = WIDE - NARROW;
  const perNode = (wide.allocated - narrow.allocated) / nodes;
  print(
    `DEBUG ${label.padEnd(6)} ${NARROW} nodes ${(narrow.allocated / 1_048_576).toFixed(1)} MB ` +
      `(${narrow.collections} GCs) · ${WIDE} nodes ` +
      `${(wide.allocated / 1_048_576).toFixed(1)} MB (${wide.collections} GCs) · ` +
      `${perNode.toFixed(0)} bytes/node`,
  );
  return perNode;
}

describe('what a node costs the collector', () => {
  // why: THE COMPARISON, and the only one that means anything — the same tree, the same process,
  // the same collected floor, differing only in which protocol built it. An absolute byte count is
  // a property of this fixture; the RATIO between the two arms is a property of the architecture.
  it('prices a node in bytes on both protocols', () => {
    // Order matters less than it looks — the slope cancels the warm-up either arm pays — but RAW
    // goes first anyway so the engine's own module state is not counted into it.
    const raw = slopeOf('RAW', buildRaw);
    const engine = slopeOf('ENGINE', buildEngine);
    // THE ARM THAT MATCHES THE DEVICE, and without it the comparison is between two things nobody
    // ships: `ENGINE` is the bare mutation API with no reconciler above it, while the stock half
    // (`stock-allocation-volume.itest.tsx`) necessarily runs React. An app on this engine runs React
    // TOO, so what a device compares is React+ours against React+Fabric.
    const adapter = slopeOf('ADAPTER', buildAdapter);

    if (raw === 0 || engine === 0) {
      expect(true).toBe(true);
      return;
    }
    print(
      `DEBUG RATIO  engine/raw ${(engine / raw).toFixed(2)}x per node · ` +
        `adapter/raw ${(adapter / raw).toFixed(2)}x · ` +
        `our engine adds ${(engine - raw).toFixed(0)} bytes over the protocol floor`,
    );

    // PRINTED, NOT BOUNDED. Byte counts move with the engine build and the fixture's own shape, and
    // §8's rule applies: a claim smaller than the run's noise is not a claim. What is asserted is
    // that both arms allocated at all — the guard against a slope taken over two empty readings.
    expect(raw).toBeGreaterThan(0);
    expect(engine).toBeGreaterThan(0);
  });

  // why: the census, so the ratio above is a ratio between two equal workloads rather than between
  // two different trees — §1's rule, and the one this suite has been caught by four times.
  it('builds the same tree on both protocols', () => {
    buildRaw(NARROW);
    const rawNodes = committedTags().length;
    buildEngine(NARROW);
    const engineNodes = committedTags().length;

    print(`DEBUG CENSUS raw=${rawNodes} engine=${engineNodes}`);
    // EXACTLY EQUAL, and the `+1` the suite's census records does not appear here: both arms open
    // the surface through `createSurface`, so the container it mints on the first commit is already
    // standing when the raw arm starts appending. The ratio above is therefore between two trees of
    // the same size, which is the whole reason this case exists (§1).
    expect(engineNodes).toBe(rawNodes);
  });
});

report();
