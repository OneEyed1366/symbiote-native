// The JS half of our own native module. It answers one question — is there a native store on this
// platform — and every caller must be able to take no. no is the majority case: headless tests,
// Android (iOS-only for now), a skipped pod install, or a pod/JS version mismatch.

// nativeEngine() returns the bindings or undefined, and nothing in the engine may require them —
// the native store is an accelerator behind the same seam the JS one sits behind.

// Not a licence for two implementations, though. The store (Int32Array vs. native memory) is
// byte-identical either way, one implementation two allocators — nothing here can drift. The
// applier (replayChildOps vs. cloneMultiple) IS two implementations of one fold.

// So undefined below is correct for the store and transitional for the applier: when the applier
// moves, the JS one is deleted, and a missing or mismatched module must fail loud rather than
// quietly run a second implementation — a silent fallback then would be a measurement that lies.

// Fantom (RN's own headless C++ test runner) is not a usable oracle for this: not published to
// npm, vendored from RN main against a repo pinned to 0.86, needing a from-scratch Hermes/folly/
// ReactCommon build, and its own README says it isn't supported for app-specific test code yet.

// So the oracle for a C++ commit path is built here instead: a TypeScript reference implementation
// the existing suite already exercises, plus a gtest target linking ReactCommon from the installed
// react-native.

import { dlog } from './debug';
import { getNativeModule } from './native-modules';
import type { ICommittedRecord } from './tree-host';
import { isRecord } from './type-guards';

// The ABI this file knows how to talk to. A binary reporting anything else is refused outright
// rather than probed method by method — the two artefacts ship separately (a pod and an npm
// package), so disagreement is routine and a partial match corrupts memory quietly.

// Exported for the tests, which must derive their supported/unsupported arms from it rather than
// restate the number: a bump that leaves a fixture behind reads as "the binary is stale", which is
// exactly the message this constant exists to produce.
export const SUPPORTED_NATIVE_VERSION = 4;

