/**
 * Counts what the JS side asks of Fabric, per mutation method, plus the size of the prop payloads
 * it sends. Standalone by construction: this file imports NOTHING, which is what lets the SAME
 * bytes live in the stock baseline (`examples/bare-rn`, which must carry no `@symbiote-native/*`
 * dependency) and in every canary. Keep the copies byte-identical; only the `bindRenderer`
 * callback at the index.js call site differs.
 *
 * Why this and not the engine's own readCommitProfile(): that instrument counts OUR reconcile walk,
 * and stock React Native has no such walk to count. `global.nativeFabricUIManager` is the one
 * surface both stacks genuinely share, so it is the only place a like-for-like number can be taken.
 * Call counts answer "do we ask Fabric to do more than React does"; the key counts answer the other
 * half, "or the same number of times, with fatter payloads".
 *
 * COST, and it is not zero: one JS call and one branch per JSI crossing, ~18 000 of them on a
 * Create of 1 000 rows. That is small next to a crossing into C++ but it is not nothing, and it
 * applies to EVERY run once installed, not only while counting. The comparison stays fair only
 * because both sides carry the identical wrapper — so install it on all of them, or on none.
 */

const COUNTED_METHODS = [
  'createNode',
  'cloneNode',
  'cloneNodeWithNewChildren',
  'cloneNodeWithNewProps',
  'cloneNodeWithNewChildrenAndProps',
  'createChildSet',
  'appendChild',
  'appendChildToSet',
  'completeRoot',
] as const;

type ICountedMethod = (typeof COUNTED_METHODS)[number];

// Which argument holds the props payload, per method. `createNode(tag, viewName, rootTag, props,
// handle)` puts it fourth; every clone-with-props variant puts it second.
const PROPS_ARG_INDEX: Partial<Record<ICountedMethod, number>> = {
  createNode: 3,
  cloneNodeWithNewProps: 1,
  cloneNodeWithNewChildrenAndProps: 1,
};

export type IFabricCallProfile = {
  calls: Record<string, number>;
  /** Total own enumerable keys across every props payload sent, by method. */
  propKeys: Record<string, number>;
  totalCalls: number;
  totalPropKeys: number;
};

const calls: Record<string, number> = {};
const propKeys: Record<string, number> = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read-and-reset, mirroring readCommitProfile() so a benchmark step can bracket one operation. */
export function readFabricCallProfile(): IFabricCallProfile {
  let totalCalls = 0;
  let totalPropKeys = 0;
  const callsSnapshot: Record<string, number> = {};
  const propKeysSnapshot: Record<string, number> = {};
  for (const method of COUNTED_METHODS) {
    const count = calls[method] ?? 0;
    const keys = propKeys[method] ?? 0;
    if (count > 0) callsSnapshot[method] = count;
    if (keys > 0) propKeysSnapshot[method] = keys;
    totalCalls += count;
    totalPropKeys += keys;
    calls[method] = 0;
    propKeys[method] = 0;
  }
  return {
    calls: callsSnapshot,
    propKeys: propKeysSnapshot,
    totalCalls,
    totalPropKeys,
  };
}

function counting(original: unknown, method: ICountedMethod): unknown {
  if (typeof original !== 'function') return original;
  const propsIndex = PROPS_ARG_INDEX[method];
  const wrapped = (...args: unknown[]): unknown => {
    calls[method] = (calls[method] ?? 0) + 1;
    if (propsIndex !== undefined) {
      const payload = args[propsIndex];
      if (isRecord(payload)) {
        propKeys[method] =
          (propKeys[method] ?? 0) + Object.keys(payload).length;
      }
    }
    return Reflect.apply(original, original, args);
  };
  // A rest parameter reports `length === 0`, and that is not cosmetic: SymbioteNative's engine
  // feature-detects the batched-children clone bindings BY ARITY
  // (`cloneNodeWithNewChildren.length >= 2`, `…AndProps.length >= 3` in core/engine/src/fabric.ts),
  // so an un-restored length silently sends every adapter down the per-child appendChild path —
  // a different commit path measured under the name of the real one. Copy the host's own arity.
  Object.defineProperty(wrapped, 'length', { value: original.length });
  return wrapped;
}

