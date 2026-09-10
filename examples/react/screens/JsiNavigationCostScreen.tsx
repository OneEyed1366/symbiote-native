import { useCallback, useRef, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  View,
  type IHostInstance,
} from '@symbiote-native/react';
import { getNativeNode } from '@symbiote-native/engine';
// Typed by ./native-dom.d.ts — the module is Flow source at a private RN path. The deep import is
// deliberate and cannot be avoided: NativeDOM is not re-exported from react-native's top level,
// and calling it IS what this screen measures.
// eslint-disable-next-line @react-native/no-deep-imports
import NativeDOM, {
  type INativeNodeReference,
} from 'react-native/src/private/webapis/dom/nodes/specs/NativeDOM';
import { ActionButton } from '../components/ActionButton';

// Prices ONE navigation query across the JSI boundary, which is the constant that decides whether
// the engine's pending tree can live in C++ instead of JS (`symbiote-fabric-cxx-surface` §7b,
// design 2). Four of five adapters' renderer seams navigate the host — Solid's
// getParentNode/getFirstChild/getNextSibling, Vue's and Angular's parentNode/nextSibling, Svelte's
// prototype getters — and today a JS field answers them. Design 2 answers them from native, so
// every one of those calls becomes a JSI crossing.
//
// It needs no native code because RN already ships the reads: `NativeDOM` (a TurboModule separate
// from nativeFabricUIManager) exposes getChildNodes / getParentNode, and they take the same
// ShadowNode reference the engine already holds in its committed record.
//
// WHAT IT DOES AND DOES NOT PREDICT, because the two halves differ:
//   - the CROSSING is a floor. Design 2 pays it per navigation call no matter how clever our C++
//     is, so this half transfers directly.
//   - the RESOLUTION is an upper bound. NativeDOM resolves the reference against the current
//     revision, and ShadowNodeFamily::getAncestors' second phase linearly scans each level's
//     children; our own module could cache a family->node map and pay less.
// So a cheap result here is inconclusive for design 2 and an expensive one is decisive against it.
//
// It reads the COMMITTED tree, which is exactly why it cannot be the design itself: a reconciler
// navigates the tree it is mid-way through building, and `getChildNodes` on an uncommitted node
// returns an empty array by RN's own spec. See §1a.
//
// Read the MIN, not the mean: these are small samples and GC makes the mean useless (the
// `symbiote-perf-measurement` rule for create-shaped rows applies to any allocation-bearing loop).

// Swept rather than fixed, because the two calls scale differently and the difference is the
// finding: getParentNode is one edge, getChildNodes materialises an array of N handles. If the
// per-call cost of getChildNodes tracks the child count, a Solid `cleanChildren` over a long list
// is quadratic across the boundary, not linear.
const CHILD_COUNTS = [10, 100, 1000] as const;
const SAMPLES = 12;
const WARMUPS = 200;

// ── THE STORE ARM, and it is the go/no-go for the whole native-store design ──────────────────────
//
// The arms above price a JSI CALL. This one prices a JSI-free READ: an `Int32Array` whose backing
// store is native memory (`MutableBuffer`), against an ordinary `Int32Array`. Item 8b' points the
// engine's node table at the first one, and that is only worth doing if the two read the same.
//
// The hazard it exists to detect: Hermes is free to insert a bounds/detach check per access on an
// externally-backed ArrayBuffer, which would make a "direct memory load" closer to a call. If this
// ratio is not ~1.0, the native store is a REGRESSION and the design needs rethinking — so a
// disappointing number here is the finding, not a failed experiment.
//
// Length is the node table's own initial capacity, so the working set matches the real one.
const STORE_LENGTH = 1024;

interface IStoreResult {
  plainUs: number;
  nativeUs: number;
  /** Folded sum of every element read. Equal across arms by construction — see `timeReads`. */
  guard: number;
}

