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
const ITERATIONS = 200;
const WARMUPS = 20;

interface IArmResult {
  childCount: number;
  jsFieldUs: number;
  getChildNodesUs: number;
  getParentNodeUs: number;
}

function minOf(
  run: () => unknown,
  iterations: number,
  warmups: number,
): number {
  for (let i = 0; i < warmups; i += 1) run();
  let best = Infinity;
  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    run();
    const elapsed = performance.now() - startedAt;
    if (elapsed < best) best = elapsed;
  }
  // performance.now() is milliseconds; one `run()` is one call, so this is microseconds per call.
  return best * 1000;
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

      // The floor: one indexed read off a plain JS array of the same length. Not a claim about the
      // engine's own field read, which is at least this cheap — it is the scale marker the two JSI
      // arms are read against.
      const floorArray = new Array<number>(childCount).fill(0);
      const jsFieldUs = minOf(() => floorArray[0], ITERATIONS, WARMUPS);

      const reference = handle as unknown as object;
      const getChildNodesUs = minOf(
        () => dom.getChildNodes(reference),
        ITERATIONS,
        WARMUPS,
      );

      // Measured on a CHILD, since a parent lookup from the root would answer null and skip the
      // work this is meant to price.
      const firstChild = dom.getChildNodes(reference)[0];
      const getParentNodeUs =
        firstChild === undefined
          ? NaN
          : minOf(() => dom.getParentNode(firstChild), ITERATIONS, WARMUPS);

      next.push({ childCount, jsFieldUs, getChildNodesUs, getParentNodeUs });
    }
    setNote(
      'min of ' +
        ITERATIONS +
        ' calls after ' +
        WARMUPS +
        ' warmups. Projection column = per-call x child count, i.e. what one Solid cleanChildren ' +
        'over that list would cost across the boundary.',
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
              getChildNodes: {result.getChildNodesUs.toFixed(3)} us/call — projection over{' '}
              {result.childCount}:{' '}
              {((result.getChildNodesUs * result.childCount) / 1000).toFixed(2)} ms
            </Text>
            <Text className="jsi-arm">
              getParentNode: {result.getParentNodeUs.toFixed(3)} us/call — projection over{' '}
              {result.childCount}:{' '}
              {((result.getParentNodeUs * result.childCount) / 1000).toFixed(2)} ms
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
