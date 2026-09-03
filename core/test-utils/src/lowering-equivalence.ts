// The equivalence oracle for host-primitive lowering: mount a primitive as a COMPONENT and as a
// LOWERED intrinsic with the same props, and require the two committed Fabric trees to be identical.
//
// WHY IT EXISTS. A lowered element inherits NOTHING its wrapper component did — prop defaults,
// alias renames and bag folds all live in the wrapper, and lowering routes around it. That cost two
// device-only bugs on 2026-08-31: a lowered `symbiote-text` lost RN's `ellipsizeMode: 'tail'` and
// `allowFontScaling: true` so clamped text truncated with no ellipsis, and Angular never applied
// `id -> nativeID` at all. Every test was green, `tsc` was happy, and the gap was found only by
// diffing prop-key NAMES between two adapters by hand.
//
// WHY THE EXISTING SUITES DID NOT CATCH IT. `core/components/lowering-fixtures.cjs` asks the
// transforms whether they lower or refuse — a verdict, never a payload. The per-adapter defaults
// tests mounted the COMPONENT spelling only, so they passed throughout. Nothing compared the two
// forms against each other.
//
// WHAT IS SHARED AND WHAT IS NOT. Mounting is per-framework by construction, and each adapter's
// idiom differs, so a harness written in one framework's shape would report the other four as
// broken. Shared here is the CANONICALISER and the ASSERTION; each adapter supplies its own two
// mount snippets and its own flush.
//
// EVERY CASE NEEDS **TWO** ASSERTIONS, AND NEITHER IS REDUNDANT. This was measured, not reasoned:
// the Vue session emptied `PROP_ALIASES` — killing the `id -> nativeID` fold outright — and 4 of 5
// cases stayed GREEN under arm comparison alone. The reason is structural rather than incidental:
// when a fold lives in a layer BOTH arms go through (a renderer, as Vue's and Solid's do), deleting
// it moves both arms identically and they still agree. Only the one case that happened to carry an
// absolute expectation caught it.
//
//   compareLoweringEquivalence   catches a fold one PATH lost   (a transform that forgot it)
//   expectCommittedProps         catches a fold EVERYONE lost    (the layer itself broke)
//
// So an equivalence-only suite is `test-harness-false-greens.md` §12 — "the same degenerate result
// on both arms is a broken instrument, not a finding" — wearing three arms instead of two. Write
// both, or the suite passes on a feature that no longer exists.
//
// REPRODUCED ON THREE ADAPTERS, so this is not one session's anecdote and should not be simplified
// away: Vue measured it by emptying `PROP_ALIASES` (4 of 5 cases stayed green), React reached it
// structurally (its wrappers render the intrinsic, so both arms traverse one path), and Solid
// mutated `foldAliasKey` to the identity — all eight of its cases went red and EVERY failure was
// `expectCommittedProps`, with the equivalence comparison silent throughout, because both arms go
// through the renderer and lost the fold identically.
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
 * The result of one comparison. Differences are returned rather than thrown so a caller can assert
 * on an EMPTY ARRAY and have its runner print the whole list at once — a thrown error reports the
 * first mismatch and hides the rest, and the interesting failures here are plural (six missing keys
 * across three nodes was the real one).
 */
export interface IEquivalenceResult {
  equal: boolean;
  differences: string[];
}

function describePath(path: readonly string[]): string {
  return path.length === 0 ? '<root>' : path.join(' > ');
}

// Props are compared by KEY NAME and value, never by count. Counting is what cost a day: two arms
// agreeing on a total while disagreeing on which keys make it up is a coincidence, not equivalence.
//
// `undefined` needs no special case, and adding one would HIDE a defect. `setProp` deletes a key
// written as `undefined` and no-ops when it was never there, and `setEventListener` derives its
// gate flag from `typeof value === 'function'` — so an absent key and an `undefined` key commit
// identically. An adapter whose diff fails to route a disappeared key is exactly what must fail.
function diffProps(
  path: readonly string[],
  component: Record<string, unknown>,
  lowered: Record<string, unknown>,
  differences: string[],
): void {
  const keys = new Set([...Object.keys(component), ...Object.keys(lowered)]);
  for (const key of [...keys].sort()) {
    const inComponent = Object.hasOwn(component, key);
    const inLowered = Object.hasOwn(lowered, key);
    if (!inLowered) {
      differences.push(
        `${describePath(path)}: lowered is MISSING "${key}" (component has ${JSON.stringify(component[key])}) — a fold the wrapper applied and the lowered path does not`,
      );
      continue;
    }
    if (!inComponent) {
      differences.push(
        `${describePath(path)}: lowered has EXTRA "${key}" = ${JSON.stringify(lowered[key])}`,
      );
      continue;
    }
    const left = JSON.stringify(component[key]);
    const right = JSON.stringify(lowered[key]);
    if (left !== right) {
      differences.push(
        `${describePath(path)}: "${key}" differs — component ${left}, lowered ${right}`,
      );
    }
  }
}

