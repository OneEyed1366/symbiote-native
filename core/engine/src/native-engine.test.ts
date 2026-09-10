// The only property of this file that matters headlessly, and it is the one a device cannot check:
// the engine must be FULLY functional with no native module. Every one of this package's ~1 000 tests
// runs that way, so a `nativeEngine()` that threw, or that a caller treated as mandatory, would take
// the suite down rather than degrade — which is exactly what makes it worth a test of its own rather
// than trusting the absence of failures elsewhere.
//
// The three refusals below are not defensive padding. A pod and an npm package are two artefacts with
// two install steps, and this repo's own local-dev loop routinely replaces one without the other
// (`<examples_vs_dot_examples>`), so "an older binary is installed" is a state that happens weekly.

import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  nativeEngine,
  resetNativeEngine,
  SUPPORTED_NATIVE_VERSION,
  type INativeEngineBindings,
} from './native-engine';
import { getSlot } from './fabric';

const GLOBAL_KEY = '__symbioteEngineNative';
const MODULE_NAME = 'SymbioteEngine';

// One factory rather than the four inline copies this file grew, so a member added to
// `INativeEngineBindings` is one edit here. That matters beyond tidiness: the ABI-refusal case below
// must carry a COMPLETE object, or the shape guard turns it away first and the version branch it
// exists to exercise never runs — a green test measuring the wrong refusal.
function fakeBindings(version: number): INativeEngineBindings {
  return {
    version,
    allocInt32Array: (length: number): Int32Array => new Int32Array(length),
    probeUIManager: (): number => 0,
    applyOps: (): void => {},
    getProp: (): unknown => undefined,
    getViewName: (): string => '',
    parentOf: (): object | undefined => undefined,
    childrenOf: (): readonly object[] => [],
    committedRecordOf: (): undefined => undefined,
    dispatchCommand: (): void => {},
    sendAccessibilityEvent: (): void => {},
    measure: (): void => {},
    measureInWindow: (): void => {},
    measureLayout: (): void => {},
  };
}

function installFakeBindings(bindings: unknown): void {
  Object.assign(globalThis, { [GLOBAL_KEY]: bindings });
  resetNativeEngine();
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, GLOBAL_KEY);
  Reflect.deleteProperty(globalThis, 'nativeModuleProxy');
  resetNativeEngine();
});

// A TurboModule proxy shaped like the bridgeless one, whose module creation has the side effect the
// real `installJSIBindingsWithRuntime:` has. This is the production mechanism, not an approximation
// of it: `RCTTurboModuleManager` installs the JSI bindings when it CREATES the module, so "the global
// appears" and "somebody resolved the module by name" are the same event on a device.
function installFakeTurboModuleProxy(bindings: unknown): {
  resolutions: number;
} {
  const counter = { resolutions: 0 };
  const proxy = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property !== MODULE_NAME) return undefined;
        counter.resolutions += 1;
        Object.assign(globalThis, { [GLOBAL_KEY]: bindings });
        return { getVersion: () => 1 };
      },
    },
  );
  Object.assign(globalThis, { nativeModuleProxy: proxy });
  return counter;
}

describe('native engine bindings', () => {
  it('reports no native store when nothing installed one', () => {
    resetNativeEngine();
    expect(nativeEngine()).toBeUndefined();
  });

  it('resolves bindings a supported binary installed', () => {
    installFakeBindings(fakeBindings(SUPPORTED_NATIVE_VERSION));

    const resolved = nativeEngine();
    expect(resolved?.version).toBe(SUPPORTED_NATIVE_VERSION);
    expect(resolved?.allocInt32Array(4)).toHaveLength(4);
  });

  // The failure this guards is not a missing feature but a WRONG MEMORY LAYOUT: the whole point of
  // the native store is that JS reads native memory directly, so a binary whose fields moved hands
  // back numbers from the wrong offsets, silently. Refusing outright is the only safe answer, and
  // falling back costs nothing because the JS store is a complete implementation.
  it('refuses a binary whose ABI it does not know', () => {
    // COMPLETE but for the version, deliberately: an object missing a member would be refused by the
    // shape guard and this case would pass without the version branch ever running.
    //
    // `1` is not a synthetic number — it is the real previous ABI, where a node was addressed by an
    // integer id out of a C++ table instead of carrying its own `shared_ptr` as `NativeState`. Every
    // method name is identical across that change, so this branch is the ONLY thing that can refuse
    // such a pod, and an app that ran `npm install` without `pod install` has exactly one.
    installFakeBindings(fakeBindings(SUPPORTED_NATIVE_VERSION - 1));

    expect(nativeEngine()).toBeUndefined();
  });

  it('refuses a global that is not the bindings object', () => {
    installFakeBindings({ version: SUPPORTED_NATIVE_VERSION });
    expect(nativeEngine()).toBeUndefined();

    installFakeBindings('installed');
    expect(nativeEngine()).toBeUndefined();

    // A PARTIAL object — the exact shape an older pod installs once JS learns a new member, and the
    // reason the version field was not bumped for `probeUIManager`: the shape guard is what turns
    // that pod away. Written per-member rather than as one blob so a member added without a guard
    // line fails here instead of resolving as `undefined` at the first call site.
    const { probeUIManager: _omitted, ...withoutProbe } = fakeBindings(
      SUPPORTED_NATIVE_VERSION,
    );
    installFakeBindings(withoutProbe);
    expect(nativeEngine()).toBeUndefined();
  });

  // Resolution is cached, and the cache must not turn a miss into a repeated lookup — the miss is the
  // common case (headless, Android, any app between `npm install` and `pod install`). Asserted by
  // installing bindings AFTER the first miss and requiring the answer to stand: only `resetNativeEngine`
  // may change it.
  // The wiring, and without this test it is unwitnessed: nothing else in the engine calls
  // `nativeEngine()`, so on a device the module would never be CREATED, the JSI hook would never run,
  // and `global.__symbioteEngineNative` would be absent on a perfectly working binary. That reads as
  // "the native module is broken" and costs a build to disprove.
  //
  // Asserted through the side effect rather than through a spy, because the side effect IS the
  // contract: a resolution that does not install the bindings has not done the thing the call is for.
  it('binding the Fabric slot resolves the module, which is what installs the bindings', () => {
    resetNativeEngine();
    const counter = installFakeTurboModuleProxy(
      fakeBindings(SUPPORTED_NATIVE_VERSION),
    );

    expect(globalThis.__symbioteEngineNative).toBeUndefined();

    installFabric();
    getSlot();

    // Snapshotted BEFORE `nativeEngine()` is called, because that call resolves the module itself —
    // read afterwards the counter is non-zero whether or not `getSlot` did anything, and the test
    // would pass with the wiring deleted. The first version of this case had exactly that hole.
    const afterSlotBind = counter.resolutions;
    expect(afterSlotBind).toBeGreaterThan(0);
    expect(nativeEngine()?.version).toBe(SUPPORTED_NATIVE_VERSION);
  });

  it('caches the miss, so the lookup does not re-run on every call', () => {
    resetNativeEngine();
    expect(nativeEngine()).toBeUndefined();

    Object.assign(globalThis, {
      [GLOBAL_KEY]: fakeBindings(SUPPORTED_NATIVE_VERSION),
    });

    expect(nativeEngine()).toBeUndefined();
    resetNativeEngine();
    expect(nativeEngine()?.version).toBe(SUPPORTED_NATIVE_VERSION);
  });
});
