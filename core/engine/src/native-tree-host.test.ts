// The property that matters on a device and that nothing else in this suite can observe: binding
// the Fabric slot INSTALLS a tree host. Without one `commitSurfaceOps` returns early, the ops stay
// pending forever, and the screen is blank with nothing red anywhere — the exact failure shape this
// file exists to make impossible to ship.
//
// The mirror property matters just as much headlessly: `installFabric()` puts the TypeScript applier
// in, and ~5 500 tests are written against it, so a native host resolving afterwards must NOT take
// the seam.

import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  resetNativeEngine,
  SUPPORTED_NATIVE_VERSION,
  type INativeEngineBindings,
} from './native-engine';
import { installNativeTreeHost, nativeTreeHost } from './native-tree-host';
import { readCommitProfile, setTreeHost, treeHost } from './tree-host';
import { getSlot, resetSlot } from './fabric';
import type { IMutationBatch } from './mutation-buffer';
import type { IFabricNode } from './fabric';

const GLOBAL_KEY = '__symbioteEngineNative';

type ICall = readonly [string, ...unknown[]];

// One factory, and its members answer DISTINGUISHABLE values on purpose: a host that wired `parentOf`
// to `childrenOf` would pass every "reaches native" assertion written against a shared stub.
function fakeBindings(version: number): {
  bindings: INativeEngineBindings;
  calls: ICall[];
  parent: object;
  child: object;
  record: { handle: IFabricNode; tag: number; rootTag: number };
} {
  const calls: ICall[] = [];
  const parent = { name: 'parent' };
  const child = { name: 'child' };
  // The engine never constructs a Fabric handle — the slot mints them — so the one this record
  // carries is whatever native would have put there, and only its identity is under test.
  const record = {
    handle: Object.freeze({ name: 'fabric' }),
    tag: 7,
    rootTag: 1,
  };
  const bindings: INativeEngineBindings = {
    version,
    allocInt32Array: length => new Int32Array(length),
    probeUIManager: () => 0,
    applyOps: (ops, strings, values, instanceHandles, handles) => {
      calls.push(['applyOps', ops, strings, values, instanceHandles, handles]);
    },
    getProp: (handle, key) => {
      calls.push(['getProp', handle, key]);
      return `prop:${key}`;
    },
    getViewName: handle => {
      calls.push(['getViewName', handle]);
      return 'RCTVirtualText';
    },
    parentOf: handle => {
      calls.push(['parentOf', handle]);
      return parent;
    },
    childrenOf: handle => {
      calls.push(['childrenOf', handle]);
      return [child];
    },
    committedRecordOf: handle => {
      calls.push(['committedRecordOf', handle]);
      return record;
    },
    dispatchCommand: () => {},
    sendAccessibilityEvent: () => {},
    measure: () => {},
    measureInWindow: () => {},
    measureLayout: () => {},
  };
  return { bindings, calls, parent, child, record };
}

function installFakeBindings(bindings: unknown): void {
  Object.assign(globalThis, { [GLOBAL_KEY]: bindings });
  resetNativeEngine();
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, GLOBAL_KEY);
  Reflect.deleteProperty(globalThis, 'nativeFabricUIManager');
  resetNativeEngine();
  resetSlot();
  setTreeHost(undefined);
});

