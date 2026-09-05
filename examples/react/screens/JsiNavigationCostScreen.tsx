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
import NativeDOM from 'react-native/src/private/webapis/dom/nodes/specs/NativeDOM';
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
  const [note, setNote] = useState<string>('');

  const measure = useCallback(() => {
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
        setNote(`no host instance for the ${childCount}-child parent — did it mount?`);
        return;
      }
      const handle = getNativeNode(host);
      if (handle === undefined) {
        setNote(
          `the ${childCount}-child parent has no committed handle yet — press again after a frame.`,
        );
        return;
      }
      const reference = handle as unknown as object;

      // THE CONTROL, and the reason this screen can be trusted at all. `getChildNodes` answers an
      // EMPTY ARRAY for a node absent from the current revision (RN's own spec text). Timing that
      // path would produce a small, plausible number for a call that did nothing — the exact
      // false-green shape `.claude/rules/test-harness-false-greens.md` exists for. So the arm is
      // refused unless the tree really came back.
      const observed = dom.getChildNodes(reference).length;
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

      // ONE EDGE, one returned handle — this is the per-query constant, and the one to read
      // against a design that answers getFirstChild/getNextSibling from native. Measured on a
      // CHILD: a parent lookup from the root answers null and skips the work being priced.
      const firstChild = dom.getChildNodes(reference)[0];
      const parentNode =
        firstChild === undefined
          ? { perCallUs: NaN, guard: 0 }
          : timeBatch(() => dom.getParentNode(firstChild), SAMPLES, WARMUPS);

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
  }, []);

  return (
    <SafeAreaView className="jsi-screen">
      <ScrollView contentContainerStyle="jsi-content">
        <Text className="jsi-title">JSI navigation cost</Text>
        <Text className="jsi-lede">
          One navigation query across the JSI boundary, against the committed tree. Decides whether
          the pending tree can live in C++ (design 2) or must stay a JS skeleton (design 1).
        </Text>

        <ActionButton title="Measure" onPress={measure} color="#4ea1ff" testID="jsi-cost-measure" />

        {note === '' ? null : (
          <Text className="jsi-note">{note}</Text>
        )}

        {results.map(result => (
          <View
            key={result.childCount}
            className="jsi-card"
          >
            <Text className="jsi-card-title">
              {result.childCount} children
            </Text>
            <Text className="jsi-floor">
              JS field read (floor): {result.jsFieldUs.toFixed(3)} us
            </Text>
            <Text className="jsi-arm">
              getParentNode (one edge — THE per-query number):{' '}
              {result.getParentNodeUs.toFixed(3)} us/call
            </Text>
            <Text className="jsi-arm">
              — a {result.childCount}-child cleanChildren would cost{' '}
              {((result.getParentNodeUs * result.childCount) / 1000).toFixed(2)} ms across the
              boundary
            </Text>
            <Text className="jsi-arm">
              getChildNodes (whole list): {result.getChildNodesUs.toFixed(3)} us/call
            </Text>
            <Text className="jsi-floor">guard {result.guard} — carries no meaning</Text>
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