/**
 * Times reads of ONE element per call, summing the VALUES.
 *
 * `timeBatch`'s fold is `value == null ? 0 : 1`, which is right for a returned handle and wrong
 * here: a numeric read folded that way lets an optimiser keep the branch and drop the load. Summing
 * the value makes the load load-bearing.
 *
 * The index walks with an odd stride so consecutive reads are not the same cache line and not a
 * pure sequential scan — the node table is addressed by `tid`, which is neither. Identical for both
 * arms, so the comparison is unaffected by whichever pattern is friendlier.
 */
function timeReads(
  store: Int32Array,
  samples: number,
  warmups: number,
): ITiming {
  let guard = 0;
  let index = 0;
  const step = (): void => {
    index = (index + 37) & (STORE_LENGTH - 1);
    guard += store[index];
  };

  for (let i = 0; i < warmups; i += 1) step();

  let best = Infinity;
  for (let sample = 0; sample < samples; sample += 1) {
    const startedAt = performance.now();
    for (let i = 0; i < BATCH; i += 1) step();
    const elapsed = performance.now() - startedAt;
    if (elapsed < best) best = elapsed;
  }
  return { perCallUs: (best * 1000) / BATCH, guard };
}

/** The bindings our own native module installs, read off the global with a runtime guard. */
function nativeStoreAllocator(): ((length: number) => Int32Array) | undefined {
  const bindings: unknown = Reflect.get(globalThis, '__symbioteEngineNative');
  if (typeof bindings !== 'object' || bindings === null) return undefined;
  const alloc: unknown = Reflect.get(bindings, 'allocInt32Array');
  return typeof alloc === 'function'
    ? (length: number) => {
        const array: unknown = alloc(length);
        if (!(array instanceof Int32Array)) {
          throw new Error('allocInt32Array did not return an Int32Array');
        }
        return array;
      }
    : undefined;
}

/**
 * Item 8c-1's reach probe: how many shadow trees our own C++ can see through the real `UIManager`,
 * or `undefined` when the module is absent.
 *
 * Not a measurement — a yes/no about three things that are invisible from JS and that every later
 * step of 8c-1 rests on: our pod compiles against ReactCommon's renderer headers, it LINKS against
 * the prebuilt `React.xcframework`, and a third-party TurboModule's JSI runtime can resolve the
 * UIManager with no app-side wiring.
 *
 * The three answers are distinct on purpose. `undefined` is no module at all; -1 is a module that
 * ran but found no `nativeFabricUIManager` on the global, i.e. we were created too early; a
 * non-negative number is the whole chain working, and >= 1 means it reached a UIManager that is
 * actually driving a surface rather than a freshly built empty one.
 */
function nativeUIManagerProbe(): number | undefined {
  const bindings: unknown = Reflect.get(globalThis, '__symbioteEngineNative');
  if (typeof bindings !== 'object' || bindings === null) return undefined;
  const probe: unknown = Reflect.get(bindings, 'probeUIManager');
  if (typeof probe !== 'function') return undefined;
  const surfaces: unknown = probe();
  return typeof surfaces === 'number' ? surfaces : undefined;
}

interface IArmResult {
  childCount: number;
  jsFieldUs: number;
  getChildNodesUs: number;
  getParentNodeUs: number;
  /** Folded call results — reported only so no loop can be optimised away. Carries no meaning. */
  guard: number;
}

// Times a BATCH and divides, never a single call. `performance.now()` has finite resolution on
// Hermes, and one navigation query is expected to land in the low microseconds — timing it alone
// measures the clock's quantisation rather than the call. The first version of this screen did
// exactly that and would have reported a plausible-looking number built out of nothing.
//
// `run` must RETURN something derived from the work, and the loop folds it into `guard`, which the
// caller then reads. Without that a JIT is free to delete the whole body: the floor arm is a bare
// array read and is exactly the shape that disappears.
const BATCH = 500;

interface ITiming {
  /** Microseconds per single call, taken as the min across samples. */
  perCallUs: number;
  /** Folded result of the batch, read by the caller so the loop cannot be optimised away. */
  guard: number;
}