// What installJSIBindingsWithRuntime: puts on the global. allocInt32Array hands back a view over
// memory native owns, not a copy — the only reason any of this exists, since every other route
// from JS to native structure costs a JSI crossing per element.
export type INativeEngineBindings = {
  version: number;
  allocInt32Array: (lengthInElements: number) => Int32Array;
  // Bring-up probe: shadow trees the real UIManager holds, or -1 when we couldn't reach one at
  // all. Not a capability the engine uses — it exists so one device run answers whether our pod
  // compiles against ReactCommon's renderer and can resolve the UIManager from a plain JSI runtime.
  probeUIManager: () => number;
  // Replay one recorded mutation batch — the five fields of IMutationBatch, spread, because JSI
  // reads five arguments cheaper than five properties off one object. ops is read as memory on the
  // native side and never becomes JS values; the four side tables carry what JSI must marshal.

  // handles is the load-bearing one and travels out, not back: it holds the placeholder object for
  // every slot the ops address, and the host attaches each created node to that slot's object as
  // JSI NativeState — the adapter's own objects become the real handles, nothing is returned.

  // That's RN's own lifetime design: nativeFabricUIManager.createNode() hands back an object whose
  // NativeState owns the node, so Hermes collecting the object is what frees it — no second owner
  // that nothing tells to let go.
  applyOps: (
    ops: Int32Array,
    strings: readonly string[],
    values: readonly unknown[],
    instanceHandles: readonly unknown[],
    handles: readonly object[],
  ) => void;
  // The tree reads of ITreeHost, taking the same placeholder object applyOps put the node on. None
  // is on a commit path — they run at gesture or lifecycle rate, so the crossing cost is
  // irrelevant. undefined/empty is an ordinary answer from all of them.

  // getViewName answers the resolved name, which native may have changed at insert — a <Text>
  // inside another commits as RCTVirtualText, and only the side holding the parent link knows.
  getProp: (handle: object, key: string) => unknown;
  getProps: (handle: object) => Readonly<Record<string, unknown>>;
  /** The one WRITE among them: dirty a node no op named. See `markPropsDirty` (node.ts). */
  markPropsDirty: (handle: object) => void;
  getViewName: (handle: object) => string;
  parentOf: (handle: object) => object | undefined;
  childrenOf: (handle: object) => readonly object[];
  /** One entry, not the whole list — see `ITreeHost` for the quadratic each of these replaces. */
  firstChildOf: (handle: object) => object | undefined;
  nextSiblingOf: (handle: object) => object | undefined;
  /** The batched twins of `parentOf` / `childrenOf`. See `ITreeHost` for why the sweep needs them. */
  parentsOf: (handles: readonly object[]) => readonly (object | undefined)[];
  subtreesOf: (roots: readonly object[]) => readonly object[];
  /** The same walk narrowed to what a teardown visits. See `ITreeHost.teardownSubtreesOf`. */
  teardownSubtreesOf: (roots: readonly object[]) => readonly object[];
  /** The upward twin, deepest first — one crossing for a chain the event path walks per event. */
  ancestorsOf: (handle: object) => readonly object[];
  committedRecordOf: (handle: object) => ICommittedRecord | undefined;
  /** A TEST read — the payload the last commit sent. See `ITreeHost.committedPayloadOf`. */
  committedPayloadOf: (
    handle: object,
  ) => Readonly<Record<string, unknown>> | undefined;
  // The imperative six, taking the same placeholder object applyOps put the node on. They're here
  // because nativeFabricUIManager's own copies unwrap a handle IT minted; ours carry the node on
  // NativeState exactly as RN's do, so these six are the same code reading a different object.

  // The callback protocol is Fabric's own, not ours: measure answers six numbers, measureInWindow
  // four, and measureLayout calls onFail when the surface has no committed revision — copied from
  // UIManagerBinding so a component that already handles those cases keeps working.
  dispatchCommand: (
    handle: object,
    commandName: string,
    args: readonly unknown[],
  ) => void;
  sendAccessibilityEvent: (handle: object, eventType: string) => void;
  measure: (
    handle: object,
    callback: (
      x: number,
      y: number,
      width: number,
      height: number,
      pageX: number,
      pageY: number,
    ) => void,
  ) => void;
  measureInWindow: (
    handle: object,
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  measureLayout: (
    handle: object,
    relativeTo: object,
    onFail: () => void,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
  ) => void;
  setIsJSResponder: (
    handle: object,
    isResponder: boolean,
    blockNativeResponder: boolean,
  ) => void;
  // RN's own commit telemetry for any surface, including one this host never drove. Optional: read
  // with ?., so a pod predating it degrades instead of throwing. Treat an absent member as "no
  // answer", never as zeroes — a zero reads as "React's commit measures no text".

  // The C++ half's diagnostics (SymbioteDebug.h). Optional, for the same reason: an older native
  // binary that predates them must still pass isBindings rather than failing bring-up.
  setDebugEnabled?: (enabled: boolean) => void;
  takeDebugLog?: () => readonly string[];
  readSurfaceTelemetry?: (surfaceId: number) => {
    // The inside of a commit, read out of RN's own TransactionTelemetry rather than timed by us.
    // layoutNodes answers the question the timings only pose: Yoga reports how many layoutable
    // nodes it actually touched, so a one-row change reporting the whole tree is a re-layout.
    layoutMs: number;
    textMs: number;
    // ShadowTree::commit's own window, NOT materialize's — materialize runs in kOpCommit before
    // completeSurface, so it falls outside this window and layout's alike.
    commitMs: number;
    layoutNodes: number;
    textMeasures: number;
    // Parents that took the targeted-replace path since the last read, zeroed on read. Ours, not
    // RN's — a liveness signal for a fast path whose absence no correctness test can see.
    targetedReplaces: number;
    // materialize's own walk and its breakdown — ours, zeroed on read. See ISurfaceTelemetry.
    walkMs: number;
    propsMs: number;
    foldLookupMs: number;
    foldsFound: number;
    foldToJsMs: number;
    foldCallMs: number;
    foldFromJsMs: number;
    rawPropsMs: number;
    createNodeMs: number;
    appendChildMs: number;
    diffPropsMs: number;
    nodesCreated: number;
    nodesCloned: number;
    nodesReused: number;
    decodeMs: number;
    instanceHandleMs: number;
    publishMs: number;
    nativeStateMs: number;
    nodesDecoded: number;
    setPropMs: number;
    propConvertMs: number;
    setProps: number;
    deletesOfAbsent: number;
    writesOfUnchanged: number;
    valueEntries: number;
    valueConversions: number;
    applyMs: number;
    liveNodes: number;
    stringDecodeMs: number;
    structureMs: number;
    holdHandleMs: number;
    hostReadMs: number;
    hostReadHandles: number;
    applyCalls: number;
  };
};

// The global the native side installs. Declared rather than read blind so the narrowing below has
// something to narrow, and named with the same `__` convention as `__turboModuleProxy`.
declare global {
  var __symbioteEngineNative: unknown;
}

function isBindings(value: unknown): value is INativeEngineBindings {
  if (!isRecord(value)) return false;
  if (typeof value.version !== 'number') return false;
  if (typeof value.allocInt32Array !== 'function') return false;
  if (typeof value.probeUIManager !== 'function') return false;
  if (typeof value.applyOps !== 'function') return false;
  // The tree reads, checked one by one: a member added to the type without a line here resolves
  // fine at bring-up and throws at the first call site — a gesture or a measure() — one language
  // and several seconds away from the install that caused it.
  if (typeof value.getProp !== 'function') return false;
  if (typeof value.getProps !== 'function') return false;
  if (typeof value.markPropsDirty !== 'function') return false;
  if (typeof value.getViewName !== 'function') return false;
  if (typeof value.parentOf !== 'function') return false;
  if (typeof value.childrenOf !== 'function') return false;
  if (typeof value.firstChildOf !== 'function') return false;
  if (typeof value.nextSiblingOf !== 'function') return false;
  if (typeof value.parentsOf !== 'function') return false;
  if (typeof value.subtreesOf !== 'function') return false;
  if (typeof value.teardownSubtreesOf !== 'function') return false;
  if (typeof value.ancestorsOf !== 'function') return false;
  if (typeof value.committedRecordOf !== 'function') return false;
  // The imperative six, checked by name: a pod with applyOps but not these is an older binary,
  // and accepting it means measure() reaches a missing method at gesture time, not bring-up.
  if (typeof value.dispatchCommand !== 'function') return false;
  if (typeof value.sendAccessibilityEvent !== 'function') return false;
  if (typeof value.measure !== 'function') return false;
  if (typeof value.measureInWindow !== 'function') return false;
  if (typeof value.measureLayout !== 'function') return false;
  return typeof value.setIsJSResponder === 'function';
}

// SUPPORTED_NATIVE_VERSION guards a memory layout, not a member list: the shape guard above
// already refuses an older pod lacking a new function's name, so bumping for that alone would
// cost every app on an older pod its native store for nothing.

// Bump only when the meaning of existing bytes or arguments changes: a calling-convention change
// the shape guard can't see, since names stay the same while what they mean does not — every read
// still resolves to a value, just the wrong one, committing a wrong tree rather than throwing.

// `undefined` means "resolved, and there is none" — distinct from `resolved === false`, which means
// nobody has looked. Collapsing the two would re-run the lookup on every miss, and the miss is the
// common case.
let resolved = false;
let bindings: INativeEngineBindings | undefined;

// The native bindings, or undefined when this platform has none. Resolving the TurboModule is
// done for its side effect: RCTTurboModuleManager runs installJSIBindingsWithRuntime: at the
// moment it creates a module, so touching the module by name is what puts the global there.
export function nativeEngine(): INativeEngineBindings | undefined {
  if (resolved) return bindings;
  resolved = true;

  getNativeModule<unknown>('SymbioteEngine');

  const installed: unknown = globalThis.__symbioteEngineNative;
  if (!isBindings(installed)) {
    dlog(
      'native-engine: no native store on this platform ' +
        `(global is ${typeof installed}) — using the JS backing arrays`,
    );
    return undefined;
  }

  if (installed.version !== SUPPORTED_NATIVE_VERSION) {
    // Loud, because the repair is a pod install and the symptom otherwise is a wrong memory
    // layout rather than a missing feature — an install routinely replaces the JS half alone.
    dlog(
      `native-engine: REFUSING native store, ABI ${installed.version} ` +
        `against supported ${SUPPORTED_NATIVE_VERSION} — run \`pod install\`. Using the JS arrays`,
    );
    return undefined;
  }

  dlog(`native-engine: native store available, ABI ${installed.version}`);
  bindings = installed;
  return bindings;
}

/** Test seam: forget what was resolved, so a fixture can install or remove the global between cases. */
export function resetNativeEngine(): void {
  resolved = false;
  bindings = undefined;
}