function diffShapes(
  path: readonly string[],
  component: readonly ICommittedShape[],
  lowered: readonly ICommittedShape[],
  differences: string[],
): void {
  if (component.length !== lowered.length) {
    differences.push(
      `${describePath(path)}: child count differs — component ${component.length}, lowered ${lowered.length}`,
    );
  }
  const count = Math.max(component.length, lowered.length);
  for (let index = 0; index < count; index += 1) {
    const left = component[index];
    const right = lowered[index];
    if (left === undefined || right === undefined) continue;
    const here = [...path, `${left.viewName}[${index}]`];
    if (left.viewName !== right.viewName) {
      differences.push(
        `${describePath(path)}: child ${index} is ${left.viewName} on the component path and ${right.viewName} on the lowered one`,
      );
      continue;
    }
    diffProps(here, left.props, right.props, differences);
    diffShapes(here, left.children, right.children, differences);
  }
}

/**
 * The assertion. Compare two committed trees taken from two separate mounts of the same props.
 *
 * The committed tree is the right subject and the RETAINED tree is not: anchors live only in the
 * retained tree and are exactly what lowering removes, so the two retained trees legitimately
 * differ. A committed tree holds no anchors, so it must match exactly, `RCTRawText` children
 * included.
 */
export function compareLoweringEquivalence(
  componentTree: readonly IFakeNode[],
  loweredTree: readonly IFakeNode[],
): IEquivalenceResult {
  const differences: string[] = [];
  diffShapes(
    [],
    normalizeCommitted(componentTree),
    normalizeCommitted(loweredTree),
    differences,
  );
  return { equal: differences.length === 0, differences };
}

