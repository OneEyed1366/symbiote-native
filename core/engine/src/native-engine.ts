// The JS half of our own native module (item 8c of `symbiote-fabric-cxx-surface`). It answers one
// question — is there a native store on this platform — and every caller must be able to take `no`.
//
// `no` is not an error case, it is the majority case:
//
//   headless (vitest, 5 600 tests)   no native anything; the JS backing store is the only one
//   Android                          the module is iOS-only for now, by choice, not by oversight
//   an app that skipped `pod install` the standing hazard of this repo's local-dev loop
//   an older pod against newer JS     two artefacts, two install steps, no shared version gate
//
// So the contract is: `nativeEngine()` returns the bindings or `undefined`, and nothing in the engine
// may require them. The native store is an ACCELERATOR behind the same seam the JS one sits behind.
//
// ── THIS IS NOT A LICENCE FOR TWO IMPLEMENTATIONS, AND THE DISTINCTION IS THE POINT ──────────────
//
// Two different things get called "the native path" and only one of them is a fork:
//
//   the STORE (8b')      `new Int32Array(n)` vs an `Int32Array` over native memory. `node-table.ts`
//                        is byte-identical either way — one implementation, two allocators. There is
//                        nothing here that can drift.
//   the APPLIER (8c-1)   `replayChildOps` in commit.ts vs `cloneMultiple` inside a commit hook. That
//                        IS two implementations of one fold, and a permanent fallback to the JS half
//                        would be exactly the silent divergence this repo keeps finding.
//
// So the graceful `undefined` below is correct for the store and TRANSITIONAL for the applier. When
// the applier moves, the JS one is DELETED — the way `node.children` and `node.parent` were — and a
// missing or mismatched module has to fail LOUD rather than quietly run a second implementation. A
// silent fallback at that point is a measurement that lies, not resilience.
//
// The expensive part of that transition, named here because it is easy to discover too late: ~5 600
// headless tests drive the JS applier against a fake Fabric slot. Faking `new Int32Array` is free;
// faking C++ tree cloning is not, so those tests stop covering what actually runs.
//
// Fantom was the intended answer and it is NOT available — measured 2026-09-08, four independent
// blockers. `@react-native/fantom` is not on npm at all (404); it exists only as vendored source
// under `.vendors/react-native/private/`, marked `private: true`. That vendored tree is RN **main**
// while this repo consumes 0.86.0, so a tester built from it would exercise the wrong C++. Building
// it needs a yarn install plus a gradle/CMake build of Hermes, folly and ReactCommon, all written
// INTO `.vendors/`. And `config/metro.config.js` computes `projectRoot` from `__dirname` with an
// empty `watchFolders`, so a test file outside that monorepo cannot be resolved — not overridable
// by env, config merge or CLI. RN's own README says it plainly: "not currently supported for
// testing application-specific code in React Native apps."
//
// So the oracle for a C++ commit path has to be built here: a TypeScript reference implementation
// the existing suite already exercises, plus a gtest target linking ReactCommon from the installed
// react-native. Do not cite Fantom as the plan again without re-running that check.

import { dlog } from './debug';
import { getNativeModule } from './native-modules';
import type { ICommittedRecord } from './tree-host';
import { isRecord } from './type-guards';

/**
 * The ABI this file knows how to talk to. A binary reporting anything else is refused outright rather
 * than probed method by method — the two artefacts ship separately (a pod and an npm package), so
 * disagreement is routine, and a partial match is the shape that corrupts memory quietly.
 *
 * Exported for the tests, which must DERIVE their supported and unsupported arms from it rather than
 * restate the number: a bump that leaves a fixture behind reads as "the binary is stale", which is
 * exactly the message this constant exists to produce, so the failure looks like the feature working.
 */
export const SUPPORTED_NATIVE_VERSION = 4;

/**
 * What `installJSIBindingsWithRuntime:` puts on the global.
 *
 * `allocInt32Array` hands back a view over memory NATIVE owns — not a copy — which is the only reason
 * any of this exists. Every other route from JS to native structure costs a JSI crossing per element,
 * and the census that sized this design counted ~4 000 reads for a two-row swap.
 */
