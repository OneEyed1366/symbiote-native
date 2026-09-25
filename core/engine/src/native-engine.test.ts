// The property this file exists for: the engine must be FULLY functional with no native module,
// since nearly every test in this package runs that way — a `nativeEngine()` that threw would take
// the whole suite down rather than degrade.

// The three refusals below aren't defensive padding: a pod and an npm package are two artefacts
// with two install steps, and this repo's local-dev loop routinely replaces one without the other.

import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  nativeEngine,
  resetNativeEngine,
  SUPPORTED_NATIVE_VERSION,
  type INativeEngineBindings,
} from './native-engine';
import { getSlot } from './fabric';

const GLOBAL_KEY = '__symbioteEngineNative';
const MODULE_NAME = 'SymbioteEngine';

// One factory so a member added to INativeEngineBindings is one edit here — the ABI-refusal case
// below needs a COMPLETE object, or the shape guard turns it away before the version branch runs.
function fakeBindings(version: number): INativeEngineBindings {
  return {
    version,
    allocInt32Array: (length: number): Int32Array => new Int32Array(length),
    probeUIManager: (): number => 0,
    applyOps: (): void => {},
    getProp: (): unknown => undefined,
    getProps: (): Readonly<Record<string, unknown>> => ({}),
    markPropsDirty: (): void => {},
    getViewName: (): string => '',
    parentOf: (): object | undefined => undefined,
    childrenOf: (): readonly object[] => [],
    firstChildOf: (): object | undefined => undefined,
    nextSiblingOf: (): object | undefined => undefined,
    parentsOf: (): readonly (object | undefined)[] => [],
    subtreesOf: (): readonly object[] => [],
    teardownSubtreesOf: (): readonly object[] => [],
    ancestorsOf: (): readonly object[] => [],
    committedRecordOf: (): undefined => undefined,
    dispatchCommand: (): void => {},
    sendAccessibilityEvent: (): void => {},
    measure: (): void => {},
    measureInWindow: (): void => {},
    measureLayout: (): void => {},
    setIsJSResponder: (): void => {},
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

// A TurboModule proxy shaped like the bridgeless one: the production mechanism, not an
// approximation — RCTTurboModuleManager installs the JSI bindings when it CREATES the module, so
// "the global appears" and "somebody resolved the module by name" are the same event on a device.
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

  // The failure this guards is a WRONG MEMORY LAYOUT, not a missing feature: JS reads native memory
  // directly, so a binary whose fields moved hands back numbers from the wrong offsets, silently.
  it('refuses a binary whose ABI it does not know', () => {
    // COMPLETE but for the version, deliberately: an object missing a member would be refused by
    // the shape guard, and this case would pass without the version branch ever running.
    installFakeBindings(fakeBindings(SUPPORTED_NATIVE_VERSION - 1));

    expect(nativeEngine()).toBeUndefined();
  });

  it('refuses a global that is not the bindings object', () => {
    installFakeBindings({ version: SUPPORTED_NATIVE_VERSION });
    expect(nativeEngine()).toBeUndefined();

    installFakeBindings('installed');
    expect(nativeEngine()).toBeUndefined();

    // A PARTIAL object — the exact shape an older pod installs once JS learns a new member; the
    // shape guard is what turns that pod away, not a version bump.
    const { probeUIManager: _omitted, ...withoutProbe } = fakeBindings(
      SUPPORTED_NATIVE_VERSION,
    );
    installFakeBindings(withoutProbe);
    expect(nativeEngine()).toBeUndefined();
  });

  // Resolution is cached: the miss is the common case (headless, Android, an app between `npm
  // install` and `pod install`), and only resetNativeEngine may change a cached answer.

  // The wiring, unwitnessed elsewhere: nothing else calls nativeEngine(), so on a device the module
  // would never be created and the JSI hook would never run on a perfectly working binary.

  // Asserted through the side effect, not a spy: a resolution that doesn't install the bindings
  // hasn't done the thing the call is for.
  it('binding the Fabric slot resolves the module, which is what installs the bindings', () => {
    resetNativeEngine();
    const counter = installFakeTurboModuleProxy(
      fakeBindings(SUPPORTED_NATIVE_VERSION),
    );

    expect(globalThis.__symbioteEngineNative).toBeUndefined();

    // A RECORDING host: nothing here reads a committed tree.
    installRecordingFabric();
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