describe('the native tree host', () => {
  it('is installed when the bindings resolve', () => {
    installFabric();
    // installFabric() puts the TypeScript applier in, and the precedence rule below is that an
    // installed host wins — so this case has to start from an empty seam to be about anything.
    setTreeHost(undefined);
    installFakeBindings(fakeBindings(SUPPORTED_NATIVE_VERSION).bindings);

    resetSlot();
    getSlot();

    expect(treeHost()).toBeDefined();
  });

  it('is not installed when no native module resolves', () => {
    installFabric();
    setTreeHost(undefined);
    resetNativeEngine();

    resetSlot();
    getSlot();

    expect(treeHost()).toBeUndefined();
  });

  // The version refusal reaches this far, and it must: a v3 pod's `applyOps` reads argument 1 as an
  // `Int32Array` of child ids where the tree batch sends a string table. Every name is present, so
  // the shape guard passes it and only the version branch can turn it away.
  it('refuses a binary one ABI behind, leaving the seam empty', () => {
    installFabric();
    setTreeHost(undefined);
    installFakeBindings(fakeBindings(SUPPORTED_NATIVE_VERSION - 1).bindings);

    resetSlot();
    getSlot();

    expect(treeHost()).toBeUndefined();
  });

  // PRECEDENCE, and the headless suite rests on it: the TypeScript applier `installFabric()` put in
  // stays. Asserted by identity rather than by "a host is present", which is true either way.
  it('never displaces a host that is already installed', () => {
    const recorder = installFabric();
    expect(recorder).toBeDefined();
    const applier = treeHost();
    installFakeBindings(fakeBindings(SUPPORTED_NATIVE_VERSION).bindings);

    resetSlot();
    getSlot();

    expect(treeHost()).toBe(applier);
  });

  it('routes every read at the matching binding', () => {
    const { bindings, calls, parent, child, record } = fakeBindings(
      SUPPORTED_NATIVE_VERSION,
    );
    const host = nativeTreeHost(bindings);
    const handle = { name: 'node' };

    expect(host.propOf(handle, 'testID')).toBe('prop:testID');
    expect(host.parentOf(handle)).toBe(parent);
    expect(host.childrenOf(handle)).toEqual([child]);
    expect(host.committedRecordOf(handle)).toBe(record);

    // Each read reached its OWN binding with the handle it was given — a host that crossed two of
    // them would still answer four defined values.
    expect(calls).toEqual([
      ['getProp', handle, 'testID'],
      ['parentOf', handle],
      ['childrenOf', handle],
      ['committedRecordOf', handle],
    ]);
  });

  it('spreads a batch into the five-argument applyOps', () => {
    const { bindings, calls } = fakeBindings(SUPPORTED_NATIVE_VERSION);
    const batch: IMutationBatch = {
      ops: new Int32Array([1, 2, 3]),
      strings: ['RCTView'],
      values: [42],
      instanceHandles: [null],
      handles: [{ name: 'slot0' }],
    };

    nativeTreeHost(bindings).applyOps(batch);

    // Field by field and IN ORDER, because the failure this guards is two tables swapped: native
    // reads by position, so `strings` arriving where `values` belongs is a wrong tree, not a throw.
    expect(calls).toEqual([
      [
        'applyOps',
        batch.ops,
        batch.strings,
        batch.values,
        batch.instanceHandles,
        batch.handles,
      ],
    ]);
  });

  // `census` is deliberately absent from the ABI: one diagnostics-only caller, against the cost of a
  // full native walk of the tree this design exists to stop walking. So it degrades to zeroes rather
  // than crossing, and the assertion that matters is that asking cost nothing.
  it('degrades the census to empty without crossing', () => {
    const { bindings, calls } = fakeBindings(SUPPORTED_NATIVE_VERSION);

    expect(nativeTreeHost(bindings).census([{ name: 'root' }])).toEqual({
      nodes: 0,
      anchors: 0,
      emptyRawTexts: 0,
      renderable: 0,
      flattenWidths: [],
    });
    expect(calls).toEqual([]);
  });

  // `takeCommitSplit` is the ONE optional member of the ABI, and both halves of that are load-
  // bearing: a pod carrying it must have its numbers reach the profile, and a pod predating it must
  // keep its entire native tree rather than lose it to a diagnostic. `fakeBindings` does not declare
  // it, so the second arm is the fixture itself.
  //
  // Zeroing is NATIVE-side — this reads what it was handed and never resets it, so a second read
  // returning zeroes is the native half doing its job, not this one.
  it('reports the commit split when the pod carries it, and zeroes when it does not', () => {
    const zeroes = {
      buildMs: 0,
      commitMs: 0,
      adoptSwaps: 0,
      propClones: 0,
      textSwaps: 0,
      dirtyTexts: 0,
      layoutMs: 0,
      textMs: 0,
      layoutNodes: 0,
      textMeasures: 0,
    };
    const { bindings } = fakeBindings(SUPPORTED_NATIVE_VERSION);
    installFakeBindings(bindings);
    expect(readCommitProfile()).toMatchObject(zeroes);

    let reads = 0;
    installFakeBindings({
      ...bindings,
      takeCommitSplit: () => {
        reads += 1;
        return reads === 1
          ? {
              ...zeroes,
              buildMs: 12.5,
              commitMs: 93.25,
              adoptSwaps: 1000,
              propClones: 35,
            }
          : zeroes;
      },
    });
    expect(readCommitProfile()).toMatchObject({
      buildMs: 12.5,
      commitMs: 93.25,
      adoptSwaps: 1000,
      propClones: 35,
    });
    expect(readCommitProfile()).toMatchObject(zeroes);
    expect(reads).toBe(2);
  });
});