export type INativeEngineBindings = {
  version: number;
  allocInt32Array: (lengthInElements: number) => Int32Array;
  /**
   * Item 8c-1's bring-up probe: shadow trees the real `UIManager` holds, or -1 when we could not
   * reach one at all. Not a capability the engine uses — it exists so one device run answers whether
   * our pod compiles against ReactCommon's renderer, links against the prebuilt framework, and can
   * resolve the UIManager from a plain JSI runtime. See the C++ side for why -1 and 0 differ.
   */
  probeUIManager: () => number;
  /**
   * Replay one recorded mutation batch — the five fields of `IMutationBatch`, spread, because JSI
   * reads five arguments cheaper than it reads five properties off one object.
   *
   * `ops` is read as MEMORY on the native side and never becomes JS values; the four side tables
   * carry what JSI has to marshal either way.
   *
   * `handles` is the load-bearing one and it travels OUT, not back. It holds the placeholder object
   * for every slot the ops address, and the host attaches each created node's
   * `shared_ptr<const ShadowNode>` to the object at that slot as JSI `NativeState` — so the objects
   * the adapter is already holding become the real handles in place. Nothing is returned.
   *
   * That is the whole lifetime design, and it is RN's own: `nativeFabricUIManager.createNode()`
   * hands back an object whose NativeState owns the node, so Hermes collecting the object is what
   * frees it. The version this replaced kept a `Map<int, shared_ptr>` in C++ instead — a second
   * owner nothing could tell to let go, which cost 792 -> 1492 MB across one benchmark suite.
   */
  applyOps: (
    ops: Int32Array,
    strings: readonly string[],
    values: readonly unknown[],
    instanceHandles: readonly unknown[],
    handles: readonly object[],
  ) => void;
  /**
   * The four reads of `ITreeHost`, taking the same placeholder object `applyOps` put the node on.
   *
   * None is on a commit path — they run at GESTURE or lifecycle rate (a host behavior seeing the
   * props it reacts to, an app measuring a ref, a framework seam navigating what it just built), so
   * the crossing cost is irrelevant. `undefined` / empty is an ordinary answer from all of them: a
   * handle native has not seen and a genuinely absent value are indistinguishable here, and both
   * degrade.
   *
   * `getViewName` answers the RESOLVED name, which native may have changed at insert — a `<Text>`
   * inside another `<Text>` commits as `RCTVirtualText`, and only the side holding the parent link
   * knows.
   */
  getProp: (handle: object, key: string) => unknown;
  getViewName: (handle: object) => string;
  parentOf: (handle: object) => object | undefined;
  childrenOf: (handle: object) => readonly object[];
  committedRecordOf: (handle: object) => ICommittedRecord | undefined;
  /**
   * The imperative five, taking the same placeholder object `applyOps` put the node on.
   *
   * They are here because `nativeFabricUIManager`'s own copies unwrap a handle IT minted, and under
   * the batched applier every handle in play was minted by the batching slot. Ours carry the node on
   * their `NativeState` exactly as RN's do, so these five are the same code reading a different
   * object. An app calling `measure()` on a ref reaches native through here or not at all.
   *
   * The callback protocol is Fabric's own, not ours: `measure` answers six numbers, `measureInWindow`
   * four, and `measureLayout` calls `onFail` when the surface has no committed revision — copied
   * from `UIManagerBinding` so a component that already handles those cases keeps working.
   */
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
  /**
   * Milliseconds in each half of a commit since the last read, zeroed by reading.
   *
   * `buildMs` is the native tree walk plus every `createNode`/`cloneNode` it issues; `commitMs` is
   * `completeSurface` — Fabric's own commit, the differ, layout and the mount pass. `applyMs` in
   * `tree-host.ts` prices both as one number, and the two halves have different fixes.
   *
   * OPTIONAL, and the only optional member here. The rest are in `isBindings` because a missing one
   * throws at a gesture, seconds and one language away from the install; this one is read with `?.`
   * and cannot, so requiring it would cost a pod predating it its entire native tree to announce a
   * diagnostic. Same trade `probeUIManager` is recorded under, decided the other way for the same
   * reason.
   */
  takeCommitSplit?: () => {
    buildMs: number;
    commitMs: number;
    adoptSwaps: number;
    propClones: number;
    textSwaps: number;
    dirtyTexts: number;
    layoutMs: number;
    textMs: number;
    layoutNodes: number;
    textMeasures: number;
  };
  /**
   * RN's own commit telemetry for ANY surface, including one this host never drove.
   *
   * Optional for the same reason `takeCommitSplit` is: a pod predating it must keep its native tree
   * rather than lose it to a diagnostic. Read with `?.` and treat an absent member as "no answer",
   * never as zeroes — a zero here would read as "React's commit measures no text", which is exactly
   * the claim this exists to test.
   */
  readSurfaceTelemetry?: (surfaceId: number) => {
    /**
     * The inside of `commitMs`, read out of RN's OWN `TransactionTelemetry` rather than timed by us
     * — a `ShadowTreeRevision` carries the telemetry of the commit that produced it.
     *
     * `layoutNodes` is the one that answers the question the timings only pose: Yoga reports how
     * many layoutable nodes it actually touched, so a one-row change that reports the whole tree is
     * a re-layout, not a slow layout.
     */
    layoutMs: number;
    textMs: number;
    layoutNodes: number;
    textMeasures: number;
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
  // The tree reads, checked one by one rather than as a blob for the reason the whole guard is
  // written this way: a member added to the type without a line here resolves fine at bring-up and
  // throws at the first call site, which is a gesture or a `measure()` — one language and several
  // seconds away from the install that caused it.
  if (typeof value.getProp !== 'function') return false;
  if (typeof value.getViewName !== 'function') return false;
  if (typeof value.parentOf !== 'function') return false;
  if (typeof value.childrenOf !== 'function') return false;
  if (typeof value.committedRecordOf !== 'function') return false;
  // The imperative five, checked by name for the same reason as the rest: a pod that has `applyOps`
  // but not these is an OLDER binary, and accepting it would leave `measure()` reaching a method
  // that is not there — at the moment an app measures a ref, not at bring-up.
  if (typeof value.dispatchCommand !== 'function') return false;
  if (typeof value.sendAccessibilityEvent !== 'function') return false;
  if (typeof value.measure !== 'function') return false;
  if (typeof value.measureInWindow !== 'function') return false;
  return typeof value.measureLayout === 'function';
}

// Why `SUPPORTED_NATIVE_VERSION` did NOT move when `probeUIManager` was added, since bumping it is
// the reflex. The version field guards a MEMORY LAYOUT — it is what stops JS reading a store whose
// fields moved. Adding a host function changes no layout, and the shape guard above already refuses
// an older pod that lacks the name, giving the same clean degrade for free. Bumping instead would
// cost every app on an older pod its native STORE to announce a probe it does not use. Bump the
// version when the meaning of the bytes changes, not when the object gains a key.
//
// ── AND WHY IT DID MOVE, 1 -> 2, FOR THE HANDLE REWRITE ──────────────────────────────────────────
//
// Because the shape guard cannot see this one. Every NAME is unchanged: a v1 pod has `applyOps` and
// all five, so `isBindings` passes it. What changed is what the arguments MEAN — `applyOps` gained
// `handles`, which a v1 binary silently ignores, and the five went from taking an integer id to
// taking the handle object, which a v1 binary reads with `.asNumber()`. The first fails by
// committing nothing and leaking; the second throws one language away from the cause. That is the
// same class as a moved field, arriving through a calling convention rather than a struct, and it is
// exactly what this number exists to refuse.
//
// ── AND 3 -> 4, FOR THE SAME REASON THE SHAPE GUARD CANNOT HELP WITH ─────────────────────────────
//
// The four tree reads are new NAMES, so the guard above would turn a v3 pod away on its own. But
// `applyOps` also went from six arguments to five, and the name did not move: a v3 binary reads
// argument 1 as `childIds` (an `Int32Array`) where JS now passes `strings`, and argument 2 as a
// props table where JS now passes `values`. Every one of those reads succeeds against the wrong
// object and commits a wrong tree rather than throwing. That is a calling convention change, which
// is what this number is for — the guard would have refused this pod by luck, on the reads, and a
// refusal by luck is not a refusal.

// `undefined` means "resolved, and there is none" — distinct from `resolved === false`, which means
// nobody has looked. Collapsing the two would re-run the lookup on every miss, and the miss is the
// common case.
let resolved = false;
let bindings: INativeEngineBindings | undefined;

/**
 * The native bindings, or `undefined` when this platform has none.
 *
 * Resolving the TurboModule is done for its SIDE EFFECT: `RCTTurboModuleManager` runs
 * `installJSIBindingsWithRuntime:` at the moment it creates a module, so touching the module by name
 * is what puts the global there. The module's own methods are not the capability and are not called
 * here — which is why a reader looking for the payload in the spec file will not find it.
 */
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
    // Loud, because the repair is a `pod install` and the symptom otherwise is a wrong memory layout
    // rather than a missing feature. `<examples_vs_dot_examples>` records how routinely an install
    // replaces the JS half without the native one.
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