/**
 * THE SECOND ASSERTION EVERY CASE OWES — an ABSOLUTE expectation, not a comparison.
 *
 * Find the committed node carrying `testID` and require `expected`'s keys to be present with those
 * values. Extra keys are allowed: this asserts that a fold RAN, and pinning the whole payload would
 * turn every unrelated prop addition into a failure here instead of in the test that owns it.
 *
 * Pass the value a fold PRODUCES, never the one the author wrote — `{ nativeID: 'x' }` for an
 * authored `id="x"`, `{ ellipsizeMode: 'tail' }` for a `<Text>` that set none. An expectation
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
 * THE GUARD AGAINST THE MOST LIKELY FALSE GREEN: both arms taking the SAME path.
 *
 * Angular is the live instance — its primitives carry a dual selector (`'symbiote-view, View'`) and
 * directive matching is resolved per TEMPLATE, so writing the intrinsic inside a template that
 * imports the component resolves straight back to the component, silently. The general form is any
 * adapter where the "lowered" snippet is hand-written intrinsic markup the renderer happens to route
 * through the wrapper anyway. Two identical arms agree perfectly and prove nothing.
 *
 * The discriminator here is the RETAINED tree: a component form allocates a wrapper the lowered
 * form does not, so the counts cannot be equal.
 *
 * !! THAT PREMISE IS PER-ADAPTER AND IT IS FALSE ON AT LEAST TWO OF THE FIVE. Corrected 2026-09-01,
 * after the Solid and React arms hit it independently within the hour. A component only allocates a
 * retained node if the FRAMEWORK gives it one:
 *
 *     svelte    HALF TRUE, and corrected by the svelte arm the same day: it holds only for a
 *               CHILDREN-BEARING wrapper, because the anchors are what cost the node. `Switch` and
 *               `TextInput` render one childless element with `p={descriptor.props}` and BOTH arms
 *               retain exactly one node — so this control fired on two correct arms before it ever
 *               reached the two real divergences in that file
 *     angular   a per-component host element      counts differ   -> this control holds
 *     solid     a component is a plain function returning the same host node — MEASURED
 *               byte-identical: {nodes:1, anchors:0, renderable:1} on both arms
 *     react     the wrappers render the intrinsic themselves, so both arms build one node
 *     vue       `hostComponent()` is a FunctionalComponent, so expected to match — UNMEASURED
 *
 * On an adapter where the counts legitimately agree this control fires on a CORRECT arm, which is
 * worse than not having it: a control that cries wolf gets deleted, and the real guard goes with it.
 *
 * So each adapter owes a discriminator whose premise holds FOR IT, stated where it is used. THREE
 * SHAPES EXIST, one per adapter family, and none is a fallback for another:
 *
 *     node count       this function. Holds where a component allocates a retained node —
 *                      Svelte's anchors, Angular's per-component host. On Svelte it holds only
 *                      for a CHILDREN-BEARING wrapper: `Switch` and `TextInput` render a single
 *                      childless element and both arms retain one node. On ANGULAR it holds only
 *                      for a COMPOSED component: `View`/`Text` are `SymbiotePrimitiveHost`s whose
 *                      component IS the node, so both arms census 1.
 *     template text    Angular's, and it exists because of the trap below. Both arms are built
 *                      from template STRINGS, so the arm can assert that only the lowered one
 *                      spells the intrinsic. Weaker than reading compiled output — it proves the
 *                      author wrote two different tags, not that Angular resolved them
 *                      differently — and it is the only thing left when no counter separates them.
 *     source spelling  only the lowered arm names the BARE intrinsic, since a wrapper renders the
 *                      `-managed` spelling. The strongest of the three — no runtime coincidence
 *                      satisfies it — and available only where the arm can read its own source.
 *     compiled output  `_$createComponent(View, …)` vs `_$createElement("symbiote-view")`. Solid's,
 *                      because its arms are JSX compiled by the runner: there is no source to read
 *                      at assertion time, and this is the same claim reachable from where it stands.
 *
 * A DISABLED discriminator can be disabled exactly where its trap lives, and only a break-test
 * says so. Measured on Angular 2026-09-02: the node-count control was switched off for `View` and
 * `Text` because their arms legitimately census equal — and those two are the ONLY primitives
 * carrying the dual selector `'symbiote-view, View'`, i.e. the one construct that makes an
 * intrinsic resolve back to its component. Handing the lowered arm its imports, which should have
 * reproduced the trap, left all nine rows GREEN. The five rows where the control WAS active have
 * single-name selectors and could never have shown it.
 *
 * So: when a control is scoped off for some members, ask whether the hazard it guards is
 * concentrated in the members you excluded. Here it was entirely there.
 *
 * Do not generalise any of them into this file. Which artifact distinguishes the two paths is a fact
 * about a framework, and this repo has a standing rule against absorbing those into shared code —
 * a shared second control would force one answer onto five adapters, which is the mistake this
 * correction exists to undo.
 *
 * THE SHAPE THAT TRANSFERS, offered as a pattern and deliberately NOT as a function here, for the
 * reason the paragraph above gives. The one thing lowering must change on every adapter is the TAG:
 * a wrapper renders the `-managed` spelling or a component boundary, and only the lowered path can
 * name the bare intrinsic the spec declares. So the question each arm can ask in its own idiom is
 * "does ONLY the lowered artifact name `HOST_PRIMITIVES[name].intrinsic`" — Svelte asks it of its
 * two source strings, Solid of its compiled output, and an adapter with no compile step has to find
 * its own answer. Two properties are worth keeping when you translate it: assert on the ARTIFACT
 * rather than on runtime state, so no coincidence at mount can satisfy it, and assert the component
 * arm does NOT name the intrinsic, or the check passes on two lowered arms.
 *
 * Match the tag with a boundary. `symbiote-text` is a prefix of `symbiote-text-input` and
 * `symbiote-switch` of `symbiote-switch-managed`, so a bare substring test reads a wrapper's
 * `-managed` output as the bare intrinsic and certifies two arms that are the same arm.
 *
 * Counts are passed IN rather than computed here: `censusRetainedTree` lives in the engine, and
 * this package must not depend on it — test-utils is imported by the engine's own suite, so the
 * edge would be a cycle. Each caller reads the census from the engine it already imports.
 */
export function assertArmsAreDistinct(
  componentRetainedNodes: number,
  loweredRetainedNodes: number,
): IEquivalenceResult {
  if (componentRetainedNodes === loweredRetainedNodes) {
    return {
      equal: false,
      differences: [
        `both arms retained ${componentRetainedNodes} nodes — the lowered arm did not lower. ` +
          `Check that the intrinsic spelling is not resolving back to the component (a dual ` +
          `selector, or a template that still imports the wrapper).`,
      ],
    };
  }
  return { equal: true, differences: [] };
}

/**
 * THE SECOND FALSE GREEN: both arms empty. `committed` is `[]` until `completeRoot` runs, and two
 * empty trees compare equal, so a wrong flush count silently compares nothing at all. Every arm must
 * prove it committed something before its diff is believed.
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
          `the ${armName} arm committed nothing — the mount did not flush, so the diff below compares two empty trees`,
        ],
      };
}