let isInstalled = false;

/**
 * Hands the renderer a counting view of the binding, then puts the global back.
 *
 * `bindRenderer` must synchronously force whichever renderer this app uses to read the global —
 * from index.js, so this file stays import-free. Stock React Native:
 *
 *   installFabricCallCounter(() => {
 *     require('react-native/Libraries/Renderer/shims/ReactFabric');
 *   });
 *
 * A SymbioteNative canary instead calls the engine's own binder, which caches identically:
 *
 *   installFabricCallCounter(() => { getSlot(); });
 *
 * Returns true if the counting object was in place while that ran.
 *
 * ## Why it is a temporary swap and not a permanent one
 *
 * **The global must belong to native at all times except this one instant.** It holds a JSI
 * HostObject, and C++ reads it back expecting exactly that:
 * `UIManagerBinding::getBinding()` (ReactCommon/react/renderer/uimanager/UIManagerBinding.cpp:41)
 * does `global.getProperty("nativeFabricUIManager").asObject(rt).getHostObject<UIManagerBinding>(rt)`
 * on every commit and every event dispatch. Hand it a plain object or a Proxy and that cast fails
 * inside C++ — the app dies with no red box and nothing in the JS log, having already printed
 * `Running "BareRN"`. Two earlier versions of this file (copy-the-properties, then Proxy) both left
 * the replacement installed permanently and both crashed exactly there; the Proxy rewrite was aimed
 * at a property-read theory that was never the cause.
 * `createAndInstallIfNeeded` (same file, :27) is the second reason: it skips installing the real
 * binding when the global is already non-undefined.
 *
 * **One instant is enough, because BOTH renderers read the binding exactly once and cache it.**
 * That symmetry is what makes the comparison legitimate at all; it is not a coincidence, both
 * cache for the same reason (the binding mints a fresh host function per property access).
 * React's prebuilt renderer destructures at module scope — `_nativeFabricUIManage =
 * nativeFabricUIManager, createNode = _nativeFabricUIManage.createNode, …`
 * (Libraries/Renderer/implementations/ReactFabric-dev.js:18694) — and the engine's `getSlot()`
 * builds a cached facade the same way (core/engine/src/fabric.ts). Both are LAZY, which is what
 * leaves the moment open: React's module is required on first render
 * (Libraries/ReactNative/RendererImplementation.js:26), `getSlot()` runs on first commit — both
 * after index.js. Forcing it here just fills the cache the app was going to fill anyway.
 *
 * What this consequently does NOT count: methods a renderer reads off the global lazily at call
 * time (React does this for measure, dispatchCommand, sendAccessibilityEvent, setIsJSResponder,
 * findNodeAtPoint) — those hit the restored binding — and `setNativeProps`, which RN's Animated
 * reaches through NativeDOM, a TurboModule, not this global at all. Every tree mutation the
 * benchmark performs goes through the cached set above.
 */
export function installFabricCallCounter(bindRenderer: () => void): boolean {
  if (isInstalled) return true;
  const original: unknown = Reflect.get(globalThis, 'nativeFabricUIManager');
  if (!isRecord(original)) return false;

  // Inherits from the binding so anything not counted still resolves; only the counted methods
  // become own properties. RN's own createProxyWithCachedProperties does the same Object.create
  // over the same HostObject, so this shape is known to work in Hermes.
  const view: Record<string, unknown> = Object.create(original);
  for (const method of COUNTED_METHODS) {
    view[method] = counting(Reflect.get(original, method), method);
  }

  try {
    Reflect.set(globalThis, 'nativeFabricUIManager', view);
    bindRenderer();
  } finally {
    Reflect.set(globalThis, 'nativeFabricUIManager', original);
  }

  isInstalled = true;
  return true;
}
