// Assertions over a COMMITTED Fabric tree: the shape canonicaliser and the "this fold ran" check.
//
// WHY AN ABSOLUTE EXPECTATION RATHER THAN A COMPARISON. A prop fold — a default, an alias rename, a
// bag fold — lives in a layer every path traverses, so comparing two mounts against each other
// cannot see it disappear: delete the fold and both sides move identically and still agree. Measured
// three times on 2026-09-01, once per adapter, before the component path was retired: emptying Vue's
// `PROP_ALIASES` left 4 of 5 comparison cases green, and mutating Solid's `foldAliasKey` to the
// identity reddened only the absolute assertions. `test-harness-false-greens.md` §12 — the same
// degenerate result on both sides is a broken instrument, not a finding.
import type { IFakeNode } from './fake-fabric';

/**
 * A committed node stripped of per-mount identity. `tag`, `instanceHandle` and `parentFamilyTag`
 * differ between two mounts of the same tree by construction, so comparing them would fail every
 * correct adapter.
 */
export interface ICommittedShape {
  viewName: string;
  props: Record<string, unknown>;
  children: ICommittedShape[];
}

export function normalizeCommitted(
  nodes: readonly IFakeNode[],
): ICommittedShape[] {
  return nodes.map(node => ({
    viewName: node.viewName,
    props: { ...node.props },
    children: normalizeCommitted(node.children),
  }));
}

/**
 * The result of one check. Differences are returned rather than thrown so a caller can assert on an
 * EMPTY ARRAY and have its runner print the whole list at once — a thrown error reports the first
 * mismatch and hides the rest, and the interesting failures here are plural.
 */
export interface IEquivalenceResult {
  equal: boolean;
  differences: string[];
}

/**
 * Find the committed node carrying `testID` and require `expected`'s keys to be present with those
 * values. Extra keys are allowed: this asserts that a fold RAN, and pinning the whole payload would
 * turn every unrelated prop addition into a failure here instead of in the test that owns it.
 *
 * Pass the value a fold PRODUCES, never the one the author wrote — `{ nativeID: 'x' }` for an
 * authored `id="x"`, `{ ellipsizeMode: 'tail' }` for a `<text>` that set none. An expectation
 * restating the input passes with the fold deleted and is the same false green one level down.
 */
export function expectCommittedProps(
  tree: readonly IFakeNode[],
  testID: string,
  expected: Record<string, unknown>,
): IEquivalenceResult {
  const differences: string[] = [];
  const found = findByTestID(tree, testID);
  if (found === undefined) {
    return {
      equal: false,
      differences: [
        `no committed node carries testID "${testID}" — the mount did not flush, or the prop never reached the payload`,
      ],
    };
  }
  for (const key of Object.keys(expected).sort()) {
    const actual = JSON.stringify(found.props[key]);
    const wanted = JSON.stringify(expected[key]);
    if (actual !== wanted) {
      differences.push(
        `${testID}: "${key}" is ${actual}, expected ${wanted} — the fold that produces it did not run on this path`,
      );
    }
  }
  return { equal: differences.length === 0, differences };
}

function findByTestID(
  nodes: readonly IFakeNode[],
  testID: string,
): IFakeNode | undefined {
  for (const node of nodes) {
    if (node.props.testID === testID) return node;
    const found = findByTestID(node.children, testID);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * `committed` is `[]` until `completeRoot` runs, and two empty trees satisfy almost any comparison,
 * so a wrong flush count silently asserts nothing at all. A mount must prove it committed something
 * before anything read off it is believed.
 */
export function assertCommittedSomething(
  tree: readonly IFakeNode[],
  armName: string,
): IEquivalenceResult {
  const count = normalizeCommitted(tree).length;
  return count > 0
    ? { equal: true, differences: [] }
    : {
        equal: false,
        differences: [
          `the ${armName} mount committed nothing — it did not flush, so anything read off it is empty`,
        ],
      };
}