function timeBatch(
  run: () => unknown,
  samples: number,
  warmups: number,
): ITiming {
  let guard = 0;
  const fold = (value: unknown): void => {
    // Cheap, allocation-free, and true of every arm: a returned handle/array is an object, a
    // floor read is a number. Either way `guard` depends on the call actually happening.
    guard += value === null || value === undefined ? 0 : 1;
  };

  for (let i = 0; i < warmups; i += 1) fold(run());

  let best = Infinity;
  for (let sample = 0; sample < samples; sample += 1) {
    const startedAt = performance.now();
    for (let i = 0; i < BATCH; i += 1) fold(run());
    const elapsed = performance.now() - startedAt;
    if (elapsed < best) best = elapsed;
  }
  // ms for BATCH calls -> microseconds for one.
  return { perCallUs: (best * 1000) / BATCH, guard };
}

export function JsiNavigationCostScreen() {
  const hostRefs = useRef<Map<number, IHostInstance | null>>(new Map());
  const [results, setResults] = useState<IArmResult[]>([]);
  const [store, setStore] = useState<IStoreResult | undefined>(undefined);
  const [reach, setReach] = useState<number | undefined>(undefined);
  const [note, setNote] = useState<string>('');

  const measure = useCallback(() => {
    // FIRST, and above the `NativeDOM` guard on purpose: the reach probe is about OUR module and
    // must still report on a host where RN's DOM module is absent. Putting it after the early
    // return would make "no NativeDOM" silently look like "no reach", which is a different failure
    // with a different repair.
    setReach(nativeUIManagerProbe());

    const dom = NativeDOM;
    if (dom === null) {
      setNote(
        'NativeDOM is not installed on this host — nothing measured. The module is fetched with ' +
          'TurboModuleRegistry.get (not getEnforcing), so absence is silent by design.',
      );
      setResults([]);
      return;
    }

    const next: IArmResult[] = [];
    for (const childCount of CHILD_COUNTS) {
      const host = hostRefs.current.get(childCount);
      if (host === null || host === undefined) {
        setNote(
          `no host instance for the ${childCount}-child parent — did it mount?`,
        );
        return;
      }
      const handle = getNativeNode(host);
      if (handle === undefined) {
        setNote(
          `the ${childCount}-child parent has no committed handle yet — press again after a frame.`,
        );
        return;
      }
      // THE I/O EDGE, and the only cast in this file. `getNativeNode` hands back the engine's
      // committed handle, which IS RN's `NativeNodeReference` — but neither side can prove that to
      // the compiler: the engine types it opaquely and RN's spec is Flow. Narrowed to the brand
      // rather than to `object`, because `object` is what let a `getChildNodes` result be passed to
      // `getParentNode` — see `native-dom.d.ts`, where the two types are now distinct.
      const reference = handle as unknown as INativeNodeReference;

      // THE CONTROL, and the reason this screen can be trusted at all. `getChildNodes` answers an
      // EMPTY ARRAY for a node absent from the current revision (RN's own spec text). Timing that
      // path would produce a small, plausible number for a call that did nothing — the exact
      // false-green shape `.claude/rules/test-harness-false-greens.md` exists for. So the arm is
      // refused unless the tree really came back.
      // And the case where the handle is not a reference AT ALL, which is not a failure of this
      // screen but the architecture working as designed. It used to be the batched applier's arm
      // switch; it is now the resting state on any runtime carrying the native tree host: the
      // engine hands out a placeholder object and the only `ShadowNode` for it lives in C++, so
      // RN's own DOM module has nothing to unwrap and throws `Value is not a ShadowNode reference`.
      // There is no per-crossing cost to measure there — the whole point is that there are 19 009
      // fewer crossings — so say so instead of redboxing.
      let observed: number;
      try {
        observed = dom.getChildNodes(reference).length;
      } catch {
        setNote(
          'This screen measures the cost of ONE JSI crossing with a real ShadowNode handle, and ' +
            'the tree lives in C++, so no such handle exists in JS — the placeholder is the ' +
            'handle. Nothing to measure here; run without the native module to read these numbers.',
        );
        setResults([]);
        return;
      }
      if (observed !== childCount) {
        setNote(
          `INVALID: getChildNodes returned ${observed} for the ${childCount}-child parent. ` +
            'Nothing below is a measurement — the call is answering about a node that is not in ' +
            'the current revision.',
        );
        setResults([]);
        return;
      }

      // The floor. A read off a plain array of the same length — not a claim about the engine's
      // own field access, which is at least this cheap, but the scale marker the JSI arms are read
      // against. `timeBatch` folds the result so it cannot be optimised out.
      const floorArray = Array.from({ length: childCount }, (_u, i) => ({ i }));
      const floor = timeBatch(() => floorArray[0], SAMPLES, WARMUPS);

      // Materialises an array of N handles per call, so its cost is expected to TRACK childCount.
      // That makes it the "read the whole child list" number, not the per-query one.
      const childNodes = timeBatch(
        () => dom.getChildNodes(reference),
        SAMPLES,
        WARMUPS,
      );

      // ONE EDGE, one returned handle — this is the per-query constant, and the one to read against
      // a design that answers getFirstChild/getNextSibling from native.
      //
      // Measured on THIS parent, not on one of its children, and the reason is a type trap in RN's
      // own spec that crashed this screen on its first device run (2026-09-07, "Exception in
      // HostFunction: Value is not a ShadowNode reference"):
      //
      //   getChildNodes(nativeNodeReference) -> ReadonlyArray<InstanceHandle>
      //   getParentNode(nativeNodeReference) -> ?InstanceHandle
      //
      // Both TAKE a NativeNodeReference and RETURN InstanceHandles — different types. So the output
      // of one is not an input to the other, and `getChildNodes(reference)[0]` is an InstanceHandle
      // the native side rejects. There is no conversion available from JS; a child's reference comes
      // from that child's OWN host instance.
      //
      // Using the parent's own reference costs nothing here: these parents are mounted inside the
      // screen's ScrollView, so the lookup walks a real edge and returns a real handle. The original
      // comment's worry — that a lookup from the ROOT answers null and prices nothing — applies to
      // the surface root, which this is not.
      const parentNode = timeBatch(
        () => dom.getParentNode(reference),
        SAMPLES,
        WARMUPS,
      );

      // Reading the guards is what keeps the three loops alive under a JIT; the sum is otherwise
      // meaningless and is reported only so it cannot be elided.
      next.push({
        childCount,
        jsFieldUs: floor.perCallUs,
        getChildNodesUs: childNodes.perCallUs,
        getParentNodeUs: parentNode.perCallUs,
        guard: floor.guard + childNodes.guard + parentNode.guard,
      });
    }
    setNote(
      `min of ${SAMPLES} samples x ${BATCH} calls, after ${WARMUPS} warmups. Read getParentNode ` +
        'as the per-query constant (one edge, one handle); getChildNodes materialises the whole ' +
        'child list, so its cost tracks the list length by construction.',
    );
    setResults(next);

    // The store arm. Independent of everything above — it makes no JSI call at all once the buffer
    // is handed over, which is the entire point.
    const alloc = nativeStoreAllocator();
    if (alloc === undefined) {
      setStore(undefined);
    } else {
      const plainStore = new Int32Array(STORE_LENGTH);
      const nativeStore = alloc(STORE_LENGTH);
      // Identical contents, so the two arms fold to the SAME guard. A guard mismatch means the arms
      // did not read the same data and no ratio between them means anything.
      for (let i = 0; i < STORE_LENGTH; i += 1) {
        plainStore[i] = i * 7;
        nativeStore[i] = i * 7;
      }

      // Both warmed the same, and the NATIVE arm runs first so the plain one cannot be the only one
      // paying a first-touch cost — the per-process-first-iteration trap this repo records for mount
      // comparisons applies to page faults just as well.
      const nativeTiming = timeReads(nativeStore, SAMPLES, WARMUPS);
      const plainTiming = timeReads(plainStore, SAMPLES, WARMUPS);

      setStore(
        nativeTiming.guard === plainTiming.guard
          ? {
              plainUs: plainTiming.perCallUs,
              nativeUs: nativeTiming.perCallUs,
              guard: plainTiming.guard,
            }
          : undefined,
      );
    }
  }, []);

  return (
    <SafeAreaView className="jsi-screen">
      <ScrollView contentContainerStyle="jsi-content">
        <Text className="jsi-title">JSI navigation cost</Text>
        <Text className="jsi-lede">
          One navigation query across the JSI boundary, against the committed
          tree. Decides whether the pending tree can live in C++ (design 2) or
          must stay a JS skeleton (design 1).
        </Text>

        <ActionButton
          title="Measure"
          onPress={measure}
          color="#4ea1ff"
          testID="jsi-cost-measure"
        />

        {note === '' ? null : <Text className="jsi-note">{note}</Text>}

        {reach === undefined ? null : (
          <View className="jsi-card">
            <Text className="jsi-card-title">
              UIManager reach (item 8c-1 bring-up)
            </Text>
            <Text className="jsi-arm">probeUIManager() = {reach}</Text>
            <Text className="jsi-floor">
              {reach < 0
                ? 'REACHED our C++, but global.nativeFabricUIManager was absent when it ran — the ' +
                  'module is created too early and the applier needs a deferred registration.'
                : 'Our pod compiles against ReactCommon, links against the prebuilt framework, and ' +
                  'resolves the real UIManager with no app-side wiring. ' +
                  (reach === 0
                    ? 'Zero surfaces, so it reached a UIManager that is not driving anything yet.'
                    : 'It is holding live shadow trees, so this is the UIManager the app renders through.')}
            </Text>
          </View>
        )}

        {store === undefined ? null : (
          <View className="jsi-card">
            <Text className="jsi-card-title">
              native store read (item 8b&apos; go/no-go)
            </Text>
            <Text className="jsi-arm">
              plain Int32Array: {store.plainUs.toFixed(4)} us/read
            </Text>
            <Text className="jsi-arm">
              MutableBuffer-backed: {store.nativeUs.toFixed(4)} us/read
            </Text>
            <Text className="jsi-arm">
              ratio {(store.nativeUs / store.plainUs).toFixed(2)}x — ~1.0 means
              Hermes reads native memory as an ordinary load, so the node table
              can move behind it. Anything materially above 1.0 is a per-access
              check, and 8b&apos; would be a regression.
            </Text>
            <Text className="jsi-floor">
              guard {store.guard} — equal across both arms by construction
            </Text>
          </View>
        )}

        {results.map(result => (
          <View key={result.childCount} className="jsi-card">
            <Text className="jsi-card-title">{result.childCount} children</Text>
            <Text className="jsi-floor">
              JS field read (floor): {result.jsFieldUs.toFixed(3)} us
            </Text>
            <Text className="jsi-arm">
              getParentNode (one edge — THE per-query number):{' '}
              {result.getParentNodeUs.toFixed(3)} us/call
            </Text>
            <Text className="jsi-arm">
              — a {result.childCount}-child cleanChildren would cost{' '}
              {((result.getParentNodeUs * result.childCount) / 1000).toFixed(2)}{' '}
              ms across the boundary
            </Text>
            <Text className="jsi-arm">
              getChildNodes (whole list): {result.getChildNodesUs.toFixed(3)}{' '}
              us/call
            </Text>
            <Text className="jsi-floor">
              guard {result.guard} — carries no meaning
            </Text>
          </View>
        ))}

        {/* The measured trees. Kept tiny and off-screen-cheap: what is priced is the boundary, not
            layout, so the children carry no styling of their own. */}
        {CHILD_COUNTS.map(childCount => (
          <View
            key={childCount}
            ref={host => {
              hostRefs.current.set(childCount, host);
            }}
            className="jsi-specimen"
          >
            {Array.from({ length: childCount }, (_unused, index) => (
              <View key={index} className="jsi-specimen-child" />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
